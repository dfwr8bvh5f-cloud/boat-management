// Best-effort "scan to PDF": trims the background around a photographed
// document (assuming the paper is meaningfully brighter and less colorful
// than whatever it's sitting on) and wraps the result in a real single-page
// PDF file, instead of leaving it as a raw photo with the desk/hand/etc
// still visible around it.
//
// This is NOT full perspective/skew correction (a document photographed at
// an angle stays at that angle, just cropped to its rough bounding box) -
// that needs real edge/contour detection, a much bigger project with no
// existing library in this app. If the document can't be confidently told
// apart from its background, the ORIGINAL, uncropped photo is kept rather
// than risk cutting into real financial data - this must never be the
// thing that silently loses part of a receipt.

// Finds the bounding box of the document (assumed to be the brightest,
// least colorful region in the photo - true for paper on almost any desk,
// table, or hand) and returns generously-padded crop bounds, or null if
// nothing can be confidently distinguished from the background.
function detectDocumentBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): { x: number; y: number; w: number; h: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(1, Math.floor(Math.max(width, height) / 400));

  let maxLuminance = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (l > maxLuminance) maxLuminance = l;
    }
  }
  if (maxLuminance < 40) return null; // whole photo too dark to tell anything apart

  const luminanceFloor = maxLuminance * 0.72;
  const saturationCeiling = 55;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let matchCount = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      const s = Math.max(r, g, b) - Math.min(r, g, b);
      if (l >= luminanceFloor && s <= saturationCeiling) {
        matchCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;

  const bboxArea = (maxX - minX) * (maxY - minY);
  const totalArea = width * height;
  // Too small a match is more likely noise (a glare spot, a stray light
  // pixel) than an actual document - and too-near-total-coverage means
  // there's no meaningful background to trim in the first place.
  if (bboxArea < totalArea * 0.15 || bboxArea > totalArea * 0.95) return null;
  if (matchCount < 20) return null;

  // Generous padding so text/numbers near the paper's own edge never get
  // cut off by an imperfect detection.
  const padX = Math.round((maxX - minX) * 0.08) + step;
  const padY = Math.round((maxY - minY) * 0.08) + step;
  const x = Math.max(0, minX - padX);
  const y = Math.max(0, minY - padY);
  const w = Math.min(width, maxX + padX) - x;
  const h = Math.min(height, maxY + padY) - y;
  return { x, y, w, h };
}

// Hand-built single-page PDF wrapping one JPEG image, byte-for-byte per
// the PDF spec's minimal case (a JPEG's own compressed bytes are valid
// DCTDecode stream data - no re-encoding needed). No dependency needed for
// something this small and fixed-shape.
function jpegToPdf(jpegBytes: Uint8Array, width: number, height: number): Blob {
  // PDF units are points (1/72in), not pixels - a raw phone-photo pixel
  // count used directly as the MediaBox (e.g. 3024x4032) declares a page
  // several dozen inches tall. Some PDF viewers (notably iOS's built-in one
  // when a PDF is embedded in an iframe) fall back to rendering that at
  // actual size instead of honoring a fit-to-view hint, which is what made
  // an uploaded receipt open too large to see without panning. Scaling the
  // page box down to a normal document size (~150dpi-equivalent, capped at
  // a sane maximum) fixes that; the embedded image itself keeps its full
  // pixel resolution and quality - only the page's declared physical size
  // changes, and the content-stream matrix scales it to fill that box.
  const SCAN_DPI = 150;
  const MAX_POINTS = 1000;
  const rawPageW = (width * 72) / SCAN_DPI;
  const rawPageH = (height * 72) / SCAN_DPI;
  const shrink = Math.min(1, MAX_POINTS / Math.max(rawPageW, rawPageH));
  const pageW = Math.round(rawPageW * shrink);
  const pageH = Math.round(rawPageH * shrink);

  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0, 0, 0, 0, 0, 0];
  let pos = 0;
  const pushBytes = (b: Uint8Array) => {
    parts.push(b);
    pos += b.length;
  };
  const pushStr = (s: string) => pushBytes(enc.encode(s));

  pushStr("%PDF-1.4\n");

  offsets[1] = pos;
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  offsets[2] = pos;
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  offsets[3] = pos;
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 4 0 R >> >> /MediaBox [0 0 ${pageW} ${pageH}] /Contents 5 0 R >>\nendobj\n`
  );

  offsets[4] = pos;
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
  );
  pushBytes(jpegBytes);
  pushStr("\nendstream\nendobj\n");

  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  offsets[5] = pos;
  pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  const xrefStart = pos;
  pushStr("xref\n0 6\n0000000000 65535 f \n");
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export async function scanReceiptToPdf(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const fullCanvas = document.createElement("canvas");
    fullCanvas.width = bitmap.width;
    fullCanvas.height = bitmap.height;
    const fullCtx = fullCanvas.getContext("2d");
    if (!fullCtx) return file;
    fullCtx.drawImage(bitmap, 0, 0);

    // Bounds detection only ever samples a ~400px-wide grid of the photo
    // (see the `step` calculation inside detectDocumentBounds), but
    // getImageData's *cost* scales with the full buffer it reads back, not
    // with how sparsely the loop afterward samples it - reading a full
    // 12MP+ phone photo just to look at ~1% of its pixels was the single
    // most expensive step in this whole function, often costing several
    // hundred milliseconds of main-thread blocking right after a photo is
    // taken. Downscaling to the detection's own target resolution *before*
    // the readback (which drawImage does via hardware-accelerated scaling,
    // not a full-res decode) fixes that; the result is scaled back up to
    // the original photo's coordinates below.
    const DETECT_MAX_DIM = 400;
    const detectScale = Math.min(1, DETECT_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const detectWidth = Math.max(1, Math.round(bitmap.width * detectScale));
    const detectHeight = Math.max(1, Math.round(bitmap.height * detectScale));
    const detectCanvas = document.createElement("canvas");
    detectCanvas.width = detectWidth;
    detectCanvas.height = detectHeight;
    const detectCtx = detectCanvas.getContext("2d");

    let bounds: { x: number; y: number; w: number; h: number } | null = null;
    if (detectCtx) {
      detectCtx.drawImage(bitmap, 0, 0, detectWidth, detectHeight);
      const smallBounds = detectDocumentBounds(detectCtx, detectWidth, detectHeight);
      if (smallBounds) {
        const x = Math.min(bitmap.width - 1, Math.round(smallBounds.x / detectScale));
        const y = Math.min(bitmap.height - 1, Math.round(smallBounds.y / detectScale));
        bounds = {
          x,
          y,
          w: Math.min(bitmap.width - x, Math.round(smallBounds.w / detectScale)),
          h: Math.min(bitmap.height - y, Math.round(smallBounds.h / detectScale)),
        };
      }
    }

    let width = bounds?.w ?? bitmap.width;
    let height = bounds?.h ?? bitmap.height;
    // A PDF page has a byte-overhead of well under 1KB beyond the JPEG
    // stream itself - reserve a safety margin so the final file still
    // lands under maxBytes after wrapping.
    const jpegBudget = Math.max(maxBytes - 2048, maxBytes * 0.9);

    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      if (bounds) {
        ctx.drawImage(fullCanvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, width, height);
      } else {
        ctx.drawImage(bitmap, 0, 0, width, height);
      }

      for (const quality of [0.85, 0.75, 0.6, 0.45]) {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (!blob) continue;
        if (blob.size <= jpegBudget) {
          const jpegBytes = new Uint8Array(await blob.arrayBuffer());
          const pdfBlob = jpegToPdf(jpegBytes, width, height);
          return new File([pdfBlob], file.name.replace(/\.\w+$/, ".pdf"), { type: "application/pdf" });
        }
      }

      width = Math.round(width * 0.75);
      height = Math.round(height * 0.75);
    }

    // Nothing fit under budget even after shrinking - fall back to
    // whatever the smallest attempt produced rather than losing the file.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    if (bounds) ctx.drawImage(fullCanvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, width, height);
    else ctx.drawImage(bitmap, 0, 0, width, height);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.4));
    if (!blob) return file;
    const jpegBytes = new Uint8Array(await blob.arrayBuffer());
    const pdfBlob = jpegToPdf(jpegBytes, width, height);
    return new File([pdfBlob], file.name.replace(/\.\w+$/, ".pdf"), { type: "application/pdf" });
  } catch {
    return file;
  }
}
