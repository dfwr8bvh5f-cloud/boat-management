"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { FloatingPanel } from "@/components/floating-panel";
import { createTechnician } from "@/lib/actions/technicians";
import { emptyToNull } from "@/lib/form-utils";
import { translate } from "@/lib/i18n/translate";
import { Button } from "@/components/ui/button";
import { INPUT_CLASS, OPTION_ROW_BASE_CLASS, optionRowStateClass } from "@/lib/ui-classes";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Technician } from "@/lib/types/database";

const inputClass = INPUT_CLASS;
const INTL_LOCALE: Record<Locale, string> = { he: "he-IL", en: "en-US", el: "el-GR" };

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
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  technicians: Technician[];
  locale: Locale;
  className?: string;
  isManagement?: boolean;
  disabled?: boolean;
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlighted, setHighlighted] = useState(0);

  // Alphabetical in the app's language (not the database's collation), so a
  // technician added mid-form lands in its sorted place too.
  const allTechnicians = useMemo(
    () => [...technicians, ...extraTechnicians].sort((a, b) => a.name.localeCompare(b.name, INTL_LOCALE[locale], { numeric: true, sensitivity: "base" })),
    [technicians, extraTechnicians, locale]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allTechnicians;
    return allTechnicians.filter((tech) =>
      [tech.name, tech.contact_name, tech.phone].filter(Boolean).some((f) => f!.toLowerCase().includes(q))
    );
  }, [allTechnicians, query]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-option-index="${highlighted}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  const selectName = (techName: string) => {
    setSelected(techName);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  // Arrows / Enter act on the search box only - the free-text name field below
  // it keeps plain typing, and Enter there must never submit the form either.
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const tech = filtered[highlighted];
      if (tech) selectName(tech.name);
    }
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
        <span className={selected ? "" : "text-fleet-ink/50"}>{selected || "—"}</span>
        <ChevronDown size={14} className="shrink-0 text-fleet-ink" />
      </button>

      <FloatingPanel
        anchorRef={containerRef}
        open={open}
        onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") triggerRef.current?.focus();
        }}
        maxHeight={400}
        matchAnchorWidth
        contentKey={filtered.length}
        className="flex w-max min-w-60 max-w-[90vw] flex-col overflow-hidden"
      >
        <div className="shrink-0 border-b border-fleet-border p-1.5">
          <div className="mb-1.5 flex items-center gap-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlighted(0);
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={t("technician_search_placeholder")}
              className="w-full rounded-lg border border-fleet-border bg-white px-2 py-1.5 text-sm outline-none focus:border-fleet-teal"
            />
            {isManagement && (
              <Button
                iconOnly
                variant="secondary"
                size="compact"
                onClick={() => {
                  setAddError(null);
                  setShowAddModal(true);
                }}
                aria-label={t("technician_add")}
                title={t("technician_add")}
                className="text-fleet-teal"
              >
                <Plus size={16} />
              </Button>
            )}
          </div>
          <input
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder={t("technician_free_text_placeholder")}
            className="w-full rounded-lg border border-fleet-border bg-white px-2 py-1.5 text-sm outline-none focus:border-fleet-teal"
          />
        </div>
        <div ref={listRef} className="overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-fleet-ink">{t("technician_none")}</div>
          ) : (
            filtered.map((tech, i) => {
              const isSelected = tech.name === selected;
              return (
                <button
                  key={tech.id}
                  type="button"
                  data-option-index={i}
                  onClick={() => selectName(tech.name)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`${OPTION_ROW_BASE_CLASS} ${optionRowStateClass(isSelected, i === highlighted)}`}
                >
                  <span className="flex flex-col items-start">
                    <span>{tech.name}</span>
                    {(tech.contact_name || tech.phone) && (
                      <span className="text-xs font-normal text-fleet-ink">
                        {[tech.contact_name, tech.phone].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={14} className="shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </FloatingPanel>

      {showAddModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4">
          <form
            action={handleAddSubmit}
            className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-fleet-navy">{t("technician_add")}</h3>
              <Button
                iconOnly
                variant="text"
                onClick={() => setShowAddModal(false)}
                aria-label={t("close_word")}
                className="text-fleet-ink hover:text-fleet-coral-text hover:no-underline"
              >
                <X size={16} />
              </Button>
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
            {addError && <p className="text-xs text-fleet-coral-text">{addError}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowAddModal(false)}>
                {t("close_word")}
              </Button>
              <Button type="submit" className="flex-1" loading={isAdding}>
                {t("technician_add")}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
