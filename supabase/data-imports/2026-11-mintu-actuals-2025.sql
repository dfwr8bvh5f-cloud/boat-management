-- ============================================================================
-- OPTIONAL data import: MINTU's 2025 ACTUAL spend per category, from
-- "MINTU - 2026 Budget 2.pdf" (its "2025 EXPENSES" column).
--
-- READ BEFORE RUNNING. The sheet only has ONE TOTAL PER CATEGORY - not the
-- individual transactions. The app has no place for yearly category totals
-- other than the expenses table, so this inserts ONE SUMMARY EXPENSE per
-- category (14 rows; CREW FOOD is blank in the sheet and is skipped, not
-- entered as 0), each clearly marked in its description. They are NOT real
-- transactions and their date is a placeholder (2025-12-31):
--   * approved, payment_method 'other' and paid_by 'crew', so they do NOT
--     affect bank/cash balances and create no MYS debt;
--   * they DO count in the 2025 budget page's "Actual" and in 2025 expense
--     reports/lists, and will show in MINTU's expense list;
--   * replace them with the real 2025 transactions if those are ever entered
--     (delete via the marker in the description).
-- Sheet total: EUR 152,862.64 (matches the 14 amounts below).
-- Re-runnable: removes previously imported summary rows first.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(trim(name)) = 'mintu';
  if v_boat_id is null then
    raise exception 'Boat "Mintu" not found - check the exact boat name and adjust before running.';
  end if;

  delete from public.expenses where boat_id = v_boat_id and description like '2025 actual total (summary)%';

  insert into public.expenses (boat_id, description, amount, category, payment_method, paid_by, expense_date, status, approved_at)
  select v_boat_id, '2025 actual total (summary) - ' || v.label, v.amount, v.category::public.expense_category,
         'other', 'crew', date '2025-12-31', 'approved', now()
  from (values
    ('diesel',            'Diesel',            6384.44),
    ('docking_out',       'Docking out',        741.30),
    ('base_docking',      'Base docking',     13550.00),
    ('capital_expenses',  'Capital expenses', 15471.14),
    ('formalities',       'Formalities',      10765.82),
    ('laundry_cleaning',  'Laundry / cleaning', 1969.14),
    ('other',             'Other',             1094.30),
    ('provisions',        'Provisions',        5805.10),
    ('repairs',           'Repairs',           8932.50),
    ('services',          'Services',         23350.51),
    ('crew',              'Crew',             47910.00),
    ('management',        'Management',       12000.00),
    ('wifi_phone',        'WiFi / phone',       747.00),
    ('underway_expenses', 'Underway expenses',  4141.39)
  ) as v(category, label, amount);
end $$;

-- Check: should return 14 rows / 152862.64
select count(*), sum(amount) from public.expenses
where boat_id = (select id from public.boats where lower(trim(name)) = 'mintu')
  and description like '2025 actual total (summary)%';
