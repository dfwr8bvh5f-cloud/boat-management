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

  it("costs exactly one request when the table fits in a single page", async () => {
    const query = vi.fn(makeFakeTable(300));
    await fetchAllRows(query);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("requests the remaining pages in one parallel batch and keeps rows in page order", async () => {
    const query = vi.fn(makeFakeTable(1500));
    const rows = await fetchAllRows(query);
    // First page, then one batch of 3 (the 2nd page is short, the 3rd and
    // 4th come back empty and are ignored).
    expect(query).toHaveBeenCalledTimes(4);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 1500 }, (_, i) => i));
  });

  it("can request several pages in the very first wave when the caller knows the table is large", async () => {
    const query = vi.fn(makeFakeTable(4630));
    const rows = await fetchAllRows(query, { pagesUpFront: 5 });
    expect(query).toHaveBeenCalledTimes(5);
    expect(rows).toHaveLength(4630);
  });

  it("returns an empty array for an empty table, never null/undefined", async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: [] }));
    expect(rows).toEqual([]);
  });

  it("throws when a page fails instead of returning a partial list that looks complete", async () => {
    const all = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const query = (from: number, to: number) =>
      from === 0
        ? Promise.resolve({ data: all.slice(from, to + 1) })
        : Promise.resolve({ data: null, error: { message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchAllRows(query)).rejects.toThrow("boom");
    spy.mockRestore();
  });

  it("treats a null data response as end-of-results rather than looping forever", async () => {
    const rows = await fetchAllRows(() => Promise.resolve({ data: null }));
    expect(rows).toEqual([]);
  });
});
