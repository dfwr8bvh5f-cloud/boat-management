"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateCashTransaction, deleteCashTransaction, approveCashTransaction } from "@/lib/actions/cash";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { isCashInflow } from "@/lib/labels";
import { OPENING_BALANCE_MARKER } from "@/lib/balances";
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

  return (
    <div className="flex flex-col gap-2">
      {cashTx.map((c) =>
        editingId === c.id ? (
          <form
            key={c.id}
            action={async (formData) => {
              await updateCashTransaction(boatId, c.id, formData);
              setEditingId(null);
            }}
            className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3"
          >
            <select name="type" defaultValue={c.type} className={inputClass}>
              <option value="withdrawal">{cashTxLabels.withdrawal}</option>
              <option value="received">{cashTxLabels.received}</option>
            </select>
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
              <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
                {t("save_word")}
              </button>
            </div>
          </form>
        ) : (
          <div key={c.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">
                {cashTxLabels[c.type]}
                {c.notes ? ` · ${c.notes === OPENING_BALANCE_MARKER ? t("opening_balance_label") : c.notes}` : ""}
              </div>
              <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(c.tx_date)}</div>
            </div>
            <ApprovalIndicator value={c.status} locale={locale} />
            <div className={`font-bold ${isCashInflow(c.type) ? "text-fleet-moss" : "text-fleet-coral"}`}>
              {isCashInflow(c.type) ? "+" : "-"}€{c.amount.toLocaleString("he-IL")}
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingId(c.id)}
                aria-label="edit"
                className="text-fleet-ink hover:text-fleet-teal"
              >
                <Pencil size={15} />
              </button>
            )}
            {isManagement && c.status === "pending" && (
              <form action={approveCashTransaction.bind(null, boatId, c.id)}>
                <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                  {t("approve")}
                </button>
              </form>
            )}
            {(canEdit || (isManagement && c.status === "pending")) && (
              <form action={deleteCashTransaction.bind(null, boatId, c.id)}>
                <ConfirmSubmitButton confirmMessage={t("delete_tx_confirm")} className="text-xs font-medium text-fleet-coral hover:underline">
                  {t("delete_word")}
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        )
      )}
    </div>
  );
}
