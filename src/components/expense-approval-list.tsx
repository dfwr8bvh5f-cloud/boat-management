"use client";

import { useState } from "react";
import { bulkApproveExpenses } from "@/lib/actions/expenses";
import { ExpenseApprovalCard } from "@/components/expense-approval-card";
import { RippleLoader } from "@/components/ripple-loader";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Expense, ExpenseCategory, PaymentMethod } from "@/lib/types/database";

export type ExpenseApprovalCardData = {
  expense: Expense;
  boatName: string;
  submittedBy: string;
  receiptFiles: { id: string; url: string }[];
  photoFiles: { id: string; url: string }[];
  categories: ExpenseCategory[];
};

// Lets management check off several pending expenses and approve them all
// in one request, instead of one "Approve" click at a time - useful when a
// captain's just submitted a batch of receipts from a provisioning run and
// every one of them is obviously fine.
export function ExpenseApprovalList({
  items,
  categoryLabels,
  paymentLabels,
  locale,
}: {
  items: ExpenseApprovalCardData[];
  categoryLabels: Record<ExpenseCategory, string>;
  paymentLabels: Record<PaymentMethod, string>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate(locale, key, vars);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.expense.id)));

  const approveSelected = async () => {
    setApproving(true);
    try {
      await bulkApproveExpenses([...selected]);
      setSelected(new Set());
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {items.length > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-fleet-border bg-fleet-paper px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-bold text-fleet-navy">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" />
            {t("select_all_word")}
          </label>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={approveSelected}
              disabled={approving}
              className="flex items-center gap-1.5 rounded-lg bg-fleet-teal px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60"
            >
              {approving && <RippleLoader size="sm" />}
              {t("approve_selected_count", { count: selected.size })}
            </button>
          )}
        </div>
      )}
      {items.map(({ expense, boatName, submittedBy, receiptFiles, photoFiles, categories }) => (
        <div key={expense.id} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected.has(expense.id)}
            onChange={() => toggle(expense.id)}
            aria-label={t("select_all_word")}
            className="mt-4 h-4 w-4 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <ExpenseApprovalCard
              expense={expense}
              boatName={boatName}
              submittedBy={submittedBy}
              receiptFiles={receiptFiles}
              photoFiles={photoFiles}
              categories={categories}
              categoryLabels={categoryLabels}
              paymentLabels={paymentLabels}
              locale={locale}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
