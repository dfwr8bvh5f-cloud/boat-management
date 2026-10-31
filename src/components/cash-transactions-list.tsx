"use client";

import { useState } from "react";
import { Download, Pencil, Printer, Trash2 } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { updateCashTransaction, deleteCashTransaction, approveCashTransaction } from "@/lib/actions/cash";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { UncontrolledCustomSelect } from "@/components/uncontrolled-custom-select";
import { formatDateDisplay } from "@/lib/date-format";
import { isCashInflow } from "@/lib/labels";
import { OPENING_BALANCE_MARKER } from "@/lib/balances";
import { formatCurrency } from "@/lib/money";
import { downloadCsv } from "@/lib/csv-export";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { CashTransaction, CashTxType } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

export function CashTransactionsList({
  boatId,
  cashTx,
  cashTxLabels,
  canEdit,
  isManagement,
  locale,
}: {
  boatId: string;
  cashTx: CashTransaction[];
  cashTxLabels: Record<CashTxType, string>;
  canEdit: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { visibleItems: visibleCashTx, hasMore, loadMore } = usePagedList(cashTx);

  const descriptionLabel = (c: CashTransaction) =>
    c.notes ? `${cashTxLabels[c.type]} · ${c.notes === OPENING_BALANCE_MARKER ? t("opening_balance_label") : c.notes}` : cashTxLabels[c.type];

  const exportCsv = () => {
    downloadCsv(
      "cash.csv",
      [t("date"), t("description"), t("amount"), t("status_column")],
      cashTx.map((c) => [
        c.tx_date,
        descriptionLabel(c),
        `${isCashInflow(c.type) ? "" : "-"}${c.amount}`,
        t(c.status === "approved" ? "approved" : "pending"),
      ])
    );
  };

  const total = cashTx.reduce((s, c) => s + c.amount, 0);

  return (
    <>
    <div className="flex flex-col gap-4 print:hidden">
      <h1 className="font-brand text-2xl font-light tracking-wide text-fleet-navy">{t("sub_cash")}</h1>
      <div className="flex gap-2">
        <Button variant="secondary" size="compact" onClick={exportCsv}>
          <Download size={14} /> {t("export_excel")}
        </Button>
        <Button variant="secondary" size="compact" onClick={() => window.print()}>
          <Printer size={14} /> {t("export_print")}
        </Button>
      </div>

      <div className="rounded-xl border border-fleet-border bg-white p-4 text-sm font-bold text-fleet-navy">
        {t("cash_in_total")}: {formatCurrency(total)}
      </div>

      <div className="flex flex-col gap-2">
      {visibleCashTx.map((c) =>
        editingId === c.id ? (
          <form
            key={c.id}
            action={async (formData) => {
              setSaveError(null);
              setSaving(true);
              try {
                const result = await updateCashTransaction(boatId, c.id, formData);
                if (result?.error) {
                  setSaveError(result.error);
                  return;
                }
                setSaved(true);
                setTimeout(() => {
                  setSaved(false);
                  setEditingId(null);
                }, 1400);
              } catch (err) {
                setSaveError(err instanceof Error ? err.message : t("save_failed"));
              } finally {
                setSaving(false);
              }
            }}
            className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3"
          >
            <UncontrolledCustomSelect
              name="type"
              defaultValue={c.type}
              options={[
                { value: "withdrawal", label: cashTxLabels.withdrawal },
                { value: "received", label: cashTxLabels.received },
              ]}
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={c.amount}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
              />
              <DateInput name="tx_date" defaultValue={c.tx_date} locale={locale} className={inputClass} />
            </div>
            <input name="notes" defaultValue={c.notes ?? undefined} placeholder={t("note")} className={inputClass} />
            {saveError && <p className="text-xs text-fleet-coral-text">{saveError}</p>}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setSaveError(null);
                  setEditingId(null);
                }}
              >
                {t("close_word")}
              </Button>
              <Button type="submit" className="flex-1" disabled={saving || saved}>
                {saving ? (
                  <>
                    <RippleLoader size="sm" /> {t("saving_word")}
                  </>
                ) : saved ? (
                  <span className="flex animate-pop-in items-center gap-2">{t("saved_word")}</span>
                ) : (
                  t("save_word")
                )}
              </Button>
            </div>
          </form>
        ) : (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">{descriptionLabel(c)}</div>
              <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(c.tx_date)}</div>
            </div>
            <ApprovalIndicator value={c.status} locale={locale} />
            <div className={`font-bold ${isCashInflow(c.type) ? "text-fleet-moss-text" : "text-fleet-coral-text"}`}>
              {isCashInflow(c.type) ? "+" : "-"}
              {formatCurrency(c.amount)}
            </div>
            {canEdit && (
              <Button
                iconOnly
                variant="text"
                aria-label={t("edit_word")}
                className="!text-fleet-ink hover:!text-fleet-teal hover:!no-underline"
                onClick={() => {
                  setSaveError(null);
                  setEditingId(c.id);
                }}
              >
                <Pencil size={16} />
              </Button>
            )}
            {isManagement && c.status === "pending" && (
              <form action={approveCashTransaction.bind(null, boatId, c.id)}>
                <Button type="submit" variant="text" size="compact" className="px-0 py-0 !text-fleet-moss-text">
                  {t("approve")}
                </Button>
              </form>
            )}
            {(canEdit || (isManagement && c.status === "pending")) && (
              <form action={deleteCashTransaction.bind(null, boatId, c.id)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("delete_tx_confirm")}
                  destructive
                  ariaLabel={t("delete_word")}
                  className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-coral-text"
                >
                  <Trash2 size={16} />
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        )
      )}
      {hasMore && (
        <Button variant="secondary" onClick={loadMore}>
          {t("load_more_word")}
        </Button>
      )}
      </div>
    </div>

    <table className="hidden w-full border-collapse text-sm print:table">
      <thead>
        <tr>
          <th className="border border-fleet-border p-1.5 text-start">{t("date")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("description")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("amount")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("status_column")}</th>
        </tr>
      </thead>
      <tbody>
        {cashTx.map((c) => (
          <tr key={c.id}>
            <td className="border border-fleet-border p-1.5" dir="ltr">
              {formatDateDisplay(c.tx_date)}
            </td>
            <td className="border border-fleet-border p-1.5">{descriptionLabel(c)}</td>
            <td className="border border-fleet-border p-1.5 text-end">
              {isCashInflow(c.type) ? "" : "-"}
              {formatCurrency(c.amount)}
            </td>
            <td className="border border-fleet-border p-1.5">{t(c.status === "approved" ? "approved" : "pending")}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}
