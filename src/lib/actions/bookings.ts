"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
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
    throw new Error("רק תפקיד ניהול יכול לאשר רשומות");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status: "approved", approved_by: profile.id, approved_at: new Date().toISOString() })
    .eq("id", bookingId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/bookings`);
}
