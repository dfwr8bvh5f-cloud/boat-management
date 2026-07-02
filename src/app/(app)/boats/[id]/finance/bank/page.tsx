import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { setBankBalance } from "@/lib/actions/bank";
import { createIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const [{ data: bank }, { data: incomes }] = await Promise.all([
    supabase.from("bank_balances").select("*").eq("boat_id", boat.id).maybeSingle(),
    supabase.from("incomes").select("*").eq("boat_id", boat.id).eq("type", "actual").order("income_date", { ascending: false }),
  ]);

  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-fleet-navy p-4 text-white">
        <div className="mb-1.5 text-xs opacity-80">מצב חשבון</div>
        {isManagement ? (
          <form action={setBankBalance.bind(null, boat.id)} className="flex items-center gap-2">
            <input
              name="balance"
              type="number"
              step="0.01"
              defaultValue={bank?.balance ?? 0}
              className="w-40 rounded-lg border border-fleet-brass/50 bg-white/10 px-3 py-1.5 text-xl font-bold text-white"
            />
            <button type="submit" className="rounded-lg bg-fleet-teal px-3 py-1.5 text-sm font-bold">
              עדכן
            </button>
          </form>
        ) : (
          <div className="text-2xl font-bold">€{(bank?.balance ?? 0).toLocaleString("he-IL")}</div>
        )}
        {bank?.updated_at && <div className="mt-1.5 text-[11px] opacity-60">עודכן: {bank.updated_at.slice(0, 10)}</div>}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-fleet-ink">הכנסות בפועל (סה״כ €{totalIncome.toLocaleString("he-IL")})</h3>
      </div>

      {canEdit && (
        <form action={createIncome.bind(null, boat.id, "actual")} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input name="source" required placeholder="מקור ההכנסה *" className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder="סכום (€) *" className={inputClass} />
            <input name="income_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            הוסף הכנסה
          </button>
        </form>
      )}

      {!incomes || incomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין הכנסות בפועל רשומות.
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
              <div className="font-bold text-fleet-moss">+€{i.amount.toLocaleString("he-IL")}</div>
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
