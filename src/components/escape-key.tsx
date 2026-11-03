"use client";

import { useEffect } from "react";

// Renders nothing; while mounted, pressing Escape runs `onEscape`. Placed
// inside a modal/overlay so it only listens while that overlay is open and
// closes it the same way its backdrop click or Cancel button does.
export function EscapeKey({ onEscape }: { onEscape: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape]);
  return null;
}
