import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "./fetch-all";

// Simulates Supabase's own behavior: a single unbounded select() caps at
// 1000 rows silently (no error) - fetchAllRows exists specifically to page
// past that cap instead of trusting the first response.
function makeFakeTable(totalRows: number) {
  const all = Array.from({ length: totalRows }, (_, i) => ({ id: i }));
  return (from: number, to: number) => Promise.resolve({ data: all.slice(from, Math.min(to + 1, all.length)) });
}

describe("fetchAllRows", () => {
  it("returns everything when the whole table fits in one page", () => {
    return fetchAllRows(makeFakeTable(3)).then((rows) => {
      expect(rows).toHaveLength(3);
    });
  });

  it("pages past Supabase's 1000-row cap instead of silently truncating", async () => {
    const rows = await fetchAllRows(makeFakeTable(2500));
    expect(rows).toHaveLength(2500);
  });

  it("stops requesting further pages once a short page is returned", async () => {
    const query = vi.fn(makeFakeTable(1500));
    await fetchAllRows(query);
    // 1000-row page, then a 500-row (short) page that ends the loop -
    // exactly 2 calls, not a 3rd probing an already-known-empty page.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array for an empty table, never null/undefined", async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: [] }));
    expect(rows).toEqual([]);
  });

  it("treats a null data response as end-of-results rather than looping forever", async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: null }));
    expect(rows).toEqual([]);
  });
});
