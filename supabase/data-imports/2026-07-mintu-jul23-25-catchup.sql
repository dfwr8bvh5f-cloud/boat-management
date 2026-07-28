-- ============================================================================
-- MINTU catch-up import: the 3 newest cash withdrawals and 10 newest
-- expenses (23-25 Jul 2026), found missing when cross-checking the app's
-- current exports (bank_3.csv / cash_4.csv / expenses_9.csv) against the
-- latest source PDFs (MINTU__Bank_Account_3.pdf, MINTU__Cash_Flow_2.pdf,
-- MINTU__Expenses_2.pdf). Bank deposits matched exactly, no changes there.
--
-- Per explicit instruction, this run deliberately EXCLUDES:
--   - The 6 rows with no date in the source sheet ("dry cleaning" EUR461,
--     "crew unifotms- 2 t shirts for captain" EUR140, 3x "traveling
--     expensess stwe- Rhodes to Athans" EUR35.10/27.03/87.97, "salary
--     stew- 16 days 9-24.6.26- eden" EUR2,680) - not added.
--   - The possible duplicate "5 Jun 2026 Super market... EUR370.00", which
--     appears twice in the source PDF but only once in the app - not
--     added (unresolved whether it's a real second transaction or a
--     rendering artifact).
--
-- notes is left as the real, user-facing text (matching every other row's
-- convention) rather than a technical marker - captains/owners see this
-- field in the app. Re-run safety instead matches on the exact row values
-- themselves (boat_id + date + description/amount, or boat_id + date +
-- amount + type for cash), the same approach the original mintu import
-- used for its own cash_transactions rows.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found (matched on lower(trim(name)) = ''mintu'') - check the exact boat name in the boats table and adjust this script before running it.';
  end if;

  delete from public.expenses where boat_id = v_boat_id and (expense_date, description, amount) in (
    ('2026-07-25', 'Super Market', 3.50),
    ('2026-07-24', 'Mooring fee Kalamata (Dimitris Kavodetis)', 50.00),
    ('2026-07-24', 'Laundry', 80.00),
    ('2026-07-24', 'Super Market', 46.42),
    ('2026-07-23', 'crew food (2 persons)', 60.80),
    ('2026-07-23', 'Super Market', 4.98),
    ('2026-07-23', 'DIESEL (320lit diesel (2/lit))', 640.00),
    ('2026-07-23', 'Gasoline for the tender (10lit gasoline (2/lit))', 20.00),
    ('2026-07-23', 'Mooring fee Kalamata (Dimitris Kavodetis)', 50.00),
    ('2026-07-23', 'Mooring fee Kalamata (Limeniko Tameio)', 168.52)
  );

  delete from public.cash_transactions where boat_id = v_boat_id and type = 'withdrawal' and notes = 'CARD - cash withdrawal from bank' and tx_date in ('2026-07-23', '2026-07-24', '2026-07-25');

  insert into public.expenses (boat_id, expense_date, description, category, payment_method, amount, paid_by, status) values
    (v_boat_id, '2026-07-25', 'Super Market', 'provisions', 'cash', 3.50, 'crew', 'approved'),
    (v_boat_id, '2026-07-24', 'Mooring fee Kalamata (Dimitris Kavodetis)', 'docking_out', 'cash', 50.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-24', 'Laundry', 'laundry_cleaning', 'cash', 80.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-24', 'Super Market', 'provisions', 'cash', 46.42, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'crew food (2 persons)', 'crew_food', 'cash', 60.80, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'Super Market', 'provisions', 'cash', 4.98, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'DIESEL (320lit diesel (2/lit))', 'diesel', 'card', 640.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'Gasoline for the tender (10lit gasoline (2/lit))', 'diesel', 'card', 20.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'Mooring fee Kalamata (Dimitris Kavodetis)', 'docking_out', 'cash', 50.00, 'crew', 'approved'),
    (v_boat_id, '2026-07-23', 'Mooring fee Kalamata (Limeniko Tameio)', 'docking_out', 'card', 168.52, 'crew', 'approved');

  insert into public.cash_transactions (boat_id, type, amount, tx_date, notes, status) values
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-23', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-24', 'CARD - cash withdrawal from bank', 'approved'),
    (v_boat_id, 'withdrawal', 2000.00, '2026-07-25', 'CARD - cash withdrawal from bank', 'approved');
end $$;
