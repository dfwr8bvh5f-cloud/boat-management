-- ============================================================================
-- One-time data import: Roga Li's open defects, from the "Technical Project
-- Manager" PDF export.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + these exact titles) before
-- re-inserting.
--
-- Not entered:
--   - Cost was a template placeholder ("€ xx.xx") in the source file for
--     every row except "Re arrangement of aft cleats" (a real €2,500.00,
--     entered as-is) - the rest left null rather than guessed.
--   - Due date left null wherever the source showed the placeholder
--     "dd/mm/yyyy" / "No date set"; where a real date was given (aft
--     cleats, emergency cut-off, service for the lights) it's entered.
--   - The row-report date and the trailing reference number / initials /
--     season note (e.g. "-509 MYS", "winter 25-26") have no matching
--     column on public.issues, so they're kept in `notes` instead of
--     being dropped or forced into the wrong field.
-- Imported as already-approved (status = 'approved'), matching how the
-- other defect/spec imports were entered.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.issues
    where boat_id = v_boat_id
    and title in (
      'Re arrangement of aft cleats', 'Emergency cut off diesel generator', 'London Sticker',
      'dinghy rogali sticker', 'Safety net for kids around the boat', 'Service for the lights',
      'Replace toilet bowl for master cabin', 'Engines service Corfu', 'Generator service Corfu'
    );

  insert into public.issues (boat_id, title, classification, area, location, supplier_labour, estimated_cost, due_date, notes, op_status, status, approved_at) values
    (v_boat_id, 'Re arrangement of aft cleats', 'warranty', 'exterior', null, 'Lagoon', 2500.00, '2025-02-15', 'Reported: 13 Nov 2024 · Ref: -509 MYS', 'pending', 'approved', now()),
    (v_boat_id, 'Emergency cut off diesel generator', 'capital', 'technical', 'Machinery', 'Active Marine', null, '2025-02-15', 'Reported: 13 Nov 2024 · Ref: -509 MYS', 'pending', 'approved', now()),
    (v_boat_id, 'London Sticker', 'capital', 'equipment', null, null, null, null, 'Reported: 1 Nov 2025 · winter 25-26', 'pending', 'approved', now()),
    (v_boat_id, 'dinghy rogali sticker', 'capital', 'equipment', null, null, null, null, 'Reported: 1 Nov 2025 · winter 25-26', 'pending', 'approved', now()),
    (v_boat_id, 'Safety net for kids around the boat', 'capital', 'technical', null, null, null, null, 'Reported: 1 Nov 2025', 'pending', 'approved', now()),
    (v_boat_id, 'Service for the lights', 'service', 'technical', 'Electronic', 'Navisense', null, '2026-05-19', 'Reported: 15 May 2026 · Ref: -51', 'in_progress', 'approved', now()),
    (v_boat_id, 'Replace toilet bowl for master cabin', 'capital', 'interior', 'Master cabin', null, null, null, 'Reported: 11 May 2026', 'pending', 'approved', now()),
    (v_boat_id, 'Engines service Corfu', 'service', 'technical', 'Engine', 'Marine Services Corfu', null, null, 'Reported: 8 Jul 2026', 'in_progress', 'approved', now()),
    (v_boat_id, 'Generator service Corfu', 'service', 'technical', 'Machinery', 'Marine Services Corfu', null, null, 'Reported: 8 Jul 2026', 'in_progress', 'approved', now());
end $$;
