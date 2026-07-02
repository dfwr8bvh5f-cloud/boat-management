-- ============================================================================
-- ROGA LI - 2026 annual budget, transcribed from the uploaded PDF.
-- Run this ONCE in the Supabase SQL Editor (run twice = duplicate line items).
--
-- Assumes a boat named exactly 'ROGA LI' already exists. If your boat's name
-- is spelled differently, edit the name in the two `where name = 'ROGA LI'`
-- lines below before running.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where name = 'ROGA LI';
  if v_boat_id is null then
    raise exception 'No boat named ROGA LI found - fix the name and re-run';
  end if;

  -- ---- category totals (drives the progress bar even if subcategories change later) ----
  insert into public.budget_categories (boat_id, category, amount) values
    (v_boat_id, 'diesel', 12475.00),
    (v_boat_id, 'docking_out', 7400.00),
    (v_boat_id, 'base_docking', 12800.00),
    (v_boat_id, 'capital_expenses', 4340.00),
    (v_boat_id, 'formalities', 17176.00),
    (v_boat_id, 'laundry_cleaning', 1780.00),
    (v_boat_id, 'other', 1616.00),
    (v_boat_id, 'provisions', 12000.00),
    (v_boat_id, 'repairs', 9500.00),
    (v_boat_id, 'services', 17840.00),
    (v_boat_id, 'crew', 66500.00),
    (v_boat_id, 'management', 16800.00),
    (v_boat_id, 'crew_food', 3200.00),
    (v_boat_id, 'wifi_phone', 623.00),
    (v_boat_id, 'underway_expenses', 4000.00),
    (v_boat_id, 'company', 1820.00)
  on conflict (boat_id, category) do update set amount = excluded.amount, updated_at = now();

  -- ---- itemized subcategories (the actual line items from the PDF) ----
  insert into public.budget_subcategories (boat_id, category, name, amount) values
    -- DIESEL
    (v_boat_id, 'diesel', 'general use during the season', 5625.00),
    (v_boat_id, 'diesel', 'delivery to croatia', 1250.00),
    (v_boat_id, 'diesel', 'generator hours', 5600.00),
    -- DOCKING OUT
    (v_boat_id, 'docking_out', 'Greece', 4400.00),
    (v_boat_id, 'docking_out', 'Croatia', 3000.00),
    -- BASE DOCKING
    (v_boat_id, 'base_docking', 'Nea Peramos Marina', 12000.00),
    (v_boat_id, 'base_docking', 'electricity and water', 800.00),
    -- CAPITAL EXPENSES
    (v_boat_id, 'capital_expenses', 'New fan for saloon x2', 300.00),
    (v_boat_id, 'capital_expenses', 'London sticker', 20.00),
    (v_boat_id, 'capital_expenses', 'dinghy rogali sticker', 20.00),
    (v_boat_id, 'capital_expenses', 'new tender bases for dinghy', 3000.00),
    (v_boat_id, 'capital_expenses', 'uniforms for crew (stew)', 1000.00),
    -- FORMALITIES
    (v_boat_id, 'formalities', 'Insurance', 12730.00),
    (v_boat_id, 'formalities', 'TEPAI - greek tax', 1596.00),
    (v_boat_id, 'formalities', 'agent', 700.00),
    (v_boat_id, 'formalities', 'agent Croatia', 2000.00),
    (v_boat_id, 'formalities', 'radio-communication service', 150.00),
    -- LAUNDRY / CLEANING
    (v_boat_id, 'laundry_cleaning', 'cleaning service', 800.00),
    (v_boat_id, 'laundry_cleaning', 'cleaning materials', 500.00),
    (v_boat_id, 'laundry_cleaning', 'laundries', 480.00),
    -- OTHER
    (v_boat_id, 'other', 'storage fees', 1116.00),
    (v_boat_id, 'other', 'other expenses', 500.00),
    -- PROVISIONS
    (v_boat_id, 'provisions', 'boat provisions', 12000.00),
    -- REPAIRS
    (v_boat_id, 'repairs', 'up/down saloon table', 250.00),
    (v_boat_id, 'repairs', 'wiring of bottom port spreader light', 250.00),
    (v_boat_id, 'repairs', 'replace steaming light', 250.00),
    (v_boat_id, 'repairs', 'repair F/B island sink cover', 150.00),
    (v_boat_id, 'repairs', 'tenderlift awning repair', 50.00),
    (v_boat_id, 'repairs', 'bow awning repair middle connection ring', 50.00),
    (v_boat_id, 'repairs', 'gear repair', 8500.00),
    -- SERVICES
    (v_boat_id, 'services', 'engines service yearly', 1200.00),
    (v_boat_id, 'services', 'engines service (2x hour)', 1300.00),
    (v_boat_id, 'services', 'generator service yearly', 750.00),
    (v_boat_id, 'services', 'generator service (2x hour)', 950.00),
    (v_boat_id, 'services', 'water maker service', 550.00),
    (v_boat_id, 'services', 'anti fouling', 1800.00),
    (v_boat_id, 'services', 'polish wax', 1500.00),
    (v_boat_id, 'services', 'air condition full service', 400.00),
    (v_boat_id, 'services', 'sails washing', 1200.00),
    (v_boat_id, 'services', 'crane shipyard', 1500.00),
    (v_boat_id, 'services', 'stay in shipyard', 1990.00),
    (v_boat_id, 'services', 'zinc', 250.00),
    (v_boat_id, 'services', 'marina fees for crane', 500.00),
    (v_boat_id, 'services', 'rigging/ropes check', 450.00),
    (v_boat_id, 'services', 'dinghy and outboard service', 1200.00),
    (v_boat_id, 'services', 'water heater resistance service', 250.00),
    (v_boat_id, 'services', 'tenderlift service', 800.00),
    (v_boat_id, 'services', 'chain counter check/replace', 250.00),
    (v_boat_id, 'services', 'replace anchor chain connection', 50.00),
    (v_boat_id, 'services', 'silicon repairs around the boat', 150.00),
    (v_boat_id, 'services', 'annual service liferaft/fire extinguishers', 800.00),
    -- CREW
    (v_boat_id, 'crew', 'captain', 42000.00),
    (v_boat_id, 'crew', 'captain bonus', 3500.00),
    (v_boat_id, 'crew', 'stew', 18000.00),
    (v_boat_id, 'crew', 'stew bonus', 3000.00),
    -- MANAGEMENT
    (v_boat_id, 'management', 'management fees', 16800.00),
    -- CREW FOOD
    (v_boat_id, 'crew_food', 'crew food', 3200.00),
    -- WIFI / PHONE
    (v_boat_id, 'wifi_phone', 'Starlink', 623.00),
    -- UNDERWAY EXPENSES
    (v_boat_id, 'underway_expenses', 'captain cost to Nea Peramos', 2500.00),
    (v_boat_id, 'underway_expenses', 'others', 1500.00),
    -- COMPANY (accounting fees / rental fees left out - no finalized total in the PDF)
    (v_boat_id, 'company', 'bank commissions', 450.00),
    (v_boat_id, 'company', 'open balance until January', 1370.00);
end $$;
