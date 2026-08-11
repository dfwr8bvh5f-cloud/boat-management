"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

// A native <select>'s open dropdown is rendered by the OS, not the page -
// on macOS it reserves blank space above the list to align the currently
// selected option with the click point, which reads as a huge empty gray
// panel when the selected item is near the bottom of a long list. Same
// reasoning as the custom DateInput: full control over the picker's own
// layout means building it instead of relying on the browser's native one.
export function CustomSelect({
  name,
  value,
  onChange,
  options,
  placeholder,
  className,
  emphasizeEmpty,
  trigger,
  disabled,
}: {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  // Bolds the placeholder text while nothing is selected yet - used for a
  // required field with no sensible default, to make it visually obvious
  // it still needs a choice instead of blending in with optional fields.
  emphasizeEmpty?: boolean;
  // Replaces the default label+chevron button entirely, for the rare case
  // where the closed control has its own bespoke look (e.g. a colored
  // status pill) that doesn't fit the standard field styling - the open
  // dropdown panel below is still the same shared white/styled one either
  // way, which is the actual thing worth sharing.
  trigger?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The open panel is rendered into document.body (see below) rather than
  // as a normal absolutely-positioned child, because this control is used
  // inside plenty of horizontally-scrolling rows (e.g. the bank statement
  // scan preview) - a scroll container with overflow-x set implicitly
  // clips overflow-y too, so an absolute panel anchored to a field inside
  // one gets cut down to the row's own height instead of floating over the
  // page, making it unusable. Fixed positioning computed from the
  // trigger's own bounding rect sidesteps that entirely.
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPanelPos({ top: rect.bottom + 4, left: rect.left, minWidth: rect.width });
    };
    updatePosition();
    // A fixed-position panel doesn't move with the page, so any scroll
    // (the window, or a scrollable ancestor like the row it's in) has to
    // close it rather than leave it floating over the wrong spot. But
    // `scroll` doesn't bubble, so this capturing window listener is the only
    // way to hear about it at all - which means it also fires for the panel
    // scrolling *itself* (a long options list is its own scroll container),
    // since capture-phase listeners see every scroll event on the way down
    // regardless of bubbling. Without excluding that case, scrolling the
    // list to reach a lower option closed the list before you could reach
    // it.
    const close = (e: Event) => {
      if (panelRef.current && e.target instanceof Node && panelRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      {trigger ? (
        <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} className="text-start disabled:opacity-60">
          {trigger}
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`flex w-full items-center justify-between gap-2 text-start disabled:opacity-60 ${
            className ?? "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal"
          }`}
        >
          <span className={selected ? "" : `text-fleet-ink/50 ${emphasizeEmpty ? "font-bold" : ""}`}>
            {selected?.label ?? placeholder ?? ""}
          </span>
          <ChevronDown size={14} className="shrink-0 text-fleet-ink" />
        </button>
      )}
      {open &&
        panelPos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: panelPos.top, left: panelPos.left, minWidth: panelPos.minWidth }}
            className="z-50 max-h-64 w-max max-w-[90vw] overflow-y-auto rounded-xl border border-fleet-border bg-white p-1 shadow-lg"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-fleet-paper ${
                  o.value === value ? "bg-fleet-teal/10 font-bold text-fleet-teal" : "text-fleet-navy"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
