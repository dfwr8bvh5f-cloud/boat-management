"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { ApprovalStatus, UsageType } from "@/lib/types/database";

export async function createBooking(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const status: ApprovalStatus = profile.role === "management" ? "approved" : "pending";

  const { error } = await supabase.from("bookings").insert({
    boat_id: boatId,
    customer_name: String(formData.get("customer_name") ?? "").trim(),
    customer_phone: emptyToNull(formData.get("customer_phone")),
    customer_email: emptyToNull(formData.get("customer_email")),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    usage_type: (String(formData.get("usage_type") ?? "charter") as UsageType),
    guests_count: numberOrNull(formData.get("guests_count")),
    sailing_area: emptyToNull(formData.get("sailing_area")),
    price: numberOrNull(formData.get("price")),
    notes: emptyToNull(formData.get("notes")),
    status,
    created_by: profile.id,
    ...(status === "approved" ? { approved_by: profile.id, approved_at: new Date().toISOString() } : {}),
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}

export async function deleteBooking(boatId: string, bookingId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("bookings").delete().eq("id", bookingId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
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
}

// Creates a booking + the signed-contract document + future-income entries
// (fee and, if present, deposit) from one scanned MYBA contract upload, all
// linked together via booking_id.
export async function createMybaContract(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const file = formData.get("contract");
  if (!(file instanceof File) || file.size === 0) {
    const { t } = await getTranslator();
    throw new Error(t("error_select_contract_file"));
  }

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const sailingArea = emptyToNull(formData.get("sailing_area"));
  const feeAmount = numberOrNull(formData.get("fee_amount"));
  const depositAmount = numberOrNull(formData.get("deposit_amount"));
  const paymentDate = emptyToNull(formData.get("payment_date"));
  const bookingReference = emptyToNull(formData.get("booking_reference"));

  if (!customerName || !startDate || !endDate) {
    const { t } = await getTranslator();
    throw new Error(t("error_customer_dates_required"));
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
      price: feeAmount,
      booking_reference: bookingReference,
      status,
      created_by: profile.id,
      ...approvedFields,
    })
    .select("id")
    .single();

  if (bookingError) throw new Error(bookingError.message);

  const year = new Date(startDate).getFullYear() || new Date().getFullYear();
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${boatId}/myba_contracts/${year}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { contentType: file.type || undefined });

  if (uploadError) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    throw new Error(uploadError.message);
  }

  const { error: docError } = await supabase.from("documents").insert({
    boat_id: boatId,
    name: `חוזה MYBA - ${bookingReference ?? customerName}`,
    doc_type: "myba_contract",
    file_path: storagePath,
    booking_id: booking.id,
    uploaded_by: profile.id,
    status,
    ...approvedFields,
  });

  if (docError) {
    await supabase.storage.from("documents").remove([storagePath]);
    await supabase.from("bookings").delete().eq("id", booking.id);
    throw new Error(docError.message);
  }

  const incomeRows = [
    feeAmount
      ? {
          boat_id: boatId,
          source: `חוזה MYBA - ${bookingReference ?? customerName}`,
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
          source: `מקדמה - ${bookingReference ?? customerName}`,
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
    if (incomeError) throw new Error(incomeError.message);
  }

  revalidatePath(`/boats/${boatId}/bookings`);
  revalidatePath(`/boats/${boatId}/documents`);
  revalidatePath(`/boats/${boatId}/finance/future`);
}
