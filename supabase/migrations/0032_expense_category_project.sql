-- Two extra expense categories, shown only for Lulu (the app hides them
-- for every other boat, but the enum values are global by nature).
alter type public.expense_category add value if not exists 'project_boat_cost';
alter type public.expense_category add value if not exists 'project';
