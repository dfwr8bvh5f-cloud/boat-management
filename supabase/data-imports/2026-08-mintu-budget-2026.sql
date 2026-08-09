-- ============================================================================
-- One-time data import: MINTU's 2026 budget, from "MINTU__2026_Budget.pdf".
-- This is DATA (budget rows for one boat), not a schema change - safe to run
-- directly, and safe to re-run (it clears just MINTU's existing rows for the
-- categories touched here before inserting, so running it twice won't create
-- duplicates).
--
-- All 15 categories in the PDF give named line items (not just a bare
-- category total), so every category becomes budget_subcategories rows -
-- unlike the LULU import, which had a few categories with only a single
-- total and no breakdown at all (those went to budget_categories instead).
-- `amount` is always the line's own Total column (the source of truth per
-- migration 0017); rate/duration/duration_unit are kept alongside only for
-- display, copied from the PDF's own Duration / Per-duration columns.
-- Where the PDF gave a count/rate but no unit label, duration_unit is left
-- null rather than guessed - except where this exact line item (same name,
-- same rate) already exists with an explicit unit in LULU's own budget
-- import (Starlink/STERLINK -> months, TEPAI/tepai -> months), or where the
-- boat's own recent expense entries confirm the unit (diesel purchased by
-- the liter - see 2026-07-mintu-jul23-25-catchup.sql's "320lit diesel"
-- line), or where the row itself is explicitly labelled ("Estimated
-- nights" for docking out).
--
-- TWO BLANK LINE ITEMS IN THE SOURCE PDF - left out entirely, not
-- fabricated as 0 or any other number:
--   - REPAIRS: "fresh paint side hatches" - Total cell is blank (highlighted
--     yellow in the PDF, unfilled).
--   - SERVICES: "Service charging system" - Total cell is blank (highlighted
--     yellow in the PDF, unfilled).
--   Both categories' own header totals (REPAIRS €7,150.00, SERVICES
--   €20,400.00) only reconcile against their other line items if these two
--   blank rows contribute €0 - confirmed by summing every other line in
--   each category by hand. So the category totals above are already
--   internally consistent without these two rows; they're just missing a
--   price from whoever filled in the sheet.
--
-- TWO DISCREPANCIES IN THE SOURCE PDF ITSELF (Assumptions column vs Total
-- column disagree) - flagged rather than silently picking one:
--   - REPAIRS: "Modification of lazy bag" - Assumptions says €150.00, but
--     Total says €200.00. Used €200.00 (Total), since only €200 makes
--     REPAIRS' own header total of €7,150.00 add up correctly.
--   - SERVICES: "Generetor service hour2x" [sic, PDF spelling] -
--     Assumptions says €500.00, but Total says €1,000.00. Used €1,000.00
--     (Total), since only €1,000 makes SERVICES' own header total of
--     €20,400.00 add up correctly.
--   Both worth double-checking against whatever the original working
--   spreadsheet (not this exported PDF) shows.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found (matched on lower(trim(name)) = ''mintu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.budget_subcategories where boat_id = v_boat_id and category in (
    'diesel', 'docking_out', 'base_docking', 'crew_food', 'capital_expenses', 'formalities',
    'laundry_cleaning', 'other', 'provisions', 'repairs', 'services', 'crew', 'management',
    'wifi_phone', 'underway_expenses'
  );

  insert into public.budget_subcategories (boat_id, category, name, amount, rate, duration, duration_unit) values
    -- DIESEL (€8,300.00)
    (v_boat_id, 'diesel', 'General use during the season', 6300.00, 18.00, 350, 'liters'),
    (v_boat_id, 'diesel', 'Generator', 2000.00, 8.00, 250, 'liters'),

    -- DOCKING OUT (€1,000.00)
    (v_boat_id, 'docking_out', 'Greece', 1000.00, 100.00, 10, 'nights'),

    -- BASE DOCKING (€14,860.00)
    (v_boat_id, 'base_docking', 'Nea Peramos Marina', 13860.00, 1155.00, 12, 'months'),
    (v_boat_id, 'base_docking', 'Electricity and water', 1000.00, null, null, null),

    -- CREW FOOD (€1,000.00)
    (v_boat_id, 'crew_food', 'Crew food', 1000.00, null, null, null),

    -- CAPITAL EXPENSES (€1,350.00)
    (v_boat_id, 'capital_expenses', 'Chain counter check replace', 250.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'New spray hood', 1100.00, null, null, null),

    -- FORMALITIES (€10,873.60)
    (v_boat_id, 'formalities', 'Insurance', 8800.00, null, null, null),
    (v_boat_id, 'formalities', 'Tepai', 1473.60, 122.80, 12, 'months'),
    (v_boat_id, 'formalities', 'Agent', 600.00, null, null, null),

    -- LAUNDRY / CLEANING (€2,300.00)
    (v_boat_id, 'laundry_cleaning', 'Cleaning materials', 500.00, null, null, null),
    (v_boat_id, 'laundry_cleaning', 'Laundries', 1800.00, 120.00, 15, null),

    -- OTHER (€1,500.00)
    (v_boat_id, 'other', 'Other expenses', 1500.00, null, null, null),

    -- PROVISIONS (€4,500.00)
    (v_boat_id, 'provisions', 'Boat provisions', 4500.00, null, null, null),

    -- REPAIRS (€7,150.00) - "fresh paint side hatches" excluded, blank in source
    (v_boat_id, 'repairs', 'General repair', 5000.00, null, null, null),
    (v_boat_id, 'repairs', 'Water maker issue', 1000.00, null, null, null),
    (v_boat_id, 'repairs', 'Replace all rubber sealings for top hatches', 350.00, null, null, null),
    (v_boat_id, 'repairs', 'Leak on autopilot/rudder pump', 500.00, null, null, null),
    (v_boat_id, 'repairs', 'Dinghy light replace + pole and base', 100.00, null, null, null),
    (v_boat_id, 'repairs', 'Modification of lazy bag', 200.00, null, null, null),

    -- SERVICES (€20,400.00) - "Service charging system" excluded, blank in source
    (v_boat_id, 'services', 'Engines service yearly', 2000.00, null, null, null),
    (v_boat_id, 'services', 'Engines service hour2x', 1100.00, null, null, null),
    (v_boat_id, 'services', 'Generator service yearly', 500.00, null, null, null),
    (v_boat_id, 'services', 'Generator service hour2x', 1000.00, null, null, null),
    (v_boat_id, 'services', 'Jet service + storage', 2200.00, null, null, null),
    (v_boat_id, 'services', 'Water maker service', 1000.00, null, null, null),
    (v_boat_id, 'services', 'Anti fouling', 1800.00, null, null, null),
    (v_boat_id, 'services', 'Polish wax', 1100.00, null, null, null),
    (v_boat_id, 'services', 'Air condition full service', 900.00, null, null, null),
    (v_boat_id, 'services', 'Sails covers washing', 1200.00, null, null, null),
    (v_boat_id, 'services', 'Radio - communication service', 150.00, null, null, null),
    (v_boat_id, 'services', 'Upholstery service / cleaning', 400.00, null, null, null),
    (v_boat_id, 'services', 'Crane shipyard', 1200.00, null, null, null),
    (v_boat_id, 'services', 'Stay in shipyard', 1650.00, null, null, null),
    (v_boat_id, 'services', 'Zinc', 250.00, null, null, null),
    (v_boat_id, 'services', 'Marina fees for crane', 400.00, null, null, null),
    (v_boat_id, 'services', 'Tenderlift service', 800.00, null, null, null),
    (v_boat_id, 'services', 'Repair or replace anchor U', 1300.00, null, null, null),
    (v_boat_id, 'services', 'Solar with BMS plus one service on batteries', 600.00, null, null, null),
    (v_boat_id, 'services', 'Water heater resistance service', 250.00, null, null, null),
    (v_boat_id, 'services', 'Annual service liferaft / fire extinguishers', 600.00, null, null, null),

    -- CREW (€48,880.00)
    (v_boat_id, 'crew', 'Captain', 38880.00, 3240.00, 12, 'months'),
    (v_boat_id, 'crew', 'Stew', 10000.00, 2500.00, 4, 'months'),

    -- MANAGEMENT (€12,000.00)
    (v_boat_id, 'management', 'Management fees', 12000.00, 1000.00, 12, 'months'),

    -- WIFI / PHONE (€534.00)
    (v_boat_id, 'wifi_phone', 'Starlink', 534.00, 89.00, 6, 'months'),

    -- UNDERWAY EXPENSES (€4,860.00)
    (v_boat_id, 'underway_expenses', 'Captain cost to Nea Peramos', 3360.00, 40.00, 84, null),
    (v_boat_id, 'underway_expenses', 'Others', 1500.00, null, null, null);

end $$;
