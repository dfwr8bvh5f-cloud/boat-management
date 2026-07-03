// Trims the empty white/transparent margin around a logo before it's
// uploaded, so a small logo mark sitting on a big blank canvas doesn't show
// up as mostly-empty space once it's placed inside a small square frame.
export async function autoCropToContent(file: File, paddingRatio = 0.04): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);

    const { width, height } = canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    const at = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
    };

    const bg = at(0, 0);
    const TOLERANCE = 18;
    const isBackground = (x: number, y: number) => {
      const [r, g, b, a] = at(x, y);
      if (bg[3] < 10 && a < 10) return true;
      return (
        Math.abs(r - bg[0]) <= TOLERANCE &&
        Math.abs(g - bg[1]) <= TOLERANCE &&
        Math.abs(b - bg[2]) <= TOLERANCE &&
        Math.abs(a - bg[3]) <= TOLERANCE
      );
    };

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    const step = Math.max(1, Math.floor(Math.max(width, height) / 500));
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        if (!isBackground(x, y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0) return file; // uniform image, nothing to crop

    const padX = Math.round((maxX - minX) * paddingRatio);
    const padY = Math.round((maxY - minY) * paddingRatio);
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(width - 1, maxX + padX);
    maxY = Math.min(height - 1, maxY + padY);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW >= width * 0.98 && cropH >= height * 0.98) return file; // barely changes anything

    const out = document.createElement("canvas");
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext("2d");
    if (!outCtx) return file;
    outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

    const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((resolve) => out.toBlob(resolve, outType, 0.92));
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type });
  } catch {
    return file;
  }
}
