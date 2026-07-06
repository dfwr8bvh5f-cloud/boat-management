import { redirect } from "next/navigation";
import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { createIncome, deleteIncome, approveIncome } from "@/lib/actions/incomes";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { DateInput } from "@/components/date-input";
import { getTranslator } from "@/lib/i18n/locale";

const inputClass =
  "rounded-lg border border-fleet-border bg-white px-3 py-2 text-sm outline-none focus:border-fleet-teal focus:ring-2 focus:ring-fleet-teal/15";

export default async function FutureIncomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  if (boat.boat_type === "private") redirect(`/boats/${boat.id}/finance`);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

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
        <div className="text-xs text-fleet-ink">{t("future_total")}</div>
        <div className="mt-1 text-xl font-bold text-fleet-teal">€{total.toLocaleString("he-IL")}</div>
      </div>

      {canEdit && (
        <form action={createIncome.bind(null, boat.id, "future")} className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4">
          <input name="source" required placeholder={`${t("income_source")} *`} className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder={`${t("amount")} *`} className={inputClass} />
            <DateInput name="income_date" defaultValue={new Date().toISOString().slice(0, 10)} locale={locale} className={inputClass} />
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("add_future")}
          </button>
        </form>
      )}

      {!incomes || incomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_future")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {incomes.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-fleet-border bg-white p-3">
              <div className="flex-1">
                <div className="text-sm">{i.source}</div>
                <div className="text-xs text-fleet-ink" dir="ltr">{i.income_date}</div>
              </div>
              <StatusBadge value={i.status} locale={locale} />
              <div className="font-bold text-fleet-teal">€{i.amount.toLocaleString("he-IL")}</div>
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
