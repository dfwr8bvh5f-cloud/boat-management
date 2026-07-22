-- Data-integrity audit follow-up (see reports/financial-reconciliation-report.md,
-- section on the cash_transactions.type "usage" value).
--
-- "usage" was defined in migration 0006 alongside "withdrawal" but was never
-- wired into computeCashBalance() (src/lib/balances.ts only ever reads
-- withdrawal/received), while the display layer (isCashInflow in
-- src/lib/labels.ts) *did* treat it as a cash outflow - a silent mismatch
-- between what the UI would show and what the balance actually reflects, had
-- a row with this type ever been created. No UI path creates one (the cash
-- transaction form only offers withdrawal/received) and a live count
-- confirmed 0 rows use it. Approved by the user to be removed outright.
--
-- Postgres enums have no DROP VALUE, so removing a value means recreating
-- the type. Guarded with an explicit check so this fails loudly instead of
-- with a cryptic cast error if a 'usage' row was somehow added between the
-- audit and this migration being applied.
do $$
begin
  if exists (select 1 from public.cash_transactions where type = 'usage') then
    raise exception 'cash_transactions has rows with type=usage - resolve them before running this migration';
  end if;
end $$;

alter type public.cash_tx_type rename to cash_tx_type_old;
create type public.cash_tx_type as enum ('withdrawal', 'received');

alter table public.cash_transactions
  alter column type type public.cash_tx_type using type::text::public.cash_tx_type;

drop type public.cash_tx_type_old;
