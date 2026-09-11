-- Adds "Travel" as its own top-level MYS expense category - company-level
-- travel costs (flights, hotels, transport for business trips), distinct
-- from any specific boat's own owner_trip/underway_expenses categories.
-- No subcategory picklist, same as salaries/boat_payment/boat_shows/other.
alter type public.mys_expense_category add value if not exists 'travel';
