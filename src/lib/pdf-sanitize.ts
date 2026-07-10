// Some source systems (certain e-invoicing/e-document portals observed in
// the wild) export "PDF" files that are actually an HTML wrapper with the
// real PDF bytes glued inside - literally
// `<html><head>...</head>%PDF-1.3 ... %%EOF</body></html>`. Desktop PDF
// viewers are lenient and scan ahead for the %PDF- marker, so these open
// fine in Preview/Adobe/Chrome and look like an ordinary valid PDF - but a
// strict parser (including Anthropic's) rejects them outright since the
// file isn't spec-compliant PDF at byte 0. This extracts the real PDF
// payload when a file is wrapped this way, and returns the bytes unchanged
// for an already-valid PDF (or anything else this pattern doesn't match).
export function extractPdfBytes(bytes: Buffer): Buffer {
  const marker = Buffer.from("%PDF-");
  const start = bytes.indexOf(marker);
  if (start <= 0) return bytes;
  const eofMarker = Buffer.from("%%EOF");
  const eofIndex = bytes.lastIndexOf(eofMarker);
  const end = eofIndex >= 0 ? eofIndex + eofMarker.length : bytes.length;
  return bytes.subarray(start, end);
}
