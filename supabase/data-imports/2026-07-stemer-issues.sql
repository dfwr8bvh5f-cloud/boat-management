-- ============================================================================
-- One-time data import: STEMER's open defects, from STEMER_LIST.pdf.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Column mapping: Description -> title, Classification -> classification
-- directly ("Service" is a real selectable value, no is_warranty needed),
-- Area/Category -> area, Location/Type -> location, Status -> op_status,
-- Date assigned -> issue_date.
--
-- Not entered (left null, per the same "template placeholder" rule used in
-- every other issues import this session): estimated cost (both rows are
-- the "€ xx.xx" placeholder), due date (both rows are the "dd/mm/yyyy"
-- placeholder). Supplier / payment method / assigned to / notes are blank
-- for both rows in the source.
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect imports this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stemer';
  if v_boat_id is null then
    raise exception 'Boat "Stemer" not found (matched on lower(trim(name)) = ''stemer'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in ('Wireless vhf is not working', 'Boat speed meter not working');

  insert into public.issues
    (boat_id, title, classification, is_warranty, area, location, issue_date, op_status, status, approved_at)
  values
    (v_boat_id, 'Wireless vhf is not working', 'service', false, 'technical', 'electronic', '2026-06-02', 'pending', 'approved', now()),
    (v_boat_id, 'Boat speed meter not working', 'service', false, 'technical', 'general', '2026-07-14', 'in_progress', 'approved', now());
end $$;
