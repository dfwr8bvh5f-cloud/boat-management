// Supabase caps an unbounded select() at 1000 rows by default. Any query
// that isn't already narrowed by a tight filter (a specific id, a short date
// range) needs this instead of trusting a single page - a silently truncated
// fetch doesn't error, it just quietly drops rows, which is especially
// dangerous feeding into financial reconciliation (see reconciliation-engine.ts):
// a bank statement line or expense that got cut from the page reads as
// genuinely missing instead of merely unfetched.
//
// A failed page throws instead of ending the loop: swallowing it would hand
// back a partial list that looks complete, and every caller (balances,
// reports, the fleet list) would then silently total the wrong rows.
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>,
  // How many pages to request together in the very first wave. 1 (default)
  // costs a single request for a table that fits in one page; a caller that
  // already knows its table is large (e.g. the fleet-wide expenses scan)
  // can ask for more up front instead of paying a lone first round trip.
  { pagesUpFront = 1 }: { pagesUpFront?: number } = {}
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  // After the first wave proves the table is bigger than what it asked for,
  // the remaining pages are requested a few at a time instead of one after
  // another - a fleet-wide scan used to wait out 3+ sequential round trips.
  const PARALLEL_PAGES = 3;
  const rows: T[] = [];

  let from = 0;
  let wave = pagesUpFront;
  for (;;) {
    const starts = Array.from({ length: wave }, (_, i) => from + i * PAGE_SIZE);
    const results = await Promise.all(starts.map((start) => buildQuery(start, start + PAGE_SIZE - 1)));
    // Consumed in page order so the combined list keeps the same order a
    // sequential scan would have produced; pages requested beyond the end
    // of the table simply come back empty and end the scan.
    for (const [i, { data, error }] of results.entries()) {
      if (error) {
        console.error(`fetchAllRows: page starting at row ${starts[i]} failed:`, error.message);
        throw new Error(error.message);
      }
      if (!data || data.length === 0) return rows;
      rows.push(...data);
      if (data.length < PAGE_SIZE) return rows;
    }
    from += wave * PAGE_SIZE;
    wave = PARALLEL_PAGES;
  }
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
