import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { BankReconciliationManager } from "@/components/bank-reconciliation-manager";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import type { CashTransaction, Expense, Income } from "@/lib/types/database";

export default async function BankReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const { locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boat.boat_type);
  const paymentLabels = getPaymentLabels(locale);

  const supabase = await createClient();

  const [{ data: lines }, { data: linkedExpenses }, { data: linkedCashTx }, { data: linkedIncomes }] = await Promise.all([
    supabase
      .from("bank_statement_lines")
      .select("*")
      .eq("boat_id", boat.id)
      .order("tx_date", { ascending: false })
      .order("statement_order", { ascending: true }),
    supabase.from("expenses").select("*").eq("boat_id", boat.id).not("bank_statement_line_id", "is", null),
    supabase.from("cash_transactions").select("*").eq("boat_id", boat.id).not("bank_statement_line_id", "is", null),
    supabase.from("incomes").select("*").eq("boat_id", boat.id).not("bank_statement_line_id", "is", null),
  ]);

  const matchByLineId = new Map<string, Expense | CashTransaction | Income>();
  for (const e of linkedExpenses ?? []) matchByLineId.set(e.bank_statement_line_id as string, e);
  for (const c of linkedCashTx ?? []) matchByLineId.set(c.bank_statement_line_id as string, c);
  for (const i of linkedIncomes ?? []) matchByLineId.set(i.bank_statement_line_id as string, i);

  const linesWithMatch = (lines ?? []).map((l) => ({ ...l, matchedRecord: matchByLineId.get(l.id) ?? null }));
  const unmatchedLines = linesWithMatch.filter((l) => !l.matchedRecord);
  const matchedLines = linesWithMatch.filter((l) => l.matchedRecord);

  let unmatchedExpenses: Expense[] = [];
  let unmatchedCashWithdrawals: CashTransaction[] = [];
  let unmatchedIncomes: Income[] = [];

  if (lines && lines.length > 0) {
    const minDate = lines.reduce((m, l) => (l.tx_date < m ? l.tx_date : m), lines[0].tx_date);
    const maxDate = lines.reduce((m, l) => (l.tx_date > m ? l.tx_date : m), lines[0].tx_date);

    const [{ data: candidateExpenses }, { data: candidateCashTx }, { data: candidateIncomes }] = await Promise.all([
      supabase
        .from("expenses")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .in("payment_method", ["card", "bank_transfer"])
        .is("bank_statement_line_id", null)
        .gte("expense_date", minDate)
        .lte("expense_date", maxDate),
      supabase
        .from("cash_transactions")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .eq("type", "withdrawal")
        .is("bank_statement_line_id", null)
        .gte("tx_date", minDate)
        .lte("tx_date", maxDate),
      supabase
        .from("incomes")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("status", "approved")
        .eq("type", "actual")
        .is("bank_statement_line_id", null)
        .gte("income_date", minDate)
        .lte("income_date", maxDate),
    ]);

    unmatchedExpenses = candidateExpenses ?? [];
    unmatchedCashWithdrawals = candidateCashTx ?? [];
    unmatchedIncomes = candidateIncomes ?? [];
  }

  return (
    <BankReconciliationManager
      boatId={boat.id}
      unmatchedLines={unmatchedLines}
      matchedLines={matchedLines}
      unmatchedExpenses={unmatchedExpenses}
      unmatchedCashWithdrawals={unmatchedCashWithdrawals}
      unmatchedIncomes={unmatchedIncomes}
      categories={categories}
      categoryLabels={categoryLabels}
      paymentLabels={paymentLabels}
      canEdit={canEdit}
      locale={locale}
    />
  );
}
