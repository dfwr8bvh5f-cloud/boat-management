import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function FutureIncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const { data: incomes } = await supabase
    .from("incomes")
    .select("*")
    .eq("boat_id", boat.id)
    .eq("type", "future")
    .order("income_date");

  const total = (incomes ?? []).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-fleet-border bg-white p-4">
        <div className="text-xs text-fleet-ink">סה״כ הכנסות עתידיות צפויות</div>
        <div className="mt-1 text-xl font-bold text-fleet-teal">₪{total.toLocaleString("he-IL")}</div>
      </div>

      {canEdit && (
        <form action={createIncome.bind(null, boat.id, "future")} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input name="source" required placeholder="מקור ההכנסה *" className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder="סכום (₪) *" className={inputClass} />
            <input name="income_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            הוסף הכנסה עתידית
          </button>
        </form>
      )}

      {!incomes || incomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין הכנסות עתידיות רשומות.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {incomes.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex-1">
                <div className="text-sm">{i.source}</div>
                <div className="text-xs text-fleet-ink">{i.income_date}</div>
              </div>
              <StatusBadge value={i.status} />
              <div className="font-bold text-fleet-teal">₪{i.amount.toLocaleString("he-IL")}</div>
              {isManagement && i.status === "pending" && (
                <form action={approveIncome.bind(null, boat.id, i.id)}>
                  <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                    אשר
                  </button>
                </form>
              )}
              {(canEdit || (isManagement && i.status === "pending")) && (
                <form action={deleteIncome.bind(null, boat.id, i.id)}>
                  <ConfirmSubmitButton confirmMessage="למחוק את ההכנסה?" className="text-xs font-medium text-fleet-coral hover:underline">
                    מחק
                  </ConfirmSubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
