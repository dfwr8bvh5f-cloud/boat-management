-- ============================================================================
-- Budgets per year (MYS FLEET budget page: switch between 2025 / 2026 / 2027).
--
-- Until now budget_categories / budget_subcategories held ONE budget per boat
-- (implicitly "the current year"). This adds a `year` column to both:
--   * every existing row becomes 2026 (the current budget year) - nothing is
--     deleted or rewritten;
--   * budget_categories' primary key becomes (boat_id, category, year) so a
--     category can have a flat amount in each year;
--   * separate-budget categories (project_2027) are not tied to a calendar
--     year, so they use the sentinel year 0 ("no year").
--
-- ADDITIVE: no column is renamed or dropped, no row is deleted. Safe to
-- re-run. APPLY THIS BEFORE deploying the matching app code - the budget page
-- queries the new `year` column.
-- ============================================================================

alter table public.budget_categories
  add column if not exists year integer not null default 2026;

alter table public.budget_subcategories
  add column if not exists year integer not null default 2026;

-- Separate budget (not part of any year's annual budget) -> year 0.
update public.budget_categories set year = 0 where category = 'project_2027' and year <> 0;
update public.budget_subcategories set year = 0 where category = 'project_2027' and year <> 0;

alter table public.budget_categories drop constraint if exists budget_categories_pkey;
alter table public.budget_categories add primary key (boat_id, category, year);

create index if not exists budget_subcategories_boat_year_category_idx
  on public.budget_subcategories (boat_id, year, category);
