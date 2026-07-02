"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { setCategoryBudget, addBudgetSubcategory, removeBudgetSubcategory } from "@/lib/actions/budget";
import type { BudgetSubcategory, ExpenseCategory } from "@/lib/types/database";

function budgetColor(pctUsed: number) {
  if (pctUsed <= 30) return "bg-fleet-moss";
  if (pctUsed <= 70) return "bg-fleet-brass";
  return "bg-fleet-coral";
}

export function BudgetCategoryCard({
  boatId,
  category,
  label,
  flatAmount,
  subcategories,
  spent,
  canEdit,
}: {
  boatId: string;
  category: ExpenseCategory;
  label: string;
  flatAmount: number;
  subcategories: BudgetSubcategory[];
  spent: number;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasSub = subcategories.length > 0;
  const budgeted = hasSub ? subcategories.reduce((s, sc) => s + sc.amount, 0) : flatAmount;
  const pct = budgeted ? Math.min(100, Math.round((spent / budgeted) * 100)) : 0;

  return (
    <div className="rounded-xl border border-fleet-border bg-white p-4">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-sm font-bold text-fleet-navy"
        >
          <ChevronDown size={14} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          {label}
        </button>
        <div className="flex items-center gap-1.5 text-sm text-fleet-ink">
          <span>€{spent.toLocaleString("he-IL")} / </span>
          {canEdit && !hasSub ? (
            <form action={setCategoryBudget.bind(null, boatId, category)} className="flex items-center gap-1">
              <input
                type="number"
                name="amount"
                step="0.01"
                defaultValue={flatAmount || ""}
                placeholder="0"
                className="w-20 rounded-md border border-fleet-border px-1.5 py-0.5 text-center text-xs"
              />
              <button type="submit" className="text-xs font-semibold text-fleet-teal hover:underline">
                עדכן
              </button>
            </form>
          ) : (
            <span>€{budgeted.toLocaleString("he-IL")}</span>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-fleet-border">
        <div className={`h-full ${budgetColor(budgeted ? (spent / budgeted) * 100 : 0)}`} style={{ width: `${pct}%` }} />
      </div>

      {open && (
        <div className="mt-3 border-t border-dashed border-fleet-border pt-3">
          {subcategories.length === 0 ? (
            <p className="mb-2 text-xs text-fleet-ink">אין תתי-קטגוריות מוגדרות. הסכום הכולל נקבע ישירות.</p>
          ) : (
            <div className="mb-2 flex flex-col gap-1.5">
              {subcategories.map((sc) => (
                <div key={sc.id} className="flex items-center justify-between text-xs">
                  <span>{sc.name}</span>
                  <div className="flex items-center gap-2">
                    <span>€{sc.amount.toLocaleString("he-IL")}</span>
                    {canEdit && (
                      <form action={removeBudgetSubcategory.bind(null, boatId, sc.id)}>
                        <button type="submit" className="text-fleet-coral hover:underline">
                          הסר
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <form action={addBudgetSubcategory.bind(null, boatId, category)} className="flex gap-1.5">
              <input
                name="name"
                placeholder="שם תת-קטגוריה"
                className="flex-[2] rounded-md border border-fleet-border px-2 py-1 text-xs"
              />
              <input
                name="amount"
                type="number"
                step="0.01"
                placeholder="€"
                className="flex-1 rounded-md border border-fleet-border px-2 py-1 text-xs"
              />
              <button
                type="submit"
                className="rounded-md bg-fleet-teal px-3 text-xs font-semibold text-white hover:opacity-90"
              >
                +
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
