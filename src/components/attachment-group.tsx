"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Eye } from "lucide-react";

// A single icon-button when there's exactly one file (matches every other
// single-attachment button in the app), or - once there's more than one -
// an Eye-plus-count pill that expands into a per-file list, mirroring the
// multi-contract badge already used for Future Income charter contracts.
export function AttachmentGroup({
  files,
  icon,
  label,
  onOpen,
}: {
  files: { id: string; url: string }[];
  icon: ReactNode;
  label: string;
  onOpen: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (files.length === 0) return null;

  if (files.length === 1) {
    return (
      <button
        type="button"
        onClick={() => onOpen(files[0].url)}
        className="flex items-center gap-1 rounded-lg border border-fleet-border px-2 py-1 text-xs text-fleet-navy hover:bg-fleet-paper"
      >
        {icon} {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-full bg-fleet-brass/15 px-2 py-1 text-xs font-bold text-fleet-brass"
      >
        <Eye size={14} /> {files.length}
      </button>
      {open && (
        <div className="flex flex-col gap-1 ps-1">
          {files.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f.url)}
              className="flex items-center gap-1.5 text-xs text-fleet-brass hover:text-fleet-navy"
            >
              <Eye size={14} /> {label} {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
