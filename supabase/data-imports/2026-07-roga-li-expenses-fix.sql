-- ============================================================================
-- One-time correction for Roga Li's 2026 expenses, found by comparing the
-- app's current data (exported CSV) row-by-row against the source "Expenses"
-- sheet in ROGA.xlsx. Three issues, all confirmed to fully close the gaps
-- the user flagged in her "Expenses Year Totals" sheet (Capital Expenses,
-- Company, Docking Out, Management, Other, Provisions, Repairs, Underway
-- Expenses):
--
-- 1. 17 rows from 29/06/2026-14/07/2026 were never imported at all.
-- 2. Two rows dated 02/07/2026 were filed under the wrong category
--    (both currently sit under Capital Expenses in the app).
-- 3. One row ("Port fees poros", 03/05/2026, EUR22.49, Docking Out) exists
--    in the app but has no counterpart in the source sheet at all - it
--    looks like a duplicate/mislabeled entry and is removed. The source
--    sheet's only "Port fees poros" entry (02/05/2026, EUR45.00) is
--    already correctly present in the app and is left untouched.
--
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script's inserts (matched by boat_id + exact date/description/
-- amount) before re-inserting; the category fixes and the removal are
-- idempotent by construction (re-running them is a no-op once applied).
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- ------------------------------------------------------------------------
  -- 1. Add the 17 rows missing entirely from the app.
  -- ------------------------------------------------------------------------
  delete from public.expenses where boat_id = v_boat_id and (expense_date, description, amount) in (
    ('2026-07-13', '60 metrs white line 2.5 mm', 18.00),
    ('2026-07-11', 'net for the rails', 111.60),
    ('2026-07-01', 'bank fees Julay', 38.80),
    ('2026-07-01', 'marinero anchorage', 100.00),
    ('2026-06-30', 'marinero', 64.00),
    ('2026-06-30', 'mamagement fees- Julay', 1400.00),
    ('2026-06-30', 'storage fees- June', 93.00),
    ('2026-07-13', 'flowers', 35.00),
    ('2026-07-13', 'souper market gouvia AB', 139.79),
    ('2026-07-11', 'souper market', 11.40),
    ('2026-07-01', 'souper market', 26.45),
    ('2026-06-29', 'bakery', 13.40),
    ('2026-06-29', 'souper market', 19.71),
    ('2026-06-29', 'souper market', 88.82),
    ('2026-07-11', 'frw sofa cover repair', 15.00),
    ('2026-07-13', 'transport company corfu', 40.00),
    ('2026-07-01', 'boaz ruthy sam food', 120.00),
    ('2026-06-29', 'dubrovnic uber', 20.10)
  );

  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status) values
    (v_boat_id, '2026-07-13', '60 metrs white line 2.5 mm', 'capital_expenses', 'card', 18.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-11', 'net for the rails', 'capital_expenses', 'card', 111.60, 'crew', 'approved'),
    (v_boat_id, '2026-07-01', 'bank fees Julay', 'company', 'bank_transfer', 38.80, 'crew', 'approved'),
    (v_boat_id, '2026-07-01', 'marinero anchorage', 'docking_out', 'card', 100.00, 'crew', 'approved'),
    (v_boat_id, '2026-06-30', 'marinero', 'docking_out', 'cash', 64.00, 'crew', 'approved'),
    (v_boat_id, '2026-06-30', 'mamagement fees- Julay', 'management', 'bank_transfer', 1400.00, 'crew', 'approved'),
    (v_boat_id, '2026-06-30', 'storage fees- June', 'other', 'bank_transfer', 93.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-13', 'flowers', 'provisions', 'card', 35.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-13', 'souper market gouvia AB', 'provisions', 'card', 139.79, 'crew', 'approved'),
    (v_boat_id, '2026-07-11', 'souper market', 'provisions', 'card', 11.40, 'crew', 'approved'),
    (v_boat_id, '2026-07-01', 'souper market', 'provisions', 'card', 26.45, 'crew', 'approved'),
    (v_boat_id, '2026-06-29', 'bakery', 'provisions', 'card', 13.40, 'crew', 'approved'),
    (v_boat_id, '2026-06-29', 'souper market', 'provisions', 'card', 19.71, 'crew', 'approved'),
    (v_boat_id, '2026-06-29', 'souper market', 'provisions', 'card', 88.82, 'crew', 'approved'),
    (v_boat_id, '2026-07-11', 'frw sofa cover repair', 'repairs', 'card', 15.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-13', 'transport company corfu', 'underway_expenses', 'cash', 40.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-01', 'boaz ruthy sam food', 'underway_expenses', 'cash', 120.00, 'crew', 'approved'),
    (v_boat_id, '2026-06-29', 'dubrovnic uber', 'underway_expenses', 'cash', 20.10, 'crew', 'approved');

  -- ------------------------------------------------------------------------
  -- 2. Fix the two miscategorized rows (both currently under
  --    capital_expenses, both dated 02/07/2026).
  -- ------------------------------------------------------------------------
  update public.expenses
  set category = 'provisions'
  where boat_id = v_boat_id and expense_date = '2026-07-02'
    and description = 'nespresso capsules x240 costa rica' and amount = 189.60;

  update public.expenses
  set category = 'repairs'
  where boat_id = v_boat_id and expense_date = '2026-07-02'
    and description = 'Nilfisk Spray Lance G2, Nilfisk C and C Nozzle' and amount = 69.59;

  -- ------------------------------------------------------------------------
  -- 3. Remove the "Port fees poros" row with no counterpart in the source
  --    sheet. The source's only real "Port fees poros" entry (02/05/2026,
  --    EUR45.00) is untouched.
  -- ------------------------------------------------------------------------
  delete from public.expenses
  where boat_id = v_boat_id and expense_date = '2026-05-03'
    and description = 'Port fees poros' and amount = 22.49;
end $$;
