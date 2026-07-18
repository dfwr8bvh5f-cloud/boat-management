-- ============================================================================
-- Refreshes Stephanie's opening-balance catch-all rows (bank + cash) to match
-- the user's confirmed real-world balances as of now:
--   Cash: EUR291.48
--   Bank: EUR39,909.36
--
-- Same self-correcting mechanism as 2026-07-stephanie-bank-cash-detail.sql:
-- deletes the existing catch-all rows, recomputes the current balance from
-- every OTHER approved income/cash-transaction/expense already in the app,
-- then inserts a new catch-all row for exactly the remaining gap - so the
-- computed balance lands on the given real number without touching any
-- itemized row. DATA only, not a schema change. Safe to re-run.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_current_cash_balance numeric;
  v_target_bank_balance numeric := 39909.36;
  v_target_cash_balance numeric := 291.48;
  v_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and source = v_marker;
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes = v_marker;

  select
    coalesce((select sum(amount) from public.incomes where boat_id = v_boat_id and status = 'approved' and type = 'actual' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type = 'withdrawal' and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method in ('bank_transfer', 'card') and archived_at is null), 0)
  into v_current_bank_balance;

  select
    coalesce((select sum(amount) from public.cash_transactions where boat_id = v_boat_id and status = 'approved' and type in ('withdrawal', 'received') and archived_at is null), 0)
    - coalesce((select sum(amount) from public.expenses where boat_id = v_boat_id and status = 'approved' and payment_method = 'cash' and archived_at is null), 0)
  into v_current_cash_balance;

  insert into public.incomes (boat_id, source, amount, income_date, type, status)
  values (v_boat_id, v_marker, v_target_bank_balance - v_current_bank_balance, '2026-01-01', 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, '2026-01-01', v_marker, 'approved');
end $$;
