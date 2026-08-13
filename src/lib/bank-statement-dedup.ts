import { normalizeDescription } from "@/lib/reconciliation-engine";

// Two lines with the same date and amount are the same real transaction
// even when their description text isn't byte-identical - re-scanning an
// overlapping statement period can have the AI extract a slightly
// truncated or extended version of the same line (e.g. a trailing
// reference code present in one read and missing in another), and an
// exact-string dedup check lets that slip through as a second, genuinely
// duplicate row. Treating one normalized description as a long-enough
// prefix of the other catches that specific failure mode without going
// so loose it could merge two coincidentally same-amount, same-day but
// actually different transactions.
export function sameStatementLine(a: string, b: string): boolean {
  const na = normalizeDescription(a);
  const nb = normalizeDescription(b);
  if (na === nb) return true;
  if (na.length < 8 || nb.length < 8) return false;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return longer.startsWith(shorter);
}
