import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { BankReconciliationManager } from "@/components/bank-reconciliation-manager";
import { getCategoryLabels, getExpenseCategories, getPaymentLabels } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";
import type { Expense } from "@/lib/types/database";

export default async function BankReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const { locale } = await getTranslator();
  const categoryLabels = getCategoryLabels(locale);
  const categories = getExpenseCategories(boat.boat_type);
  const paymentLabels = getPaymentLabels(locale);

  const supabase = await createClient();

  const [{ data: lines }, { data: linkedExpenses }] = await Promise.all([
    supabase
      .from("bank_statement_lines")
      .select("*")
      .eq("boat_id", boat.id)
      .order("tx_date", { ascending: false })
      .order("statement_order", { ascending: true }),
    supabase.from("expenses").select("*").eq("boat_id", boat.id).not("bank_statement_line_id", "is", null),
  ]);

  const linkedByLineId = new Map((linkedExpenses ?? []).map((e) => [e.bank_statement_line_id as string, e]));
  const linesWithMatch = (lines ?? []).map((l) => ({ ...l, matchedExpense: linkedByLineId.get(l.id) ?? null }));
  const unmatchedLines = linesWithMatch.filter((l) => !l.matchedExpense);
  const matchedLines = linesWithMatch.filter((l) => l.matchedExpense);

  let unmatchedExpenses: Expense[] = [];
  if (lines && lines.length > 0) {
    const minDate = lines.reduce((m, l) => (l.tx_date < m ? l.tx_date : m), lines[0].tx_date);
    const maxDate = lines.reduce((m, l) => (l.tx_date > m ? l.tx_date : m), lines[0].tx_date);

    const { data: candidateExpenses } = await supabase
      .from("expenses")
      .select("*")
      .eq("boat_id", boat.id)
      .eq("status", "approved")
      .in("payment_method", ["card", "bank_transfer"])
      .is("bank_statement_line_id", null)
      .gte("expense_date", minDate)
      .lte("expense_date", maxDate);

    unmatchedExpenses = candidateExpenses ?? [];
  }

  return (
    <BankReconciliationManager
      boatId={boat.id}
      unmatchedLines={unmatchedLines}
      matchedLines={matchedLines}
      unmatchedExpenses={unmatchedExpenses}
      categories={categories}
      categoryLabels={categoryLabels}
      paymentLabels={paymentLabels}
      canEdit={canEdit}
      locale={locale}
    />
  );
}
