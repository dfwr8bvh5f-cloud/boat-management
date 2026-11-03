"use client";

import { useEffect, useRef } from "react";

// The one overlay shell for every modal in the app (confirm popups, photo
// lightboxes, small forms, info sheets). Gives each of them the same
// behavior: role="dialog" + aria-modal, a backdrop click and Escape both call
// `onClose`, focus moves into the dialog on open, Tab stays inside it, and
// focus returns to whatever was focused before when it closes.
//
// Only the shell lives here - callers keep rendering their own content panel
// inside (and keep calling e.stopPropagation() on it if they rely on a click
// there not reaching the backdrop).
//
// tone picks the layer and dimming:
//   confirm - z-[70], light dim: a question that must be answered (delete?)
//   dialog  - z-50, medium dim: an information sheet
//   viewer  - z-50, dark dim: a photo/lightbox viewer
// A dropdown/calendar panel (z-50, portaled to <body>) opened from inside a
// confirm-tone modal would sit under it - none does today; keep it that way.
const TONE_CLASS = {
  confirm: "z-[70] bg-black/30",
  dialog: "z-50 bg-black/50",
  viewer: "z-50 bg-black/70",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  tone,
  onClose,
  closeOnBackdrop = true,
  className = "",
  children,
}: {
  tone: keyof typeof TONE_CLASS;
  // Omit for a question that cannot be dismissed (it must be answered).
  onClose?: () => void;
  // A form modal passes false so a stray click outside does not discard
  // what was typed (Escape still closes it).
  closeOnBackdrop?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Something inside may already have taken focus (an autoFocus field).
    if (el && !el.contains(document.activeElement)) {
      (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An open dropdown/calendar closes on its own Escape first.
        if (document.querySelector("[data-floating-panel]")) return;
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={`fixed inset-0 flex items-center justify-center p-4 outline-none ${TONE_CLASS[tone]} ${className}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      {children}
    </div>
  );
}
