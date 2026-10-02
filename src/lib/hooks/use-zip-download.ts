"use client";

import { useState } from "react";
import { isPdfUrl } from "@/lib/upload";

export type ZipDownloadFile = { url: string; baseName: string };

const FETCH_TIMEOUT_MS = 20_000;
// Firing every file's fetch() at once (Promise.all over the whole list)
// crashed the tab once a selection got into the hundreds - confirmed live
// with 103 files, which never got past file 0 before the page died. Each
// pending fetch holds its own response/blob in memory and the browser caps
// real parallel connections per origin anyway, so nothing was actually
// downloading any faster for the extra concurrency, just piling up more
// half-finished work at once. A small fixed-size pool keeps steady
// progress with a bounded memory footprint regardless of selection size.
const CONCURRENCY = 4;

// Bundles a set of already-signed file URLs into one .zip and triggers a
// browser download - shared by every "select some rows, download their
// files together" button in the app (boat expenses, MYS expenses) instead
// of each screen reimplementing its own fetch loop. Each file gets its own
// timeout and a failure is skipped rather than blocking the rest, since a
// single stuck/expired URL used to hang the whole batch forever with no
// file ever produced and no way to tell what went wrong.
export function useZipDownload() {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failedCount, setFailedCount] = useState<number | null>(null);
  // Every failure happens entirely in the browser (a direct fetch() to
  // Supabase storage, never through our own server) so there's no server
  // log to check when every file in a batch fails at once - this is the
  // only way to see *why* without asking her to open devtools herself.
  const [firstErrorDetail, setFirstErrorDetail] = useState<string | null>(null);

  const download = async (files: ZipDownloadFile[], zipFilename: string) => {
    if (files.length === 0) return;
    setDownloading(true);
    setFailedCount(null);
    setFirstErrorDetail(null);
    setProgress({ done: 0, total: files.length });
    try {
      // Loaded on demand instead of statically imported - jszip is a
      // ~176KB chunk that would otherwise ship to everyone visiting a page
      // that merely has this button, even if they never click it.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const usedNames = new Set<string>();
      let failed = 0;
      let firstError: string | null = null;

      const fetchOne = async (f: ZipDownloadFile) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
          let blob: Blob;
          try {
            const res = await fetch(f.url, { signal: controller.signal });
            if (!res.ok) throw new Error(`${res.status}`);
            blob = await res.blob();
          } finally {
            clearTimeout(timeoutId);
          }
          const ext = isPdfUrl(f.url) ? "pdf" : f.url.split("?")[0].split(".").pop() || "jpg";
          let name = `${f.baseName}.${ext}`;
          let i = 2;
          while (usedNames.has(name)) {
            name = `${f.baseName}_${i}.${ext}`;
            i++;
          }
          usedNames.add(name);
          zip.file(name, blob);
        } catch (e) {
          console.error("useZipDownload: failed to fetch file", f.url, e);
          failed++;
          if (!firstError) firstError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        } finally {
          setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
        }
      };

      let next = 0;
      const worker = async () => {
        while (next < files.length) {
          const f = files[next];
          next++;
          await fetchOne(f);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));

      setFailedCount(failed);
      setFirstErrorDetail(firstError);
      if (failed === files.length) return;
      const content = await zip.generateAsync({ type: "blob" });
      const blobUrl = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = zipFilename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  return { download, downloading, progress, failedCount, firstErrorDetail };
}
