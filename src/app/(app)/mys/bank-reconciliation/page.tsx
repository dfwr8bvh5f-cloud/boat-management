import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { getCachedSignedUrls } from "@/lib/storage-cache";
import { getMysExpenseCategoryLabels, getPaymentLabels } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import { reconcile, type AppTxn, type BankTxn, type ReconciliationRecordType } from "@/lib/reconciliation-engine";
import { MysReconciliationSplitView } from "@/components/mys-reconciliation-split-view";
import type {
  MysReconciliationItem,
  MysReconItemAppRecord,
  MysReconItemBankLine,
  MysArchivedRecordView,
} from "@/components/mys-bank-reconciliation-manager";
import type { MysBankStatementLine, MysExpense } from "@/lib/types/database";

// Mirrors boats/[id]/finance/bank-reconciliation/page.tsx, scoped to
// mys_expenses only - see supabase/migrations/0078_mys_bank_reconciliation.sql.
export default async function MysBankReconciliationPage() {
  const profile = await requireProfile();
  if (profile.role !== "management") redirect("/mys");

  const { locale } = await getTranslator();
  const categoryLabels = getMysExpenseCategoryLabels(locale);
  const paymentLabels = getPaymentLabels(locale);

  const supabase = await createClient();

  const [lines, { data: statementFiles }, allExpenses] = await Promise.all([
    fetchAllRows<MysBankStatementLine>((from, to) =>
      supabase
        .from("mys_bank_statement_lines")
        .select("*")
        .order("tx_date", { ascending: false })
        .order("statement_order", { ascending: true })
        .range(from, to)
    ),
    supabase.from("mys_bank_statement_files").select("*").order("uploaded_at", { ascending: false }),
    fetchAllRows<MysExpense>((from, to) =>
      supabase.from("mys_expenses").select("*").is("archived_at", null).order("expense_date", { ascending: false }).range(from, to)
    ),
  ]);

  // Same two-date-bound approach as the boat page - see its own comment for
  // why padding only ever helps find a match, never manufactures a gap.
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

  let candidateExpenses: MysExpense[] = [];
  let archivedCandidateExpenses: MysExpense[] = [];
  if (rangeMin && rangeMax) {
    const [{ data: exps }, { data: archExps }] = await Promise.all([
      supabase
        .from("mys_expenses")
        .select("*")
        .in("payment_method", ["card", "bank_transfer"])
        .is("archived_at", null)
        .gte("expense_date", rangeMin)
        .lte("expense_date", rangeMax),
      supabase.from("mys_expenses").select("*").in("payment_method", ["card", "bank_transfer"]).not("archived_at", "is", null),
    ]);
    candidateExpenses = exps ?? [];
    archivedCandidateExpenses = archExps ?? [];
  }

  const bankTxns: BankTxn[] = (lines ?? []).map((l) => ({
    id: l.id,
    recordType: "expense" as ReconciliationRecordType,
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
  ].filter((a) => a.date);

  const results = reconcile(bankTxns, appTxns);

  const receiptPaths = [
    ...new Set([...(allExpenses ?? []), ...archivedCandidateExpenses].flatMap((e) => (e.receipt_path ? [e.receipt_path] : []))),
  ];
  const statementFilePaths = (statementFiles ?? []).map((f) => f.file_path);
  const [signedUrlByPath, statementFileUrlByPath] = await Promise.all([
    getCachedSignedUrls("receipts", receiptPaths),
    getCachedSignedUrls("bank-statements", statementFilePaths),
  ]);

  const toBankView = (b: BankTxn): MysReconItemBankLine => ({ id: b.id, description: b.description, date: b.date, amount: b.amount });
  const toAppView = (a: AppTxn): MysReconItemAppRecord => {
    const recordId = a.id.slice(a.id.indexOf(":") + 1);
    const source = [...candidateExpenses, ...archivedCandidateExpenses].find((e) => e.id === recordId);
    return {
      id: recordId,
      description: a.description,
      date: a.date,
      amount: a.amount,
      fromArchive: !!a.fromArchive,
      receiptUrl: (source?.receipt_path && signedUrlByPath.get(source.receipt_path)) ?? null,
      receiptPath: source?.receipt_path ?? null,
    };
  };

  const isWithinExactRange = (a: { date: string }) => exactMin !== null && exactMax !== null && a.date >= exactMin && a.date <= exactMax;
  const isArchived = (r: (typeof results)[number]) =>
    r.status === "missing_in_bank" && r.appItems.length === 1 && !!r.appItems[0].fromArchive;

  const toItem = (r: (typeof results)[number]): MysReconciliationItem => {
    const bankLines = r.bankItems.map(toBankView);
    const appRecords = r.appItems.map(toAppView);
    return {
      key: `${r.status}:${[...bankLines.map((b) => b.id), ...appRecords.map((a) => a.id)].join(",")}`,
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

  const reconciliationItems: MysReconciliationItem[] = relevantResults.filter((r) => !isArchived(r)).map(toItem);

  const statementFilesWithUrls = (statementFiles ?? []).map((f) => ({
    id: f.id,
    fileName: f.file_name,
    uploadedAt: f.uploaded_at,
    url: statementFileUrlByPath.get(f.file_path) ?? null,
  }));

  const archivedRecords: MysArchivedRecordView[] = archivedCandidateExpenses
    .map((e) => ({
      id: e.id,
      description: e.description,
      date: e.expense_date ?? "",
      amount: e.amount,
      receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
      receiptPath: e.receipt_path,
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const { data: boats } = await supabase.from("boats").select("id, name").order("name");
  const { data: clients } = await supabase.from("mys_clients").select("id, name").order("name");
  const boatNames = new Set((boats ?? []).map((b) => b.name));
  const clientNames = [...(boats ?? []).map((b) => b.name), ...(clients ?? []).map((c) => c.name).filter((n) => !boatNames.has(n))];
  const expensesWithUrls = (allExpenses ?? []).map((e) => ({
    ...e,
    receiptUrl: (e.receipt_path && signedUrlByPath.get(e.receipt_path)) ?? null,
  }));

  return (
    <MysReconciliationSplitView
      locale={locale}
      expensesProps={{ expenses: expensesWithUrls, clientNames, locale }}
      reconciliationProps={{
        reconciliationItems,
        archivedRecords,
        statementFiles: statementFilesWithUrls,
        categoryLabels,
        paymentLabels,
        canEdit: true,
        locale,
      }}
    />
  );
}
