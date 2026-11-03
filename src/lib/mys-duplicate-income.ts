import { round2 } from "@/lib/money";

// An income row recorded with a client but never linked to a specific debt
// counts as a credit for that client (see creditsByClient, mys/debts/page.tsx).
// If someone then records the payment on the debt itself ("record payment"),
// a SECOND income row is created for the same money and the first one is
// left over as a phantom credit (confirmed live: a €500 cash payment entered
// twice left a €500 credit on a boat that owed nothing).
//
// This finds those candidates so the payment form can warn before it happens:
// same client (ignoring case/spaces) and exactly the same amount. Purely a
// deterministic match for a warning - it never links or deletes anything.
export type UnlinkedIncomeRow = {
  id: string;
  client_name: string;
  amount: number;
  income_date: string;
  description: string | null;
};

const normalize = (name: string) => name.trim().toLowerCase();

export function findDuplicateIncomeCandidates(rows: UnlinkedIncomeRow[], clientName: string, amount: number): UnlinkedIncomeRow[] {
  const wanted = round2(amount);
  if (!(wanted > 0) || !clientName.trim()) return [];
  const client = normalize(clientName);
  return rows.filter((r) => normalize(r.client_name) === client && round2(r.amount) === wanted);
}
