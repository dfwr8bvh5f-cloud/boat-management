-- ============================================================================
-- Refresh Roga Li's bank/cash "opening balance" catch-all to match the real
-- balances the user gave directly: Bank EUR19,848.81, Cash EUR1,252.30 (as
-- of today). Since 2026-07-roga-li-bank-cash-2.sql set the catch-all, two
-- rounds of expense corrections were applied (2026-07-roga-li-expenses-fix.sql
-- and -fix-2.sql), which changed the computed balance - this recomputes the
-- catch-all fresh against whatever is actually in the database now, rather
-- than assuming the old target is still correct.
--
-- Only touches this script's own catch-all rows (matched by the marker
-- text) - does not touch any itemized income/cash/expense row. Safe to
-- re-run any time the real balance needs to be re-synced.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_bank_balance numeric;
  v_current_cash_balance numeric;
  v_target_bank_balance numeric := 19848.81;
  v_target_cash_balance numeric := 1252.30;
  v_catchall_marker text := 'יתרת פתיחה - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and source = v_catchall_marker;
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes = v_catchall_marker;

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
  values (v_boat_id, v_catchall_marker, v_target_bank_balance - v_current_bank_balance, '2026-07-01', 'actual', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_cash_balance - v_current_cash_balance, '2026-07-01', v_catchall_marker, 'approved');
end $$;
