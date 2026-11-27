"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRefreshTransition } from "@/lib/hooks/use-refresh-transition";
import { setMysManagementFeeTemplateActive } from "@/lib/actions/mys-management-fees";
import { ConfirmPopup } from "@/components/confirm-popup";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MysManagementFeeTemplate } from "@/lib/types/database";

export type FeeTemplateRow = Pick<MysManagementFeeTemplate, "id" | "amount" | "charge_label" | "frequency" | "active"> & {
  boatName: string;
};

// Every boat's recurring charge (management/storage fees...), with a switch
// to stop billing a boat MYS no longer services - and to resume it later. A
// stopped boat is simply skipped by the due-reminder logic (see
// computeDueManagementFee); nothing already charged is ever touched. The
// amount a boat is billed is changed from the reminder itself ("permanently"),
// so this panel only shows it.
export function MysManagementFeeTemplatesPanel({ templates, locale }: { templates: FeeTemplateRow[]; locale: Locale }) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const { startTransition, router } = useRefreshTransition();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FeeTemplateRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) return null;

  const apply = async (row: FeeTemplateRow) => {
    setError(null);
    setBusyId(row.id);
    try {
      await setMysManagementFeeTemplateActive(row.id, !row.active);
      startTransition(() => {
        router.refresh();
        setBusyId(null);
      });
    } catch (e) {
      console.error("setMysManagementFeeTemplateActive failed:", e);
      setError(e instanceof Error ? e.message : t("save_failed"));
      setBusyId(null);
    }
  };

  const stoppedCount = templates.filter((tpl) => !tpl.active).length;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 text-start text-sm font-bold text-fleet-navy"
      >
        <span>
          {t("mys_fee_templates_title")} ({templates.length}
          {stoppedCount > 0 ? ` · ${stoppedCount} ${t("mys_fee_template_stopped")}` : ""})
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="flex flex-col gap-1.5">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className={`flex items-center gap-3 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 ${tpl.active ? "" : "opacity-70"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-fleet-navy">{tpl.boatName}</div>
                <div className="truncate text-xs text-fleet-ink">
                  {tpl.charge_label} · {tpl.frequency === "quarterly" ? t("recurring_frequency_quarterly") : t("recurring_frequency_monthly")}
                  {!tpl.active && ` · ${t("mys_fee_template_stopped")}`}
                </div>
              </div>
              <div dir="ltr" className="shrink-0 text-sm font-bold tabular-nums text-fleet-navy">
                {formatCurrency(tpl.amount)}
              </div>
              <Button variant="secondary" size="compact" loading={busyId === tpl.id} onClick={() => setPending(tpl)}>
                {tpl.active ? t("mys_fee_template_stop") : t("mys_fee_template_resume")}
              </Button>
            </div>
          ))}
          {error && <p className="text-xs text-fleet-coral-text">{error}</p>}
        </div>
      )}

      {pending && (
        <ConfirmPopup
          message={t(pending.active ? "mys_fee_template_stop_confirm" : "mys_fee_template_resume_confirm", {
            boat: pending.boatName,
            label: pending.charge_label,
          })}
          destructive={pending.active}
          locale={locale}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const row = pending;
            setPending(null);
            void apply(row);
          }}
        />
      )}
    </div>
  );
}
