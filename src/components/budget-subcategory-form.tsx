"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { BudgetSubcategory } from "@/lib/types/database";

type Mode = "fixed" | "rate";

const INPUT = "rounded-md border border-fleet-border bg-white px-2 py-1.5 text-xs";

// Compact add / edit form for one budget subcategory. A line is either a
// fixed amount or rate x quantity (+ optional unit); only the fields of the
// chosen mode are rendered, and `mode` is submitted so the server knows which
// to trust. `hideRate` (separate budgets) keeps the simple name + amount form.
export function BudgetSubcategoryForm({
  initial,
  hideRate = false,
  submitLabel,
  locale,
  onSubmit,
  onCancel,
}: {
  initial?: BudgetSubcategory;
  hideRate?: boolean;
  submitLabel: string;
  locale: Locale;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [mode, setMode] = useState<Mode>(!hideRate && initial?.rate != null && initial?.duration != null ? "rate" : "fixed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-fleet-border bg-fleet-paper p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        if (!String(formData.get("name") ?? "").trim()) {
          setError(t("error_subcat_name_required"));
          return;
        }
        if (mode === "rate" && (!String(formData.get("rate") ?? "").trim() || !String(formData.get("duration") ?? "").trim())) {
          setError(t("error_subcat_rate_required"));
          return;
        }
        setSaving(true);
        setError(null);
        try {
          await onSubmit(formData);
        } catch (err) {
          console.error("Budget subcategory save failed", err);
          setError(t("error_subcat_save_failed"));
          setSaving(false);
        }
      }}
    >
      <input type="hidden" name="mode" value={mode} />
      <input
        name="name"
        defaultValue={initial?.name ?? ""}
        placeholder={t("subcat_name_placeholder")}
        aria-label={t("subcat_name_placeholder")}
        autoFocus
        className={`${INPUT} w-full`}
      />
      {!hideRate && (
        <div role="radiogroup" className="inline-flex self-start overflow-hidden rounded-md border border-fleet-border bg-white text-xs">
          {(["fixed", "rate"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fleet-teal/40 ${
                mode === m ? "bg-fleet-navy text-white" : "text-fleet-ink hover:bg-fleet-paper"
              }`}
            >
              {t(m === "fixed" ? "subcat_mode_fixed" : "subcat_mode_rate")}
            </button>
          ))}
        </div>
      )}
      {mode === "fixed" ? (
        <input
          name="amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={initial?.amount ?? ""}
          placeholder={t("subcat_total_placeholder")}
          aria-label={t("subcat_total_placeholder")}
          onWheel={(e) => e.currentTarget.blur()}
          className={`${INPUT} w-full sm:w-48`}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            name="rate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.rate ?? ""}
            placeholder={t("rate_per_unit_placeholder")}
            aria-label={t("rate_per_unit_placeholder")}
            onWheel={(e) => e.currentTarget.blur()}
            className={`${INPUT} min-w-0 flex-1 basis-28`}
          />
          <span className="text-2xs text-fleet-ink">×</span>
          <input
            name="duration"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.duration ?? ""}
            placeholder={t("quantity_placeholder")}
            aria-label={t("quantity_placeholder")}
            onWheel={(e) => e.currentTarget.blur()}
            className={`${INPUT} w-20`}
          />
          <input
            name="duration_unit"
            defaultValue={initial?.duration_unit ?? ""}
            placeholder={t("duration_unit_placeholder")}
            aria-label={t("duration_unit_placeholder")}
            className={`${INPUT} min-w-0 flex-1 basis-28`}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-2xs font-semibold text-fleet-coral-text">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="compact" loading={saving}>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" size="compact" onClick={onCancel} disabled={saving}>
          {t("cancel_word")}
        </Button>
      </div>
    </form>
  );
}
