-- ============================================================================
-- Adds a subcategory to boat expenses, same shape as mys_expenses.subcategory
-- (see 0076_mys_expense_categories_and_boat_payment.sql): free text, no
-- enum/FK/check constraint - the picklist itself lives in code
-- (EXPENSE_SUBCATEGORIES_BY_CATEGORY, src/lib/labels.ts), keyed per
-- category. Only "owner_trip" has a picklist for now (Guest F&B, Fuel,
-- Misc., Marina Berth, Guest Transportation, Guest Other - requested
-- directly from a Seazone APA report's own expense subcategories), every
-- other category has none, same as mys_expenses' own salaries/boat_payment/
-- other categories having none.
-- ============================================================================

alter table public.expenses
  add column if not exists subcategory text;
