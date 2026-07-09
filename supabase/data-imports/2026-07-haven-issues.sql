-- ============================================================================
-- One-time data import: Haven's open defects, from the "Technical Project
-- Manager" PDF export.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Not entered:
--   - Cost was a template placeholder ("€ xx.xx") in the source file, not
--     a real amount - left null rather than guessed (never fabricate a
--     financial figure).
--   - Due date / completion date were both blank in the source
--     ("dd/mm/yyyy" / "No date set" placeholders) - left null.
--   - The "15 May 2026" date in the source has no matching column on
--     public.issues (it isn't a due date - both due-date-shaped columns
--     were explicitly blank), so it's kept in `notes` as "Reported: ..."
--     instead of being dropped or forced into the wrong field.
-- Imported as already-approved (status = 'approved'), matching how the
-- technical specs imports were entered.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'haven';
  if v_boat_id is null then
    raise exception 'Boat "Haven" not found (matched on lower(trim(name)) = ''haven'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in ('Repair bimini zipper cockpit', 'Teak cleaning');

  insert into public.issues (boat_id, title, classification, area, location, supplier_labour, notes, op_status, status, approved_at) values
    (v_boat_id, 'Repair bimini zipper cockpit', 'repair', 'exterior', 'Cockpit', 'Aeronautica', 'Reported: 15 May 2026', 'in_progress', 'approved', now()),
    (v_boat_id, 'Teak cleaning', 'service', 'exterior', 'Deck', 'MYS Tech', 'Reported: 15 May 2026', 'pending', 'approved', now());
end $$;
