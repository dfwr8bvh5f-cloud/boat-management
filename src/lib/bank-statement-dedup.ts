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

// Which of a fresh batch of scanned lines are the same real transaction as
// one already saved for this boat - used to keep a re-scan of an
// overlapping statement period from treating an already-recorded line as
// new and running it through app-record matching again, which can produce
// a spurious "type mismatch" for something that was already resolved
// correctly the first time (confirmed in production, LULU: a cash
// withdrawal recorded via one statement's OCR read got flagged again as an
// "expense" on a re-scan that read the same line's merchant name instead of
// its category column).
export function findAlreadyRecordedIndices(
  lines: { date: string; amount: number; description?: string | null }[],
  existing: { tx_date: string; amount: number; description: string }[]
): Set<number> {
  const byDateAmount = new Map<string, string[]>();
  for (const l of existing) {
    const key = `${l.tx_date}|${l.amount}`;
    const arr = byDateAmount.get(key);
    if (arr) arr.push(l.description);
    else byDateAmount.set(key, [l.description]);
  }
  const result = new Set<number>();
  lines.forEach((l, i) => {
    const desc = (l.description ?? "").trim() || "—";
    const candidates = byDateAmount.get(`${l.date}|${l.amount}`) ?? [];
    if (candidates.some((c) => sameStatementLine(c, desc))) result.add(i);
  });
  return result;
}
