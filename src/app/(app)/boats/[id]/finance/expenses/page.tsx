import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ExpensesManager } from "@/components/expenses-manager";
import { getLocale } from "@/lib/i18n/locale";

export default async function ExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const locale = await getLocale();

  const supabase = await createClient();
  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .order("expense_date", { ascending: false });

  // Batched into one request for every receipt instead of one signed-URL
  // call per expense - with hundreds of expenses that N+1 pattern was by
  // far the slowest part of loading this page.
  const receiptPaths = [...new Set((expenses ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])))];
  const signedUrlByPath = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const withUrls = (expenses ?? []).map((e) => ({
    ...e,
    receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
  }));

  return (
    <ExpensesManager
      boatId={boat.id}
      boatType={boat.boat_type}
      expenses={withUrls}
      canAdd={canEdit}
      isManagement={profile.role === "management"}
      locale={locale}
    />
  );
}
