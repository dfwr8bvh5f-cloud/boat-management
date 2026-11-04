-- ============================================================================
-- One-time data import: MINTU's 2025 BUDGET, from "MINTU - 2026 Budget 2.pdf"
-- (its "2025 BUDGET" column). DATA only, no schema change. Requires migration
-- 0133 (budget `year` column). Re-runnable: clears just MINTU's 2025 rows in
-- budget_categories first. The sheet gives one total per category (no line
-- items), so these are flat budget_categories amounts.
--
-- Sheet total: EUR 146,701.00 incl. CREW FOOD (500.00), which MINTU did not
-- use and was removed afterwards -> 14 rows / 146,201.00 below.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found - check the exact boat name and adjust before running.';
  end if;

  delete from public.budget_categories where boat_id = v_boat_id and year = 2025;
  delete from public.budget_subcategories where boat_id = v_boat_id and year = 2025;

  insert into public.budget_categories (boat_id, category, year, amount) values
    (v_boat_id, 'diesel',            2025,  5000.00),
    (v_boat_id, 'docking_out',       2025,  2250.00),
    (v_boat_id, 'base_docking',      2025, 13200.00),
    (v_boat_id, 'capital_expenses',  2025, 16450.00),
    (v_boat_id, 'formalities',       2025, 10384.00),
    (v_boat_id, 'laundry_cleaning',  2025,  2700.00),
    (v_boat_id, 'other',             2025,  1500.00),
    (v_boat_id, 'provisions',        2025,  6000.00),
    (v_boat_id, 'repairs',           2025,  5000.00),
    (v_boat_id, 'services',          2025, 17637.00),
    (v_boat_id, 'crew',              2025, 51380.00),
    (v_boat_id, 'management',        2025, 12000.00),
    (v_boat_id, 'wifi_phone',        2025,  1200.00),
    (v_boat_id, 'underway_expenses', 2025,  1500.00);
end $$;

-- Check: should return 14 rows / 146201.00
select count(*), sum(amount) from public.budget_categories
where boat_id = (select id from public.boats where lower(trim(name)) = 'mintu') and year = 2025;
