"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";
import { getTranslator } from "@/lib/i18n/locale";
import type { TransferVehicle } from "@/lib/types/database";

export async function createTransferRequest(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("transfer_requests").insert({
    boat_id: boatId,
    people_count: Number(formData.get("people_count") ?? 1),
    flight_number: emptyToNull(formData.get("flight_number")),
    transfer_date: String(formData.get("transfer_date") ?? new Date().toISOString().slice(0, 10)),
    landing_time: emptyToNull(formData.get("landing_time")),
    vehicle: (String(formData.get("vehicle") ?? "van") as TransferVehicle),
    pickup: String(formData.get("pickup") ?? "").trim(),
    dropoff: String(formData.get("dropoff") ?? "").trim(),
    notes: emptyToNull(formData.get("notes")),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/store/transfer`);
}

export async function markTransferArranged(boatId: string, transferId: string) {
  const profile = await requireProfile();
  if (profile.role !== "management") {
    const { t } = await getTranslator();
    throw new Error(t("error_management_only_transfer"));
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transfer_requests").update({ arranged: true }).eq("id", transferId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/store/transfer`);
}

export async function deleteTransferRequest(boatId: string, transferId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("transfer_requests").delete().eq("id", transferId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/store/transfer`);
}
