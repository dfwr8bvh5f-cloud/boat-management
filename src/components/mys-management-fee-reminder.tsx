"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Receipt, X } from "lucide-react";
import {
  createMysManagementFeeCharges,
  skipMysManagementFeePeriod,
  updateMysManagementFeeTemplateAmount,
} from "@/lib/actions/mys-management-fees";
import type { DueManagementFee } from "@/lib/mys-management-fees";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS_COMPACT, PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

type Row = DueManagementFee & { boatName: string };
type EditableRow = Row & { editedAmount: string; askingScope: boolean };

// An inline banner on /mys for every management-fee template due (see
// src/lib/mys-management-fees.ts for the "is this due" logic evaluated
// server-side in mys/page.tsx) - stays in place, embedded on the page like
// the recurring-expenses due banner (mys-recurring-expenses-panel.tsx),
// rather than a blocking popup, since an unhandled row is meant to keep
// showing until she deals with it. Editing a row's amount (via its pencil
// icon) away from its template default asks whether that's a one-time
// correction or the new permanent default
// (updateMysManagementFeeTemplateAmount) - the X skips just this period
// (skipMysManagementFeePeriod) without ever touching the template's stored
// amount. "Add to debts" creates the real charge for every row still here.
export function MysManagementFeeReminder({ dueRows, locale }: { dueRows: Row[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const router = useRouter();

  const [rows, setRows] = useState<EditableRow[]>(
    dueRows.map((r) => ({ ...r, editedAmount: String(r.amount), askingScope: false }))
  );
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const updateEditedAmount = (templateId: string, value: string) =>
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, editedAmount: value } : r)));

  const cancelAmountEdit = (templateId: string) => {
    setRows((prev) => prev.map((r) => (r.templateId === templateId ? { ...r, editedAmount: String(r.amount) } : r)));
    setEditingAmountId(null);
  };

  const confirmAmountEdit = (templateId: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.templateId !== templateId) return r;
        const newValue = round2(Number(r.editedAmount) || 0);
        if (newValue === r.amount) {
          setEditingAmountId(null);
          return { ...r, editedAmount: String(newValue) };
        }
        setEditingAmountId(null);
        return { ...r, editedAmount: String(newValue), askingScope: true };
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
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-fleet-brass bg-fleet-brass/10 p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-fleet-brass">
        <Receipt size={14} /> {t("mys_management_fee_reminder_title")}
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.templateId} className="flex flex-col gap-1.5 rounded-lg border border-fleet-border bg-white p-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-fleet-navy">{r.boatName}</div>
                <div className="truncate text-xs text-fleet-ink">{r.description}</div>
              </div>
              {editingAmountId === r.templateId ? (
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  value={r.editedAmount}
                  onChange={(e) => updateEditedAmount(r.templateId, e.target.value)}
                  onBlur={() => confirmAmountEdit(r.templateId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAmountEdit(r.templateId);
                    if (e.key === "Escape") cancelAmountEdit(r.templateId);
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`w-24 shrink-0 ${INPUT_CLASS_COMPACT}`}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingAmountId(r.templateId)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-fleet-border px-2 py-1 text-sm font-bold text-fleet-navy hover:bg-fleet-paper"
                >
                  <span dir="ltr">{formatCurrency(Number(r.editedAmount) || 0)}</span>
                  <Pencil size={12} className="text-fleet-ink" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeRow(r.templateId, r.period)}
                aria-label={t("delete_word")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-fleet-border text-fleet-ink hover:bg-fleet-paper"
              >
                <X size={14} />
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

      <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-bold text-fleet-navy">
        <span>{t("total")}</span>
        <span dir="ltr">{formatCurrency(total)}</span>
      </div>

      {error && <p className="text-xs text-fleet-coral-text">{error}</p>}

      <button
        type="button"
        disabled={saving || hasPendingScopeChoice}
        onClick={doAddToDebts}
        className={`flex items-center justify-center gap-1.5 ${PRIMARY_BUTTON_CLASS}`}
      >
        <Plus size={14} /> {saving ? t("saving_word") : t("mys_management_fee_add_to_debts_cta")}
      </button>
    </div>
  );
}
