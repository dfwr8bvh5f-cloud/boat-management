import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { computeBankBalance, OPENING_BALANCE_MARKER } from "@/lib/balances";
import { createIncome } from "@/lib/actions/incomes";
import { DateInput } from "@/components/date-input";
import { IncomesList } from "@/components/incomes-list";
import { getTranslator } from "@/lib/i18n/locale";
import { INPUT_CLASS } from "@/lib/ui-classes";
import type { Income } from "@/lib/types/database";

const inputClass = INPUT_CLASS;

export default async function BankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { boat, profile, canEdit } = await getBoatContext(id);
  const isManagement = profile.role === "management";
  const { t, locale } = await getTranslator();

  const supabase = await createClient();
  // Paginated: a boat with a couple of years of history can genuinely pass
  // 1000 income rows, and an unbounded select() silently caps there -
  // dropping the oldest incomes off the list and out of the total below
  // without error, rather than just being slow.
  const [bankBalance, incomes] = await Promise.all([
    computeBankBalance(supabase, boat.id),
    fetchAllRows<Income>((from, to) =>
      supabase
        .from("incomes")
        .select("*")
        .eq("boat_id", boat.id)
        .eq("type", "actual")
        .is("archived_at", null)
        .order("income_date", { ascending: false })
        .range(from, to)
    ),
  ]);

  // Incomes linked to a bank statement line (via reconciliation) sort by
  // the statement's own row order within the same date, instead of
  // insertion order - see the matching comment on the expenses page, which
  // this list mirrors.
  const statementLineIds = [
    ...new Set(incomes.flatMap((i) => (i.bank_statement_line_id ? [i.bank_statement_line_id] : []))),
  ];
  const { data: lines } =
    statementLineIds.length > 0
      ? await supabase.from("bank_statement_lines").select("id, statement_order").in("id", statementLineIds)
      : { data: null };
  const statementOrderById = new Map<string, number>();
  for (const l of lines ?? []) statementOrderById.set(l.id, l.statement_order);

  const sortedIncomes = incomes
    .map((i) => ({
      ...i,
      statementOrder: i.bank_statement_line_id ? (statementOrderById.get(i.bank_statement_line_id) ?? null) : null,
    }))
    .sort((a, b) => {
      const byDate = (b.income_date ?? "").localeCompare(a.income_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      return a.created_at.localeCompare(b.created_at);
    });

  const totalIncome = sortedIncomes.reduce((s, i) => s + i.amount, 0);
  // The opening-balance row (carried from a previous period) counts toward
  // the balance/total above for everyone, but is only ever shown as a
  // visible row to management - captains and owners don't see it.
  const visibleIncomes = isManagement ? sortedIncomes : sortedIncomes.filter((i) => i.source !== OPENING_BALANCE_MARKER);

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
        <form
          action={createIncome.bind(null, boat.id, "actual")}
          className="flex flex-col gap-3 rounded-xl border border-fleet-border bg-white p-4 print:hidden"
        >
          <input name="source" required placeholder={`${t("income_source")} *`} className={inputClass} />
          <div className="grid grid-cols-2 gap-3">
            <input name="amount" type="number" step="0.01" required placeholder={`${t("amount")} *`} className={inputClass} />
            <DateInput name="income_date" locale={locale} className={inputClass} allowClear />
          </div>
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("add_income")}
          </button>
        </form>
      )}

      {visibleIncomes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_income")}
        </p>
      ) : (
        <IncomesList boatId={boat.id} incomes={visibleIncomes} canEdit={canEdit} isManagement={isManagement} locale={locale} />
      )}
    </div>
  );
}
