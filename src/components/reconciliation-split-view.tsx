"use client";

import { useRef, useState } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";
import { ExpensesManager } from "@/components/expenses-manager";
import { BankReconciliationManager, type ExpenseReconciliationFlag } from "@/components/bank-reconciliation-manager";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { ComponentProps } from "react";

const PANEL_HEIGHT_CLASS = "lg:h-[calc(100vh-9rem)] lg:overflow-y-auto";

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

  const expensesPaneRef = useRef<HTMLDivElement>(null);
  const reconciliationPaneRef = useRef<HTMLDivElement>(null);
  const syncingFrom = useRef<"expenses" | "reconciliation" | null>(null);

  // Mirrors scroll position by percentage (not raw pixels) since the two
  // lists are rarely the same length - this keeps them moving together and
  // reaching the bottom at the same time instead of drifting out of sync.
  const syncScroll = (source: "expenses" | "reconciliation") => {
    if (syncingFrom.current && syncingFrom.current !== source) return;
    const from = source === "expenses" ? expensesPaneRef.current : reconciliationPaneRef.current;
    const to = source === "expenses" ? reconciliationPaneRef.current : expensesPaneRef.current;
    if (!from || !to) return;

    const fromRange = from.scrollHeight - from.clientHeight;
    const toRange = to.scrollHeight - to.clientHeight;
    if (fromRange <= 0 || toRange <= 0) return;

    syncingFrom.current = source;
    to.scrollTop = (from.scrollTop / fromRange) * toRange;
    requestAnimationFrame(() => {
      syncingFrom.current = null;
    });
  };

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
          <div
            ref={expensesPaneRef}
            onScroll={() => syncScroll("expenses")}
            className={`rounded-xl border border-fleet-border bg-white p-3 ${PANEL_HEIGHT_CLASS}`}
          >
            <ExpensesManager {...expensesProps} reconciliationFlags={expenseFlags} />
          </div>
        )}
        <div
          ref={reconciliationPaneRef}
          onScroll={() => syncScroll("reconciliation")}
          className={`min-w-0 ${showExpenses ? PANEL_HEIGHT_CLASS : ""}`}
        >
          <BankReconciliationManager {...reconciliationProps} onExpenseFlagsChange={setExpenseFlags} />
        </div>
      </div>
    </div>
  );
}
