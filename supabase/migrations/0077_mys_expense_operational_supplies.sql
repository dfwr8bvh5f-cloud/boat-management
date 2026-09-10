-- ============================================================================
-- Splits the "car" subcategory out of Bills into its own top-level MYS
-- expense category, "operational_supplies" (car & fuel, cleaning, tools,
-- office supplies) - these are general operational purchases (some of
-- which happen to be used on boats, e.g. cleaning supplies) rather than
-- recurring fixed utility bills (electricity/water/rent/phone), which stay
-- under Bills. The subcategory picklists themselves live in code
-- (src/lib/labels.ts), same as every other mys_expenses.subcategory value.
-- ============================================================================

alter type public.mys_expense_category add value if not exists 'operational_supplies';
