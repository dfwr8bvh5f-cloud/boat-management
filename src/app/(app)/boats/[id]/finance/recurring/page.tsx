import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createRecurringExpense, deleteRecurringExpense, confirmRecurringPayment } from "@/lib/actions/recurring";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/labels";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function RecurringExpensesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, canEdit } = await getBoatContext(id);
  const thisMonth = new Date().toISOString().slice(0, 7);

  const supabase = await createClient();
  const { data: recurring } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("boat_id", boat.id)
    .order("day_of_month");

  return (
    <div className="flex flex-col gap-4">
      {!recurring || recurring.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין הוצאות קבועות מוגדרות.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {recurring.map((r) => {
            const paidThisMonth = r.last_paid_month === thisMonth;
            return (
              <div key={r.id} className="rounded-xl border border-fleet-border bg-white p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-bold">{r.description}</div>
                    <div className="text-xs text-fleet-ink">
                      {CATEGORY_LABELS[r.category]} · {PAYMENT_LABELS[r.payment_method]} · יום {r.day_of_month} בחודש
                    </div>
                  </div>
                  {canEdit && (
                    <form action={deleteRecurringExpense.bind(null, boat.id, r.id)}>
                      <ConfirmSubmitButton confirmMessage="למחוק את ההוצאה הקבועה?" className="text-xs font-medium text-fleet-coral hover:underline">
                        מחק
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-fleet-navy">₪{r.amount.toLocaleString("he-IL")}</span>
                  {canEdit &&
                    (paidThisMonth ? (
                      <span className="rounded-full border border-fleet-moss px-2.5 py-1 text-xs font-bold text-fleet-moss">
                        שולם החודש ✓
                      </span>
                    ) : (
                      <form action={confirmRecurringPayment.bind(null, boat.id, r.id)} className="flex items-center gap-1.5">
                        <input type="month" name="month" defaultValue={thisMonth} className={`${inputClass} py-1 text-xs`} />
                        <input
                          type="number"
                          name="amount"
                          step="0.01"
                          defaultValue={r.amount}
                          className={`${inputClass} w-24 py-1 text-xs`}
                        />
                        {r.category === "diesel" && (
                          <input type="number" name="liters" placeholder="ליטרים" className={`${inputClass} w-20 py-1 text-xs`} />
                        )}
                        <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1 text-xs font-bold text-white">
                          אשר תשלום
                        </button>
                      </form>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <form action={createRecurringExpense.bind(null, boat.id)} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <h2 className="text-sm font-semibold text-fleet-navy">הוצאה קבועה חדשה</h2>
          <input name="description" required placeholder="תיאור (לדוגמה: ביטוח צוות, שכירות)" className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder="סכום (₪) *" className={inputClass} />
            <input name="day_of_month" type="number" min={1} max={28} defaultValue={1} placeholder="יום בחודש" className={inputClass} />
            <select name="category" defaultValue={EXPENSE_CATEGORIES[0]} className={inputClass}>
              {EXPENSE_CATEGORIES.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
            <select name="payment_method" defaultValue={PAYMENT_METHODS[0]} className={inputClass}>
              {PAYMENT_METHODS.map((k) => (
                <option key={k} value={k}>
                  {PAYMENT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            הוסף הוצאה קבועה
          </button>
        </form>
      )}
    </div>
  );
}
