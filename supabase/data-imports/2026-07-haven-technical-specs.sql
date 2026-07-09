-- ============================================================================
-- One-time data import: Haven's Technical Specs (machine category), from
-- "Copy of SERIAL_NUMBER_LIST.xlsx / DATA LIST.pdf".
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact names) before
-- re-inserting.
--
-- Not entered (no matching field in Technical Specs / boats):
--   - Hull number (36) - boat-level info, no column for it on public.boats.
--     Captain was blank in the source file.
--   - Watermaker - source file explicitly says "NO" (none installed), so
--     no row is created for it.
-- The 727h main-engine and 143h generator hour readings from the source
-- file are NOT written as live "operation hours" - per the app's design,
-- operation hours are only ever derived from the weekly engine report,
-- never entered manually. They're kept in `details` as a labeled
-- historical reference only, so the number isn't lost but can't be
-- mistaken for a current reading.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'haven';
  if v_boat_id is null then
    raise exception 'Boat "Haven" not found (matched on lower(trim(name)) = ''haven'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.technical_specs
    where boat_id = v_boat_id
    and name in ('Main engine', 'Gearbox', 'Generator', 'Dinghy outboard engine');

  insert into public.technical_specs (boat_id, category, name, model, serial_number, details, status, approved_at) values
    (v_boat_id, 'machine', 'Main engine', 'YANMAR 4JH80', 'E52014', 'Reference reading 6/10/23: 727h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox', 'ZF SPPSB80 - 2.5', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Generator', 'FISCHER PMS 10000i', 'SN180692', 'Reference reading 6/10/23: 143h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Dinghy outboard engine', 'KAPPA TENDER - Electric motor', null, null, 'approved', now());
end $$;
