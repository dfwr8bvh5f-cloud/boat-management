-- Adds "Boat Shows" as its own top-level MYS expense category - company-
-- level marketing/exhibition costs (attending or exhibiting at a boat show),
-- distinct from any specific boat's own expenses. No subcategory picklist,
-- same as salaries/boat_payment/other.
alter type public.mys_expense_category add value if not exists 'boat_shows';
