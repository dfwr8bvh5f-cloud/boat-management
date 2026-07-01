import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ExpensesManager } from "@/components/expenses-manager";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);

  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .order("expense_date", { ascending: false });

  const withUrls = await Promise.all(
    (expenses ?? []).map(async (e) => {
      if (!e.receipt_path) return { ...e, receiptUrl: null };
      const { data } = await supabase.storage.from("receipts").createSignedUrl(e.receipt_path, 3600);
      return { ...e, receiptUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <ExpensesManager
      boatId={boat.id}
      expenses={withUrls}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
    />
  );
}
