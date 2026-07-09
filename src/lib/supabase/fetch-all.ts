// Supabase caps an unbounded select() at 1000 rows by default. Any query
// that isn't already narrowed by a tight filter (a specific id, a short date
// range) needs this instead of trusting a single page - a silently truncated
// fetch doesn't error, it just quietly drops rows, which is especially
// dangerous feeding into financial reconciliation (see reconciliation-engine.ts):
// a bank statement line or expense that got cut from the page reads as
// genuinely missing instead of merely unfetched.
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}
