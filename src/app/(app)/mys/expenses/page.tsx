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
  const { data: expenses } = await supabase.from("mys_expenses").select("*").order("expense_date", { ascending: false });

  const receiptPaths = [...new Set((expenses ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])))];
  const signedUrlByPath = await getCachedSignedUrls("receipts", receiptPaths);
  const withUrls = (expenses ?? []).map((e) => ({
    ...e,
    receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
  }));

  return <MysExpensesManager expenses={withUrls} locale={locale} />;
}
