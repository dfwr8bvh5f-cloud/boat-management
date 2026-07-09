-- ============================================================================
-- One-time data import: Stemer's Technical Specs (machine category), from
-- "Copy of SERIAL_NUMBER_LIST.xlsx / DATA LIST.pdf".
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact names) before
-- re-inserting.
--
-- Not entered (no matching field in Technical Specs / boats):
--   - Hull number (16) - boat-level info, no column for it on public.boats.
--     Captain was blank in the source file.
--   - Dinghy / outboard engine - both blank in the source file, so left
--     out here too (unlike Mintu/Stephanie, which had this section filled
--     in).
-- The 884h main-engine and 1699h generator hour readings from the source
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
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stemer';
  if v_boat_id is null then
    raise exception 'Boat "Stemer" not found (matched on lower(trim(name)) = ''stemer'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.technical_specs
    where boat_id = v_boat_id
    and name in ('Main engine', 'Gearbox', 'Generator', 'Watermaker');

  insert into public.technical_specs (boat_id, category, name, model, serial_number, details, status, approved_at) values
    (v_boat_id, 'machine', 'Main engine', 'YANMAR 6BY3-160', '3974094', 'Reference reading 6/10/23: 884h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox', 'AXLE', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Generator', 'ONAN 17.5MDKDR-8202A', 'K160118135', 'Reference reading 6/10/23: 1699h (not a live operating-hours value)', 'approved', now()),
    (v_boat_id, 'machine', 'Watermaker', 'Dessalator 12V and 220V', null, null, 'approved', now());
end $$;
