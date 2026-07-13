-- ============================================================================
-- One-time data import: Roga Li's expenses for 02/07/2026-13/07/2026, from
-- ROGA__Expenses_2.pdf - the next batch after 2026-07-roga-li-expenses.sql
-- (or the equivalent script already run), which ended exactly on 02/07/2026.
-- DATA only, not a schema change. Safe to re-run: deletes any prior run of
-- this exact script (matched by boat_id + exact date/description/amount)
-- before re-inserting.
--
-- "PAID WITH ... PIRAEUS" in the source sheet is a single company bank
-- account name, not a separate payment method - mapped to plain
-- bank_transfer/card, same as the first Roga Li expenses import.
--
-- Row count: 34
-- Sum of amounts: EUR 6,978.33
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'roga li';
  if v_boat_id is null then
    raise exception 'Boat "Roga Li" not found (matched on lower(trim(name)) = ''roga li'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.expenses where boat_id = v_boat_id and (expense_date, description, amount) in (
    ('2026-07-13', 'accounting fees and rental fees- August 2025-March 2026', 1780.00),
    ('2026-07-13', 'payment for vat examption fees- accountant', 1425.00),
    ('2026-07-10', 'gouvia souper market', 10.39),
    ('2026-07-10', 'crew food', 26.50),
    ('2026-07-10', 'gouvia souper market', 113.57),
    ('2026-07-10', 'petrol 37.31 liters', 83.95),
    ('2026-07-09', 'gouvia souper market', 17.69),
    ('2026-07-09', 'JAMBO CORFU', 35.42),
    ('2026-07-08', 'corfu souper market', 14.13),
    ('2026-07-08', 'agent Croatia', 701.18),
    ('2026-07-08', 'petros flight athens and back', 192.42),
    ('2026-07-07', 'SKIPPER fees julay part cash', 142.20),
    ('2026-07-07', 'SKIPPER fees julay part marina dubrovnic', 732.80),
    ('2026-07-07', 'wine bottle covers 2 packs', 24.07),
    ('2026-07-06', 'souper market', 13.84),
    ('2026-07-06', 'washin machine cleaner Bosch x3', 33.05),
    ('2026-07-06', 'interior', 14.45),
    ('2026-07-06', 'interior', 17.50),
    ('2026-07-06', 'souper market', 51.19),
    ('2026-07-06', 'bakery', 2.50),
    ('2026-07-06', 'samantha food', 37.00),
    ('2026-07-05', 'uber dubrovnic', 20.00),
    ('2026-07-04', 'souper market', 11.35),
    ('2026-07-03', 'boaz and ruth pizza', 30.00),
    ('2026-07-03', 'show tickets x2 A Three Musketeers tale', 105.50),
    ('2026-07-03', '4 hats- 2 black, i yellow, 1 orange', 89.60),
    ('2026-07-03', 'glasses - sarris', 48.85),
    ('2026-07-03', 'gas bottle for go pure soda system', 8.84),
    ('2026-07-03', 'Running Armband lululemon', 35.00),
    ('2026-07-03', 'Miele Powerdisk for dishwasher 6pcs', 73.50),
    ('2026-07-02', 'souper market', 58.44),
    ('2026-07-02', 'crew food', 38.00),
    ('2026-07-02', 'petrol 42.5 liter', 65.45),
    ('2026-07-02', 'diesel 600.62 litres', 924.95)
  );

  -- A few same-day/same-description rows ("gouvia souper market", "interior",
  -- "souper market") are distinct real transactions in the source PDF, each
  -- with a different amount - the (date, description, amount) tuple above
  -- still identifies each one uniquely.
  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status, notes) values
    (v_boat_id, '2026-07-13', 'accounting fees and rental fees- August 2025-March 2026', 'company', 'other', 1780.00, 'crew', 'approved', 'paid from old account of SEA YAM'),
    (v_boat_id, '2026-07-13', 'payment for vat examption fees- accountant', 'company', 'bank_transfer', 1425.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-10', 'gouvia souper market', 'provisions', 'card', 10.39, 'crew', 'approved', null),
    (v_boat_id, '2026-07-10', 'crew food', 'crew_food', 'card', 26.50, 'crew', 'approved', null),
    (v_boat_id, '2026-07-10', 'gouvia souper market', 'provisions', 'card', 113.57, 'crew', 'approved', null),
    (v_boat_id, '2026-07-10', 'petrol 37.31 liters', 'diesel', 'card', 83.95, 'crew', 'approved', null),
    (v_boat_id, '2026-07-09', 'gouvia souper market', 'provisions', 'cash', 17.69, 'crew', 'approved', null),
    (v_boat_id, '2026-07-09', 'JAMBO CORFU', 'provisions', 'cash', 35.42, 'crew', 'approved', null),
    (v_boat_id, '2026-07-08', 'corfu souper market', 'provisions', 'card', 14.13, 'crew', 'approved', null),
    (v_boat_id, '2026-07-08', 'agent Croatia', 'formalities', 'bank_transfer', 701.18, 'crew', 'approved', null),
    (v_boat_id, '2026-07-08', 'petros flight athens and back', 'underway_expenses', 'cash', 192.42, 'crew', 'approved', null),
    (v_boat_id, '2026-07-07', 'SKIPPER fees julay part cash', 'crew', 'cash', 142.20, 'crew', 'approved', null),
    (v_boat_id, '2026-07-07', 'SKIPPER fees julay part marina dubrovnic', 'crew', 'card', 732.80, 'crew', 'approved', null),
    (v_boat_id, '2026-07-07', 'wine bottle covers 2 packs', 'capital_expenses', 'card', 24.07, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'souper market', 'provisions', 'card', 13.84, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'washin machine cleaner Bosch x3', 'services', 'card', 33.05, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'interior', 'capital_expenses', 'card', 14.45, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'interior', 'capital_expenses', 'card', 17.50, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'souper market', 'provisions', 'card', 51.19, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'bakery', 'provisions', 'card', 2.50, 'crew', 'approved', null),
    (v_boat_id, '2026-07-06', 'samantha food', 'crew_food', 'cash', 37.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-05', 'uber dubrovnic', 'underway_expenses', 'cash', 20.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-04', 'souper market', 'provisions', 'card', 11.35, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'boaz and ruth pizza', 'provisions', 'card', 30.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'show tickets x2 A Three Musketeers tale', 'capital_expenses', 'card', 105.50, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', '4 hats- 2 black, i yellow, 1 orange', 'capital_expenses', 'card', 89.60, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'glasses - sarris', 'capital_expenses', 'bank_transfer', 48.85, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'gas bottle for go pure soda system', 'provisions', 'bank_transfer', 8.84, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'Running Armband lululemon', 'capital_expenses', 'card', 35.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-03', 'Miele Powerdisk for dishwasher 6pcs', 'underway_expenses', 'card', 73.50, 'crew', 'approved', null),
    (v_boat_id, '2026-07-02', 'souper market', 'provisions', 'card', 58.44, 'crew', 'approved', null),
    (v_boat_id, '2026-07-02', 'crew food', 'crew_food', 'card', 38.00, 'crew', 'approved', null),
    (v_boat_id, '2026-07-02', 'petrol 42.5 liter', 'diesel', 'card', 65.45, 'crew', 'approved', null),
    (v_boat_id, '2026-07-02', 'diesel 600.62 litres', 'diesel', 'card', 924.95, 'crew', 'approved', null);
end $$;
