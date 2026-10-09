"use client";

import { useState, type ComponentType } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";

// Shared by both the boat-side and MYS-side bank reconciliation pages -
// previously two near-byte-identical files (reconciliation-split-view.tsx /
// mys-reconciliation-split-view.tsx) differing only in which pair of
// Expenses/BankReconciliation manager components they wired together.
// Generic over that pair instead, so there's one toggle-panel/flag-lifting
// implementation to maintain.
type ReconFlag = { type: "date_mismatch" | "amount_mismatch" | "missing" | "matched"; suggestedDate?: string };

export function ReconciliationSplitView<
  ExpensesProps extends { reconciliationFlags?: Record<string, ReconFlag> },
  ReconciliationProps extends { onExpenseFlagsChange?: (flags: Record<string, ReconFlag>) => void },
>({
  ExpensesComponent,
  expensesProps,
  ReconciliationComponent,
  reconciliationProps,
  locale,
}: {
  ExpensesComponent: ComponentType<ExpensesProps>;
  expensesProps: Omit<ExpensesProps, "reconciliationFlags">;
  ReconciliationComponent: ComponentType<ReconciliationProps>;
  reconciliationProps: Omit<ReconciliationProps, "onExpenseFlagsChange">;
  locale: Locale;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const [showExpenses, setShowExpenses] = useState(false);
  const [expenseFlags, setExpenseFlags] = useState<Record<string, ReconFlag>>({});

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
            <ExpensesComponent {...(expensesProps as ExpensesProps)} reconciliationFlags={expenseFlags} />
          </div>
        )}
        <div className="min-w-0">
          <ReconciliationComponent {...(reconciliationProps as ReconciliationProps)} onExpenseFlagsChange={setExpenseFlags} />
        </div>
      </div>
    </div>
  );
}
