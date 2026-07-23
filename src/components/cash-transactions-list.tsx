"use client";

import { useState } from "react";
import { CheckCircle2, Download, Pencil, Printer, Trash2 } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { updateCashTransaction, deleteCashTransaction, approveCashTransaction } from "@/lib/actions/cash";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
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

  return (
    <>
    <div className="flex flex-col gap-2 print:hidden">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Download size={14} /> {t("export_excel")}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Printer size={14} /> {t("export_print")}
        </button>
      </div>
      {visibleCashTx.map((c) =>
        editingId === c.id ? (
          <form
            key={c.id}
            action={async (formData) => {
              setSaving(true);
              await updateCashTransaction(boatId, c.id, formData);
              setSaving(false);
              setSaved(true);
              setTimeout(() => {
                setSaved(false);
                setEditingId(null);
              }, 1400);
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
              <input name="amount" type="number" step="0.01" required defaultValue={c.amount} className={inputClass} />
              <DateInput name="tx_date" defaultValue={c.tx_date} locale={locale} className={inputClass} />
            </div>
            <input name="notes" defaultValue={c.notes ?? undefined} placeholder={t("note")} className={inputClass} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="flex-1 rounded-lg border border-fleet-border py-2.5 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
              >
                {t("close_word")}
              </button>
              <button
                type="submit"
                disabled={saving || saved}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <RippleLoader size="sm" /> {t("saving_word")}
                  </>
                ) : saved ? (
                  <span className="flex animate-pop-in items-center gap-2">
                    <CheckCircle2 size={16} /> {t("saved_word")}
                  </span>
                ) : (
                  t("save_word")
                )}
              </button>
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
              <button
                type="button"
                onClick={() => setEditingId(c.id)}
                aria-label="edit"
                className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-teal"
              >
                <Pencil size={16} />
              </button>
            )}
            {isManagement && c.status === "pending" && (
              <form action={approveCashTransaction.bind(null, boatId, c.id)}>
                <button type="submit" className="py-2 text-xs font-bold text-fleet-moss-text hover:underline">
                  {t("approve")}
                </button>
              </form>
            )}
            {(canEdit || (isManagement && c.status === "pending")) && (
              <form action={deleteCashTransaction.bind(null, boatId, c.id)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("delete_tx_confirm")}
                  ariaLabel={t("delete_word")}
                  className="flex h-9 w-9 items-center justify-center text-fleet-coral-text hover:text-fleet-coral-text/80"
                >
                  <Trash2 size={16} />
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        )
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          className="rounded-lg border border-fleet-border bg-white py-2.5 text-sm font-bold text-fleet-teal hover:bg-fleet-paper"
        >
          {t("load_more_word")}
        </button>
      )}
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
            <td className="border border-fleet-border p-1.5">
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
