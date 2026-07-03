"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
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
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (code: string) => void;
  locale: Locale;
  className?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selected = isControlled ? value : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (!open) return;
    searchRef.current?.focus();
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectCode = (code: string) => {
    if (!isControlled) setInternalValue(code);
    onChange?.(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selected ?? ""} />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          className ??
          "flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
        }
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

      {open && (
        <div className="absolute z-50 mt-1 w-64 rounded-xl border border-fleet-border bg-white p-2 shadow-lg">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nationality_search_placeholder")}
            className="mb-2 w-full rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-fleet-teal"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-fleet-ink">{t("nationality_no_match")}</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => selectCode(c.code)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-fleet-paper ${
                    c.code === selected ? "bg-fleet-paper font-bold" : ""
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-fleet-paper text-xs">
                    {flagEmoji(c.code)}
                  </span>
                  {c.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
