"use client";

import { useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { MysExpensesManager } from "@/components/mys-expenses-manager";
import { MysBankReconciliationManager, type MysExpenseReconciliationFlag } from "@/components/mys-bank-reconciliation-manager";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ComponentProps } from "react";

// Thin composition mirroring reconciliation-split-view.tsx (boats).
export function MysReconciliationSplitView({
  expensesProps,
  reconciliationProps,
  locale,
}: {
  expensesProps: ComponentProps<typeof MysExpensesManager>;
  reconciliationProps: ComponentProps<typeof MysBankReconciliationManager>;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showExpenses, setShowExpenses] = useState(false);
  const [expenseFlags, setExpenseFlags] = useState<Record<string, MysExpenseReconciliationFlag>>({});

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setShowExpenses((s) => !s)}
        className="flex w-fit items-center gap-1.5 rounded-full border border-fleet-border bg-white px-3.5 py-2 text-sm font-bold text-fleet-navy hover:bg-fleet-paper"
      >
        {showExpenses ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
        {showExpenses ? t("expenses_panel_close") : t("expenses_panel_open")}
      </button>

      <div className={`grid grid-cols-1 gap-4 ${showExpenses ? "lg:grid-cols-2" : ""}`}>
        {showExpenses && (
          <div className="rounded-xl border border-fleet-border bg-white p-3">
            <MysExpensesManager {...expensesProps} reconciliationFlags={expenseFlags} />
          </div>
        )}
        <div className="min-w-0">
          <MysBankReconciliationManager {...reconciliationProps} onExpenseFlagsChange={setExpenseFlags} />
        </div>
      </div>
    </div>
  );
}
