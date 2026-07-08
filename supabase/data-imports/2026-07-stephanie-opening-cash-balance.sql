-- ============================================================================
-- One-time data fix: sets Stephanie's computed CASH balance to match the
-- real cash in hand today (€59.81, as given) - same mechanism as
-- 2026-07-stephanie-opening-balance.sql, but for cash instead of bank.
--
-- Why a "received" cash transaction, and why dated 2025-12-31:
--   - The app's cash balance (src/lib/balances.ts, computeCashBalance) is
--     fully computed: approved cash withdrawals + cash received in hand,
--     minus approved cash-paid expenses, with no lower date bound - so a
--     single row here becomes part of the running total from now on,
--     exactly like a real opening balance would. "received" (not
--     "withdrawal") because this cash isn't coming from a bank
--     withdrawal - it's simply cash that already exists in hand.
--   - Financial/period reports filter cash transactions by a date RANGE.
--     Dated 2025-12-31, this row falls before any 2026 report's start date
--     and will never appear in a 2026 budget, period report, or category
--     breakdown - only in the plain running cash balance.
--
-- Self-correcting rather than a fixed guess: computes whatever Stephanie's
-- cash balance already is in the system right now (should be €0 if nothing
-- has been entered for her yet) and inserts the DIFFERENCE needed to reach
-- €59.81 - safe to run regardless of whether anything was already entered,
-- and safe to re-run (it replaces its own prior row by notes text instead
-- of stacking a new one each time).
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_balance numeric;
  v_target_balance numeric := 59.81;
  v_notes text := 'יתרת פתיחה 2026 - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Remove any previous run of this same adjustment first, so re-running
  -- this script doesn't double-count it.
  delete from public.cash_transactions where boat_id = v_boat_id and type = 'received' and notes = v_notes;

  select
    coalesce((
      select sum(amount) from public.cash_transactions
      where boat_id = v_boat_id and status = 'approved' and type in ('withdrawal', 'received') and archived_at is null
    ), 0)
    - coalesce((
      select sum(amount) from public.expenses
      where boat_id = v_boat_id and status = 'approved' and payment_method = 'cash' and archived_at is null
    ), 0)
  into v_current_balance;

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status)
  values (v_boat_id, 'received', v_target_balance - v_current_balance, '2025-12-31', v_notes, 'approved');
end $$;
