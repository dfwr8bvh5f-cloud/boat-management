"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Technician } from "@/lib/types/database";

// Picks a technician/supplier name from the fleet-wide directory (see
// /technicians) - a dropdown whose first row is a search box that filters
// the list as you type, same interaction pattern as NationalitySelect.
export function TechnicianSelect({
  name,
  defaultValue,
  technicians,
  locale,
  className,
}: {
  name?: string;
  defaultValue?: string;
  technicians: Technician[];
  locale: Locale;
  className?: string;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter((tech) =>
      [tech.name, tech.contact_name, tech.phone].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [technicians, query]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectName = (techName: string) => {
    setSelected(techName);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      {name && <input type="hidden" name={name} value={selected} />}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          className ??
          "flex w-full items-center justify-between gap-2 rounded-lg border border-fleet-border bg-white px-3 py-2 text-start text-sm outline-none focus:border-fleet-teal"
        }
      >
        <span className={selected ? "" : "text-fleet-ink/50"}>{selected || "—"}</span>
        <ChevronDown size={14} className="shrink-0 text-fleet-ink" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[220px] rounded-xl border border-fleet-border bg-white p-2 shadow-lg">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("technician_search_placeholder")}
            className="mb-2 w-full rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-fleet-teal"
          />
          <div className="max-h-56 overflow-y-auto">
            {selected && (
              <button
                type="button"
                onClick={() => selectName("")}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs text-fleet-coral hover:bg-fleet-paper"
              >
                {t("remove_word")}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-fleet-ink">{t("technician_none")}</div>
            ) : (
              filtered.map((tech) => (
                <button
                  key={tech.id}
                  type="button"
                  onClick={() => selectName(tech.name)}
                  className={`flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-start text-sm hover:bg-fleet-paper ${
                    tech.name === selected ? "bg-fleet-paper font-bold" : ""
                  }`}
                >
                  <span>{tech.name}</span>
                  {(tech.contact_name || tech.phone) && (
                    <span className="text-xs font-normal text-fleet-ink">
                      {[tech.contact_name, tech.phone].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
