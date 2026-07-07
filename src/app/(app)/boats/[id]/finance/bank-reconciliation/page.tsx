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

  // Two different date bounds, deliberately not the same:
  // - a PADDED range to actually fetch candidates for matching - a bank
  //   line dated right at the edge of a statement may still genuinely
  //   correspond to an app record a few days beyond it (e.g. a card charge
  //   that posted just after month-end), so matching itself is allowed to
  //   look up to 10 days either side.
  // - the EXACT (unpadded) span of statement lines on file, used further
  //   down to decide what's allowed to be reported as "missing in bank" -
  //   a record outside every statement's own dates was never going to be
  //   on one, so it must never be flagged as a gap just because it's a few
  //   days away. Padding only ever helps FIND a match; it never manufactures
  //   a false gap.
  const txDates = (lines ?? []).map((l) => l.tx_date).sort();
  const exactMin = txDates.length ? txDates[0] : null;
  const exactMax = txDates.length ? txDates[txDates.length - 1] : null;
  const padded = (iso: string, days: number) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const rangeMin = exactMin ? padded(exactMin, -10) : null;
  const rangeMax = exactMax ? padded(exactMax, 10) : null;

  let candidateExpenses: Expense[] = [];
  let candidateCashTx: CashTransaction[] = [];
  let candidateIncomes: Income[] = [];
  // Archived candidates are fetched separately, with NO date bound at all -
  // a record often ends up archived precisely because its own date (or
  // amount) was mistyped, so re-applying the same date window here would
  // just repeat that mistake and never let a later statement resolve it.
  let archivedCandidateExpenses: Expense[] = [];
  let archivedCandidateCashTx: CashTransaction[] = [];
  let archivedCandidateIncomes: Income[] = [];
  if (rangeMin && rangeMax) {
    const [{ data: exps }, { data: cashTx }, { data: incomes }, { data: archExps }, { data: archCashTx }, { data: archIncomes }] =
      await Promise.all([
        supabase
          .from("expenses")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .in("payment_method", ["card", "bank_transfer"])
          .is("archived_at", null)
          .gte("expense_date", rangeMin)
          .lte("expense_date", rangeMax),
        supabase
          .from("cash_transactions")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .eq("type", "withdrawal")
          .is("archived_at", null)
          .gte("tx_date", rangeMin)
          .lte("tx_date", rangeMax),
        supabase
          .from("incomes")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .eq("type", "actual")
          .is("archived_at", null)
          .gte("income_date", rangeMin)
          .lte("income_date", rangeMax),
        supabase
          .from("expenses")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .in("payment_method", ["card", "bank_transfer"])
          .not("archived_at", "is", null),
        supabase
          .from("cash_transactions")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .eq("type", "withdrawal")
          .not("archived_at", "is", null),
        supabase
          .from("incomes")
          .select("*")
          .eq("boat_id", boat.id)
          .eq("status", "approved")
          .eq("type", "actual")
          .not("archived_at", "is", null),
      ]);
    candidateExpenses = exps ?? [];
    candidateCashTx = cashTx ?? [];
    candidateIncomes = incomes ?? [];
    archivedCandidateExpenses = archExps ?? [];
    archivedCandidateCashTx = archCashTx ?? [];
    archivedCandidateIncomes = archIncomes ?? [];
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
    ...archivedCandidateExpenses.map((e) => ({
      id: `expense:${e.id}`,
      recordType: "expense" as ReconciliationRecordType,
      date: e.expense_date ?? "",
      amount: e.amount,
      currency: "EUR",
      paymentMethod: e.payment_method,
      description: e.description,
      fromArchive: true,
    })),
    ...archivedCandidateCashTx.map((c) => ({
      id: `cash_withdrawal:${c.id}`,
      recordType: "cash_withdrawal" as ReconciliationRecordType,
      date: c.tx_date,
      amount: c.amount,
      currency: "EUR",
      description: c.notes ?? "",
      fromArchive: true,
    })),
    ...archivedCandidateIncomes.map((i) => ({
      id: `income:${i.id}`,
      recordType: "income" as ReconciliationRecordType,
      date: i.income_date,
      amount: i.amount,
      currency: "EUR",
      description: i.source,
      fromArchive: true,
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
    fromArchive: !!a.fromArchive,
  });

  // A gap has no bank line to anchor it to a statement at all, so unlike a
  // match (which is only ever found within the statement's own padded
  // window in the first place), it needs its own explicit check here: only
  // report it if its date actually falls within a statement's exact span.
  const isWithinExactRange = (a: { date: string }) => exactMin !== null && exactMax !== null && a.date >= exactMin && a.date <= exactMax;

  // Archived records still take part in matching above (so a later
  // statement can still resolve them, even without a date match - see
  // reconciliation-engine.ts), but a "missing in bank" result for one is
  // routed into its own archived list instead of the regular gap list - she
  // asked these off her plate without losing the underlying record. Only
  // "missing_in_bank" supports this (always exactly one app record);
  // duplicates and reviewable mismatches are unaffected.
  const isArchived = (r: (typeof results)[number]) =>
    r.status === "missing_in_bank" && r.appItems.length === 1 && !!r.appItems[0].fromArchive;

  const toItem = (r: (typeof results)[number]): ReconciliationItem => {
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
  };

  const relevantResults = results
    .filter((r) => r.status !== "excluded_cash")
    .filter((r) => (r.status === "missing_in_bank" || r.status === "possible_duplicate" ? r.appItems.some(isWithinExactRange) : true));

  const reconciliationItems: ReconciliationItem[] = relevantResults.filter((r) => !isArchived(r)).map(toItem);
  const archivedItems: ReconciliationItem[] = relevantResults.filter(isArchived).map(toItem);

  const { data: statementFiles } = await supabase
    .from("bank_statement_files")
    .select("*")
    .eq("boat_id", boat.id)
    .order("uploaded_at", { ascending: false });
  const statementFilePaths = (statementFiles ?? []).map((f) => f.file_path);
  const statementFileUrlByPath = new Map<string, string>();
  if (statementFilePaths.length > 0) {
    const { data: signedStatementUrls } = await supabase.storage.from("bank-statements").createSignedUrls(statementFilePaths, 3600);
    for (const s of signedStatementUrls ?? []) {
      if (s.signedUrl) statementFileUrlByPath.set(s.path ?? "", s.signedUrl);
    }
  }
  const statementFilesWithUrls = (statementFiles ?? []).map((f) => ({
    id: f.id,
    fileName: f.file_name,
    uploadedAt: f.uploaded_at,
    url: statementFileUrlByPath.get(f.file_path) ?? null,
  }));

  const { data: allExpenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .is("archived_at", null)
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
      // Same date: expenses linked to the statement follow its exact row
      // order for that date, swapping places with each other if that's what
      // the statement shows - this mirrors exactly how the statement's own
      // lines are displayed elsewhere (date desc, then statement row order).
      const byDate = (b.expense_date ?? "").localeCompare(a.expense_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      // A cash expense (or anything not linked to a statement line) has no
      // statement position - it keeps the order it was entered in.
      return a.created_at.localeCompare(b.created_at);
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
        archivedItems,
        statementFiles: statementFilesWithUrls,
        categories,
        categoryLabels,
        paymentLabels,
        canEdit: true,
        locale,
      }}
    />
  );
}
