import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createCashTransaction, deleteCashTransaction, approveCashTransaction } from "@/lib/actions/cash";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function CashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";

  const supabase = await createClient();
  const { data: cashTx } = await supabase
    .from("cash_transactions")
    .select("*")
    .eq("boat_id", boat.id)
    .order("tx_date", { ascending: false });

  const withdrawals = (cashTx ?? []).filter((c) => c.type === "withdrawal").reduce((s, c) => s + c.amount, 0);
  const usage = (cashTx ?? []).filter((c) => c.type === "usage").reduce((s, c) => s + c.amount, 0);
  const net = withdrawals - usage;

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-xl border p-4 ${net >= 0 ? "border-fleet-moss bg-emerald-50" : "border-fleet-coral bg-red-50"}`}>
        <div className="mb-1 text-xs text-fleet-ink">מזומן בקופה</div>
        <div className={`text-2xl font-bold ${net >= 0 ? "text-fleet-moss" : "text-fleet-coral"}`}>
          ₪{net.toLocaleString("he-IL")}
        </div>
        <div className="mt-1 text-xs text-fleet-ink">
          משיכות: ₪{withdrawals.toLocaleString("he-IL")} · שימוש: ₪{usage.toLocaleString("he-IL")}
        </div>
      </div>

      {canEdit && (
        <form action={createCashTransaction.bind(null, boat.id)} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <p className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
            משיכת מזומן תרד אוטומטית מיתרת הבנק.
          </p>
          <select name="type" defaultValue="withdrawal" className={inputClass}>
            <option value="withdrawal">משיכת מזומן</option>
            <option value="usage">שימוש במזומן</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder="סכום (₪) *" className={inputClass} />
            <input name="tx_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <input name="notes" placeholder="הערה" className={inputClass} />
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            שמור תנועה
          </button>
        </form>
      )}

      {!cashTx || cashTx.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          אין תנועות מזומן רשומות.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {cashTx.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex-1">
                <div className="text-sm">
                  {c.type === "withdrawal" ? "משיכת מזומן" : "שימוש במזומן"}
                  {c.notes ? ` · ${c.notes}` : ""}
                </div>
                <div className="text-xs text-fleet-ink">{c.tx_date}</div>
              </div>
              <StatusBadge value={c.status} />
              <div className={`font-bold ${c.type === "withdrawal" ? "text-fleet-moss" : "text-fleet-coral"}`}>
                {c.type === "withdrawal" ? "+" : "-"}₪{c.amount.toLocaleString("he-IL")}
              </div>
              {isManagement && c.status === "pending" && (
                <form action={approveCashTransaction.bind(null, boat.id, c.id)}>
                  <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                    אשר
                  </button>
                </form>
              )}
              {(canEdit || (isManagement && c.status === "pending")) && (
                <form action={deleteCashTransaction.bind(null, boat.id, c.id)}>
                  <ConfirmSubmitButton confirmMessage="למחוק את התנועה?" className="text-xs font-medium text-fleet-coral hover:underline">
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
