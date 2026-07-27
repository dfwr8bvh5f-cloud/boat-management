"use client";

import type { ReactNode } from "react";
import { ClearFileButton } from "@/components/clear-file-button";

// A single "this file is attached" row shown below an UploadButton - same
// markup whether the file is still staged locally or already saved and
// linked (pass `href` to make it open the saved file, omit it for a
// pending pick that has no URL yet).
export function FileChip({
  icon,
  name,
  href,
  onRemove,
  removing,
  removeLabel,
}: {
  icon: ReactNode;
  name: string;
  href?: string;
  onRemove?: () => void;
  removing?: boolean;
  removeLabel: string;
}) {
  const content = (
    <>
      {icon}
      <span className="flex-1 truncate">{name}</span>
    </>
  );

  return (
    <div className="flex items-center gap-2 rounded-lg border border-fleet-moss bg-fleet-moss/10 px-3 py-1.5 text-xs text-fleet-moss-text">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2">
          {content}
        </a>
      ) : (
        content
      )}
      {onRemove && <ClearFileButton onClear={onRemove} label={removeLabel} disabled={removing} />}
    </div>
  );
}
