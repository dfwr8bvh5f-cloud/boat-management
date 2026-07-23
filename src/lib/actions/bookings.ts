"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import { MYBA_CONTRACT_NAME_PREFIX, MYBA_DEPOSIT_SOURCE_PREFIX } from "@/lib/balances";
import type { ApprovalStatus, UsageType } from "@/lib/types/database";

// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, turning any failure here into an opaque
// "Something went wrong" page with no way to diagnose it.
export async function createBooking(
  boatId: string,
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();

    // Management-created bookings count immediately. A captain's own
    // insert must land as "pending" - the bookings_insert RLS policy
    // requires it (mirrors every other approval-workflow table in this
    // app), so forcing "approved" here would make a captain's insert get
    // silently rejected by the database.
    const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

    const { data, error } = await supabase
      .from("bookings")
      .insert({
        boat_id: boatId,
        customer_name: String(formData.get("customer_name") ?? "").trim(),
        customer_phone: emptyToNull(formData.get("customer_phone")),
        customer_email: emptyToNull(formData.get("customer_email")),
        start_date: String(formData.get("start_date") ?? ""),
        end_date: String(formData.get("end_date") ?? ""),
        usage_type: (String(formData.get("usage_type") ?? "charter") as UsageType),
        usage_type_other: emptyToNull(formData.get("usage_type_other")),
        guests_count: numberOrNull(formData.get("guests_count")),
        sailing_area: emptyToNull(formData.get("sailing_area")),
        departure_port: emptyToNull(formData.get("departure_port")),
        arrival_port: emptyToNull(formData.get("arrival_port")),
        departure_time: emptyToNull(formData.get("departure_time")),
        arrival_time: emptyToNull(formData.get("arrival_time")),
        price: numberOrNull(formData.get("price")),
        notes: emptyToNull(formData.get("notes")),
        status,
        created_by: profile.id,
        ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath(`/boats/${boatId}/bookings`);
    revalidatePath(`/boats/${boatId}`);
    revalidatePath("/boats");
    revalidatePath("/approvals");
    return { ok: true, id: data.id as string };
  } catch (e) {
    console.error("createBooking failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateBooking(boatId: string, bookingId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from("bookings")
      .update({
        customer_name: String(formData.get("customer_name") ?? "").trim(),
        customer_phone: emptyToNull(formData.get("customer_phone")),
        customer_email: emptyToNull(formData.get("customer_email")),
        start_date: String(formData.get("start_date") ?? ""),
        end_date: String(formData.get("end_date") ?? ""),
        usage_type: String(formData.get("usage_type") ?? "charter") as UsageType,
        usage_type_other: emptyToNull(formData.get("usage_type_other")),
        guests_count: numberOrNull(formData.get("guests_count")),
        sailing_area: emptyToNull(formData.get("sailing_area")),
        departure_port: emptyToNull(formData.get("departure_port")),
        arrival_port: emptyToNull(formData.get("arrival_port")),
        departure_time: emptyToNull(formData.get("departure_time")),
        arrival_time: emptyToNull(formData.get("arrival_time")),
        price: numberOrNull(formData.get("price")),
        notes: emptyToNull(formData.get("notes")),
      })
      .eq("id", bookingId);

    if (error) return { error: error.message };
    revalidatePath(`/boats/${boatId}/bookings`);
    revalidatePath(`/boats/${boatId}`);
    revalidatePath("/boats");
    return { error: null };
  } catch (e) {
    console.error("updateBooking failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBooking(boatId: string, bookingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
}

export async function approveBooking(boatId: string, bookingId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_approve"));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
  revalidatePath(`/boats/${boatId}`);
  revalidatePath("/boats");
  revalidatePath("/approvals");
}

// Large scanned contracts can exceed the platform's request-body limit for
// server actions, so the client uploads the file directly to Supabase
// Storage first (see createMybaUploadUrl) and passes the resulting path
// here instead of the raw file. A raw `contract` File is still accepted for
// small files that didn't need the direct-upload path.
export async function createMybaUploadUrl(boatId: string, fileName: string) {
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

// Creates a booking + the signed-contract document + future-income entries
// (fee and, if present, deposit) from one scanned MYBA contract upload, all
// linked together via booking_id.
//
// Returns a result object instead of throwing so the real message always
// reaches the client - Next.js redacts thrown Server Action error messages
// in production builds, which was making every failure here show up as an
// opaque "Server Components render" error with no way to diagnose it.
export async function createMybaContract(boatId: string, formData: FormData): Promise<{ error: string | null }> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();
    const { t } = await getTranslator();

    const file = formData.get("contract");
    // Signed multiple files (multiple hidden contract_path inputs, one per
    // upload) - the browser-side form only ever uses this path today; the
    // raw `file` field below is kept only as a fallback for a caller that
    // posts a single file directly instead of pre-uploading it.
    const preUploadedPaths = formData.getAll("contract_path").map(String).filter(Boolean);
    if (!(file instanceof File && file.size > 0) && preUploadedPaths.length === 0) {
      return { error: t("error_select_contract_file") };
    }

    const customerName = String(formData.get("customer_name") ?? "").trim();
    const startDate = String(formData.get("start_date") ?? "");
    const endDate = String(formData.get("end_date") ?? "");
    const sailingArea = emptyToNull(formData.get("sailing_area"));
    const departurePort = emptyToNull(formData.get("departure_port"));
    const arrivalPort = emptyToNull(formData.get("arrival_port"));
    const feeAmount = numberOrNull(formData.get("fee_amount"));
    const depositAmount = numberOrNull(formData.get("deposit_amount"));
    const paymentDate = emptyToNull(formData.get("payment_date"));
    const bookingReference = emptyToNull(formData.get("booking_reference"));

    if (!customerName || !startDate || !endDate) {
      return { error: t("error_customer_dates_required") };
    }

    const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";
    const approvedFields = status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {};

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        boat_id: boatId,
        customer_name: customerName,
        start_date: startDate,
        end_date: endDate,
        usage_type: "charter",
        sailing_area: sailingArea,
        departure_port: departurePort,
        arrival_port: arrivalPort,
        price: feeAmount,
        booking_reference: bookingReference,
        status,
        created_by: profile.id,
        ...approvedFields,
      })
      .select("id")
      .single();

    if (bookingError) return { error: bookingError.message };

    let storagePaths: string[];
    if (preUploadedPaths.length > 0) {
      // Files were already uploaded directly to storage from the browser
      // (createMybaUploadUrl) - nothing left to do here.
      storagePaths = preUploadedPaths;
    } else {
      const uploadedFile = file as File;
      const year = new Date(startDate).getFullYear() || new Date().getFullYear();
      const safeName = uploadedFile.name.replace(/[^\w.\-]+/g, "_");
      const storagePath = `${boatId}/myba_contracts/${year}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, uploadedFile, { contentType: uploadedFile.type || undefined });

      if (uploadError) {
        await supabase.from("bookings").delete().eq("id", booking.id);
        return { error: uploadError.message };
      }
      storagePaths = [storagePath];
    }

    const { error: docsError } = await supabase.from("documents").insert(
      storagePaths.map((p) => ({
        boat_id: boatId,
        name: `${MYBA_CONTRACT_NAME_PREFIX}${bookingReference ?? customerName}`,
        doc_type: "myba_contract" as const,
        file_path: p,
        booking_id: booking.id,
        uploaded_by: profile.id,
        status,
        ...approvedFields,
      }))
    );

    if (docsError) {
      await supabase.storage.from("documents").remove(storagePaths);
      await supabase.from("bookings").delete().eq("id", booking.id);
      return { error: docsError.message };
    }

    const incomeRows = [
      feeAmount
        ? {
            boat_id: boatId,
            source: `${MYBA_CONTRACT_NAME_PREFIX}${bookingReference ?? customerName}`,
            amount: feeAmount,
            income_date: paymentDate ?? startDate,
            type: "future" as const,
            booking_id: booking.id,
            status,
            created_by: profile.id,
            ...approvedFields,
          }
        : null,
      depositAmount
        ? {
            boat_id: boatId,
            source: `${MYBA_DEPOSIT_SOURCE_PREFIX}${bookingReference ?? customerName}`,
            amount: depositAmount,
            income_date: paymentDate ?? startDate,
            type: "future" as const,
            booking_id: booking.id,
            status,
            created_by: profile.id,
            ...approvedFields,
          }
        : null,
    ].filter((r): r is NonNullable<typeof r> => r !== null);

    if (incomeRows.length > 0) {
      const { error: incomeError } = await supabase.from("incomes").insert(incomeRows);
      if (incomeError) return { error: incomeError.message };
    }

    revalidatePath(`/boats/${boatId}/bookings`);
    revalidatePath(`/boats/${boatId}/documents`);
    revalidatePath(`/boats/${boatId}/finance/future`);
    revalidatePath(`/boats/${boatId}`);
    revalidatePath("/boats");
    revalidatePath("/approvals");
    return { error: null };
  } catch (e) {
    console.error("createMybaContract failed:", e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
