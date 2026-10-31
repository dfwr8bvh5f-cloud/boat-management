"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

// The one open/close + positioning behavior shared by every dropdown and
// date picker (CustomSelect, DateInput, DateRangeCalendar, NationalitySelect,
// TechnicianSelect), so they can't drift apart again:
//
// - Rendered into document.body with `position: fixed`, so a field inside a
//   horizontally-scrolling row or an overflow:hidden card never clips it.
// - Opens BELOW the field by default (4px gap), flips ABOVE only when there
//   is not enough room below and more room above. Once the panel has
//   rendered its real size is measured, so a flipped panel sits flush
//   against the field with no guessed-height gap.
// - Aligned to the START edge of the field for the page direction (right in
//   RTL, left in LTR), then pulled back inside the viewport (8px margin).
// - A list panel (maxHeight set) shrinks to the room available; a calendar
//   (no maxHeight) keeps its natural height.
// - Follows the field while the page scrolls or resizes (closing only when
//   the field itself scrolls out of view), instead of closing on any scroll.
// - Closes on a press outside, and on Escape.
const MARGIN = 8;
const GAP = 4;

export type FloatingCloseReason = "outside" | "escape" | "scroll";

export function FloatingPanel({
  anchorRef,
  open,
  onClose,
  maxHeight,
  matchAnchorWidth,
  contentKey,
  className = "",
  onKeyDown,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: (reason: FloatingCloseReason) => void;
  // Caps a list panel's height (it scrolls inside). Omit for a calendar.
  maxHeight?: number;
  // Makes the panel at least as wide as its field.
  matchAnchorWidth?: boolean;
  // Anything that changes the panel's size while open (view mode, filtered
  // option count...) - triggers a re-measure.
  contentKey?: unknown;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight?: number; minWidth?: number } | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (!anchor || !panel) return;
      const rect = anchor.getBoundingClientRect();
      // The field scrolled out of view: nothing left to attach the panel to.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        onCloseRef.current("scroll");
        return;
      }
      // Measure the panel's natural size (not the size a previous pass
      // squeezed it to), then put the inline styles back for React to own.
      const prevMax = panel.style.maxHeight;
      const prevMin = panel.style.minWidth;
      panel.style.maxHeight = maxHeight ? `${maxHeight}px` : "";
      panel.style.minWidth = matchAnchorWidth ? `${rect.width}px` : "";
      const naturalH = panel.offsetHeight;
      const w = panel.offsetWidth;
      panel.style.maxHeight = prevMax;
      panel.style.minWidth = prevMin;

      const spaceBelow = window.innerHeight - rect.bottom - MARGIN - GAP;
      const spaceAbove = rect.top - MARGIN - GAP;
      const below = spaceBelow >= naturalH || spaceBelow >= spaceAbove;
      const avail = below ? spaceBelow : spaceAbove;
      const cappedMax = maxHeight ? Math.max(0, Math.min(maxHeight, avail)) : undefined;
      const h = cappedMax !== undefined ? Math.min(naturalH, cappedMax) : naturalH;
      const top = below ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - h);
      const rtl = getComputedStyle(anchor).direction === "rtl";
      const startLeft = rtl ? rect.right - w : rect.left;
      const left = Math.max(MARGIN, Math.min(startLeft, window.innerWidth - w - MARGIN));
      const minWidth = matchAnchorWidth ? rect.width : undefined;
      setPos((p) =>
        p && p.top === top && p.left === left && p.maxHeight === cappedMax && p.minWidth === minWidth
          ? p
          : { top, left, maxHeight: cappedMax, minWidth }
      );
    };
    compute();
    const onScroll = (e: Event) => {
      // The panel's own list scrolling must not move the panel.
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      compute();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", compute);
    };
  }, [open, anchorRef, maxHeight, matchAnchorWidth, contentKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onCloseRef.current("outside");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current("escape");
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panelRef}
      onKeyDown={onKeyDown}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxHeight: pos?.maxHeight ?? maxHeight,
        minWidth: pos?.minWidth,
        // Hidden (not display/visibility:none) until measured, so the first
        // paint never shows it at 0,0 - but it must stay focusable, so a
        // picker or search box can take focus the moment it opens.
        opacity: pos ? 1 : 0,
        pointerEvents: pos ? undefined : "none",
      }}
      className={`z-50 rounded-xl border border-fleet-border bg-white shadow-lg ${className}`}
    >
      {children}
    </div>,
    document.body
  );
}
