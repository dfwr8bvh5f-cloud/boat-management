"use client";

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
  return (
    <div className="relative w-fit">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" className="h-16 w-16 rounded-lg border border-fleet-border object-cover" />
      {onRemove && <ClearFileButton onClear={onRemove} label={removeLabel} disabled={removing} variant="overlay" />}
    </div>
  );
}
