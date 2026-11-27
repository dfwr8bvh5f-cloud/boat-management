"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useRefreshTransition } from "@/lib/hooks/use-refresh-transition";
import { setMysManagementFeeTemplateActive, updateMysManagementFeeTemplateAmount } from "@/lib/actions/mys-management-fees";
import { CloseButton } from "@/components/close-button";
import { ConfirmPopup } from "@/components/confirm-popup";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysManagementFeeTemplate } from "@/lib/types/database";
import { INPUT_CLASS_COMPACT } from "@/lib/ui-classes";

export type FeeTemplateRow = Pick<MysManagementFeeTemplate, "id" | "amount" | "charge_label" | "frequency" | "active"> & {
  boatName: string;
};

// "Edit existing charges" on the MYS dashboard: opens a window listing every
// boat's recurring charge (management/storage fees...). Each row's amount can
// be changed - it becomes the new default for every FUTURE charge of that boat
// (same as choosing "Permanently" in the reminder; charges already created are
// never touched) - and the charge can be stopped for a boat MYS no longer
// services, or resumed later. A stopped boat is skipped by the due-reminder
// logic (see computeDueManagementFee).
export function MysManagementFeeTemplatesButton({ templates, locale }: { templates: FeeTemplateRow[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const { startTransition, router } = useRefreshTransition();
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pendingToggle, setPendingToggle] = useState<FeeTemplateRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  const run = async (id: string, action: () => Promise<void>) => {
    setError(null);
    setBusyId(id);
    try {
      await action();
      startTransition(() => {
        router.refresh();
        setBusyId(null);
      });
    } catch (e) {
      console.error("management fee template update failed:", e);
      setError(e instanceof Error ? e.message : t("save_failed"));
      setBusyId(null);
    }
  };

  const draftOf = (tpl: FeeTemplateRow) => drafts[tpl.id] ?? String(tpl.amount);
  const draftAmount = (tpl: FeeTemplateRow) => Number(draftOf(tpl));
  const isDirty = (tpl: FeeTemplateRow) => {
    const n = draftAmount(tpl);
    return draftOf(tpl).trim() !== "" && Number.isFinite(n) && n >= 0 && n !== tpl.amount;
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={14} /> {t("mys_fee_templates_edit_cta")}
      </Button>

      {open && (
        <Modal tone="dialog" onClose={() => setOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-fleet-navy">{t("mys_fee_templates_title")}</h2>
              <CloseButton label={t("close_word")} onClick={() => setOpen(false)} />
            </div>
            <p className="text-xs text-fleet-ink">{t("mys_fee_templates_amount_hint")}</p>

            <div className="flex flex-col gap-1.5">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 ${tpl.active ? "" : "opacity-70"}`}
                >
                  <div className="min-w-[8rem] flex-1">
                    <div className="truncate text-sm font-bold text-fleet-navy">{tpl.boatName}</div>
                    <div className="truncate text-xs text-fleet-ink">
                      {tpl.charge_label} · {tpl.frequency === "quarterly" ? t("recurring_frequency_quarterly") : t("recurring_frequency_monthly")}
                      {!tpl.active && ` · ${t("mys_fee_template_stopped")}`}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    dir="ltr"
                    value={draftOf(tpl)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [tpl.id]: e.target.value }))}
                    onWheel={(e) => e.currentTarget.blur()}
                    aria-label={t("amount")}
                    className={`${INPUT_CLASS_COMPACT} !w-28 shrink-0`}
                  />
                  {isDirty(tpl) && (
                    <Button
                      size="compact"
                      loading={busyId === tpl.id}
                      onClick={() => run(tpl.id, () => updateMysManagementFeeTemplateAmount(tpl.id, round2Amount(draftAmount(tpl))))}
                    >
                      {t("save_word")}
                    </Button>
                  )}
                  <Button variant="secondary" size="compact" disabled={busyId === tpl.id} onClick={() => setPendingToggle(tpl)}>
                    {tpl.active ? t("mys_fee_template_stop") : t("mys_fee_template_resume")}
                  </Button>
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
          </div>
        </Modal>
      )}

      {pendingToggle && (
        <ConfirmPopup
          message={t(pendingToggle.active ? "mys_fee_template_stop_confirm" : "mys_fee_template_resume_confirm", {
            boat: pendingToggle.boatName,
            label: pendingToggle.charge_label,
          })}
          destructive={pendingToggle.active}
          locale={locale}
          onCancel={() => setPendingToggle(null)}
          onConfirm={() => {
            const row = pendingToggle;
            setPendingToggle(null);
            void run(row.id, () => setMysManagementFeeTemplateActive(row.id, !row.active));
          }}
        />
      )}
    </>
  );
}

// Amounts are entered to the cent - round so 12.345 is never stored.
function round2Amount(n: number) {
  return Math.round(n * 100) / 100;
}
