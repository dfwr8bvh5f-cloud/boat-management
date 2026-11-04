-- Removes MINTU's 2025 "Crew food" budget (EUR 500.00) - the category was not
-- used in 2025. DATA only, no schema change. No expenses are touched (the
-- sheet had no 2025 actual for this category). Safe to re-run.
delete from public.budget_categories
where boat_id = (select id from public.boats where lower(trim(name)) = 'mintu')
  and year = 2025 and category = 'crew_food';

delete from public.budget_subcategories
where boat_id = (select id from public.boats where lower(trim(name)) = 'mintu')
  and year = 2025 and category = 'crew_food';

-- Check: should return 14 rows / 146201.00
select count(*), sum(amount) from public.budget_categories
where boat_id = (select id from public.boats where lower(trim(name)) = 'mintu') and year = 2025;
