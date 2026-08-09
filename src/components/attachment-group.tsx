"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// A single icon-button when there's exactly one file (matches every other
// single-attachment button in the app), or - once there's more than one -
// a pill showing that same icon (receipt/photo/quote, never swapped for a
// generic "view" glyph) plus the count, expanding into a per-file list.
// Mirrors the multi-contract badge already used for Future Income charter
// contracts, but keeps the file-type icon instead of that badge's Eye.
export function AttachmentGroup({
  files,
  icon,
  label,
  onOpen,
  compact,
  bordered = true,
}: {
  files: { id: string; url: string }[];
  icon: ReactNode;
  label: string;
  onOpen: (url: string) => void;
  // Dense list rows (e.g. the issues list) use the same icon-only square
  // button as every other row action instead of the icon+label pill the
  // approval cards use - only the multi-file count pill/list looks the
  // same either way.
  compact?: boolean;
  // Some compact rows (Future Income) put plain, borderless icon buttons
  // next to this one (edit, delete) - forcing this one into a bordered box
  // would stick out. Others (expenses/issues lists) do want that box, to
  // match their own sibling icon buttons - hence defaulting to true.
  bordered?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (files.length === 0) return null;

  if (files.length === 1) {
    return compact ? (
      <button
        type="button"
        onClick={() => onOpen(files[0].url)}
        aria-label={label}
        title={label}
        className={
          bordered
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-fleet-paper text-fleet-brass hover:bg-white sm:h-10 sm:w-10"
            : "flex h-9 w-9 shrink-0 items-center justify-center text-fleet-brass hover:text-fleet-navy"
        }
      >
        {icon}
      </button>
    ) : (
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
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title={label}
        className={
          compact && bordered
            ? "flex h-8 items-center gap-1 rounded-full border border-fleet-border bg-fleet-paper px-2 text-xs font-bold text-fleet-brass hover:bg-white sm:h-10"
            : "flex items-center gap-1 rounded-full bg-fleet-brass/15 px-2 py-1 text-xs font-bold text-fleet-brass"
        }
      >
        {icon} {files.length}
      </button>
      {open && (
        <div className="absolute top-full start-0 z-10 mt-1 flex w-max flex-col gap-1 rounded-lg border border-fleet-border bg-white p-2 shadow-lg">
          {files.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onOpen(f.url);
                setOpen(false);
              }}
              className="flex items-center gap-1.5 whitespace-nowrap text-xs text-fleet-brass hover:text-fleet-navy"
            >
              {icon} {label} {idx + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
