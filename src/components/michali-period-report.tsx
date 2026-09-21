"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download, Pencil, Save, Trash2 } from "lucide-react";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { MichaliPeriodReportPrintView } from "@/components/michali-period-report-print-view";
import { saveMichaliPeriodReport } from "@/lib/actions/michali-period-reports";
import { computeMichaliPeriodSnapshot, michaliPeriodReportXlsxRows, PROVISIONS_BUCKETS, type MichaliReportExpense } from "@/lib/michali-period-report";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MichaliProvisionsBucket } from "@/lib/types/database";
import { formatCurrency } from "@/lib/money";
import { formatDateDisplay } from "@/lib/date-format";
import { INPUT_CLASS_INLINE, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

const CHART_COLORS = { fuel: "#0b1f38", boatService: "#4c6585", provisions: "#c98787", docking: "#78bb7a" };

// A one-time calculator (never auto-saved - see the session's discussion)
// shown only on the MICHALI boat's Expenses page: it summarizes whatever
// the page's own date/payment-method/category/search filters left in
// `expenses`, plus a handful of fields the captain fills in by hand each
// time (cabin count, fuel liters/price, the boat-service package prices,
// which provisions expense goes in which bucket). Reopening this panel
// always starts fresh from those filtered expenses. "Save" freezes the
// current numbers into a michali_period_reports row (visible on the
// Periodic Reports tab); "Download" exports the same numbers to Excel
// without saving anything.
export function MichaliPeriodReport({
  boatId,
  expenses,
  periodStart,
  periodEnd,
  locale,
}: {
  boatId: string;
  expenses: MichaliReportExpense[];
  periodStart: string;
  periodEnd: string;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);

  const [open, setOpen] = useState(false);
  const [cabinCount, setCabinCount] = useState("");
  const [fuelLiters, setFuelLiters] = useState("");
  const [fuelPrice, setFuelPrice] = useState("");
  const [laundry, setLaundry] = useState("180");
  const [service, setService] = useState("450");
  const [transfers, setTransfers] = useState("");
  const [toiletries, setToiletries] = useState("90");
  const [editingField, setEditingField] = useState<"laundry" | "service" | "toiletries" | null>(null);
  const [provisionsBuckets, setProvisionsBuckets] = useState<Record<string, MichaliProvisionsBucket>>({});
  const [provisionsConfirmed, setProvisionsConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  // Removes a row from this report's own totals only (a small trash icon on
  // Provisions/Docking Fees rows) - never touches the real expense record,
  // just excludes it from this particular calculation, e.g. a docking fee
  // that shouldn't count toward this charter's turnover.
  const [excludedExpenseIds, setExcludedExpenseIds] = useState<Set<string>>(new Set());
  const removeExpenseFromReport = (id: string) => setExcludedExpenseIds((prev) => new Set(prev).add(id));

  const isDirty =
    cabinCount !== "" ||
    fuelLiters !== "" ||
    fuelPrice !== "" ||
    transfers !== "" ||
    laundry !== "180" ||
    service !== "450" ||
    toiletries !== "90" ||
    Object.keys(provisionsBuckets).length > 0 ||
    excludedExpenseIds.size > 0;

  const closePanel = () => {
    if (isDirty && !saved) setShowCloseConfirm(true);
    else setOpen(false);
  };

  const includedExpenses = useMemo(
    () => expenses.filter((e) => !excludedExpenseIds.has(e.id)),
    [expenses, excludedExpenseIds]
  );
  const provisionsExpenses = useMemo(() => includedExpenses.filter((e) => e.category === "provisions"), [includedExpenses]);
  const dockingExpenses = useMemo(
    () => includedExpenses.filter((e) => e.category === "docking_out" || e.category === "base_docking"),
    [includedExpenses]
  );
  const provisionsByBucket = useMemo(() => {
    const map = new Map<MichaliProvisionsBucket, MichaliReportExpense[]>();
    for (const b of PROVISIONS_BUCKETS) map.set(b, []);
    for (const e of provisionsExpenses) {
      const b = provisionsBuckets[e.id];
      if (b) map.get(b)!.push(e);
    }
    return map;
  }, [provisionsExpenses, provisionsBuckets]);
  const unassignedProvisionsItems = useMemo(
    () => provisionsExpenses.filter((e) => !provisionsBuckets[e.id]),
    [provisionsExpenses, provisionsBuckets]
  );

  const snapshot = useMemo(
    () =>
      computeMichaliPeriodSnapshot(includedExpenses, {
        cabinCount: Number(cabinCount) || 0,
        fuelLiters: Number(fuelLiters) || 0,
        fuelPricePerLiter: Number(fuelPrice) || 0,
        laundry: Number(laundry) || 0,
        service: Number(service) || 0,
        transfers: Number(transfers) || 0,
        toiletries: Number(toiletries) || 0,
        provisionsBuckets,
      }),
    [includedExpenses, cabinCount, fuelLiters, fuelPrice, laundry, service, transfers, toiletries, provisionsBuckets]
  );

  const periodLabel =
    periodStart && periodEnd
      ? `${formatDateDisplay(periodStart)} – ${formatDateDisplay(periodEnd)}`
      : periodStart
        ? `${t("from_date")}: ${formatDateDisplay(periodStart)}`
        : periodEnd
          ? `${t("to_date")}: ${formatDateDisplay(periodEnd)}`
          : null;

  const setProvisionsBucket = (expenseId: string, bucket: MichaliProvisionsBucket) =>
    setProvisionsBuckets((prev) => {
      const next = { ...prev };
      if (next[expenseId] === bucket) delete next[expenseId];
      else next[expenseId] = bucket;
      return next;
    });

  const chartData = [
    { name: t("mp_report_fuel_section"), value: snapshot.fuel.total, color: CHART_COLORS.fuel },
    { name: t("mp_report_boat_service_section"), value: snapshot.boatService.total, color: CHART_COLORS.boatService },
    { name: t("mp_report_provisions_section"), value: snapshot.provisions.total, color: CHART_COLORS.provisions },
    { name: t("mp_report_docking_section"), value: snapshot.docking.total, color: CHART_COLORS.docking },
  ].filter((d) => d.value > 0);

  const exportLabels = {
    fuel: t("mp_report_fuel_section"),
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
  };

  // "Download" is the browser's own print-to-PDF (see
  // michali-period-report-print-view.tsx's own comment for why) - the
  // printable table itself is portaled straight to document.body since this
  // whole panel is nested inside expenses-manager.tsx's `print:hidden`
  // wrapper, which a plain nested element could never escape.
  const doDownload = () => window.print();

  const doSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveMichaliPeriodReport(boatId, periodStart || null, periodEnd || null, snapshot);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const fixedPriceRow = (
    field: "laundry" | "service" | "toiletries",
    label: string,
    value: string,
    setValue: (v: string) => void
  ) => (
    <div className="flex h-9 items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5">
      <span className="text-xs text-fleet-navy">{label}</span>
      {editingField === field ? (
        <input
          type="number"
          step="0.01"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditingField(null)}
          onWheel={(e) => e.currentTarget.blur()}
          className={`h-7 w-24 ${INPUT_CLASS_INLINE}`}
        />
      ) : (
        <button type="button" onClick={() => setEditingField(field)} className="flex items-center gap-1.5 text-xs font-bold text-fleet-navy">
          <span dir="ltr">{formatCurrency(Number(value) || 0)}</span>
          <Pencil size={12} aria-label={t("mp_report_edit_price")} className="text-fleet-ink" />
        </button>
      )}
    </div>
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => (open ? closePanel() : setOpen(true))}
        className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
          open ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
        }`}
      >
        {t("mp_report_toggle_cta")} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showCloseConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={() => setShowCloseConfirm(false)}>
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-xl border border-fleet-border bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-fleet-navy">{t("mp_report_close_unsaved_confirm")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCloseConfirm(false)} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
                {t("no_word")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  setOpen(false);
                }}
                className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}
              >
                {t("yes_word")}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-xl border border-fleet-border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-brand text-base font-light tracking-wide text-fleet-navy">{t("mp_report_title")}</h3>
              {periodLabel && (
                <div className="text-2xs text-fleet-ink" dir="ltr">
                  {periodLabel}
                </div>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-fleet-ink">
              {t("mp_report_cabin_count")}
              <input
                type="number"
                min="0"
                step="1"
                value={cabinCount}
                onChange={(e) => setCabinCount(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={`w-16 ${INPUT_CLASS_INLINE}`}
              />
            </label>
          </div>

          {/* Fuel */}
          <div className="flex flex-col gap-1.5">
            <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_fuel_section")}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-2xs text-fleet-ink">
                {t("mp_report_fuel_liters")}
                <input
                  type="number"
                  step="0.01"
                  value={fuelLiters}
                  onChange={(e) => setFuelLiters(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={INPUT_CLASS_INLINE}
                />
              </label>
              <label className="flex flex-col gap-1 text-2xs text-fleet-ink">
                {t("mp_report_fuel_price")}
                <input
                  type="number"
                  step="0.01"
                  value={fuelPrice}
                  onChange={(e) => setFuelPrice(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={INPUT_CLASS_INLINE}
                />
              </label>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(snapshot.fuel.total)}</span>
            </div>
          </div>

          {/* Boat Service */}
          <div className="flex flex-col gap-1.5">
            <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_boat_service_section")}</div>
            {fixedPriceRow("laundry", t("mp_report_laundry"), laundry, setLaundry)}
            {fixedPriceRow("service", t("mp_report_service"), service, setService)}
            <div className="flex h-9 items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5">
              <span className="text-xs text-fleet-navy">{t("mp_report_transfers")}</span>
              <input
                type="number"
                step="0.01"
                value={transfers}
                onChange={(e) => setTransfers(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={`h-7 w-24 ${INPUT_CLASS_INLINE}`}
              />
            </div>
            {fixedPriceRow("toiletries", t("mp_report_toiletries"), toiletries, setToiletries)}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(snapshot.boatService.total)}</span>
            </div>
          </div>

          {/* Provisions */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_provisions_section")}</div>
              {provisionsConfirmed && provisionsExpenses.length > 0 && (
                <button
                  type="button"
                  onClick={() => setProvisionsConfirmed(false)}
                  className="flex items-center gap-1 text-2xs font-bold text-fleet-teal"
                >
                  <Pencil size={12} /> {t("mp_report_provisions_edit_cta")}
                </button>
              )}
            </div>
            {provisionsExpenses.length === 0 ? (
              <p className="text-2xs text-fleet-ink">{t("mp_report_no_provisions")}</p>
            ) : provisionsConfirmed ? (
              <div className="flex flex-col gap-2">
                {PROVISIONS_BUCKETS.map((b) => {
                  const items = provisionsByBucket.get(b) ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={b} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between text-xs font-bold text-fleet-navy">
                        <span>{t(`mp_report_provisions_${b}` as Parameters<typeof translate>[1])}</span>
                        <span dir="ltr">{formatCurrency(snapshot.provisions.buckets[b])}</span>
                      </div>
                      <div className="text-2xs text-fleet-ink italic">
                        {items.map((e) => `${e.description} — ${formatCurrency(e.amount)}`).join(", ")}
                      </div>
                    </div>
                  );
                })}
                {unassignedProvisionsItems.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-xs font-bold text-fleet-coral-text">
                      <span>{t("mp_report_provisions_unassigned")}</span>
                      <span dir="ltr">{formatCurrency(snapshot.provisions.unassigned)}</span>
                    </div>
                    <div className="text-2xs text-fleet-ink italic">
                      {unassignedProvisionsItems.map((e) => `${e.description} — ${formatCurrency(e.amount)}`).join(", ")}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  {provisionsExpenses.map((e) => (
                    <div key={e.id} className="flex flex-col gap-1 rounded-lg border border-fleet-border px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center justify-between gap-2 sm:flex-1">
                        <span className="truncate text-xs text-fleet-navy">{e.description}</span>
                        <span dir="ltr" className="shrink-0 text-xs font-bold text-fleet-navy">
                          {formatCurrency(e.amount)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {PROVISIONS_BUCKETS.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setProvisionsBucket(e.id, b)}
                            className={`rounded-full border px-2 py-0.5 text-2xs font-bold ${
                              provisionsBuckets[e.id] === b ? "border-fleet-teal bg-fleet-teal text-white" : "border-fleet-border text-fleet-navy"
                            }`}
                          >
                            {t(`mp_report_provisions_${b}` as Parameters<typeof translate>[1])}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => removeExpenseFromReport(e.id)}
                          aria-label={t("delete_word")}
                          className="shrink-0 text-fleet-ink hover:text-fleet-coral-text"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROVISIONS_BUCKETS.map((b) => (
                    <div key={b} className="flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1 text-2xs font-bold text-fleet-navy">
                      {t(`mp_report_provisions_${b}` as Parameters<typeof translate>[1])}
                      <span dir="ltr">{formatCurrency(snapshot.provisions.buckets[b])}</span>
                    </div>
                  ))}
                  {snapshot.provisions.unassigned > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1 text-2xs font-bold text-fleet-coral-text">
                      {t("mp_report_provisions_unassigned")}
                      <span dir="ltr">{formatCurrency(snapshot.provisions.unassigned)}</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setProvisionsConfirmed(true)}
                  className="w-fit rounded-full border border-fleet-teal px-3 py-1 text-2xs font-bold text-fleet-teal"
                >
                  {t("mp_report_provisions_confirm_cta")}
                </button>
              </>
            )}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(snapshot.provisions.total)}</span>
            </div>
          </div>

          {/* Docking Fees */}
          <div className="flex flex-col gap-1.5">
            <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_docking_section")}</div>
            {dockingExpenses.length === 0 ? (
              <p className="text-2xs text-fleet-ink">{t("mp_report_no_docking")}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {dockingExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border border-fleet-border px-2.5 py-1.5">
                    <span className="truncate text-xs text-fleet-navy">{e.description}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <span dir="ltr" className="text-xs font-bold text-fleet-navy">
                        {formatCurrency(e.amount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeExpenseFromReport(e.id)}
                        aria-label={t("delete_word")}
                        className="text-fleet-ink hover:text-fleet-coral-text"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(snapshot.docking.total)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-2 border-t border-fleet-border pt-3">
            {chartData.length > 0 && (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <CategoryPieChart data={chartData} className="h-44 w-44 shrink-0" />
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
            <div className="flex items-center justify-between rounded-lg bg-fleet-navy px-3 py-2 text-sm font-bold text-white">
              <span>{t("mp_report_grand_total")}</span>
              <span dir="ltr">{formatCurrency(snapshot.grandTotal)}</span>
            </div>
            {snapshot.perCabin != null && (
              <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-3 py-2 text-xs font-bold text-fleet-navy">
                <span>{t("mp_report_per_cabin")}</span>
                <span dir="ltr">{formatCurrency(snapshot.perCabin)}</span>
              </div>
            )}
          </div>

          {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
          {saved && (
            <p className="text-xs font-bold text-fleet-moss-text">
              {t("mp_report_saved_confirm")} —{" "}
              <Link href={`/boats/${boatId}/finance/periodic-reports`} className="underline">
                {t("mp_report_saved_title")}
              </Link>
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={doDownload} className={`flex flex-1 items-center justify-center gap-1.5 ${SECONDARY_BUTTON_CLASS}`}>
              <Download size={16} /> {t("mp_report_download_cta")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={doSave}
              className={`flex flex-1 items-center justify-center gap-1.5 ${PRIMARY_BUTTON_CLASS}`}
            >
              <Save size={16} /> {saving ? t("saving_word") : t("save_word")}
            </button>
          </div>
        </div>
      )}

      {/* Gated on `open` (never true during SSR - it only flips via a click)
          rather than a mount-effect flag, so this never touches `document`
          before the client has hydrated. */}
      {open &&
        createPortal(
          <div className="hidden print:block">
            <MichaliPeriodReportPrintView
              title="MICHALI"
              periodLabel={periodLabel}
              rows={michaliPeriodReportXlsxRows(snapshot, exportLabels)}
              categoryLabel={t("category")}
              descriptionLabel={t("description")}
              amountLabel={t("amount")}
            />
          </div>,
          document.body
        )}
    </div>
  );
}
