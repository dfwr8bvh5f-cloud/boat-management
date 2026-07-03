"use client";

import { X } from "lucide-react";

// Small gray X shown next to an upload button once a file has been picked,
// letting the user clear the selection without resetting the whole form.
export function ClearFileButton({ onClear, label }: { onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fleet-ink/10 text-fleet-ink hover:bg-fleet-ink/20"
    >
      <X size={14} />
    </button>
  );
}
