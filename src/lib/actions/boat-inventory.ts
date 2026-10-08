"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { BoatInventoryCategory } from "@/lib/types/database";

export async function createInventoryItem(boatId: string, formData: FormData) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));

  const { error } = await supabase.from("boat_inventory_items").insert({
    boat_id: boatId,
    description,
    category,
    quantity,
    created_by: profile.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function updateInventoryItem(boatId: string, itemId: string, formData: FormData) {
  await requireProfile();
  const supabase = await createClient();

  const description = String(formData.get("description") ?? "").trim();
  if (!description) throw new Error("Description is required");
  const category = String(formData.get("category") ?? "other") as BoatInventoryCategory;
  const quantity = Math.max(1, Math.round(Number(formData.get("quantity") ?? 1)));

  const { error } = await supabase
    .from("boat_inventory_items")
    .update({ description, category, quantity })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}

export async function deleteInventoryItem(boatId: string, itemId: string) {
  await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("boat_inventory_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/boats/${boatId}/maintenance/inventory`);
}
