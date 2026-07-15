-- ============================================================================
-- One-time data import: 4 rows found in Stephanie's source spreadsheet
-- (STEPHANIE Expenses.pdf, checked against the app's own expenses export)
-- that were missing from public.expenses. DATA only, not a schema change.
-- Safe to re-run: deletes any prior run of this exact script (matched by
-- boat_id + a marker in notes) before re-inserting.
--
-- 3 of the 4 are plain gaps (present in the source sheet, never entered):
--   - 2026-07-11 "base tip" (Base Docking, Cash, EUR20.00)
--   - 2026-07-11 "lpg bootle" (Capital Expenses, Card, EUR26.00)
--   - 2026-06-25 "tip base" (Base Docking, Cash, EUR20.00) - a second, separate
--     "tip base" entry the day before the 2026-06-26 one already in the app.
--
-- The 4th was a deliberate exclusion in the original 2026-07-stephanie-
-- expenses-2026.sql import, not a bug: a 2025-05-02 "prepayment for the
-- bottles - promostitch- 50%" (Capital Expenses, Bank Transfer, EUR458.80)
-- was left out at the time as "outside 2026" scope. It is a distinct
-- transaction from the 2026-06-03 "final for the bottles - promostitch- 50%"
-- (same EUR458.80, already in the app) - a separate 50% prepayment, not a
-- duplicate. Included here because it is still present in the source sheet
-- and this pass was asked to reconcile everything in it - remove this row
-- from the script (or delete it after running) if it should stay excluded.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
  v_marker text := 'stephanie-expenses-missing-rows-2026-07';
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.expenses where boat_id = v_boat_id and notes = v_marker;

  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status, notes) values
    (v_boat_id, '2026-07-11', 'base tip', 'base_docking', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-07-11', 'lpg bootle', 'capital_expenses', 'card', 26.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2026-06-25', 'tip base', 'base_docking', 'cash', 20.00, 'crew', 'approved', v_marker),
    (v_boat_id, '2025-05-02', 'prepayment for the bottles - promostitch- 50%', 'capital_expenses', 'bank_transfer', 458.80, 'crew', 'approved', v_marker);
end $$;
