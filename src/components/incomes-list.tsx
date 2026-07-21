"use client";

import { useState } from "react";
import { Download, Pencil, Printer, Trash2 } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { updateIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { formatDateDisplay } from "@/lib/date-format";
import { OPENING_BALANCE_MARKER, MYBA_CONTRACT_NAME_PREFIX, MYBA_DEPOSIT_SOURCE_PREFIX } from "@/lib/balances";
import { downloadCsv } from "@/lib/csv-export";
import { formatCurrency } from "@/lib/money";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Income } from "@/lib/types/database";
import { INPUT_CLASS } from "@/lib/ui-classes";

const inputClass = INPUT_CLASS;

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
  const { visibleItems: visibleIncomes, hasMore, loadMore } = usePagedList(incomes);

  const sourceLabel = (i: Income) =>
    i.source === OPENING_BALANCE_MARKER
      ? t("opening_balance_label")
      : i.source.startsWith(MYBA_CONTRACT_NAME_PREFIX)
        ? `${t("doc_myba_contract")} - ${i.source.slice(MYBA_CONTRACT_NAME_PREFIX.length)}`
        : i.source.startsWith(MYBA_DEPOSIT_SOURCE_PREFIX)
          ? `${t("contract_deposit_label")} - ${i.source.slice(MYBA_DEPOSIT_SOURCE_PREFIX.length)}`
          : i.source;

  const exportCsv = () => {
    downloadCsv(
      "bank.csv",
      [t("date"), t("income_source"), t("amount"), t("status_column")],
      incomes.map((i) => [i.income_date, sourceLabel(i), String(i.amount), t(i.status === "approved" ? "approved" : "pending")])
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
          <Download size={13} /> {t("export_excel")}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-full border border-fleet-border px-3 py-1.5 text-xs font-bold text-fleet-navy hover:bg-fleet-paper"
        >
          <Printer size={13} /> {t("export_print")}
        </button>
      </div>
      {visibleIncomes.map((i) =>
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
          <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">{sourceLabel(i)}</div>
              <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(i.income_date)}</div>
            </div>
            <ApprovalIndicator value={i.status} locale={locale} />
            <div className="font-bold text-fleet-moss">+{formatCurrency(i.amount)}</div>
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditingId(i.id)}
                aria-label="edit"
                className="flex h-9 w-9 items-center justify-center text-fleet-ink hover:text-fleet-teal"
              >
                <Pencil size={15} />
              </button>
            )}
            {isManagement && i.status === "pending" && (
              <form action={approveIncome.bind(null, boatId, i.id)}>
                <button type="submit" className="py-2 text-xs font-bold text-fleet-moss hover:underline">
                  {t("approve")}
                </button>
              </form>
            )}
            {(canEdit || (isManagement && i.status === "pending")) && (
              <form action={deleteIncome.bind(null, boatId, i.id)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("delete_income_confirm")}
                  ariaLabel={t("delete_word")}
                  className="flex h-9 w-9 items-center justify-center text-fleet-coral hover:text-fleet-coral/80"
                >
                  <Trash2 size={15} />
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
          <th className="border border-fleet-border p-1.5 text-start">{t("income_source")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("amount")}</th>
          <th className="border border-fleet-border p-1.5 text-start">{t("status_column")}</th>
        </tr>
      </thead>
      <tbody>
        {incomes.map((i) => (
          <tr key={i.id}>
            <td className="border border-fleet-border p-1.5" dir="ltr">
              {formatDateDisplay(i.income_date)}
            </td>
            <td className="border border-fleet-border p-1.5">{sourceLabel(i)}</td>
            <td className="border border-fleet-border p-1.5">{formatCurrency(i.amount)}</td>
            <td className="border border-fleet-border p-1.5">{t(i.status === "approved" ? "approved" : "pending")}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </>
  );
}
