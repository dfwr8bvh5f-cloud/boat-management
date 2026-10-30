import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Every page that shows a photo/receipt/document used to re-sign its
// storage URLs on every single render, producing a brand-new token each
// time even when the underlying file hadn't changed. Because the token is
// part of the URL, the browser could never reuse a cached image/PDF across
// page loads - it looked like a brand-new resource every time, which was
// the single largest driver of Supabase egress in this app. Caching the
// *signed URL itself* here (not the file) for a window comfortably inside
// its own expiry lets repeat page loads return the identical URL, so
// normal HTTP caching actually works.
//
// Uses the admin client (bypasses RLS) since by the time a page asks for a
// signed URL, application code has already checked the user's access to
// the boat/record the file belongs to - this also lets the same cached URL
// be shared across different users viewing the same file, not just repeat
// visits by one person.
//
// The token's own expiry must comfortably outlive the cache's revalidate
// window under real traffic, not just in theory - `unstable_cache`'s
// revalidate only refreshes lazily on the next request for that exact key,
// so a rarely-viewed file (e.g. one guest's passport scan, opened once and
// not revisited) can sit stale well past 30 minutes with nothing to trigger
// a refresh, and the previously-issued 1-hour token expires underneath it
// (confirmed in production: "InvalidJWT / exp claim timestamp check
// failed" on a booking-guests passport image). 24 hours gives a wide,
// realistic safety margin over the 30-minute cache window.
const SIGNED_URL_EXPIRES_IN = 86400;
const SIGNED_URL_CACHE_SECONDS = 1800;

type Transform = { width: number; height: number; quality?: number };

// Firing one createSignedUrl() call per path via Promise.all used to crash
// a long list outright: a boat with ~400 inventory photos issued ~800
// concurrent signed-url requests (thumb + full) on a single page load,
// which Supabase's Storage API rejected with "Too many connections issued
// to the database" (429) for a meaningful fraction of them - confirmed
// live, ~7% of 396 concurrent calls failing. Those failures used to be
// cached as a plain `null` for the full 30-minute window (see below), so a
// bad page load could leave a chunk of photos looking "missing" for half
// an hour even after the underlying rate-limit pressure was long gone.
// A small fixed-size worker pool (same pattern as useZipDownload's client-
// side download queue) keeps steady progress without hammering the
// connection pool, regardless of how many paths are requested at once.
const SIGN_CONCURRENCY = 15;

async function runWithConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// Throws on failure instead of swallowing it into a cached `null` -
// unstable_cache only persists a value its wrapped function actually
// returns, so a thrown (transient) error here is never frozen into the
// cache; the very next request for that same path gets a fresh attempt
// instead of being stuck showing "no photo" for the rest of the window.
const cachedSignedUrl = unstable_cache(
  async (bucket: string, path: string, transform?: Transform) => {
    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN, transform ? { transform } : undefined);
    if (error) {
      console.error("getCachedSignedUrl: createSignedUrl failed", { bucket, path, error });
      throw error;
    }
    return data.signedUrl;
  },
  ["signed-url"],
  { revalidate: SIGNED_URL_CACHE_SECONDS }
);

// A single path's failure (missing file, transient rate limit) never
// blocks the rest of the batch - caught per-path, logged, and left out of
// the returned map so the caller's own fallback (a placeholder icon) kicks
// in only for that one file instead of the whole page erroring out.
async function safeSignedUrl(bucket: string, path: string, transform?: Transform): Promise<string | null> {
  try {
    return await cachedSignedUrl(bucket, path, transform);
  } catch {
    return null;
  }
}

export async function getCachedSignedUrl(bucket: string, path: string): Promise<string | null> {
  return safeSignedUrl(bucket, path);
}

export async function getCachedSignedUrls(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const urls = await runWithConcurrencyLimit(paths, SIGN_CONCURRENCY, (p) => safeSignedUrl(bucket, p));
  paths.forEach((p, i) => {
    const url = urls[i];
    if (url) map.set(p, url);
  });
  return map;
}

// Small pre-resized rendition for list-view icons (Supabase Storage Image
// Transformations, a Pro-plan feature) - a 40px icon has no business
// transferring a multi-megabyte original just to shrink it in CSS.
const THUMB_TRANSFORM: Transform = { width: 96, height: 96, quality: 70 };

export async function getCachedThumbUrls(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const urls = await runWithConcurrencyLimit(paths, SIGN_CONCURRENCY, (p) => safeSignedUrl(bucket, p, THUMB_TRANSFORM));
  paths.forEach((p, i) => {
    const url = urls[i];
    if (url) map.set(p, url);
  });
  return map;
}
