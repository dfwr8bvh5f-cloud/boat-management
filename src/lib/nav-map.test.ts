import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { FLEET_WIDE_ROUTES, PER_BOAT_ROUTES, UNAUTHENTICATED_ROUTES, NOT_CRAWLED_ROUTES } from "../../e2e/nav-map";

// The e2e crawl is only as complete as e2e/nav-map.ts. That file's header
// claimed to be a "complete inventory" while listing four pages that no
// longer exist (store, finance/invoices) and omitting every /mys page, so
// the browser review silently skipped the whole MYS area. This keeps the
// map honest by diffing it against the real src/app/**/page.tsx files.

function pageRoutes(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // (group) folders don't appear in the URL.
      const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
      const segment = isGroup ? "" : `/${entry.name.replace(/^\[(.+)\]$/, "{$1}")}`;
      out.push(...pageRoutes(path.join(dir, entry.name), base + segment));
    } else if (entry.name === "page.tsx") {
      out.push(base === "" ? "/" : base);
    }
  }
  return out;
}

const actual = pageRoutes(path.resolve(__dirname, "../app")).sort();
// The per-boat map uses {boatId} where the folder is named [id].
const normalize = (r: string) => r.replace("/boats/{id}", "/boats/{boatId}");
const actualNormalized = actual.map(normalize);

const mapped = [
  ...FLEET_WIDE_ROUTES,
  ...UNAUTHENTICATED_ROUTES,
  ...PER_BOAT_ROUTES,
  ...NOT_CRAWLED_ROUTES,
  "/boats/{boatId}",
];

describe("e2e/nav-map.ts matches the real pages", () => {
  it("lists no page that doesn't exist", () => {
    const stale = mapped.filter((r) => !actualNormalized.includes(r) && r !== "/boats/{boatId}");
    expect(stale).toEqual([]);
  });

  it("covers every page (crawled, or explicitly marked not-crawled)", () => {
    const missing = actualNormalized.filter((r) => !mapped.includes(r));
    expect(missing).toEqual([]);
  });
});
