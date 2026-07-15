"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { createTechnician } from "@/lib/actions/technicians";
import { emptyToNull } from "@/lib/form-utils";
import { translate } from "@/lib/i18n/translate";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Technician } from "@/lib/types/database";

const inputClass = INPUT_CLASS;

// Picks a technician/supplier name from the fleet-wide directory (see
// /technicians): a search box filters the list below it, a separate free-text
// row lets you type any name directly (or leave it blank), and - for
// management - a "+" opens a small popup to add a new technician to the
// shared directory without leaving the issue form.
export function TechnicianSelect({
  name,
  defaultValue,
  technicians,
  locale,
  className,
  isManagement,
}: {
  name?: string;
  defaultValue?: string;
  technicians: Technician[];
  locale: Locale;
  className?: string;
  isManagement?: boolean;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [selected, setSelected] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [extraTechnicians, setExtraTechnicians] = useState<Technician[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, startAdding] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const allTechnicians = useMemo(() => [...technicians, ...extraTechnicians], [technicians, extraTechnicians]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTechnicians;
    return allTechnicians.filter((tech) =>
      [tech.name, tech.contact_name, tech.phone].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [allTechnicians, query]);

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

  const handleAddSubmit = (formData: FormData) => {
    const newName = String(formData.get("name") ?? "").trim();
    if (!newName) return;
    setAddError(null);
    startAdding(async () => {
      try {
        await createTechnician(formData);
        setExtraTechnicians((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            name: newName,
            contact_name: emptyToNull(formData.get("contact_name")),
            contact: emptyToNull(formData.get("contact")),
            phone: emptyToNull(formData.get("phone")),
            notes: emptyToNull(formData.get("notes")),
            created_by: null,
            created_at: new Date().toISOString(),
          },
        ]);
        setSelected(newName);
        setShowAddModal(false);
      } catch (e) {
        setAddError(e instanceof Error ? e.message : String(e));
      }
    });
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
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-xl border border-fleet-border bg-white p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("technician_search_placeholder")}
              className="w-full rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-fleet-teal"
            />
            {isManagement && (
              <button
                type="button"
                onClick={() => {
                  setAddError(null);
                  setShowAddModal(true);
                }}
                aria-label={t("technician_add")}
                title={t("technician_add")}
                className="flex shrink-0 items-center justify-center rounded-lg border border-fleet-border bg-white p-1.5 text-fleet-teal hover:bg-fleet-paper"
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          <input
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            placeholder={t("technician_free_text_placeholder")}
            className="mb-2 w-full rounded-lg border border-fleet-border bg-white px-2.5 py-1.5 text-sm outline-none focus:border-fleet-teal"
          />
          <div className="max-h-56 overflow-y-auto">
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

      {showAddModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <form
            action={handleAddSubmit}
            className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fleet-navy">{t("technician_add")}</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                aria-label={t("close_word")}
                className="text-fleet-ink hover:text-fleet-coral"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("technician_name")} *</label>
              <input name="name" required autoFocus className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("technician_contact_name")}</label>
                <input name="contact_name" className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-fleet-ink">{t("technician_phone")}</label>
                <input name="phone" className={inputClass} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("technician_contact")}</label>
              <input name="contact" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-fleet-ink">{t("technician_notes")}</label>
              <textarea name="notes" rows={2} className={inputClass} />
            </div>
            {addError && <p className="text-xs text-fleet-coral">{addError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowAddModal(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("close_word")}
              </button>
              <button type="submit" disabled={isAdding} className={`flex-1 ${PRIMARY_BUTTON_CLASS} disabled:opacity-60`}>
                {t("technician_add")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
