"use client";

import { useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { ExpensesManager } from "@/components/expenses-manager";
import { BankReconciliationManager, type ExpenseReconciliationFlag } from "@/components/bank-reconciliation-manager";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ComponentProps } from "react";

export function ReconciliationSplitView({
  expensesProps,
  reconciliationProps,
  locale,
}: {
  expensesProps: ComponentProps<typeof ExpensesManager>;
  reconciliationProps: ComponentProps<typeof BankReconciliationManager>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showExpenses, setShowExpenses] = useState(false);
  const [expenseFlags, setExpenseFlags] = useState<Record<string, ExpenseReconciliationFlag>>({});

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setShowExpenses((s) => !s)}
        className="flex w-fit items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3.5 py-2 text-sm font-bold text-fleet-navy hover:bg-fleet-paper"
      >
        {showExpenses ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
        {showExpenses ? t("expenses_panel_close") : t("expenses_panel_open")}
      </button>

      <div className={`grid grid-cols-1 gap-4 ${showExpenses ? "lg:grid-cols-2" : ""}`}>
        {showExpenses && (
          <div className="rounded-xl border border-fleet-border bg-white p-3">
            <ExpensesManager {...expensesProps} reconciliationFlags={expenseFlags} />
          </div>
        )}
        <div className="min-w-0 lg:sticky lg:top-4 lg:h-fit lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <BankReconciliationManager {...reconciliationProps} onExpenseFlagsChange={setExpenseFlags} />
        </div>
      </div>
    </div>
  );
}
