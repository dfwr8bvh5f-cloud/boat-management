"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FloatingPanel } from "@/components/floating-panel";
import { OPTION_ROW_BASE_CLASS, optionRowStateClass } from "@/lib/ui-classes";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

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
  searchable,
  searchPlaceholder,
  required,
  locale,
  ordered,
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
  // Opt-in: adds a small filter input pinned to the top of the open panel,
  // for a list long enough that scanning it visually stops being the
  // fastest way to find one option (e.g. the fleet's boats). Off by
  // default so every other, usually short, options list is unaffected.
  searchable?: boolean;
  searchPlaceholder?: string;
  // Blocks native form submission while nothing is selected, the same way
  // a plain <select required> would - this control's own value lives in a
  // hidden <input> which browsers don't enforce `required` on, so without
  // this a select that used to be a native, required one would silently
  // stop blocking an empty submit. Needs `locale` to show the error text;
  // omit both on a select that was never required to begin with.
  required?: boolean;
  locale?: Locale;
  // Keeps `options` in the order given. Every list is otherwise sorted
  // alphabetically by its displayed label (in the app's language), with
  // "no choice" rows (value "" / "__new_client__") pinned first and "other"
  // rows (value "other" / "__other__") pinned last. Set this only for a list
  // with a meaningful natural order (frequency, workflow status, sort modes,
  // roles, preset percentages), where A-B order would scramble it.
  ordered?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [showError, setShowError] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // A real CSS bound (used to cap the panel's height), not a guess.
  const PANEL_MAX_HEIGHT = 256;
  useEffect(() => {
    if (open && searchable) searchInputRef.current?.focus();
  }, [open, searchable]);

  const selected = options.find((o) => o.value === value);
  // Alphabetical by label using the app's language (the root <html lang>),
  // not the browser's, with numbers compared numerically ("2" before "10").
  const sortedOptions = useMemo(() => {
    if (ordered) return options;
    const lang = typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined;
    const isTop = (v: string) => v === "" || v === "__new_client__";
    const isBottom = (v: string) => v === "other" || v === "__other__";
    const top = options.filter((o) => isTop(o.value));
    const bottom = options.filter((o) => isBottom(o.value));
    const middle = options
      .filter((o) => !isTop(o.value) && !isBottom(o.value))
      .sort((a, b) => a.label.localeCompare(b.label, lang, { numeric: true, sensitivity: "base" }));
    return [...top, ...middle, ...bottom];
  }, [options, ordered]);
  const filteredOptions =
    searchable && search.trim() ? sortedOptions.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase())) : sortedOptions;

  // Starts the keyboard highlight on the currently selected option (or the
  // first row) - computed inline wherever `open`/`search` change rather than
  // in an effect, since setting state synchronously from an effect body
  // triggers an extra cascading render for something this cheap to just do
  // in the handler that already changes that state.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-option-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const highlightFor = (opts: { value: string; label: string }[]) => {
    const selectedIndex = opts.findIndex((o) => o.value === value);
    return selectedIndex >= 0 ? selectedIndex : 0;
  };

  // Clears on every toggle (not just opening) rather than in an effect
  // keyed on `open` - same reasoning as the highlight reset above.
  const toggleOpen = () => {
    setShowError(false);
    setOpen((o) => {
      const next = !o;
      if (next) setHighlighted(highlightFor(sortedOptions));
      return next;
    });
    setSearch("");
  };

  const closeAndRefocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // One shared handler used by BOTH the trigger button and the open panel -
  // when the select isn't `searchable`, clicking the trigger never moves
  // focus anywhere (there's no input to receive it), so focus stays on the
  // trigger button for the whole time the panel is open and it has to keep
  // handling Arrow/Enter/Escape itself, not just the "open on first press"
  // case. Only the searchable case ever moves focus into the panel (onto
  // its search input), where this same handler also applies via bubbling.
  const onSelectKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setHighlighted(highlightFor(sortedOptions));
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closeAndRefocus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filteredOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filteredOptions[highlighted];
      if (option) {
        onChange(option.value);
        closeAndRefocus();
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={value} />}
      {/* Blocks native form submission while required and empty, the same
          way a plain <select required> used to - this field's real value
          lives in the hidden input above, which browsers don't validate
          `required` on, so without this a select that used to natively
          block an empty submit would silently stop doing so. */}
      {required && (
        <input
          type="text"
          required
          value={value}
          onChange={() => {}}
          onInvalid={(e) => {
            e.preventDefault();
            setShowError(true);
          }}
          className="sr-only"
          tabIndex={-1}
        />
      )}
      {trigger ? (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={toggleOpen}
          onKeyDown={onSelectKeyDown}
          className="text-start disabled:opacity-60"
        >
          {trigger}
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          onClick={toggleOpen}
          onKeyDown={onSelectKeyDown}
          className={`flex w-full items-center justify-between gap-2 text-start disabled:opacity-60 ${
            className ??
            (showError && !value
              ? "rounded-lg border border-fleet-coral bg-white px-3 py-2 text-sm outline-none ring-2 ring-fleet-coral/20"
              : "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal")
          }`}
        >
          <span className={selected ? "" : `text-fleet-ink/50 ${emphasizeEmpty ? "font-bold" : ""}`}>
            {selected?.label ?? placeholder ?? ""}
          </span>
          <ChevronDown size={14} className="shrink-0 text-fleet-ink" />
        </button>
      )}
      {required && showError && !value && (
        <p className="mt-1 text-xs text-fleet-coral-text">{translate(locale ?? "en", "field_required_error")}</p>
      )}
      <FloatingPanel
        anchorRef={containerRef}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
        maxHeight={PANEL_MAX_HEIGHT}
        matchAnchorWidth
        contentKey={filteredOptions.length}
        onKeyDown={onSelectKeyDown}
        className="flex w-max max-w-[90vw] flex-col overflow-hidden"
      >
        {searchable && (
          <div className="shrink-0 border-b border-fleet-border p-1.5">
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlighted(0);
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-fleet-border px-2 py-1.5 text-sm outline-none focus:border-fleet-teal"
            />
          </div>
        )}
        <div ref={listRef} className="overflow-y-auto p-1">
          {searchable && search.trim() && filteredOptions.length === 0 && (
            <p className="px-3 py-2 text-center text-xs text-fleet-ink">{translate(locale ?? "en", "select_no_results")}</p>
          )}
          {filteredOptions.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                data-option-index={i}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                onMouseEnter={() => setHighlighted(i)}
                className={`${OPTION_ROW_BASE_CLASS} ${optionRowStateClass(isSelected, i === highlighted)}`}
              >
                <span>{o.label}</span>
                {isSelected && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      </FloatingPanel>
    </div>
  );
}
