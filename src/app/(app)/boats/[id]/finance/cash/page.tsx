import { getBoatContext } from "@/lib/boat-access";
import { createClient } from "@/lib/supabase/server";
import { computeCashBalance, OPENING_BALANCE_MARKER } from "@/lib/balances";
import { createCashTransaction } from "@/lib/actions/cash";
import { DateInput } from "@/components/date-input";
import { todayLocalISO } from "@/lib/date-format";
import { CashTransactionsList } from "@/components/cash-transactions-list";
import { getCashTxLabels } from "@/lib/labels";
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
    supabase.from("cash_transactions").select("*").eq("boat_id", boat.id).is("archived_at", null).order("tx_date", { ascending: false }),
    supabase.from("expenses").select("amount").eq("boat_id", boat.id).eq("status", "approved").eq("payment_method", "cash").is("archived_at", null),
    computeCashBalance(supabase, boat.id),
  ]);

  // Cash withdrawals linked to a bank statement line (via reconciliation)
  // sort by the statement's own row order within the same date, instead of
  // insertion order - "received in hand" transactions are never linked (they
  // never appear on a bank statement), so they just keep falling back to
  // insertion order below, same as before. See the matching comment on the
  // expenses page, which this list mirrors.
  const statementLineIds = [
    ...new Set((cashTx ?? []).flatMap((c) => (c.bank_statement_line_id ? [c.bank_statement_line_id] : []))),
  ];
  const { data: lines } =
    statementLineIds.length > 0
      ? await supabase.from("bank_statement_lines").select("id, statement_order").in("id", statementLineIds)
      : { data: null };
  const statementOrderById = new Map<string, number>();
  for (const l of lines ?? []) statementOrderById.set(l.id, l.statement_order);

  const sortedCashTx = (cashTx ?? [])
    .map((c) => ({
      ...c,
      statementOrder: c.bank_statement_line_id ? (statementOrderById.get(c.bank_statement_line_id) ?? null) : null,
    }))
    .sort((a, b) => {
      const byDate = (b.tx_date ?? "").localeCompare(a.tx_date ?? "");
      if (byDate !== 0) return byDate;
      if (a.statementOrder != null && b.statementOrder != null) return a.statementOrder - b.statementOrder;
      return a.created_at.localeCompare(b.created_at);
    });

  const withdrawals = sortedCashTx.filter((c) => c.type === "withdrawal").reduce((s, c) => s + c.amount, 0);
  const receivedInHand = sortedCashTx.filter((c) => c.type === "received").reduce((s, c) => s + c.amount, 0);
  const cashExpenseSum = (cashExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  // The opening-balance row (carried from a previous period) counts toward
  // the totals above for everyone, but is only ever shown as a visible row
  // to management - captains and owners don't see it.
  const visibleCashTx = isManagement ? sortedCashTx : sortedCashTx.filter((c) => c.notes !== OPENING_BALANCE_MARKER);

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
            <DateInput name="tx_date" defaultValue={todayLocalISO()} locale={locale} className={inputClass} />
          </div>
          <input name="notes" placeholder={t("note")} className={inputClass} />
          <button type="submit" className="rounded-lg bg-fleet-teal py-2.5 text-sm font-bold text-white hover:opacity-90">
            {t("save_transaction")}
          </button>
        </form>
      )}

      {visibleCashTx.length === 0 ? (
        <p className="rounded-xl border border-dashed border-fleet-brass bg-white p-6 text-center text-sm text-fleet-ink">
          {t("none_cash")}
        </p>
      ) : (
        <CashTransactionsList
          boatId={boat.id}
          cashTx={visibleCashTx}
          cashTxLabels={cashTxLabels}
          canEdit={canEdit}
          isManagement={isManagement}
          locale={locale}
        />
      )}
    </div>
  );
}
