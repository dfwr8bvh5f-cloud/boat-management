"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { FloatingPanel } from "@/components/floating-panel";
import { OPTION_ROW_BASE_CLASS, optionRowStateClass } from "@/lib/ui-classes";
import { COUNTRY_CODES, flagEmoji, isCountryCode } from "@/lib/countries";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

// Nationality picker: type-to-filter a list of countries (localized names via
// Intl.DisplayNames), select one, and it's shown as a round flag badge. Old
// free-text values (entered before this existed) still display as plain
// text, just without a flag.
export function NationalitySelect({
  name,
  defaultValue,
  value,
  onChange,
  locale,
  className,
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (code: string) => void;
  locale: Locale;
  className?: string;
  disabled?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  const countries = useMemo(() => {
    const displayNames = new Intl.DisplayNames([INTL_LOCALE[locale]], { type: "region" });
    return COUNTRY_CODES.map((code) => ({ code, label: displayNames.of(code) ?? code })).sort((a, b) =>
      a.label.localeCompare(b.label, INTL_LOCALE[locale])
    );
  }, [locale]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.label.toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q));
  }, [countries, query]);

  const selectedLabel = isCountryCode(selected) ? countries.find((c) => c.code === selected)?.label : selected;

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-option-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const selectCode = (code: string) => {
    if (!isControlled) setInternalValue(code);
    onChange?.(code);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // Enter in the search box must never submit the surrounding form.
      e.preventDefault();
      const c = filtered[highlighted];
      if (c) selectCode(c.code);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selected ?? ""} />}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setHighlighted(0);
          setOpen((o) => !o);
        }}
        className={`disabled:opacity-60 ${
          className ??
          "flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
        }`}
      >
        <span className={`flex items-center gap-1.5 ${selectedLabel ? "" : "text-fleet-ink/50"}`}>
          {isCountryCode(selected) && (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fleet-paper text-xs">
              {flagEmoji(selected)}
            </span>
          )}
          {selectedLabel || t("nationality_field")}
        </span>
        <ChevronDown size={14} className="shrink-0 text-fleet-ink" />
      </button>

      <FloatingPanel
        anchorRef={containerRef}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
        maxHeight={320}
        matchAnchorWidth
        contentKey={filtered.length}
        onKeyDown={onPanelKeyDown}
        className="flex w-max min-w-64 max-w-[90vw] flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-fleet-border p-1.5">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            placeholder={t("nationality_search_placeholder")}
            className="w-full rounded-lg border border-fleet-border bg-white px-2 py-1.5 text-sm outline-none focus:border-fleet-teal"
          />
        </div>
        <div ref={listRef} className="overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fleet-ink">{t("nationality_no_match")}</div>
          ) : (
            filtered.map((c, i) => {
              const isSelected = c.code === selected;
              return (
                <button
                  key={c.code}
                  type="button"
                  data-option-index={i}
                  onClick={() => selectCode(c.code)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`${OPTION_ROW_BASE_CLASS} ${optionRowStateClass(isSelected, i === highlighted)}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fleet-paper text-xs">
                      {flagEmoji(c.code)}
                    </span>
                    {c.label}
                  </span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </FloatingPanel>
    </div>
  );
}
