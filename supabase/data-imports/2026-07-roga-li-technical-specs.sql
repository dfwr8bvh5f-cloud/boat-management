-- ============================================================================
-- One-time data import: Roga Li's Technical Specs (machine category), from
-- "Copy of SERIAL_NUMBER_LIST.xlsx / DATA LIST.pdf" (source sheet spells
-- the boat name as one word, "ROGALI" - matched here against the app's
-- own boat name, "Roga Li", not the source spelling).
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact names) before
-- re-inserting.
--
-- Not entered (no matching field in Technical Specs / boats):
--   - Hull number (54) and Captain (SOTIRIS) - boat-level info, no column
--     for either on public.boats.
--   - Dinghy / outboard engine - both blank in the source file.
-- No engine or generator hour readings were given in the source file for
-- this boat (unlike Mintu/Stephanie/Stemer/Haven), so no historical-
-- reading note was added to `details`.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.technical_specs
    where boat_id = v_boat_id
    and name in ('Main engine 1', 'Main engine 2', 'Gearbox 1', 'Gearbox 2', 'Generator', 'Watermaker 1', 'Watermaker 2');

  insert into public.technical_specs (boat_id, category, name, model, serial_number, details, status, approved_at) values
    (v_boat_id, 'machine', 'Main engine 1', 'NANI N4.115 PORT', '2NL0992', null, 'approved', now()),
    (v_boat_id, 'machine', 'Main engine 2', 'NANI N4.115 STB', '2NL1028', null, 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox 1', 'ZF SD 15', 'sn30134432', null, 'approved', now()),
    (v_boat_id, 'machine', 'Gearbox 2', 'ZF SD 15', 'sn30134431', null, 'approved', now()),
    (v_boat_id, 'machine', 'Generator', 'FISCHER PANDA', 'SN 2204760', null, 'approved', now()),
    (v_boat_id, 'machine', 'Watermaker 1', 'AQUA BASE 220 2.7KW', null, null, 'approved', now()),
    (v_boat_id, 'machine', 'Watermaker 2', 'ARUBA 240', '10092', null, 'approved', now());
end $$;
