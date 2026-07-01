"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { emptyToNull, numberOrNull } from "@/lib/form-utils";
import type { MaintenanceStatus } from "@/lib/types/database";

export async function createMaintenanceRecord(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("maintenance_records").insert({
    boat_id: boatId,
    title: String(formData.get("title") ?? "").trim(),
    description: emptyToNull(formData.get("description")),
    status: (String(formData.get("status") ?? "planned") as MaintenanceStatus),
    scheduled_date: emptyToNull(formData.get("scheduled_date")),
    completed_date: emptyToNull(formData.get("completed_date")),
    cost: numberOrNull(formData.get("cost")),
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance`);
}

export async function deleteMaintenanceRecord(boatId: string, recordId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("maintenance_records").delete().eq("id", recordId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance`);
}
