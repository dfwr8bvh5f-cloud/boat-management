import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { computeBankBalance, computeCashBalance } from "@/lib/balances";

// Bank/cash balance are each a full-history scan (see balances.ts) - the
// slowest queries on the boat dashboard by a wide margin. Two separate
// spots on that page need the result (the balance cards, and the payroll
// warning banner further down, which needs bankBalance too) - cache()
// means whichever of the two Suspense boundaries resolves first pays for
// the actual fetch, and the other just reuses that same promise/result
// instead of re-running the whole scan a second time in the same request.
export const getCachedBoatFinancialSummary = cache(async (boatId: string) => {
  const supabase = await createClient();
  const [bankBalance, cashNet] = await Promise.all([
    computeBankBalance(supabase, boatId),
    computeCashBalance(supabase, boatId),
  ]);
  return { bankBalance, cashNet };
});
