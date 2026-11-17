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
import type { ExpenseInvoiceLink } from "@/components/mys-expense-invoice-link";

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
  const linkedExpenseRows = await fetchRowsForIds<{ id: string; boat_id: string | null; amount: number; mys_invoice_id: string | null }>(
    linkedExpenseIds,
    (chunk) => supabase.from("expenses").select("id, boat_id, amount, mys_invoice_id").in("id", chunk)
  );
  const linkedAdHocIds = [
    ...new Set([...(expenses ?? []), ...(archivedExpenses ?? [])].flatMap((e) => (e.linked_ad_hoc_charge_id ? [e.linked_ad_hoc_charge_id] : []))),
  ];
  const linkedAdHocRows = await fetchRowsForIds<{ id: string; client_name: string; amount: number; invoice_id: string | null }>(linkedAdHocIds, (chunk) =>
    supabase.from("mys_ad_hoc_charges").select("id, client_name, amount, invoice_id").in("id", chunk)
  );

  // Issued invoices (sent/paid) a client-billed expense can be attached to,
  // with what is already attached to each (so the remaining room is known).
  const { data: issuedInvoices } = await supabase
    .from("mys_invoices")
    .select("id, invoice_number, boat_id, client_name, amount, vat_amount, status")
    .in("status", ["sent", "paid"]);
  const issuedIds = (issuedInvoices ?? []).map((i) => i.id);
  const [attachedExpenseRows, attachedAdHocRows] = await Promise.all([
    fetchRowsForIds<{ mys_invoice_id: string | null; amount: number }>(issuedIds, (chunk) =>
      supabase.from("expenses").select("mys_invoice_id, amount").in("mys_invoice_id", chunk)
    ),
    fetchRowsForIds<{ invoice_id: string | null; amount: number }>(issuedIds, (chunk) =>
      supabase.from("mys_ad_hoc_charges").select("invoice_id, amount").in("invoice_id", chunk)
    ),
  ]);
  const attachedByInvoiceId = new Map<string, number>();
  for (const r of attachedExpenseRows) if (r.mys_invoice_id) attachedByInvoiceId.set(r.mys_invoice_id, (attachedByInvoiceId.get(r.mys_invoice_id) ?? 0) + r.amount);
  for (const r of attachedAdHocRows) if (r.invoice_id) attachedByInvoiceId.set(r.invoice_id, (attachedByInvoiceId.get(r.invoice_id) ?? 0) + r.amount);
  const invoiceNumberById = new Map((issuedInvoices ?? []).map((i) => [i.id, i.invoice_number]));
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const expenseRowById = new Map(linkedExpenseRows.map((r) => [r.id, r]));
  const adHocRowById = new Map(linkedAdHocRows.map((r) => [r.id, r]));
  const invoiceLinkFor = (e: { linked_expense_id: string | null; linked_ad_hoc_charge_id: string | null }): ExpenseInvoiceLink | null => {
    const charge = e.linked_expense_id ? expenseRowById.get(e.linked_expense_id) : null;
    const adHoc = e.linked_ad_hoc_charge_id ? adHocRowById.get(e.linked_ad_hoc_charge_id) : null;
    const debt = charge
      ? { kind: "charge" as const, id: charge.id, amount: charge.amount, invoiceId: charge.mys_invoice_id, boatId: charge.boat_id, clientName: null }
      : adHoc
        ? { kind: "ad_hoc" as const, id: adHoc.id, amount: adHoc.amount, invoiceId: adHoc.invoice_id, boatId: null, clientName: adHoc.client_name }
        : null;
    if (!debt) return null;
    const attachedNumber = debt.invoiceId ? invoiceNumberById.get(debt.invoiceId) : null;
    const options = debt.invoiceId
      ? []
      : (issuedInvoices ?? [])
          .filter((i) =>
            debt.kind === "charge"
              ? debt.boatId !== null && i.boat_id === debt.boatId
              : i.client_name.trim().toLowerCase() === (debt.clientName ?? "").trim().toLowerCase()
          )
          .map((i) => {
            const gross = round2(i.amount + (i.vat_amount ?? 0));
            return { id: i.id, number: i.invoice_number, status: i.status, gross, remaining: round2(gross - (attachedByInvoiceId.get(i.id) ?? 0)) };
          });
    return {
      debt: { kind: debt.kind, id: debt.id, amount: debt.amount },
      attachedTo: debt.invoiceId ? { invoiceId: debt.invoiceId, number: attachedNumber ?? "" } : null,
      // Whether it came in through an invoice line is only known on the invoice
      // page; the server refuses to detach a line-sourced debt with a message.
      viaLine: false,
      options,
    };
  };
  const boatNameById = new Map((boats ?? []).map((b) => [b.id, b.name]));
  const linkedBoatNameByExpenseId = new Map(
    (linkedExpenseRows ?? []).map((r) => [r.id, r.boat_id ? (boatNameById.get(r.boat_id) ?? t("mys_deleted_boat_label")) : t("mys_deleted_boat_label")])
  );

  const withUrls = (rows: typeof expenses) =>
    (rows ?? []).map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      linkedBoatName: e.linked_expense_id ? (linkedBoatNameByExpenseId.get(e.linked_expense_id) ?? null) : null,
      invoiceLink: invoiceLinkFor(e),
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
