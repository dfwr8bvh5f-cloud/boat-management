import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { MysExpensesManager } from "@/components/mys-expenses-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { MysPaymentMethodSummary } from "@/components/mys-payment-method-summary";
import { getTranslator } from "@/lib/i18n/locale";
import { thisMonthYearBounds } from "@/lib/date-format";
import { paymentMethodBreakdown } from "@/lib/labels";

export default async function MysExpensesPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/");

  const { t, locale } = await getTranslator();
  const supabase = await createClient();
  const [{ data: expenses }, { data: archivedExpenses }, { data: boats }, { data: clients }, { data: recurringTemplates }] = await Promise.all([
    supabase.from("mys_expenses").select("*").is("archived_at", null).order("expense_date", { ascending: false }),
    // Archived by the bank reconciliation page (a gap she set aside without
    // deleting) - kept out of the main list/total, same as a boat's own
    // archived expenses (see bank-reconciliation-manager.tsx).
    supabase.from("mys_expenses").select("*").not("archived_at", "is", null).order("expense_date", { ascending: false }),
    supabase.from("boats").select("id, name").order("name"),
    supabase.from("mys_clients").select("id, name").order("name"),
    supabase.from("mys_expense_recurring_templates").select("*").order("next_due_date"),
  ]);

  // Same combined list as the income/debts pages' client picker: boats and
  // ad-hoc mys_clients entries together, alphabetical, deduped against any
  // boat name.
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))].sort((a, b) =>
    a.localeCompare(b)
  );

  const { thisMonth, thisYear, firstOfNextMonth } = thisMonthYearBounds();
  const expensesThisYear = (expenses ?? []).filter((e) => e.expense_date && e.expense_date >= `${thisYear}-01-01` && e.expense_date <= `${thisYear}-12-31`);
  const expensesThisMonth = expensesThisYear.filter((e) => e.expense_date! >= thisMonth && e.expense_date! < firstOfNextMonth);
  const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

  const receiptPaths = [
    ...new Set([...(expenses ?? []), ...(archivedExpenses ?? [])].flatMap((e) => (e.receipt_path ? [e.receipt_path] : []))),
  ];
  const signedUrlByPath = await getCachedSignedUrls("receipts", receiptPaths);
  const withUrls = (rows: typeof expenses) =>
    (rows ?? []).map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
    }));

  return (
    <div className="flex flex-col gap-3">
      <MysBackLink locale={locale} />
      <MysPaymentMethodSummary
        monthLabel={t("mys_expenses_month")}
        monthTotal={sum(expensesThisMonth)}
        monthBreakdown={paymentMethodBreakdown(expensesThisMonth)}
        yearLabel={t("mys_expenses_year")}
        yearTotal={sum(expensesThisYear)}
        yearBreakdown={paymentMethodBreakdown(expensesThisYear)}
        tone="negative"
        locale={locale}
      />
      <MysExpensesManager
        expenses={withUrls(expenses)}
        archivedExpenses={withUrls(archivedExpenses)}
        clientNames={clientNames}
        recurringTemplates={recurringTemplates ?? []}
        locale={locale}
      />
    </div>
  );
}
