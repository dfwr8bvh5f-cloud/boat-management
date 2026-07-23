"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, emptyToUndefined, numberOrNull } from "@/lib/form-utils";
import { computeCharterBreakdown } from "@/lib/charter-income";
import type { ApprovalStatus, IncomeType } from "@/lib/types/database";
import { getTranslator } from "@/lib/i18n/locale";

// The set of pages that show an income's amount/status, revalidated
// together after any mutation that can change it - mirrors the identical
// helper already in bank-statement.ts, expenses.ts, and cash.ts.
function revalidateAll(boatId: string) {
  revalidatePath(`/boats/${boatId}/finance/bank`);
  revalidatePath(`/boats/${boatId}/finance/future`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function createIncome(boatId: string, type: IncomeType, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
  // Left empty in the UI on purpose (no default date pushed on the user) -
  // omitting the key lets the column's own `default current_date` apply.
  const incomeDate = emptyToUndefined(formData.get("income_date"));

  const { error } = await supabase.from("incomes").insert({
    boat_id: boatId,
    source: String(formData.get("source") ?? "").trim(),
    amount: Number(formData.get("amount") ?? 0),
    ...(incomeDate ? { income_date: incomeDate } : {}),
    type,
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function updateIncome(boatId: string, incomeId: string, formData: FormData) {
  const supabase = await createClient();

  const incomeDate = emptyToUndefined(formData.get("income_date"));

  const { error } = await supabase
    .from("incomes")
    .update({
      source: String(formData.get("source") ?? "").trim(),
      amount: Number(formData.get("amount") ?? 0),
      ...(incomeDate ? { income_date: incomeDate } : {}),
    })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

export async function deleteIncome(boatId: string, incomeId: string) {
  const supabase = await createClient();

  // A charter-income row can carry attached contract documents (the legacy
  // single contract_document_id, and/or any number of documents rows
  // linked via income_id - see 0070_document_income_multi.sql) and/or an
  // auto-created calendar booking (booking_id) - deleting the income
  // without also cleaning those up would leave orphaned, otherwise-
  // undeletable PDFs/documents rows and a stale calendar entry behind
  // every time. Every other income row has all of these null/empty, so
  // the lookup/cleanup below is a no-op for them.
  const [{ data: existing }, { data: linkedDocs }] = await Promise.all([
    supabase.from("incomes").select("contract_document_id, booking_id").eq("id", incomeId).single(),
    supabase.from("documents").select("id, file_path").eq("income_id", incomeId),
  ]);

  const { error } = await supabase.from("incomes").delete().eq("id", incomeId);
  if (error) throw new Error(error.message);

  if (existing?.contract_document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", existing.contract_document_id)
      .single();
    await supabase.from("documents").delete().eq("id", existing.contract_document_id);
    if (doc?.file_path) await supabase.storage.from("documents").remove([doc.file_path]);
  }

  if (linkedDocs && linkedDocs.length > 0) {
    await supabase
      .from("documents")
      .delete()
      .in("id", linkedDocs.map((d) => d.id));
    await supabase.storage.from("documents").remove(linkedDocs.map((d) => d.file_path));
    revalidatePath(`/boats/${boatId}/documents`);
  }

  if (existing?.booking_id) {
    await supabase.from("bookings").delete().eq("id", existing.booking_id);
    revalidatePath(`/boats/${boatId}/bookings`);
  }

  revalidateAll(boatId);
}

export async function approveIncome(boatId: string, incomeId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("incomes")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", incomeId);

  if (error) throw new Error(error.message);
  revalidateAll(boatId);
}

// A signed contract PDF can exceed the platform's request-body limit for
// server actions, so the client uploads it directly to Supabase Storage
// first (same bucket/path convention as createMybaUploadUrl in
// bookings.ts) and passes the resulting path to createCharterFutureIncome
// instead of the raw file.
export async function createCharterUploadUrl(boatId: string, fileName: string) {
  const profile = await requireProfile();
  if (profile.role !== "management" && profile.boat_id !== boatId) {
    const { t } = await getTranslator();
    throw new Error(t("error_not_authorized"));
  }

  const supabase = await createClient();
  const year = new Date().getFullYear();
  const safeName = fileName.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/myba_contracts/${year}/${Date.now()}_${safeName}`;

  const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);

  return { path: storagePath, token: data.token };
}

// Creates a structured charter future-income row: recomputes the full
// commission/VAT breakdown server-side (never trusts a client-supplied
// total) and stores its net-to-owner result as the row's amount. Attaching
// a MYBA contract is optional and supports more than one file (extra
// pages, an addendum) - each uploaded file (see createCharterUploadUrl
// above) becomes its own documents row linked via income_id (0070), the
// same one-income-to-many-documents shape documents.booking_id already
// has for bookings.
//
// Returns a result object instead of throwing, matching createMybaContract
// in bookings.ts - Next.js redacts thrown Server Action error messages in
// production, which would otherwise turn every validation failure into an
// opaque, undiagnosable error.
export async function createCharterFutureIncome(boatId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { t } = await getTranslator();

    const charterCode = String(formData.get("charter_code") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const embarkationPort = emptyToNull(formData.get("embarkation_port"));
    const disembarkationPort = emptyToNull(formData.get("disembarkation_port"));
    const grossPrice = numberOrNull(formData.get("gross_price"));
    const netToOwner = numberOrNull(formData.get("net_price_to_owner"));
    const deliveryFee = numberOrNull(formData.get("delivery_fee")) ?? 0;
    const redeliveryFee = numberOrNull(formData.get("redelivery_fee")) ?? 0;
    const apa = numberOrNull(formData.get("apa")) ?? 0;
    const contractPaths = formData.getAll("contract_path").map(String).filter(Boolean);

    if (!charterCode || !startDate || !endDate || grossPrice === null || netToOwner === null) {
      return { error: t("error_charter_fields_required") };
    }

    const { data: boat } = await supabase.from("boats").select("charter_vat_rate").eq("id", boatId).single();
    const vatRate = boat?.charter_vat_rate ?? 0.065;

    const breakdown = computeCharterBreakdown({ grossPrice, netToOwner, vatRate, deliveryFee, redeliveryFee });

    const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
    const approvedFields = status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {};

    // A charter future-income row also places the charter on the calendar
    // (Bookings tab) automatically, reusing the same fields she already
    // typed once here - customer_name is required on bookings but has no
    // equivalent field on this form, so it's filled with the charter code
    // as a placeholder (bookings-manager.tsx prefers booking_reference as
    // the card title, so this is rarely even shown).
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        boat_id: boatId,
        customer_name: charterCode,
        start_date: startDate,
        end_date: endDate,
        usage_type: "charter",
        departure_port: embarkationPort,
        arrival_port: disembarkationPort,
        price: grossPrice,
        booking_reference: charterCode,
        status,
        created_by: profile.id,
        ...approvedFields,
      })
      .select("id")
      .single();

    if (bookingError) return { error: bookingError.message };

    const { data: income, error: incomeError } = await supabase
      .from("incomes")
      .insert({
        boat_id: boatId,
        source: charterCode,
        amount: breakdown.netToOwner,
        income_date: startDate,
        type: "future",
        charter_code: charterCode,
        embarkation_port: embarkationPort,
        disembarkation_port: disembarkationPort,
        charter_end_date: endDate,
        gross_price: grossPrice,
        delivery_fee: deliveryFee,
        redelivery_fee: redeliveryFee,
        apa,
        booking_id: booking.id,
        status,
        created_by: profile.id,
        ...approvedFields,
      })
      .select("id")
      .single();

    if (incomeError) {
      await supabase.from("bookings").delete().eq("id", booking.id);
      return { error: incomeError.message };
    }

    if (contractPaths.length > 0) {
      const { error: docsError } = await supabase.from("documents").insert(
        contractPaths.map((p) => ({
          boat_id: boatId,
          name: `${t("doc_myba_contract")} ${charterCode}`,
          doc_type: "myba_contract" as const,
          file_path: p,
          income_id: income.id,
          uploaded_by: profile.id,
          status,
          ...approvedFields,
        }))
      );

      if (docsError) {
        await supabase.storage.from("documents").remove(contractPaths);
        await supabase.from("incomes").delete().eq("id", income.id);
        await supabase.from("bookings").delete().eq("id", booking.id);
        return { error: docsError.message };
      }
    }

    revalidatePath(`/boats/${boatId}/finance/future`);
    if (contractPaths.length > 0) revalidatePath(`/boats/${boatId}/documents`);
    revalidatePath(`/boats/${boatId}/bookings`);
    revalidatePath(`/boats/${boatId}`);
    revalidatePath("/boats");
    return { error: null };
  } catch (e) {
    console.error("createCharterFutureIncome failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Edits a charter future-income row's own fields, plus any number of new
// MYBA contract files to attach (additive - never touches contracts
// already linked, so the form's uploader is always available, not just
// for rows that have none yet). Recomputes the full breakdown server-side
// from the submitted fields, same as creation, so amount never drifts
// from what the fields add up to.
export async function updateCharterFutureIncome(boatId: string, incomeId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { t } = await getTranslator();

    const charterCode = String(formData.get("charter_code") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const embarkationPort = emptyToNull(formData.get("embarkation_port"));
    const disembarkationPort = emptyToNull(formData.get("disembarkation_port"));
    const grossPrice = numberOrNull(formData.get("gross_price"));
    const netToOwner = numberOrNull(formData.get("net_price_to_owner"));
    const deliveryFee = numberOrNull(formData.get("delivery_fee")) ?? 0;
    const redeliveryFee = numberOrNull(formData.get("redelivery_fee")) ?? 0;
    const apa = numberOrNull(formData.get("apa")) ?? 0;
    const contractPaths = formData.getAll("contract_path").map(String).filter(Boolean);

    if (!charterCode || !startDate || !endDate || grossPrice === null || netToOwner === null) {
      return { error: t("error_charter_fields_required") };
    }

    const { data: boat } = await supabase.from("boats").select("charter_vat_rate").eq("id", boatId).single();
    const vatRate = boat?.charter_vat_rate ?? 0.065;
    const breakdown = computeCharterBreakdown({ grossPrice, netToOwner, vatRate, deliveryFee, redeliveryFee });

    const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
    const approvedFields = status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {};

    // Keep the linked calendar booking's charter fields in sync - never
    // touches customer_name/status, which belong to the booking's own
    // approval flow once it exists. Legacy rows with no booking_id yet
    // (created before this feature, or the un-backfilled imported
    // charters) get one created now, so this edit is what "catches up"
    // that charter onto the calendar going forward.
    const { data: existing } = await supabase.from("incomes").select("booking_id").eq("id", incomeId).single();

    let bookingId = existing?.booking_id ?? null;
    const bookingCreatedNow = !bookingId;
    if (bookingId) {
      const { error: bookingError } = await supabase
        .from("bookings")
        .update({
          start_date: startDate,
          end_date: endDate,
          departure_port: embarkationPort,
          arrival_port: disembarkationPort,
          booking_reference: charterCode,
          price: grossPrice,
        })
        .eq("id", bookingId);

      if (bookingError) return { error: bookingError.message };
    } else {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          boat_id: boatId,
          customer_name: charterCode,
          start_date: startDate,
          end_date: endDate,
          usage_type: "charter",
          departure_port: embarkationPort,
          arrival_port: disembarkationPort,
          price: grossPrice,
          booking_reference: charterCode,
          status,
          created_by: profile.id,
          ...approvedFields,
        })
        .select("id")
        .single();

      if (bookingError) return { error: bookingError.message };
      bookingId = booking.id;
    }

    const { error } = await supabase
      .from("incomes")
      .update({
        source: charterCode,
        amount: breakdown.netToOwner,
        income_date: startDate,
        charter_code: charterCode,
        embarkation_port: embarkationPort,
        disembarkation_port: disembarkationPort,
        charter_end_date: endDate,
        gross_price: grossPrice,
        delivery_fee: deliveryFee,
        redelivery_fee: redeliveryFee,
        apa,
        booking_id: bookingId,
      })
      .eq("id", incomeId);

    if (error) {
      if (bookingCreatedNow) await supabase.from("bookings").delete().eq("id", bookingId);
      return { error: error.message };
    }

    if (contractPaths.length > 0) {
      const { error: docsError } = await supabase.from("documents").insert(
        contractPaths.map((p) => ({
          boat_id: boatId,
          name: `${t("doc_myba_contract")} ${charterCode}`,
          doc_type: "myba_contract" as const,
          file_path: p,
          income_id: incomeId,
          uploaded_by: profile.id,
          status,
          ...approvedFields,
        }))
      );

      if (docsError) {
        await supabase.storage.from("documents").remove(contractPaths);
        return { error: docsError.message };
      }
    }

    revalidateAll(boatId);
    revalidatePath(`/boats/${boatId}/bookings`);
    if (contractPaths.length > 0) revalidatePath(`/boats/${boatId}/documents`);
    return { error: null };
  } catch (e) {
    console.error("updateCharterFutureIncome failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
