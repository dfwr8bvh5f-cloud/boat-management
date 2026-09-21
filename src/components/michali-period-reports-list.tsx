"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, Trash2 } from "lucide-react";
import { deleteMichaliPeriodReport } from "@/lib/actions/michali-period-reports";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { MichaliPeriodReportPrintView } from "@/components/michali-period-report-print-view";
import { formatDateDisplay } from "@/lib/date-format";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MichaliPeriodReport } from "@/lib/types/database";

const CHART_COLORS = { fuel: "#0b1f38", boatService: "#4c6585", provisions: "#c98787", docking: "#78bb7a" };

export function MichaliPeriodReportsList({
  boatId,
  reports,
  creatorNames,
  isManagement,
  locale,
}: {
  boatId: string;
  reports: MichaliPeriodReport[];
  creatorNames: Record<string, string>;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [openId, setOpenId] = useState<string | null>(null);
  // Download = print-to-PDF (see michali-period-report-print-view.tsx) -
  // `printing` names which saved report's printable table is currently
  // shown (everything else on this page is print:hidden), reset once the
  // print dialog closes so a later download doesn't reprint a stale pick.
  const [printing, setPrinting] = useState<MichaliPeriodReport | null>(null);

  useEffect(() => {
    if (!printing) return;
    window.print();
    const reset = () => setPrinting(null);
    window.addEventListener("afterprint", reset, { once: true });
    return () => window.removeEventListener("afterprint", reset);
  }, [printing]);

  if (reports.length === 0) {
    return <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">{t("none_michali_period_reports")}</p>;
  }

  const exportLabels = {
    fuel: t("mp_report_fuel_section"),
    fuelLiters: t("mp_report_fuel_liters"),
    fuelPrice: t("mp_report_fuel_price"),
    boatService: t("mp_report_boat_service_section"),
    laundry: t("mp_report_laundry"),
    service: t("mp_report_service"),
    transfers: t("mp_report_transfers"),
    toiletries: t("mp_report_toiletries"),
    provisions: t("mp_report_provisions_section"),
    shopping: t("mp_report_provisions_shopping"),
    meat: t("mp_report_provisions_meat"),
    drinks: t("mp_report_provisions_drinks"),
    fish: t("mp_report_provisions_fish"),
    unassigned: t("mp_report_provisions_unassigned"),
    docking: t("mp_report_docking_section"),
    total: t("total"),
    grandTotal: t("mp_report_grand_total"),
    perCabin: t("mp_report_per_cabin"),
    cabinCount: t("mp_report_cabin_count"),
  };

  return (
    <>
    <div className="flex flex-col gap-2 print:hidden">
      {reports.map((r) => {
        const isOpen = openId === r.id;
        const chartData = [
          { name: t("mp_report_fuel_section"), value: r.snapshot.fuel.total, color: CHART_COLORS.fuel },
          { name: t("mp_report_boat_service_section"), value: r.snapshot.boatService.total, color: CHART_COLORS.boatService },
          { name: t("mp_report_provisions_section"), value: r.snapshot.provisions.total, color: CHART_COLORS.provisions },
          { name: t("mp_report_docking_section"), value: r.snapshot.docking.total, color: CHART_COLORS.docking },
        ].filter((d) => d.value > 0);

        return (
          <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex w-full items-center gap-2.5">
              <button onClick={() => setOpenId(isOpen ? null : r.id)} className="flex flex-1 items-center gap-2.5 text-start">
                <div className="flex-1">
                  <div className="text-sm font-bold text-fleet-navy" dir="ltr">
                    {r.period_start && r.period_end
                      ? `${formatDateDisplay(r.period_start)} – ${formatDateDisplay(r.period_end)}`
                      : formatDateDisplay(r.created_at.slice(0, 10))}
                  </div>
                  <div className="text-2xs text-fleet-ink">
                    {t("mp_report_saved_by")} {creatorNames[r.created_by ?? ""] ?? "—"} ·{" "}
                    <span dir="ltr">{formatDateDisplay(r.created_at.slice(0, 10))}</span>
                  </div>
                </div>
                <span dir="ltr" className="shrink-0 text-sm font-bold text-fleet-navy">
                  {formatCurrency(r.snapshot.grandTotal)}
                </span>
                <ChevronDown size={16} className={`text-fleet-brass transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              <button
                type="button"
                onClick={() => setPrinting(r)}
                aria-label={t("mp_report_download_cta")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-ink hover:bg-fleet-paper"
              >
                <Download size={16} />
              </button>
              {isManagement && (
                <form action={deleteMichaliPeriodReport.bind(null, boatId, r.id)}>
                  <ConfirmSubmitButton
                    locale={locale}
                    confirmMessage={t("delete_report_confirm")}
                    ariaLabel={t("delete_word")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-fleet-coral-text hover:bg-fleet-paper"
                  >
                    <Trash2 size={16} />
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>

            {isOpen && (
              <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-fleet-border pt-3">
                {chartData.length > 0 && (
                  <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                    <CategoryPieChart data={chartData} className="h-40 w-40 shrink-0" />
                    <div className="flex w-full flex-col gap-1">
                      {chartData.map((d) => (
                        <div key={d.name} className="flex items-center gap-2 border-b border-dotted border-fleet-border py-1 text-xs">
                          <span className="flex flex-1 items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} />
                            {d.name}
                          </span>
                          <span dir="ltr" className="font-medium text-fleet-navy">
                            {formatCurrency(d.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {r.snapshot.cabinCount > 0 && (
                  <div className="flex items-center justify-between text-xs text-fleet-ink">
                    <span>{t("mp_report_cabin_count")}</span>
                    <span>{r.snapshot.cabinCount}</span>
                  </div>
                )}
                {r.snapshot.perCabin != null && (
                  <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-3 py-2 text-xs font-bold text-fleet-navy">
                    <span>{t("mp_report_per_cabin")}</span>
                    <span dir="ltr">{formatCurrency(r.snapshot.perCabin)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {printing && (
      <div className="hidden print:block">
        <MichaliPeriodReportPrintView
          title="MICHALI"
          periodLabel={
            printing.period_start && printing.period_end
              ? `${formatDateDisplay(printing.period_start)} – ${formatDateDisplay(printing.period_end)}`
              : null
          }
          snapshot={printing.snapshot}
          labels={exportLabels}
        />
      </div>
    )}
    </>
  );
}
