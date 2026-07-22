"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
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
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full min-w-max overflow-y-auto rounded-xl border border-fleet-border bg-white p-1 shadow-lg">
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
        </div>
      )}
    </div>
  );
}
