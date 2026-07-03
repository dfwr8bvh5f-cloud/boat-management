"use client";

import { useState, type DragEvent } from "react";

// Programmatically sets a hidden <input type="file">'s FileList to a
// dropped file, so a plain named form input still submits it normally.
export function setInputFiles(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
}

// Adds drag-and-drop to an existing "click to upload" box: spread
// dropHandlers onto the box element, and use `dragging` to show a "this
// will accept the file" highlight while something is dragged over it.
export function useFileDrop(onFile: (file: File) => void) {
  const [dragging, setDragging] = useState(false);

  return {
    dragging,
    dropHandlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      },
    },
  };
}
