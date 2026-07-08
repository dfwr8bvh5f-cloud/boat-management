// Vercel serverless functions hard-cap the incoming request body around
// 4.5MB regardless of plan/config, so any AI-scan upload past that fails
// at the platform level with a generic network error before our route
// handler even runs. Checking client-side lets us show an accurate message
// instead of the confusing "couldn't connect to the scanning service".
export const MAX_SCAN_FILE_BYTES = 4 * 1024 * 1024;

// Same 4MB ceiling, for photo uploads that go through a server action
// rather than the scan API - next.config.ts caps server action bodies at
// 4mb too, so a raw phone photo past this doesn't just upload slowly, it
// fails outright. Compressing client-side (see image-compress.ts) before
// submitting avoids both problems.
export const MAX_UPLOAD_FILE_BYTES = 4 * 1024 * 1024;

// A signed storage URL keeps the original filename before the query
// string, so a plain extension check works even though the URL isn't a
// simple path - used to render PDFs in an <iframe> instead of an <img>,
// which would otherwise just show a broken-image icon.
export function isPdfUrl(url: string) {
  return /\.pdf(\?|$)/i.test(url);
}
