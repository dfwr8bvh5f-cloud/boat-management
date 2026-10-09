"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireManagement } from "@/lib/auth";
import { emptyToNull } from "@/lib/form-utils";

// A visit shows on the fleet-wide /technical calendar and on each linked
// boat's own /bookings calendar - revalidate every page it could appear on,
// not just the fleet one, same reasoning as mys.ts's revalidateAll.
function revalidateVisit(boatIds: string[]) {
  revalidatePath("/technical/calendar");
  for (const boatId of boatIds) revalidatePath(`/boats/${boatId}/bookings`);
}

// Only written when it matters: a plain visit omits the field entirely, so
// ordinary visits keep saving even before 0118 (which adds the column) has
// been applied. On update it is also sent when the row was a shipyard job
// before (original_kind), so switching it back to a plain visit sticks.
function readKind(formData: FormData): "visit" | "shipyard" {
  return formData.get("kind") === "shipyard" ? "shipyard" : "visit";
}

function readBoatIds(formData: FormData): string[] {
  return [...new Set(formData.getAll("boat_ids").filter((v): v is string => typeof v === "string" && v.length > 0))];
}

export async function createTechnicianVisit(formData: FormData) {
  const profile = await requireManagement();
  const supabase = await createClient();

  const boatIds = readBoatIds(formData);
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? startDate);

  const { data: inserted, error } = await supabase
    .from("technician_visits")
    .insert({
      technician_name: String(formData.get("technician_name") ?? "").trim(),
      start_date: startDate,
      end_date: endDate,
      start_time: emptyToNull(formData.get("start_time")),
      location: emptyToNull(formData.get("location")),
      ...(readKind(formData) === "shipyard" ? { kind: "shipyard" as const } : {}),
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (boatIds.length > 0) {
    const { error: boatsError } = await supabase
      .from("technician_visit_boats")
      .insert(boatIds.map((boat_id) => ({ visit_id: inserted.id, boat_id })));
    if (boatsError) {
      await supabase.from("technician_visits").delete().eq("id", inserted.id);
      throw new Error(boatsError.message);
    }
  }

  revalidateVisit(boatIds);
}

export async function updateTechnicianVisit(visitId: string, formData: FormData) {
  await requireManagement();
  const supabase = await createClient();

  const { data: existingLinks } = await supabase.from("technician_visit_boats").select("boat_id").eq("visit_id", visitId);
  const boatIds = readBoatIds(formData);
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? startDate);

  const { error } = await supabase
    .from("technician_visits")
    .update({
      technician_name: String(formData.get("technician_name") ?? "").trim(),
      start_date: startDate,
      end_date: endDate,
      start_time: emptyToNull(formData.get("start_time")),
      location: emptyToNull(formData.get("location")),
      ...(readKind(formData) === "shipyard" || formData.get("original_kind") === "shipyard"
        ? { kind: readKind(formData) }
        : {}),
    })
    .eq("id", visitId);

  if (error) throw new Error(error.message);

  const { error: deleteError } = await supabase.from("technician_visit_boats").delete().eq("visit_id", visitId);
  if (deleteError) throw new Error(deleteError.message);

  if (boatIds.length > 0) {
    const { error: boatsError } = await supabase
      .from("technician_visit_boats")
      .insert(boatIds.map((boat_id) => ({ visit_id: visitId, boat_id })));
    if (boatsError) throw new Error(boatsError.message);
  }

  const allBoatIds = [...new Set([...(existingLinks ?? []).map((l) => l.boat_id), ...boatIds])];
  revalidateVisit(allBoatIds);
}

export async function deleteTechnicianVisit(visitId: string) {
  await requireManagement();
  const supabase = await createClient();

  const { data: links } = await supabase.from("technician_visit_boats").select("boat_id").eq("visit_id", visitId);
  const { error } = await supabase.from("technician_visits").delete().eq("id", visitId);
  if (error) throw new Error(error.message);

  revalidateVisit((links ?? []).map((l) => l.boat_id));
}
