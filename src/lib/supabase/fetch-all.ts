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

// A .in("col", ids) filter is sent as part of the request URL, not the
// body - a boat (or, worse, the MYS-wide expenses page) with enough history
// can pass hundreds of ids in one of these lists, long enough to exceed a
// proxy's URL-length limit and fail the whole request outright. Confirmed
// live: one boat with 942 expense ids silently wiped out every receipt
// attachment on its page, with the failed request's error never even
// surfacing - every row just read as "no attachments". Splitting into
// fixed-size chunks (run in parallel - a handful of requests, not hundreds)
// keeps each request's URL short regardless of how large the full id list
// gets, and a genuine failure now throws instead of silently vanishing.
const IN_CHUNK_SIZE = 150;

export async function fetchRowsForIds<T>(
  ids: string[],
  buildQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) chunks.push(ids.slice(i, i + IN_CHUNK_SIZE));
  const results = await Promise.all(chunks.map((chunk) => buildQuery(chunk)));
  const rows: T[] = [];
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
  }
  return rows;
}
