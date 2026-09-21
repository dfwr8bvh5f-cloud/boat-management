"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { CategoryPieChart } from "@/components/category-pie-chart";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ExpenseCategory } from "@/lib/types/database";
import { formatCurrency, round2 } from "@/lib/money";
import { INPUT_CLASS_INLINE } from "@/lib/ui-classes";

type ReportExpense = { id: string; category: ExpenseCategory | null; amount: number; description: string };
type ProvisionsBucket = "shopping" | "meat" | "drinks" | "fish";
const PROVISIONS_BUCKETS: ProvisionsBucket[] = ["shopping", "meat", "drinks", "fish"];

// A one-time calculator (never saved to the database - see the session's
// discussion) built for MICHALI only: it summarizes whatever the boat's own
// Expenses filters (date range/payment method/category/search) left in
// `expenses`, plus a handful of fields the captain fills in by hand each
// time (cabin count, fuel liters/price, the boat-service package prices,
// which provisions expense goes in which bucket). Reopening this panel
// always starts fresh from those filtered expenses; nothing here persists
// across a page refresh.
export function MichaliPeriodReport({ expenses, locale }: { expenses: ReportExpense[]; locale: Locale }) {
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
  const [provisionsBuckets, setProvisionsBuckets] = useState<Record<string, ProvisionsBucket>>({});

  const provisionsExpenses = useMemo(() => expenses.filter((e) => e.category === "provisions"), [expenses]);
  const dockingExpenses = useMemo(
    () => expenses.filter((e) => e.category === "docking_out" || e.category === "base_docking"),
    [expenses]
  );

  const fuelTotal = round2((Number(fuelLiters) || 0) * (Number(fuelPrice) || 0));
  const boatServiceTotal = round2((Number(laundry) || 0) + (Number(service) || 0) + (Number(transfers) || 0) + (Number(toiletries) || 0));
  const provisionsTotal = round2(provisionsExpenses.reduce((s, e) => s + e.amount, 0));
  const dockingTotal = round2(dockingExpenses.reduce((s, e) => s + e.amount, 0));
  const grandTotal = round2(fuelTotal + boatServiceTotal + provisionsTotal + dockingTotal);
  const cabinCountNum = Number(cabinCount) || 0;
  const perCabin = cabinCountNum > 0 ? round2(grandTotal / cabinCountNum) : null;

  const bucketTotal = (bucket: ProvisionsBucket) =>
    round2(provisionsExpenses.filter((e) => provisionsBuckets[e.id] === bucket).reduce((s, e) => s + e.amount, 0));
  const unassignedProvisions = provisionsExpenses.filter((e) => !provisionsBuckets[e.id]);
  const setProvisionsBucket = (expenseId: string, bucket: ProvisionsBucket) =>
    setProvisionsBuckets((prev) => {
      const next = { ...prev };
      if (next[expenseId] === bucket) delete next[expenseId];
      else next[expenseId] = bucket;
      return next;
    });

  const chartData = [
    { name: t("mp_report_fuel_section"), value: fuelTotal, color: "#0b1f38" },
    { name: t("mp_report_boat_service_section"), value: boatServiceTotal, color: "#4c6585" },
    { name: t("mp_report_provisions_section"), value: provisionsTotal, color: "#c98787" },
    { name: t("mp_report_docking_section"), value: dockingTotal, color: "#78bb7a" },
  ].filter((d) => d.value > 0);

  const fixedPriceRow = (
    field: "laundry" | "service" | "toiletries",
    label: string,
    value: string,
    setValue: (v: string) => void
  ) => (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5">
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
          className={`w-24 ${INPUT_CLASS_INLINE}`}
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
        onClick={() => setOpen((s) => !s)}
        className={`flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
          open ? "border-fleet-teal text-fleet-teal" : "border-fleet-border text-fleet-navy"
        }`}
      >
        {t("mp_report_toggle_cta")} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-4 rounded-xl border border-fleet-border bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-brand text-base font-light tracking-wide text-fleet-navy">{t("mp_report_title")}</h3>
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
              <span dir="ltr">{formatCurrency(fuelTotal)}</span>
            </div>
          </div>

          {/* Boat Service */}
          <div className="flex flex-col gap-1.5">
            <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_boat_service_section")}</div>
            {fixedPriceRow("laundry", t("mp_report_laundry"), laundry, setLaundry)}
            {fixedPriceRow("service", t("mp_report_service"), service, setService)}
            <div className="flex items-center justify-between gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5">
              <span className="text-xs text-fleet-navy">{t("mp_report_transfers")}</span>
              <input
                type="number"
                step="0.01"
                value={transfers}
                onChange={(e) => setTransfers(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={`w-24 ${INPUT_CLASS_INLINE}`}
              />
            </div>
            {fixedPriceRow("toiletries", t("mp_report_toiletries"), toiletries, setToiletries)}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(boatServiceTotal)}</span>
            </div>
          </div>

          {/* Provisions */}
          <div className="flex flex-col gap-1.5">
            <div className="text-2xs font-bold text-fleet-ink">{t("mp_report_provisions_section")}</div>
            {provisionsExpenses.length === 0 ? (
              <p className="text-2xs text-fleet-ink">{t("mp_report_no_provisions")}</p>
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
                      <div className="flex flex-wrap gap-1">
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
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROVISIONS_BUCKETS.map((b) => (
                    <div key={b} className="flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1 text-2xs font-bold text-fleet-navy">
                      {t(`mp_report_provisions_${b}` as Parameters<typeof translate>[1])}
                      <span dir="ltr">{formatCurrency(bucketTotal(b))}</span>
                    </div>
                  ))}
                  {unassignedProvisions.length > 0 && (
                    <div className="flex items-center gap-1.5 rounded-full bg-fleet-paper px-2.5 py-1 text-2xs font-bold text-fleet-coral-text">
                      {t("mp_report_provisions_unassigned")}
                      <span dir="ltr">{formatCurrency(round2(unassignedProvisions.reduce((s, e) => s + e.amount, 0)))}</span>
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(provisionsTotal)}</span>
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
                    <span dir="ltr" className="shrink-0 text-xs font-bold text-fleet-navy">
                      {formatCurrency(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs font-bold text-fleet-navy">
              <span>{t("total")}</span>
              <span dir="ltr">{formatCurrency(dockingTotal)}</span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex flex-col gap-2 border-t border-fleet-border pt-3">
            {chartData.length > 0 && <CategoryPieChart data={chartData} className="h-48 w-full" />}
            <div className="flex items-center justify-between rounded-lg bg-fleet-navy px-3 py-2 text-sm font-bold text-white">
              <span>{t("mp_report_grand_total")}</span>
              <span dir="ltr">{formatCurrency(grandTotal)}</span>
            </div>
            {perCabin != null && (
              <div className="flex items-center justify-between rounded-lg bg-fleet-paper px-3 py-2 text-xs font-bold text-fleet-navy">
                <span>{t("mp_report_per_cabin")}</span>
                <span dir="ltr">{formatCurrency(perCabin)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
