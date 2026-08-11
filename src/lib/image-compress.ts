// HEIC/HEIF is the default photo format on iPhone/Mac cameras, and no
// mainstream browser except Safari can decode or display it - an <img>
// pointed at a raw .heic file just renders as a broken-image icon
// everywhere else, even though the upload itself succeeded. It has to be
// converted to a real web format before anything else runs, since a small
// HEIC file (they compress far better than JPEG) would otherwise sail
// straight through the size check below untouched.
//
// Real iPhone camera photos are HEVC-compressed inside that HEIC container,
// and HEVC decoding needs a patent-licensed codec that neither this app's
// client-side WASM converter nor its server-side image library (sharp/
// libvips, checked directly against a real photo pulled from production)
// can legally bundle - confirmed both fail with the same class of error
// ("format not supported" / "compression format has not been built in").
// So this can only ever be a best-effort conversion, not a guarantee - a
// file that fails throws HeicUnsupportedError instead of silently
// uploading something broken, so the caller can tell her to re-export it
// (e.g. share as JPEG, or Settings > Camera > Formats > Most Compatible)
// rather than her only finding out from a blank thumbnail after the fact.
export class HeicUnsupportedError extends Error {
  constructor() {
    super("HEIC_UNSUPPORTED");
    this.name = "HeicUnsupportedError";
  }
}

const HEIC_EXTENSION = /\.hei[cf]$/i;

function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_EXTENSION.test(file.name);
}

// Phone camera photos routinely exceed a few MB, and Vercel serverless
// functions hard-cap the incoming request body around 4.5MB regardless of
// plan/config - so a large receipt/invoice photo submitted as-is fails at
// the platform level before our server action even runs. Re-encoding the
// image client-side (shrinking dimensions and JPEG quality until it fits)
// removes that failure for anyone photographing paper receipts, instead of
// just rejecting the upload.
export async function compressImageToLimit(file: File, maxBytes: number): Promise<File> {
  let working = file;

  if (isHeic(file)) {
    try {
      const heic2any = (await import("heic2any")).default;
      const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
      const blob = Array.isArray(result) ? result[0] : result;
      working = new File([blob], file.name.replace(HEIC_EXTENSION, ".jpg"), { type: "image/jpeg" });
    } catch {
      throw new HeicUnsupportedError();
    }
  }

  if (!working.type.startsWith("image/") || working.type === "image/svg+xml" || working.type === "image/gif") return working;
  if (working.size <= maxBytes) return working;

  try {
    const bitmap = await createImageBitmap(working);
    let { width, height } = bitmap;

    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return working;
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.7, 0.55, 0.4]) {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= maxBytes) {
          return new File([blob], working.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
        }
      }

      width = Math.round(width * 0.75);
      height = Math.round(height * 0.75);
    }
    return working;
  } catch {
    return working;
  }
}
