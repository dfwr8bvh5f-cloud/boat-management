-- ============================================================================
-- One-time data import: Stephanie's 2026 budget, from "STEPHANIE 2026
-- Budget.pdf". This is DATA (budget rows for one boat), not a schema change -
-- safe to run directly, and safe to re-run (it clears just Stephanie's
-- existing rows for the categories touched here before inserting, so running
-- it twice won't create duplicates).
--
-- IMPORTANT: run migration 0037_expense_category_blue_water.sql FIRST, and
-- let it finish/commit before running this script - Postgres won't let a new
-- enum value be used in the same transaction it was added in.
--
-- Categories with real line items become budget_subcategories (so the
-- Budget page shows the same rate x duration breakdown as the PDF).
-- Categories with only a single total become a flat budget_categories row.
--
-- NOT included - the PDF didn't give a clear number, so nothing was
-- fabricated:
--   - owner_trip (the "OWNER TRIP" section header is in the PDF, but every
--     row under it is blank)
--
-- DECISIONS WORTH DOUBLE-CHECKING:
--   - "bank commisions" (€450) was listed inside the COMPANY section, but
--     COMPANY's own stated header total (€48,857.00) only balances against
--     its own line items when bank commisions is EXCLUDED (48,857 + 450 =
--     49,307, not 48,857). Moved that €450 to the app's existing "Bank
--     fees" category instead, which is exactly what it is.
--   - "blue_water" is a new category (see the migration above), used only
--     for Stephanie, matching how "Blue Water" mooring fees are tracked
--     separately from "Base Docking" in both this budget and her expense
--     sheet.
--   - CREW's "stew- extra 2027- to be paid" (€1,400) is included as given -
--     it's part of the section's own stated €94,500 total - but it's
--     labeled 2027 inside a 2026 budget sheet, worth confirming that's
--     intentional.
--   - A few line items had no amount filled in at all in the source sheet
--     (e.g. "Change tender floor to flexiteek" under Capital Expenses,
--     "STBD engine room electric leak check" and "Gangway reinforcement/
--     stair" under Repairs, "Drive shafts service" under Services, "FMI-
--     NAT- winter" under Company) - included as €0 placeholder rows so
--     they're visible in the app and easy to fill in later, not silently
--     dropped.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'stephanie';
  if v_boat_id is null then
    raise exception 'Boat "Stephanie" not found (matched on lower(trim(name)) = ''stephanie'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  -- Flat categories (single total, no line-item breakdown)
  delete from public.budget_subcategories where boat_id = v_boat_id and category in ('diesel', 'bank_fees', 'blue_water');
  insert into public.budget_categories (boat_id, category, amount) values
    (v_boat_id, 'diesel', 0.00),
    (v_boat_id, 'bank_fees', 450.00),
    (v_boat_id, 'blue_water', 15000.00)
  on conflict (boat_id, category) do update set amount = excluded.amount;

  -- Categories with line-item detail become subcategories
  delete from public.budget_subcategories where boat_id = v_boat_id and category in (
    'docking_out', 'base_docking', 'capital_expenses', 'formalities', 'laundry_cleaning', 'other',
    'provisions', 'repairs', 'services', 'crew', 'management', 'crew_food', 'wifi_phone',
    'underway_expenses', 'company'
  );

  insert into public.budget_subcategories (boat_id, category, name, amount, rate, duration, duration_unit) values
    -- DOCKING OUT (€4,000.00)
    (v_boat_id, 'docking_out', 'Docking out', 4000.00, 200.00, 20, 'nights'),

    -- BASE DOCKING (€16,472.00)
    (v_boat_id, 'base_docking', 'Nea Peramos Marina', 15672.00, 1306.00, 12, 'months'),
    (v_boat_id, 'base_docking', 'Electricity and water', 800.00, null, null, null),

    -- CAPITAL EXPENSES (€10,900.00)
    (v_boat_id, 'capital_expenses', 'Order new fenders + covers', 1450.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'Toping lift/boom sheet replace', 1000.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'Mast Light (10-30VDC) BLUE', 500.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'Deck shower aft new', 450.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'Change tender floor to flexiteek', 0.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'New speakers', 600.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'Replacement of the waterline vinyl film', 1800.00, null, null, null),
    (v_boat_id, 'capital_expenses', 'New anchor winch', 5100.00, null, null, null),

    -- FORMALITIES (€20,156.00)
    (v_boat_id, 'formalities', 'Insurance', 17998.00, null, null, null),
    (v_boat_id, 'formalities', 'TEPAI - Greek tax', 1308.00, 109.00, 12, 'months'),
    (v_boat_id, 'formalities', 'Agent', 700.00, null, null, null),
    (v_boat_id, 'formalities', 'Radio communication service', 150.00, null, null, null),

    -- LAUNDRY / CLEANING (€12,100.00)
    (v_boat_id, 'laundry_cleaning', 'Cleaning service', 6500.00, 500.00, 13, null),
    (v_boat_id, 'laundry_cleaning', 'Cleaning materials', 500.00, null, null, null),
    (v_boat_id, 'laundry_cleaning', 'Laundries', 5100.00, 300.00, 17, null),

    -- OTHER (€4,000.00)
    (v_boat_id, 'other', 'Tips', 500.00, null, null, null),
    (v_boat_id, 'other', 'Boat show', 2000.00, null, null, null),
    (v_boat_id, 'other', 'Other expenses', 1500.00, null, null, null),

    -- PROVISIONS (€12,350.00)
    (v_boat_id, 'provisions', 'Boat provisions', 10000.00, null, null, null),
    (v_boat_id, 'provisions', 'Boat show provisions', 1500.00, null, null, null),
    (v_boat_id, 'provisions', 'Flowers', 850.00, 50.00, 17, null),

    -- REPAIRS (€3,100.00)
    (v_boat_id, 'repairs', 'Tender cover repairs', 100.00, null, null, null),
    (v_boat_id, 'repairs', 'STBD engine room electric leak check', 0.00, null, null, null),
    (v_boat_id, 'repairs', 'Electrician for wiring NAVTEX', 300.00, null, null, null),
    (v_boat_id, 'repairs', 'Repairs on corian FB+Galley', 600.00, null, null, null),
    (v_boat_id, 'repairs', 'Installation of electric furler', 1200.00, null, null, null),
    (v_boat_id, 'repairs', 'Gangway reinforcement/ stair', 0.00, null, null, null),
    (v_boat_id, 'repairs', 'Door from sallon to bow needs repairs', 400.00, null, null, null),
    (v_boat_id, 'repairs', 'Gangway hydraulics repairs', 500.00, null, null, null),

    -- SERVICES (€23,770.00)
    (v_boat_id, 'services', 'Engines service yearly', 3000.00, null, null, null),
    (v_boat_id, 'services', 'Engines service hour2x', 1200.00, null, null, null),
    (v_boat_id, 'services', 'Generator service yearly', 800.00, null, null, null),
    (v_boat_id, 'services', 'Generator service hour2x', 600.00, null, null, null),
    (v_boat_id, 'services', 'Water maker service', 550.00, null, null, null),
    (v_boat_id, 'services', 'Anti fouling', 2000.00, null, null, null),
    (v_boat_id, 'services', 'Polish wax', 1200.00, null, null, null),
    (v_boat_id, 'services', 'Air condition full service', 770.00, null, null, null),
    (v_boat_id, 'services', 'Sails washing', 800.00, null, null, null),
    (v_boat_id, 'services', 'Crane shipyard', 3500.00, null, null, null),
    (v_boat_id, 'services', 'Stay in shipyard', 1350.00, null, null, null),
    (v_boat_id, 'services', 'Rigging/ropes check', 1350.00, null, null, null),
    (v_boat_id, 'services', 'Dinghy and outboard service', 1000.00, null, null, null),
    (v_boat_id, 'services', 'Tenderlift service', 700.00, null, null, null),
    (v_boat_id, 'services', 'Thrusters service', 500.00, null, null, null),
    (v_boat_id, 'services', 'Boiler service', 500.00, null, null, null),
    (v_boat_id, 'services', 'Rudders service', 350.00, null, null, null),
    (v_boat_id, 'services', 'Chain counter check replace', 250.00, null, null, null),
    (v_boat_id, 'services', 'Replace anchor chain connection', 200.00, null, null, null),
    (v_boat_id, 'services', 'Tender fuel tank overflowing', 200.00, null, null, null),
    (v_boat_id, 'services', 'Installation of gopure filters', 1400.00, null, null, null),
    (v_boat_id, 'services', 'Drive shafts service (warranty)', 0.00, null, null, null),
    (v_boat_id, 'services', 'Change flotters', 500.00, null, null, null),
    (v_boat_id, 'services', 'Service radio communication system', 300.00, null, null, null),
    (v_boat_id, 'services', 'Annual service liferaft-fire extinguishers', 750.00, null, null, null),

    -- CREW (€94,500.00)
    (v_boat_id, 'crew', 'Captain', 44400.00, 3700.00, 12, 'months'),
    (v_boat_id, 'crew', 'Deckhand', 14000.00, 2000.00, 7, 'months'),
    (v_boat_id, 'crew', 'Deckhand - winter', 2500.00, 500.00, 5, 'months'),
    (v_boat_id, 'crew', 'Stew', 14700.00, 2100.00, 7, 'months'),
    (v_boat_id, 'crew', 'Stew - extra 2027 (to be paid)', 1400.00, 200.00, 7, 'months'),
    (v_boat_id, 'crew', 'Chef', 17500.00, 2500.00, 7, 'months'),

    -- MANAGEMENT (€18,600.00)
    (v_boat_id, 'management', 'Management fees', 18600.00, 1550.00, 12, 'months'),

    -- CREW FOOD (€1,500.00)
    (v_boat_id, 'crew_food', 'Crew food', 1500.00, null, null, null),

    -- WIFI / PHONE (€623.00)
    (v_boat_id, 'wifi_phone', 'Starlink', 623.00, 89.00, 7, 'months'),

    -- UNDERWAY EXPENSES (€3,050.00)
    (v_boat_id, 'underway_expenses', 'Captain cost to Nea Peramos', 450.00, 15.00, 30, null),
    (v_boat_id, 'underway_expenses', 'Corinth canal', 1100.00, 550.00, 2, null),
    (v_boat_id, 'underway_expenses', 'Others - owner use', 1500.00, null, null, null),

    -- COMPANY (€48,857.00 - excludes "bank commisions", moved to Bank fees above)
    (v_boat_id, 'company', 'Accounting fees', 2976.00, 248.00, 12, 'months'),
    (v_boat_id, 'company', 'Rental fees', 600.00, 50.00, 12, 'months'),
    (v_boat_id, 'company', 'Payroll fees', 360.00, 30.00, 12, 'months'),
    (v_boat_id, 'company', 'NAT - summer', 11431.00, 1633.00, 7, 'months'),
    (v_boat_id, 'company', 'NAT - winter', 2500.00, 500.00, 5, 'months'),
    (v_boat_id, 'company', 'FMI-NAT - summer', 5950.00, 850.00, 7, 'months'),
    (v_boat_id, 'company', 'FMI-NAT - winter', 0.00, null, 5, 'months'),
    (v_boat_id, 'company', 'FMI-EFKA - summer', 140.00, 20.00, 7, 'months'),
    (v_boat_id, 'company', 'EFKA', 2450.00, 350.00, 7, 'months'),
    (v_boat_id, 'company', 'Invoicing software', 150.00, null, null, null),
    (v_boat_id, 'company', 'Other taxes', 1500.00, null, null, null),
    (v_boat_id, 'company', 'VAT', 20000.00, null, null, null),
    (v_boat_id, 'company', 'EFKA bonus', 800.00, null, null, null);

end $$;
