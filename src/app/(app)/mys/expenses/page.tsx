import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { fetchRowsForIds } from "@/lib/supabase/fetch-all";
import { MysExpensesManager } from "@/components/mys-expenses-manager";
import { MysBackLink } from "@/components/mys-back-link";
import { MysPaymentMethodSummary } from "@/components/mys-payment-method-summary";
import { CategoryPieChart } from "@/components/report-charts-lazy";
import { getTranslator } from "@/lib/i18n/locale";
import { thisMonthYearBounds } from "@/lib/date-format";
import { paymentMethodBreakdown, getMysExpenseCategoryLabels, MYS_EXPENSE_CATEGORY_COLORS } from "@/lib/labels";
import { formatCurrency } from "@/lib/money";
import type { MysExpenseCategory, MysExpenseAttachment } from "@/lib/types/database";

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

  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const byCategory = new Map<MysExpenseCategory, number>();
  for (const e of expensesThisYear) {
    if (!e.category) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }
  const pieData = [...byCategory.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([category, value]) => ({ category, name: categoryLabels[category], value, color: MYS_EXPENSE_CATEGORY_COLORS[category] }));

  const expenseIds = [...(expenses ?? []).map((e) => e.id), ...(archivedExpenses ?? []).map((e) => e.id)];
  // Chunked (see fetchRowsForIds) - this page aggregates expenses across
  // every boat at once, so expenseIds can get large enough to push a single
  // .in() call over a proxy's URL-length limit, silently wiping out every
  // receipt icon on the page (confirmed live on the boat-level equivalent
  // of this same query).
  const attachments = await fetchRowsForIds<MysExpenseAttachment>(expenseIds, (chunk) =>
    supabase.from("mys_expense_attachments").select("*").in("mys_expense_id", chunk).order("created_at")
  );

  const receiptPaths = [
    ...new Set(
      [
        ...(expenses ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])),
        ...(archivedExpenses ?? []).flatMap((e) => (e.receipt_path ? [e.receipt_path] : [])),
        ...(attachments ?? []).map((a) => a.file_path),
      ]
    ),
  ];
  const signedUrlByPath = await getCachedSignedUrls("receipts", receiptPaths);

  // The "also added as an expense on {boat}" note (mys_linked_boat_expense_note)
  // used to be filled with this row's own client_name, which is editable
  // after creation (see updateMysExpense's comment: the link itself never
  // moves, but client_name can drift or be cleared) - leaving the note blank
  // even though linked_expense_id still points at a real boat expense.
  // Resolved live here instead, same "don't trust a snapshot" fix already
  // applied to the invoice-attachment staleness bugs this session.
  const linkedExpenseIds = [
    ...new Set([...(expenses ?? []), ...(archivedExpenses ?? [])].flatMap((e) => (e.linked_expense_id ? [e.linked_expense_id] : []))),
  ];
  const linkedExpenseRows = await fetchRowsForIds<{ id: string; boat_id: string | null }>(linkedExpenseIds, (chunk) =>
    supabase.from("expenses").select("id, boat_id").in("id", chunk)
  );
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const linkedBoatNameByExpenseId = new Map(
    (linkedExpenseRows ?? []).map((r) => [r.id, r.boat_id ? (boatNameById.get(r.boat_id) ?? t("mys_deleted_boat_label")) : t("mys_deleted_boat_label")])
  );

  const withUrls = (rows: typeof expenses) =>
    (rows ?? []).map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      linkedBoatName: e.linked_expense_id ? (linkedBoatNameByExpenseId.get(e.linked_expense_id) ?? null) : null,
      attachments: (attachments ?? [])
        .filter((a) => a.mys_expense_id === e.id && signedUrlByPath.has(a.file_path))
        .map((a) => ({ id: a.id, path: a.file_path, url: signedUrlByPath.get(a.file_path)! })),
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
      {pieData.length > 0 && (
        <div className="rounded-xl border border-fleet-border bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-4 text-sm font-bold text-fleet-navy">{t("mys_expenses_by_category")}</h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <CategoryPieChart data={pieData} className="h-56 w-full sm:w-56 sm:shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              {pieData.map((c) => (
                <div key={c.category} className="flex items-center justify-between gap-3 border-b border-dotted border-fleet-border py-1 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <span className="tabular-nums" dir="ltr">
                    {formatCurrency(c.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
