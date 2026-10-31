"use client";

import { useState } from "react";
import { Download, Pencil, Printer, Trash2 } from "lucide-react";
import { usePagedList } from "@/lib/hooks/use-paged-list";
import { updateIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { RippleLoader } from "@/components/ripple-loader";
import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
        <Button variant="secondary" size="compact" onClick={exportCsv}>
          <Download size={14} /> {t("export_excel")}
        </Button>
        <Button variant="secondary" size="compact" onClick={() => window.print()}>
          <Printer size={14} /> {t("export_print")}
        </Button>
      </div>
      {visibleIncomes.map((i) =>
        editingId === i.id ? (
          <form
            key={i.id}
            action={async (formData) => {
              setSaving(true);
              await updateIncome(boatId, i.id, formData);
              setSaving(false);
              setSaved(true);
              setTimeout(() => {
                setSaved(false);
                setEditingId(null);
              }, 1400);
            }}
            className="flex flex-col gap-2 rounded-xl border border-fleet-border bg-white p-3"
          >
            <input name="source" required defaultValue={i.source} className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={i.amount}
                onWheel={(e) => e.currentTarget.blur()}
                className={inputClass}
              />
              <DateInput name="income_date" defaultValue={i.income_date} locale={locale} className={inputClass} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditingId(null)}>
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
          <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
            <div className="flex-1">
              <div className="text-sm">{sourceLabel(i)}</div>
              <div className="text-xs text-fleet-ink" dir="ltr">{formatDateDisplay(i.income_date)}</div>
            </div>
            <ApprovalIndicator value={i.status} locale={locale} />
            <div className="font-bold text-fleet-moss-text">+{formatCurrency(i.amount)}</div>
            {canEdit && (
              <Button
                iconOnly
                variant="text"
                aria-label={t("edit_word")}
                className="!text-fleet-ink hover:!text-fleet-teal hover:!no-underline"
                onClick={() => setEditingId(i.id)}
              >
                <Pencil size={16} />
              </Button>
            )}
            {isManagement && i.status === "pending" && (
              <form action={approveIncome.bind(null, boatId, i.id)}>
                <Button type="submit" variant="text" size="compact" className="px-0 py-0 !text-fleet-moss-text">
                  {t("approve")}
                </Button>
              </form>
            )}
            {(canEdit || (isManagement && i.status === "pending")) && (
              <form action={deleteIncome.bind(null, boatId, i.id)}>
                <ConfirmSubmitButton
                  locale={locale}
                  confirmMessage={t("delete_income_confirm")}
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
