import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { computeBankBalance } from "@/lib/balances";
import { createIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { getTranslator } from "@/lib/i18n/locale";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  const [bankBalance, { data: incomes }] = await Promise.all([
    computeBankBalance(supabase, boat.id),
    supabase.from("incomes").select("*").eq("boat_id", boat.id).eq("type", "actual").order("income_date", { ascending: false }),
  ]);

  const totalIncome = (incomes ?? []).reduce((s, i) => s + i.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-fleet-navy p-4 text-white">
        <div className="mb-1.5 text-xs opacity-80">{t("bank_balance")}</div>
        <div className="text-2xl font-bold">€{bankBalance.toLocaleString("he-IL")}</div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-fleet-ink">{t("income_total")} €{totalIncome.toLocaleString("he-IL")})</h3>
      </div>

      {canEdit && (
        <form action={createIncome.bind(null, boat.id, "actual")} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input name="source" required placeholder={`${t("income_source")} *`} className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder={`${t("amount")} *`} className={inputClass} />
            <input name="income_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("add_income")}
          </button>
        </form>
      )}

      {!incomes || incomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_income")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {incomes.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex-1">
                <div className="text-sm">{i.source}</div>
                <div className="text-xs text-fleet-ink">{i.income_date}</div>
              </div>
              <StatusBadge value={i.status} locale={locale} />
              <div className="font-bold text-fleet-moss">+€{i.amount.toLocaleString("he-IL")}</div>
              {isManagement && i.status === "pending" && (
                <form action={approveIncome.bind(null, boat.id, i.id)}>
                  <button type="submit" className="text-xs font-bold text-fleet-moss hover:underline">
                    {t("approve")}
                  </button>
                </form>
              )}
              {(canEdit || (isManagement && i.status === "pending")) && (
                <form action={deleteIncome.bind(null, boat.id, i.id)}>
                  <ConfirmSubmitButton confirmMessage={t("delete_income_confirm")} className="text-xs font-medium text-fleet-coral hover:underline">
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
