-- ============================================================================
-- Second, smaller correction for Roga Li's 2026 expenses - found the same
-- way as 2026-07-roga-li-expenses-fix.sql (row-by-row diff of the app's
-- current export against the source "Expenses" sheet in ROGA.xlsx), after
-- confirming that fix closed every category gap except two that weren't
-- checked/flagged the first time: Crew Food and Services. 3 rows total,
-- all from the same 29/06-11/07/2026 tail that the first fix mostly (but
-- not entirely) covered.
--
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script's inserts (matched by boat_id + exact date/description/
-- amount) before re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.expenses where boat_id = v_boat_id and (expense_date, description, amount) in (
    ('2026-07-11', 'crew food corfu', 50.00),
    ('2026-06-29', 'crew food', 64.90),
    ('2026-07-11', 'anti rust spray', 24.60)
  );

  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status) values
    (v_boat_id, '2026-07-11', 'crew food corfu', 'crew_food', 'cash', 50.00, 'crew', 'approved'),
    (v_boat_id, '2026-06-29', 'crew food', 'crew_food', 'card', 64.90, 'crew', 'approved'),
    (v_boat_id, '2026-07-11', 'anti rust spray', 'services', 'card', 24.60, 'crew', 'approved');
end $$;
