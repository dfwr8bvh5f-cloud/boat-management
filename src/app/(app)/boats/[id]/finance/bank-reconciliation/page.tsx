import { redirect } from "next/navigation";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { ReconciliationSplitView } from "@/components/reconciliation-split-view";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";
import type { ReconciliationItem, ReconItemAppRecord, ReconItemBankLine } from "@/components/bank-reconciliation-manager";
import type { CashTransaction, Expense, Income } from "@/lib/types/database";

export default async function BankReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile } = await getBoatContext(id);
  if (profile.role !== "management") redirect(`/boats/${id}`);
  const { locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boat.boat_type, boat.name);
  const paymentLabels = getPaymentLabels(locale);

  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("bank_statement_lines")
    .select("*")
    .eq("boat_id", boat.id)
    .order("tx_date", { ascending: false })
    .order("statement_order", { ascending: true });

  // Bounded to exactly the span of statement lines actually on file, with
  // no padding - a record dated outside every uploaded statement's own
  // period genuinely couldn't appear on one, so it must not be flagged as
  // "missing in bank" just because it's a few days away from that period.
  const txDates = (lines ?? []).map((l) => l.tx_date).sort();
  const rangeMin = txDates.length ? txDates[0] : null;
  const rangeMax = txDates.length ? txDates[txDates.length - 1] : null;

  let candidateExpenses: Expense[] = [];
  let candidateCashTx: CashTransaction[] = [];
  let candidateIncomes: Income[] = [];
  if (rangeMin && rangeMax) {
    const [{ data: exps }, { data: cashTx }, { data: incomes }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .in("payment_method", ["card", "bank_transfer"])
        .gte("expense_date", rangeMin)
        .lte("expense_date", rangeMax),
      supabase
        .from("cash_transactions")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .eq("type", "withdrawal")
        .gte("tx_date", rangeMin)
        .lte("tx_date", rangeMax),
      supabase
        .from("incomes")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .eq("type", "actual")
        .gte("income_date", rangeMin)
        .lte("income_date", rangeMax),
    ]);
    candidateExpenses = exps ?? [];
    candidateCashTx = cashTx ?? [];
    candidateIncomes = incomes ?? [];
  }

  // Every bank line and every ledger record for this boat is run through
  // the deterministic rule engine fresh on every page load - there is no
  // persisted "is this matched" flag to go stale, so what's shown is always
  // exactly what the current data actually supports. A record a captain
  // already linked to a line (via "adopt existing" or "create from line")
  // simply re-matches itself with full confidence, since adopting a line
  // sets the record's own date/amount to the line's values.
  const bankTxns: BankTxn[] = (lines ?? []).map((l) => ({
    id: l.id,
    recordType: l.line_type as ReconciliationRecordType,
    date: l.tx_date,
    amount: l.amount,
    currency: "EUR",
    description: l.description,
  }));
  const appTxns: AppTxn[] = [
    ...candidateExpenses.map((e) => ({
      id: `expense:${e.id}`,
      recordType: "expense" as ReconciliationRecordType,
      date: e.expense_date ?? "",
      amount: e.amount,
      currency: "EUR",
      paymentMethod: e.payment_method,
      description: e.description,
    })),
    ...candidateCashTx.map((c) => ({
      id: `cash_withdrawal:${c.id}`,
      recordType: "cash_withdrawal" as ReconciliationRecordType,
      date: c.tx_date,
      amount: c.amount,
      currency: "EUR",
      description: c.notes ?? "",
    })),
    ...candidateIncomes.map((i) => ({
      id: `income:${i.id}`,
      recordType: "income" as ReconciliationRecordType,
      date: i.income_date,
      amount: i.amount,
      currency: "EUR",
      description: i.source,
    })),
  ].filter((a) => a.date);

  const results = reconcile(bankTxns, appTxns);

  const toBankView = (b: BankTxn): ReconItemBankLine => ({
    id: b.id,
    lineType: b.recordType,
    description: b.description,
    date: b.date,
    amount: b.amount,
  });
  const toAppView = (a: AppTxn): ReconItemAppRecord => ({
    id: a.id.slice(a.id.indexOf(":") + 1),
    recordType: a.recordType,
    description: a.description,
    date: a.date,
    amount: a.amount,
  });

  const reconciliationItems: ReconciliationItem[] = results
    .filter((r) => r.status !== "excluded_cash")
    .map((r) => {
      const bankLines = r.bankItems.map(toBankView);
      const appRecords = r.appItems.map(toAppView);
      return {
        key: `${r.status}:${[...bankLines.map((b) => b.id), ...appRecords.map((a) => `${a.recordType}-${a.id}`)].join(",")}`,
        status: r.status,
        confidence: r.confidence,
        bankLines,
        appRecords,
        differenceAmount: r.differenceAmount,
        notes: r.notes,
      };
    });

  const { data: allExpenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .order("expense_date", { ascending: false });

  const receiptPaths = [
    ...new Set((allExpenses ?? []).flatMap((e) => [e.receipt_path, e.photo_path].filter((p): p is string => Boolean(p)))),
  ];
  const signedUrlByPath = new Map<string, string>();
  if (receiptPaths.length > 0) {
    const { data: signedUrls } = await supabase.storage.from("receipts").createSignedUrls(receiptPaths, 3600);
    for (const s of signedUrls ?? []) {
      if (s.signedUrl) signedUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const statementLineIds = [
    ...new Set((allExpenses ?? []).flatMap((e) => (e.bank_statement_line_id ? [e.bank_statement_line_id] : []))),
  ];
  const statementOrderById = new Map<string, number>();
  if (statementLineIds.length > 0) {
    const { data: statementLines } = await supabase
      .from("bank_statement_lines")
      .select("id, statement_order")
      .in("id", statementLineIds);
    for (const l of statementLines ?? []) statementOrderById.set(l.id, l.statement_order);
  }
  const expensesWithUrls = (allExpenses ?? [])
    .map((e) => ({
      ...e,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      photoUrl: (e.photo_path && signedUrlByPath.get(e.photo_path)) ?? null,
      statementOrder: e.bank_statement_line_id ? (statementOrderById.get(e.bank_statement_line_id) ?? null) : null,
    }))
    .sort((a, b) => {
      const byDate = (b.expense_date ?? "").localeCompare(a.expense_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      return 0;
    });

  return (
    <ReconciliationSplitView
      locale={locale}
      expensesProps={{
        boatId: boat.id,
        boatType: boat.boat_type,
        boatName: boat.name,
        expenses: expensesWithUrls,
        canAdd: true,
        isManagement: true,
        locale,
      }}
      reconciliationProps={{
        boatId: boat.id,
        reconciliationItems,
        categories,
        categoryLabels,
        paymentLabels,
        canEdit: true,
        locale,
      }}
    />
  );
}
