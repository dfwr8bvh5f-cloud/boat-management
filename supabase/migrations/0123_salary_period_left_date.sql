-- A partial-month salary_periods row ("left during the month") now records
-- the actual last working day instead of her typing a raw day-count - the
-- day count (days_worked, still stored for display/prorating) is derived
-- from this date so every day of the week counts equally (no weekday vs.
-- weekend distinction, matching how days_in_month/proration already work).
alter table public.salary_periods add column if not exists left_date date;
