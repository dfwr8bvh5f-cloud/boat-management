-- ============================================================================
-- One-time data fix: sets Stephanie's computed bank balance to match the
-- real bank account today (€16,571.17, as given), by inserting a single
-- "opening balance" income row rather than trying to reconstruct every
-- individual 2025 transaction that led there.
--
-- Why an income row, and why dated 2025-12-31:
--   - The app's bank balance (src/lib/balances.ts) is fully computed, not a
--     manually-set number: approved income minus cash withdrawals minus
--     approved bank/card expenses, with NO lower date bound - so a single
--     row here becomes part of the running total from now on, exactly like
--     a real opening balance would.
--   - Financial/period reports filter income by a date RANGE (both a start
--     and an end date). Dated 2025-12-31, this row falls before any 2026
--     report's start date and will never appear in a 2026 budget, period
--     report, or category breakdown - only in the plain running balance,
--     matching "should be the base for income/expenses, not enter any
--     budget or calculation."
--
-- Self-correcting rather than a fixed guess: computes whatever Stephanie's
-- balance already is in the system right now (should be €0 if nothing has
-- been entered for her yet) and inserts the DIFFERENCE needed to reach
-- €16,571.17 - so this is safe to run regardless of whether anything was
-- already entered, and safe to re-run (it replaces its own prior row by
-- source name instead of stacking a new one each time).
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_current_balance numeric;
  v_target_balance numeric := 16571.17;
  v_source text := 'יתרת פתיחה 2026 - הועברה משנה קודמת';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Remove any previous run of this same adjustment first, so re-running
  -- this script doesn't double-count it.
  delete from public.incomes where boat_id = v_boat_id and source = v_source;

  select
    coalesce((
      select sum(amount) from public.incomes
      where boat_id = v_boat_id and status = 'approved' and type = 'actual' and archived_at is null
    ), 0)
    - coalesce((
      select sum(amount) from public.cash_transactions
      where boat_id = v_boat_id and status = 'approved' and type = 'withdrawal' and archived_at is null
    ), 0)
    - coalesce((
      select sum(amount) from public.expenses
      where boat_id = v_boat_id and status = 'approved' and payment_method in ('bank_transfer', 'card') and archived_at is null
    ), 0)
  into v_current_balance;

  insert into public.incomes (boat_id, source, amount, income_date, type, status)
  values (v_boat_id, v_source, v_target_balance - v_current_balance, '2025-12-31', 'actual', 'approved');
end $$;
