"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { createMysInvoiceFromDebts } from "@/lib/actions/mys";
import { DateInput } from "@/components/date-input";
import { formatCurrency, round2 } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import { INPUT_CLASS, PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS } from "@/lib/ui-classes";

export type SelectedDebtRow = {
  kind: "charge" | "ad_hoc";
  id: string;
  description: string;
  amount: number;
  boatId: string | null;
  clientName: string;
};

// Small panel that opens once she's checked at least one open debt on the
// Debts page - lets her set a VAT% per selected item and issue them all as
// one combined invoice. All selected rows share the same client (enforced
// by mys-debts-manager.tsx before this ever renders), so client name/boat
// id are fixed, not editable here.
export function MysInvoiceFromDebtsForm({
  rows,
  locale,
  onClose,
  onDone,
}: {
  rows: SelectedDebtRow[];
  locale: Locale;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const [vatPercentByRow, setVatPercentByRow] = useState<Record<string, string>>({});
  const [clientEmail, setClientEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const subtotal = useMemo(() => round2(rows.reduce((s, r) => s + r.amount, 0)), [rows]);
  const vatTotal = useMemo(
    () => round2(rows.reduce((s, r) => s + r.amount * ((Number(vatPercentByRow[r.id]) || 0) / 100), 0)),
    [rows, vatPercentByRow]
  );
  const total = round2(subtotal + vatTotal);

  const doIssue = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      await createMysInvoiceFromDebts({
        clientName: rows[0].clientName,
        boatId: rows[0].kind === "charge" ? rows[0].boatId : null,
        clientEmail: clientEmail.trim() || null,
        dueDate: dueDate || null,
        lines: rows.map((r) => ({ sourceType: r.kind, sourceId: r.id, vatPercent: Number(vatPercentByRow[r.id]) || 0 })),
      });
      onDone();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-fleet-navy">
          {t("mys_issue_invoice_title", { client: rows[0].clientName, count: rows.length })}
        </h2>
        <button type="button" onClick={onClose} aria-label={t("close_word")} className="flex h-8 w-8 items-center justify-center text-fleet-ink hover:text-fleet-navy">
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="flex flex-nowrap items-center gap-2 rounded-lg bg-fleet-paper px-2.5 py-1.5 text-xs">
            <div className="min-w-0 flex-1 truncate">{r.description}</div>
            <div className="shrink-0 font-bold text-fleet-navy">{formatCurrency(r.amount)}</div>
            <div className="flex shrink-0 items-center gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                placeholder="0"
                value={vatPercentByRow[r.id] ?? ""}
                onChange={(e) => setVatPercentByRow((prev) => ({ ...prev, [r.id]: e.target.value }))}
                onWheel={(e) => e.currentTarget.blur()}
                aria-label={t("mys_vat_percent_label")}
                className="w-16 rounded-md border border-fleet-border bg-white px-1.5 py-1 text-2xs"
              />
              <span className="text-fleet-ink">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("mys_invoice_client_email")}</label>
          <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} type="email" className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-fleet-ink">{t("mys_invoice_due_date")}</label>
          <DateInput value={dueDate} onChange={setDueDate} locale={locale} className={INPUT_CLASS} allowClear />
        </div>
      </div>

      <div className="flex flex-col gap-0.5 rounded-lg bg-fleet-paper px-3 py-2 text-xs">
        <div className="flex justify-between">
          <span className="text-fleet-ink">{t("mys_invoice_subtotal_label")}</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fleet-ink">{t("mys_vat_amount_label")}</span>
          <span>{formatCurrency(vatTotal)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold text-fleet-navy">
          <span>{t("total")}</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>

      {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className={`flex-1 ${SECONDARY_BUTTON_CLASS}`}>
          {t("close_word")}
        </button>
        <button type="button" disabled={saving} onClick={doIssue} className={`flex-1 ${PRIMARY_BUTTON_CLASS}`}>
          {saving ? t("saving_word") : t("mys_issue_invoice_cta")}
        </button>
      </div>
    </div>
  );
}
