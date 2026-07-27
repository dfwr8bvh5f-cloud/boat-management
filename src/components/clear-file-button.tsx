"use client";

import { X } from "lucide-react";

// Small gray X shown next to an upload button once a file has been picked,
// letting the user clear the selection without resetting the whole form.
// The "overlay" variant is for removing an image thumbnail: a white X on a
// dark circle, absolutely positioned over the image's top corner.
export function ClearFileButton({
  onClear,
  label,
  disabled,
  variant = "default",
}: {
  onClear: () => void;
  label: string;
  disabled?: boolean;
  variant?: "default" | "overlay";
}) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={
        variant === "overlay"
          ? "absolute -end-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-fleet-ink/70 text-white hover:bg-fleet-coral disabled:opacity-60"
          : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fleet-ink/10 text-fleet-ink hover:bg-fleet-ink/20 disabled:opacity-60"
      }
    >
      <X size={14} />
    </button>
  );
}
