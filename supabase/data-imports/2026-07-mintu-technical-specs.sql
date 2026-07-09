-- ============================================================================
-- One-time data import: Mintu's Technical Specs (machine category), from
-- "Copy of SERIAL_NUMBER_LIST.xlsx / DATA LIST.pdf".
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact names) before
-- re-inserting.
--
-- Not entered (no matching field in Technical Specs / boats):
--   - Hull number (14) and Captain (PANOS) - boat-level info, no column
--     for either on public.boats.
-- The 552h / 605h main-engine and 318h generator hour readings from the
-- source file are NOT written as live "operation hours" - per the app's
-- design, operation hours are only ever derived from the weekly engine
-- report, never entered manually. They're kept in `details` as a labeled
-- historical reference only, so the number isn't lost but can't be
-- mistaken for a current reading.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found (matched on lower(trim(name)) = ''mintu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.technical_specs
    where boat_id = v_boat_id
    and name in ('Main engine 1', 'Main engine 2', 'Gearbox 1', 'Gearbox 2', 'Generator', 'Watermaker 1', 'Watermaker 2', 'Dinghy outboard engine');

  insert into public.technical_specs (boat_id, category, name, model, serial_number, details, status, approved_at) values
    (v_boat_id, 'machine', 'Main engine 1', 'YANMAR 4JH80 PORT', 'E58646', 'Reference reading 28/8/23: 552h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Main engine 2', 'YANMAR 4JH80 STB', 'E58120', 'Reference reading 28/8/23: 605h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox 1', 'YANMAR SD60-4', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox 2', 'YANMAR SD60-4', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Generator', 'FISCHER PMS P-12000X', 'S2204761', 'Reference reading 31/8/23: 318h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Watermaker 1', 'Ice Sea', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Watermaker 2', 'Eneq', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Dinghy outboard engine', 'ABJET 350 - Rotax', null, null, 'approved', now());
end $$;
