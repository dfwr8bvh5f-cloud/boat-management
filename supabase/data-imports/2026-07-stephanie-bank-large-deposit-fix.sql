-- ============================================================================
-- Adds the "14-Jul-2026 final payment for charter 4-11.7.26" bank deposit
-- flagged in 2026-07-stephanie-bank-cash-missing-rows.sql as a likely typo
-- in the source sheet (EUR2,405,550.00). Confirmed by the user: the correct
-- amount is EUR24,055.00. DATA only, not a schema change. Safe to re-run:
-- deletes this exact row (by date+amount+source) before re-inserting.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.incomes where boat_id = v_boat_id and (income_date, amount, source) in (
    ('2026-07-14', 24055.00, 'final payment for charter 4-11.7.26')
  );

  insert into public.incomes (boat_id, source, amount, income_date, type, status) values
    (v_boat_id, 'final payment for charter 4-11.7.26', 24055.00, '2026-07-14', 'actual', 'approved');
end $$;
