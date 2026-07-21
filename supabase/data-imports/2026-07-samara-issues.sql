-- ============================================================================
-- One-time data import: SAMARA's open defects, from SAMARA_LIST.pdf.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Column mapping: Description -> title, Classification -> classification
-- directly (all real selectable values here: "Repair"/"Capital"/"Service" -
-- none say "Waranty", so is_warranty = false throughout), Area/Category ->
-- area, Location/Type -> location, Supplier -> supplier_labour, Status ->
-- op_status, Date assigned -> issue_date.
--
-- Not entered (left null, per the "template placeholder" rule used in every
-- other issues import this session): estimated cost (every row is the
-- "€ xx.xx" placeholder). Payment method / assigned to / notes are blank for
-- every row in the source.
--
-- Due date: 4 of 5 rows are the "dd/mm/yyyy" placeholder and left null, but
-- row 1 ("Replace mirrors in cabins+staircase") has a REAL due date in the
-- source (15 Jun 2026, with the sheet's own "Days remaining" showing -36,
-- i.e. already overdue as of today) - entered as-is, not left null.
--
-- Imported as already-approved (status = 'approved'), matching the other
-- defect imports this session.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'samara';
  if v_boat_id is null then
    raise exception 'Boat "Samara" not found (matched on lower(trim(name)) = ''samara'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'Replace mirrors in cabins+staircase', 'Order new foil', 'Polishing propellers and replace 2 anodes',
      'Change of new pump- icemaker', 'Boiler service'
    );

  insert into public.issues
    (boat_id, title, classification, is_warranty, area, location, supplier_labour, issue_date, due_date, op_status, status, approved_at)
  values
    (v_boat_id, 'Replace mirrors in cabins+staircase', 'repair', false, 'interior', 'all cabins', 'pitsilos', '2025-11-01', '2026-06-15', 'pending', 'approved', now()),
    (v_boat_id, 'Order new foil', 'capital', false, 'equipment', 'watersports', 'VS YACHTING', '2026-06-25', null, 'in_progress', 'approved', now()),
    (v_boat_id, 'Polishing propellers and replace 2 anodes', 'service', false, 'exterior', 'hull', null, '2026-07-13', null, 'in_progress', 'approved', now()),
    (v_boat_id, 'Change of new pump- icemaker', 'repair', false, 'technical', 'general', 'ARIA SOLUTIONS', '2026-07-14', null, 'in_progress', 'approved', now()),
    (v_boat_id, 'Boiler service', 'service', false, 'technical', 'water system', 'MARINAKIS MARINE SERVICES', '2026-07-13', null, 'in_progress', 'approved', now());
end $$;
