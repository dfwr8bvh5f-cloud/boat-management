import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysExpensesManager } from "@/components/mys-expenses-manager";
import { getTranslator } from "@/lib/i18n/locale";

export default async function MysExpensesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: expenses }, { data: boats }, { data: clients }] = await Promise.all([
    supabase.from("mys_expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
    supabase.from("mys_clients").select("id, name").order("name"),
  ]);

  // Same combined list as the income/debts pages' client picker: boats
  // first, then ad-hoc mys_clients entries, deduped against any boat name.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))];

  const receiptPaths = [...new Set((expenses ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])))];
  const signedUrlByPath = await getCachedSignedUrls("receipts", receiptPaths);
  const withUrls = (expenses ?? []).map((e) => ({
    ...e,
    receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
  }));

  return <MysExpensesManager expenses={withUrls} clientNames={clientNames} locale={locale} />;
}
