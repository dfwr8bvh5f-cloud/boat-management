-- ============================================================================
-- Sets Samara's opening-balance catch-all row (bank only - she gave a bank
-- figure, not a cash one) to match the user's confirmed real-world bank
-- balance as of today (21/07/2026):
--   Bank: EUR178,416.57
--
-- Same self-correcting mechanism already used for Stephanie (see
-- 2026-07-stephanie-opening-balance-refresh.sql): deletes any existing
-- catch-all row, recomputes the current balance from every OTHER approved
-- income/cash-transaction/expense already in the app, then inserts a new
-- catch-all row for exactly the remaining gap - so the computed balance
-- lands on the given real number without touching any itemized row. This
-- does NOT create or edit any individual expense/income - if the gap turns
-- out to be large/unexpected, that's worth a manual look before re-running
-- this (a real missing or wrong entry should be fixed directly, not papered
-- over here) - but the catch-all mechanism itself is the same one already
-- accepted for the other boats' pre-app account history.
-- DATA only, not a schema change. Safe to re-run.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_target_bank_balance numeric := 178416.57;
  v_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'samara';
  if v_boat_id is null then
    raise exception 'Boat "Samara" not found (matched on lower(trim(name)) = ''samara'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and source = v_marker;

  select
    coalesce((select sum(amount) from public.incomes where boat_id = v_boat_id and status = 'approved' and type = 'actual' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type = 'withdrawal' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method in ('bank_transfer', 'card') and archived_at is null), 0)
  into v_current_bank_balance;

  insert into public.incomes (boat_id, source, amount, income_date, type, status)
  values (v_boat_id, v_marker, v_target_bank_balance - v_current_bank_balance, '2026-01-01', 'actual', 'approved');
end $$;
