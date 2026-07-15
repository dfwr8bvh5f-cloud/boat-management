-- ============================================================================
-- Imports the technical/maintenance issues list for MINTU, from
-- Technical_Project_Manager_Project_Manager_7.pdf (7 rows).
--
-- Column mapping: Description -> title, Classification -> classification,
-- Area/Category -> area, Location/Type -> location, Supplier -> supplier_labour
-- (same mapping used for the LULU/MA BELLE imports), Status -> op_status,
-- Date assigned -> issue_date.
--
-- Not entered (left null): estimated cost (every row is the "€ xx.xx"
-- placeholder), due date (every row but the first is the "dd/mm/yyyy"
-- placeholder; the first row's due date - 10 Mar 2026 - is a real value and
-- is kept), "days remaining" (a derived display value, not stored anywhere).
-- The first row's "Assigned to: drydock" doesn't fit the assigned_to field
-- (which only means captain/management routing in this app), so it's kept
-- as a note instead of forced into that column.
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect/spec imports this boat and others have had.
--
-- Idempotent: deletes any prior run of this exact script (same title match)
-- before re-inserting, so it's safe to run more than once.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found (matched on lower(trim(name)) = ''mintu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'repaint side hatches', 'A/C port side cabins- heating not working', 'Speed sensor- not working',
      'new laundry machine', 'new laundry machine- Installation', 'Deck wash pump- not working',
      'Bilge pump stbd side- not drawing the water properly'
    );

  insert into public.issues
    (boat_id, title, classification, area, location, supplier_labour, estimated_cost, due_date, issue_date, notes, op_status, status, approved_at)
  values
    (v_boat_id, 'repaint side hatches', 'repair', 'exterior', 'deck', 'STAMATIS GELCOAT', null, '2026-03-10', '2025-11-01', 'Assigned to: drydock', 'pending', 'approved', now()),
    (v_boat_id, 'A/C port side cabins- heating not working', 'service', 'technical', 'general', 'CREW', null, null, '2026-04-02', null, 'pending', 'approved', now()),
    (v_boat_id, 'Speed sensor- not working', 'repair', 'technical', 'electronic', null, null, null, '2026-06-02', null, 'pending', 'approved', now()),
    (v_boat_id, 'new laundry machine', 'capital', 'technical', 'general', null, null, null, '2026-06-25', null, 'in_progress', 'approved', now()),
    (v_boat_id, 'new laundry machine- Installation', 'capital', 'technical', 'general', null, null, null, '2026-06-29', null, 'pending', 'approved', now()),
    (v_boat_id, 'Deck wash pump- not working', 'repair', 'exterior', 'deck', null, null, null, '2026-07-14', null, 'pending', 'approved', now()),
    (v_boat_id, 'Bilge pump stbd side- not drawing the water properly', 'service', 'technical', 'water system', null, null, null, '2026-07-14', null, 'pending', 'approved', now());
end $$;
