import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { computeCashBalance } from "@/lib/balances";
import { createCashTransaction, deleteCashTransaction, approveCashTransaction } from "@/lib/actions/cash";
import { ApprovalIndicator } from "@/components/approval-indicator";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getCashTxLabels, isCashInflow } from "@/lib/labels";
import { getTranslator } from "@/lib/i18n/locale";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function CashPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();
  const cashTxLabels = getCashTxLabels(locale);

  const supabase = await createClient();
  const [{ data: cashTx }, { data: cashExpenses }, net] = await Promise.all([
    supabase.from("cash_transactions").select("*").eq("boat_id", boat.id).order("tx_date", { ascending: false }),
    supabase.from("expenses").select("amount").eq("boat_id", boat.id).eq("status", "approved").eq("payment_method", "cash"),
    computeCashBalance(supabase, boat.id),
  ]);

  const withdrawals = (cashTx ?? []).filter((c) => c.type === "withdrawal").reduce((s, c) => s + c.amount, 0);
  const receivedInHand = (cashTx ?? []).filter((c) => c.type === "received").reduce((s, c) => s + c.amount, 0);
  const cashExpenseSum = (cashExpenses ?? []).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-xl border p-4 ${net >= 0 ? "border-fleet-moss bg-emerald-50" : "border-fleet-coral bg-red-50"}`}>
        <div className="mb-1 text-xs text-fleet-ink">{t("cash_balance")}</div>
        <div className={`text-2xl font-bold ${net >= 0 ? "text-fleet-moss" : "text-fleet-coral"}`}>
          €{net.toLocaleString("he-IL")}
        </div>
        <div className="mt-1 text-xs text-fleet-ink">
          {t("withdrawals")}: €{withdrawals.toLocaleString("he-IL")} · {t("cash_received_short")}: €{receivedInHand.toLocaleString("he-IL")} · {t("report_expenses_word")}: €
          {cashExpenseSum.toLocaleString("he-IL")}
        </div>
      </div>

      {canEdit && (
        <form action={createCashTransaction.bind(null, boat.id)} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <p className="flex items-center gap-1.5 rounded-lg border border-fleet-border bg-fleet-paper px-3 py-2 text-xs text-fleet-ink">
            {t("cash_bank_link")} {t("cash_bank_link_received")}
          </p>
          <select name="type" defaultValue="withdrawal" className={inputClass}>
            <option value="withdrawal">{cashTxLabels.withdrawal}</option>
            <option value="received">{cashTxLabels.received}</option>
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder={`${t("amount")} *`} className={inputClass} />
            <input name="tx_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <input name="notes" placeholder={t("note")} className={inputClass} />
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("save_transaction")}
          </button>
        </form>
      )}

      {!cashTx || cashTx.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_cash")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {cashTx.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex-1">
                <div className="text-sm">
                  {cashTxLabels[c.type]}
                  {c.notes ? ` · ${c.notes}` : ""}
                </div>
                <div className="text-xs text-fleet-ink">{c.tx_date}</div>
              </div>
              <ApprovalIndicator value={c.status} locale={locale} />
              <div className={`font-bold ${isCashInflow(c.type) ? "text-fleet-moss" : "text-fleet-coral"}`}>
                {isCashInflow(c.type) ? "+" : "-"}€{c.amount.toLocaleString("he-IL")}
              </div>
              {isManagement && c.status === "pending" && (
                <form action={approveCashTransaction.bind(null, boat.id, c.id)}>
                  <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                    {t("approve")}
                  </button>
                </form>
              )}
              {(canEdit || (isManagement && c.status === "pending")) && (
                <form action={deleteCashTransaction.bind(null, boat.id, c.id)}>
                  <ConfirmSubmitButton confirmMessage={t("delete_tx_confirm")} className="text-xs font-medium text-fleet-coral hover:underline">
                    {t("delete_word")}
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
