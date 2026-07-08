"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { updateIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { OPENING_BALANCE_MARKER, MYBA_CONTRACT_NAME_PREFIX, MYBA_DEPOSIT_SOURCE_PREFIX } from "@/lib/balances";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Income } from "@/lib/types/database";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export function IncomesList({
  boatId,
  incomes,
  canEdit,
  isManagement,
  locale,
}: {
  boatId: string;
  incomes: Income[];
  canEdit: boolean;
  isManagement: boolean;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {incomes.map((i) =>
        editingId === i.id ? (
          <form
            key={i.id}
            action={async (formData) => {
              await updateIncome(boatId, i.id, formData);
              setEditingId(null);
            }}
            className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3"
          >
            <input name="source" required defaultValue={i.source} className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <input name="amount" type="number" step="0.01" required defaultValue={i.amount} className={inputClass} />
              <DateInput name="income_date" defaultValue={i.income_date} locale={locale} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="flex-1 rounded-lg border border-fleet-border py-2 text-sm font-bold text-fleet-ink hover:bg-fleet-paper"
              >
                {t("close_word")}
              </button>
              <button type="submit" className="flex-1 rounded-lg bg-fleet-teal py-2 text-sm font-bold text-white hover:opacity-90">
                {t("save_word")}
              </button>
            </div>
          </form>
        ) : (
          <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">
                {i.source === OPENING_BALANCE_MARKER
                  ? t("opening_balance_label")
                  : i.source.startsWith(MYBA_CONTRACT_NAME_PREFIX)
                    ? `${t("doc_myba_contract")} - ${i.source.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
                    : i.source.startsWith(MYBA_DEPOSIT_SOURCE_PREFIX)
                      ? `${t("contract_deposit_label")} - ${i.source.slice(MYBA_DEPOSIT_SOURCE_PREFIX.length)}`
                      : i.source}
              </div>
              <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(i.income_date)}</div>
            </div>
            <ApprovalIndicator value={i.status} locale={locale} />
            <div className="font-bold text-fleet-moss">+€{i.amount.toLocaleString("he-IL")}</div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingId(i.id)}
                aria-label="edit"
                className="text-fleet-ink hover:text-fleet-teal"
              >
                <Pencil size={15} />
              </button>
            )}
            {isManagement && i.status === "pending" && (
              <form action={approveIncome.bind(null, boatId, i.id)}>
                <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                  {t("approve")}
                </button>
              </form>
            )}
            {(canEdit || (isManagement && i.status === "pending")) && (
              <form action={deleteIncome.bind(null, boatId, i.id)}>
                <ConfirmSubmitButton confirmMessage={t("delete_income_confirm")} className="text-xs font-medium text-fleet-coral hover:underline">
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
