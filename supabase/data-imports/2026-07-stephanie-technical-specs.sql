-- ============================================================================
-- One-time data import: Stephanie's Technical Specs (machine category),
-- from "Copy of SERIAL_NUMBER_LIST.xlsx / DATA LIST.pdf".
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact names) before
-- re-inserting.
--
-- Not entered (no matching field in Technical Specs / boats):
--   - Hull number (49) and Captain (GIANNIS) - boat-level info, no column
--     for either on public.boats.
--   - Gearbox, Generator serial number, Water maker - left blank in the
--     source file itself, so left blank here too.
--   - Dinghy make/model - left blank in the source file.
-- The 22/7/24 engine/generator hour readings from the source file are NOT
-- written as live "operation hours" - per the app's design, operation hours
-- are only ever derived from the weekly engine report, never entered
-- manually. They're kept in `details` as a labeled historical reference
-- only, so the number isn't lost but can't be mistaken for a current
-- reading.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.technical_specs
    where boat_id = v_boat_id
    and name in ('Main engine 1', 'Main engine 2', 'Generator 1', 'Generator 2', 'Dinghy outboard engine');

  insert into public.technical_specs (boat_id, category, name, model, serial_number, details, status, approved_at) values
    (v_boat_id, 'machine', 'Main engine 1', 'YANMAR LV170', '2983', 'Reference reading 22/7/24: 533h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Main engine 2', 'YANMAR LV170', '2984', 'Reference reading 22/7/24: 539h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Generator 1', 'FISCHER 15000I PMS', null, 'Reference reading 22/7/24: 263h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Generator 2', 'FISCHER PMGI 15000', null, 'Reference reading 22/7/24: 278h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Dinghy outboard engine', 'YAMAHA 70HP 6CJ F70AET', '1123854', null, 'approved', now());
end $$;
