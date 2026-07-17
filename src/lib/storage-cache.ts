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

const cachedSignedUrl = unstable_cache(
  async (bucket: string, path: string, transform?: Transform) => {
    const supabase = createAdminClient();
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_EXPIRES_IN, transform ? { transform } : undefined);
    return data?.signedUrl ?? null;
  },
  ["signed-url"],
  { revalidate: SIGNED_URL_CACHE_SECONDS }
);

export async function getCachedSignedUrl(bucket: string, path: string): Promise<string | null> {
  return cachedSignedUrl(bucket, path);
}

export async function getCachedSignedUrls(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const urls = await Promise.all(paths.map((p) => cachedSignedUrl(bucket, p)));
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
  const urls = await Promise.all(paths.map((p) => cachedSignedUrl(bucket, p, THUMB_TRANSFORM)));
  paths.forEach((p, i) => {
    const url = urls[i];
    if (url) map.set(p, url);
  });
  return map;
}
