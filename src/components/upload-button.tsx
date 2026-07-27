"use client";

import { Plus, Sparkles, Upload } from "lucide-react";
import type { DragEvent, ReactNode } from "react";

type DropHandlers = {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
};

// The single "click or drag a file here" button used by every upload
// widget in the app - one visual/interaction contract (idle/dragging/
// busy/done coloring, the drag-over + overlay) so every attach-a-document
// flow behaves and animates identically.
export function UploadButton({
  onClick,
  dropHandlers,
  dragging,
  busy,
  done,
  icon,
  label,
  busyLabel,
  doneLabel,
  disabled,
  fullWidth = true,
  compact = false,
}: {
  onClick: () => void;
  dropHandlers: DropHandlers;
  dragging: boolean;
  busy?: boolean;
  done?: boolean;
  icon?: ReactNode;
  label: string;
  busyLabel?: string;
  doneLabel?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  // Tight inline rows (e.g. adding a guest passport next to a Save button)
  // need a smaller footprint than the standard form-field upload button.
  compact?: boolean;
}) {
  const iconSize = compact ? 14 : 16;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      {...dropHandlers}
      className={`relative flex items-center justify-center gap-2 rounded-lg border border-dashed disabled:opacity-60 ${
        compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm"
      } ${fullWidth ? "w-full" : "w-fit"} ${
        dragging
          ? "border-fleet-teal bg-fleet-teal/10 text-fleet-navy"
          : done
            ? "border-fleet-moss bg-fleet-moss/10 text-fleet-moss-text"
            : "border-fleet-brass bg-fleet-paper text-fleet-navy"
      }`}
    >
      {busy ? <Sparkles size={iconSize} className="animate-twinkle" /> : (icon ?? <Upload size={iconSize} />)}
      {busy ? busyLabel : done ? (doneLabel ?? label) : label}
      {dragging && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-fleet-teal/10">
          <Plus size={iconSize} className="text-fleet-teal" />
        </span>
      )}
    </button>
  );
}
