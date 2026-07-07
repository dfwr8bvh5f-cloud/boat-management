-- ============================================================================
-- One-time data import: LULU's 2026 budget, from the "LULU 2026 Budget.pdf"
-- document. This is DATA (budget rows for one boat), not a schema change -
-- safe to run directly, and safe to re-run (it clears just LULU's existing
-- rows for the categories touched here before inserting, so running it
-- twice won't create duplicates).
--
-- Categories with real line items become budget_subcategories (so the
-- Budget page shows the same rate x duration breakdown as the PDF).
-- Categories with only a single total in the PDF (no line items filled in)
-- become a flat budget_categories row instead.
--
-- NOT included - the PDF didn't give a clear number for these, so nothing
-- was fabricated:
--   - lpg, bank_fees, boat_show (boat_show's own €1,500 is already folded
--     into "other"'s €2,500 total in the PDF, not broken out separately)
--   - project, project_boat_cost (rows present in the PDF but left blank)
--   - three trailing rows after "company" (company annual tax €800,
--     invoicing software €150, liferaft service €1,000) - they come right
--     after company's own total and aren't included in it (2,976 + 600 +
--     19,596 + 9,600 = 32,772 exactly, with no room for these three), but
--     the category they actually belong to isn't clear from the PDF layout.
--
-- ONE DISCREPANCY IN THE SOURCE PDF ITSELF, flagged rather than guessed:
--   DIESEL's own header says €3,000.00, but its three listed line items
--   (tender diesel, boat diesel, owner use) only add up to €1,900.00 - a
--   €1,100 gap with no fourth line shown. Used the header's €3,000 as a
--   flat amount rather than the incomplete line items, but this is worth
--   double-checking against the original spreadsheet.
-- ============================================================================

do $$
declare
  v_boat_id uuid := '03d69090-8859-455b-adb9-4e1c909b6786'; -- LULU
begin

  -- Flat categories (PDF gave only a single total, no line items)
  delete from public.budget_subcategories where boat_id = v_boat_id and category in ('diesel', 'capital_expenses', 'repairs', 'owner_trip');
  insert into public.budget_categories (boat_id, category, amount) values
    (v_boat_id, 'diesel', 3000.00),
    (v_boat_id, 'capital_expenses', 15000.00),
    (v_boat_id, 'repairs', 10000.00),
    (v_boat_id, 'owner_trip', 10000.00)
  on conflict (boat_id, category) do update set amount = excluded.amount;

  -- Categories with line-item detail become subcategories (flat amount stays 0 / ignored once subcategories exist)
  delete from public.budget_subcategories where boat_id = v_boat_id and category in (
    'docking_out', 'base_docking', 'formalities', 'laundry_cleaning', 'other', 'provisions',
    'services', 'crew', 'management', 'crew_food', 'wifi_phone', 'underway_expenses', 'company'
  );

  insert into public.budget_subcategories (boat_id, category, name, amount, rate, duration, duration_unit) values
    -- DOCKING OUT (€5,000.00)
    (v_boat_id, 'docking_out', 'Docking out', 5000.00, 200.00, 25, 'nights'),

    -- BASE DOCKING (€15,500.00)
    (v_boat_id, 'base_docking', 'Nea Peramos marina', 15000.00, 1250.00, 12, 'months'),
    (v_boat_id, 'base_docking', 'Electricity and water', 500.00, null, null, null),

    -- FORMALITIES (€14,946.45)
    (v_boat_id, 'formalities', 'Insurance', 12350.45, null, null, null),
    (v_boat_id, 'formalities', 'TEPAI - Greek tax', 1596.00, 133.00, 12, 'months'),
    (v_boat_id, 'formalities', 'Agent', 1000.00, null, null, null),

    -- LAUNDRY / CLEANING (€14,500.00)
    (v_boat_id, 'laundry_cleaning', 'Cleaning service', 7500.00, 500.00, 15, null),
    (v_boat_id, 'laundry_cleaning', 'Cleaning materials', 1000.00, null, null, null),
    (v_boat_id, 'laundry_cleaning', 'Laundries', 6000.00, 400.00, 15, null),

    -- OTHER (€2,500.00)
    (v_boat_id, 'other', 'Boat show', 1500.00, null, null, null),
    (v_boat_id, 'other', 'Other expenses', 1000.00, null, null, null),

    -- PROVISIONS (€12,850.00)
    (v_boat_id, 'provisions', 'Owner use', 12000.00, 3000.00, 4, null),
    (v_boat_id, 'provisions', 'Flowers', 850.00, 50.00, 17, null),

    -- SERVICES (€15,340.00)
    (v_boat_id, 'services', 'Engines service yearly', 1200.00, null, null, null),
    (v_boat_id, 'services', 'Engines service hour2x', 1300.00, null, null, null),
    (v_boat_id, 'services', 'Generator service yearly', 750.00, null, null, null),
    (v_boat_id, 'services', 'Generator service hour2x', 950.00, null, null, null),
    (v_boat_id, 'services', 'Water maker service', 550.00, null, null, null),
    (v_boat_id, 'services', 'Shipyard', 10590.00, null, null, null),

    -- CREW (€80,500.00)
    (v_boat_id, 'crew', 'Captain', 42000.00, 3500.00, 12, 'months'),
    (v_boat_id, 'crew', 'Chef', 21000.00, 3000.00, 7, 'months'),
    (v_boat_id, 'crew', 'Stew', 17500.00, 2500.00, 7, 'months'),

    -- MANAGEMENT (€18,000.00)
    (v_boat_id, 'management', 'Management fees', 18000.00, 1500.00, 12, 'months'),

    -- CREW FOOD (€3,300.00)
    (v_boat_id, 'crew_food', 'Crew food', 3300.00, 60.00, 55, null),

    -- WIFI / PHONE (€623.00)
    (v_boat_id, 'wifi_phone', 'Starlink', 623.00, 89.00, 7, 'months'),

    -- UNDERWAY EXPENSES (€4,500.00)
    (v_boat_id, 'underway_expenses', 'Captain traveling cost to Nea Peramos', 3000.00, 30.00, 100, null),
    (v_boat_id, 'underway_expenses', 'Others', 1500.00, null, null, null),

    -- COMPANY (€32,772.00)
    (v_boat_id, 'company', 'Accounting fees', 2976.00, 248.00, 12, 'months'),
    (v_boat_id, 'company', 'Rental fees', 600.00, 50.00, 12, 'months'),
    (v_boat_id, 'company', 'NAT', 19596.00, 1633.00, 12, 'months'),
    (v_boat_id, 'company', 'FMI', 9600.00, 800.00, 12, 'months');

end $$;
