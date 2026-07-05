// Phone camera photos routinely exceed a few MB, and Vercel serverless
// functions hard-cap the incoming request body around 4.5MB regardless of
// plan/config - so a large receipt/invoice photo submitted as-is fails at
// the platform level before our server action even runs. Re-encoding the
// image client-side (shrinking dimensions and JPEG quality until it fits)
// removes that failure for anyone photographing paper receipts, instead of
// just rejecting the upload.
export async function compressImageToLimit(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") return file;
  if (file.size <= maxBytes) return file;

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.82, 0.7, 0.55, 0.4]) {
        const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= maxBytes) {
          return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
        }
      }

      width = Math.round(width * 0.75);
      height = Math.round(height * 0.75);
    }
    return file;
  } catch {
    return file;
  }
}
