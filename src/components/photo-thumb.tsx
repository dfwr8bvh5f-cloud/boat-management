"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { ClearFileButton } from "@/components/clear-file-button";

// A single image preview (a staged photo pick, or an already-saved photo)
// with the same overlay remove-X everywhere a photo is attached.
export function PhotoThumb({
  src,
  onRemove,
  removing,
  removeLabel,
}: {
  src: string;
  onRemove?: () => void;
  removing?: boolean;
  removeLabel: string;
}) {
  // The underlying file can be gone from storage (e.g. an upload that never
  // actually finished) while the app still holds a reference to it - without
  // this, that renders as the browser's own broken-image glyph, which looks
  // like an error nothing can fix. Swapping in a plain placeholder keeps the
  // remove button (still fully functional - it only ever needed the src to
  // know what to delete, not to have loaded it) as the obvious way to clear it.
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative w-fit">
      {broken ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-fleet-border bg-fleet-highlight text-fleet-ink">
          <ImageOff size={20} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-16 w-16 rounded-lg border border-fleet-border object-cover"
        />
      )}
      {onRemove && <ClearFileButton onClear={onRemove} label={removeLabel} disabled={removing} variant="overlay" />}
    </div>
  );
}
