"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  createMysManagementFeeCharges,
  skipMysManagementFeePeriod,
  updateMysManagementFeeTemplateAmount,
} from "@/lib/actions/mys-management-fees";
import type { DueManagementFee } from "@/lib/mys-management-fees";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Row = DueManagementFee & { boatName: string };
type EditableRow = Row & { editedAmount: string; askingScope: boolean };

// One popup on /mys for every management-fee template due today (see
// src/lib/mys-management-fees.ts for the "is this due" logic evaluated
// server-side in mys/page.tsx). Editing a row's amount away from its
// template default asks whether that's a one-time correction or the new
// permanent default (updateMysManagementFeeTemplateAmount) - deleting a
// row skips just this period (skipMysManagementFeePeriod) without ever
// touching the template's stored amount. "Add to debts" creates the real
// charge for every row still in the list.
export function MysManagementFeeReminder({ dueRows, locale }: { dueRows: Row[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();

  const [open, setOpen] = useState(dueRows.length > 0);
  const [rows, setRows] = useState<EditableRow[]>(
    dueRows.map((r) => ({ ...r, editedAmount: String(r.amount), askingScope: false }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || rows.length === 0) return null;

  const updateEditedAmount = (templateId: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, editedAmount: value } : r)));

  const onAmountBlur = (templateId: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.templateId !== templateId) return r;
        const newValue = round2(Number(r.editedAmount) || 0);
        if (newValue === r.amount) return r;
        return { ...r, askingScope: true };
      })
    );

  const resolveScope = async (templateId: string, scope: "once" | "permanent") => {
    const row = rows.find((r) => r.templateId === templateId);
    if (!row) return;
    const newAmount = round2(Number(row.editedAmount) || 0);
    if (scope === "permanent") {
      try {
        await updateMysManagementFeeTemplateAmount(templateId, newAmount);
      } catch (e) {
        setError(e instanceof Error ? e.message : t("save_failed"));
      }
    }
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, amount: newAmount, askingScope: false } : r)));
  };

  const removeRow = (templateId: string, period: string) => {
    setRows((prev) => prev.filter((r) => r.templateId !== templateId));
    skipMysManagementFeePeriod(templateId, period).catch((e) => {
      console.error("MysManagementFeeReminder: failed to skip period", e);
    });
  };

  const total = round2(rows.reduce((s, r) => s + (Number(r.editedAmount) || 0), 0));
  const hasPendingScopeChoice = rows.some((r) => r.askingScope);

  const doAddToDebts = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await createMysManagementFeeCharges(
        rows.map((r) => ({
          templateId: r.templateId,
          boatId: r.boatId,
          amount: round2(Number(r.editedAmount) || 0),
          description: r.description,
          period: r.period,
        }))
      );
      if (result?.errors && result.errors.length > 0) {
        setError(t("mys_management_fee_partial_error", { list: result.errors.join(", ") }));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-brand text-lg font-light tracking-wide text-fleet-navy">{t("mys_management_fee_reminder_title")}</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("close_word")} className="text-fleet-ink hover:text-fleet-navy">
            <X size={18} />
          </button>
        </div>

        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.templateId} className="flex flex-col gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-fleet-navy">{r.boatName}</div>
                  <div className="truncate text-xs text-fleet-ink">{r.description}</div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={r.editedAmount}
                  onChange={(e) => updateEditedAmount(r.templateId, e.target.value)}
                  onBlur={() => onAmountBlur(r.templateId)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`w-24 shrink-0 ${INPUT_CLASS}`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(r.templateId, r.period)}
                  aria-label={t("delete_word")}
                  className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                >
                  <X size={16} />
                </button>
              </div>
              {r.askingScope && (
                <div className="flex items-center gap-2 rounded-lg bg-fleet-brass/15 px-2.5 py-1.5 text-xs">
                  <span className="flex-1 text-fleet-navy">{t("mys_management_fee_scope_question")}</span>
                  <button
                    type="button"
                    onClick={() => resolveScope(r.templateId, "once")}
                    className="shrink-0 font-bold text-fleet-navy hover:underline"
                  >
                    {t("mys_management_fee_scope_once")}
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveScope(r.templateId, "permanent")}
                    className="shrink-0 font-bold text-fleet-teal hover:underline"
                  >
                    {t("mys_management_fee_scope_permanent")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-3 py-2 text-sm font-bold text-fleet-navy">
          <span>{t("total")}</span>
          <span dir="ltr">{formatCurrency(total)}</span>
        </div>

        {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
            {t("close_word")}
          </button>
          <button
            type="button"
            disabled={saving || hasPendingScopeChoice}
            onClick={doAddToDebts}
            className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
          >
            {saving ? t("saving_word") : t("mys_management_fee_add_to_debts_cta")}
          </button>
        </div>
      </div>
    </div>
  );
}
