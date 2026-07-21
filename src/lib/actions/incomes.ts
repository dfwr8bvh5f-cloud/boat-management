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

  // A charter-income row can carry its own attached contract document
  // (contract_document_id) - deleting the income without also cleaning
  // that up would leave an orphaned, otherwise-undeletable PDF and
  // documents row behind every time. Every other income row has this
  // column null, so the lookup/cleanup below is a no-op for them.
  const { data: existing } = await supabase.from("incomes").select("contract_document_id").eq("id", incomeId).single();

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
// a contract PDF is optional; if one was uploaded (see
// createCharterUploadUrl above), a documents row is created for it so the
// existing eye-icon/download route works unmodified.
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
    const deliveryFee = numberOrNull(formData.get("delivery_fee")) ?? 0;
    const redeliveryFee = numberOrNull(formData.get("redelivery_fee")) ?? 0;
    const apa = numberOrNull(formData.get("apa")) ?? 0;
    const contractPath = emptyToNull(formData.get("contract_path"));

    if (!charterCode || !startDate || !endDate || grossPrice === null) {
      return { error: t("error_charter_fields_required") };
    }

    const { data: boat } = await supabase.from("boats").select("charter_vat_rate").eq("id", boatId).single();
    const vatRate = boat?.charter_vat_rate ?? 0.065;

    const breakdown = computeCharterBreakdown({ grossPrice, vatRate, deliveryFee, redeliveryFee, apa });

    const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
    const approvedFields = status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {};

    let contractDocumentId: string | null = null;
    if (contractPath) {
      const { data: doc, error: docError } = await supabase
        .from("documents")
        .insert({
          boat_id: boatId,
          name: `${t("doc_myba_contract")} ${charterCode}`,
          doc_type: "myba_contract",
          file_path: contractPath,
          uploaded_by: profile.id,
          status,
          ...approvedFields,
        })
        .select("id")
        .single();

      if (docError) {
        await supabase.storage.from("documents").remove([contractPath]);
        return { error: docError.message };
      }
      contractDocumentId = doc.id;
    }

    const { error: incomeError } = await supabase.from("incomes").insert({
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
      contract_document_id: contractDocumentId,
      status,
      created_by: profile.id,
      ...approvedFields,
    });

    if (incomeError) {
      if (contractDocumentId) {
        await supabase.from("documents").delete().eq("id", contractDocumentId);
        await supabase.storage.from("documents").remove([contractPath!]);
      }
      return { error: incomeError.message };
    }

    revalidatePath(`/boats/${boatId}/finance/future`);
    if (contractDocumentId) revalidatePath(`/boats/${boatId}/documents`);
    revalidatePath(`/boats/${boatId}`);
    revalidatePath("/boats");
    return { error: null };
  } catch (e) {
    console.error("createCharterFutureIncome failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Edits a charter future-income row's own fields - the attached contract
// (if any) is untouched here, only the charter details. Recomputes the
// full breakdown server-side from the submitted fields, same as creation,
// so amount never drifts from what the fields actually add up to.
export async function updateCharterFutureIncome(boatId: string, incomeId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { t } = await getTranslator();

    const charterCode = String(formData.get("charter_code") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const embarkationPort = emptyToNull(formData.get("embarkation_port"));
    const disembarkationPort = emptyToNull(formData.get("disembarkation_port"));
    const grossPrice = numberOrNull(formData.get("gross_price"));
    const deliveryFee = numberOrNull(formData.get("delivery_fee")) ?? 0;
    const redeliveryFee = numberOrNull(formData.get("redelivery_fee")) ?? 0;
    const apa = numberOrNull(formData.get("apa")) ?? 0;

    if (!charterCode || !startDate || !endDate || grossPrice === null) {
      return { error: t("error_charter_fields_required") };
    }

    const { data: boat } = await supabase.from("boats").select("charter_vat_rate").eq("id", boatId).single();
    const vatRate = boat?.charter_vat_rate ?? 0.065;
    const breakdown = computeCharterBreakdown({ grossPrice, vatRate, deliveryFee, redeliveryFee, apa });

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
      })
      .eq("id", incomeId);

    if (error) return { error: error.message };

    revalidateAll(boatId);
    return { error: null };
  } catch (e) {
    console.error("updateCharterFutureIncome failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
