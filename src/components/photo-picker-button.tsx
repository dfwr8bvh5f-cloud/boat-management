"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { UploadButton } from "@/components/upload-button";

type DropHandlers = {
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent) => void;
};

// A single "Add photo" trigger that opens a small menu with two explicit
// choices - take a new photo with the camera, or pick an existing one from
// the gallery - instead of two separate full-width buttons competing for
// space. Each choice is its own hidden file input (the camera one carries
// capture="environment") so the OS opens exactly the picker she tapped,
// rather than relying on a device/browser's own combined camera-or-library
// dialog for a plain accept="image/*" input, which isn't consistent across
// devices.
export function PhotoPickerButton({
  onFile,
  label,
  cameraLabel,
  galleryLabel,
  disabled,
  dropHandlers,
  dragging,
  done,
  doneLabel,
}: {
  onFile: (file: File) => void;
  label: string;
  cameraLabel: string;
  galleryLabel: string;
  disabled?: boolean;
  dropHandlers: DropHandlers;
  dragging: boolean;
  done?: boolean;
  doneLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const file of Array.from(e.target.files ?? [])) onFile(file);
    e.target.value = "";
  };

  return (
    <div ref={containerRef} className="relative">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={pickFiles} />
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={pickFiles} />
      <UploadButton
        onClick={() => setOpen((o) => !o)}
        dropHandlers={dropHandlers}
        dragging={dragging}
        disabled={disabled}
        done={done}
        doneLabel={doneLabel}
        icon={<ImagePlus size={16} />}
        label={label}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-fleet-border bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              cameraRef.current?.click();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fleet-navy hover:bg-fleet-paper"
          >
            <Camera size={16} className="shrink-0 text-fleet-ink" /> {cameraLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              galleryRef.current?.click();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-fleet-navy hover:bg-fleet-paper"
          >
            <ImagePlus size={16} className="shrink-0 text-fleet-ink" /> {galleryLabel}
          </button>
        </div>
      )}
    </div>
  );
}
