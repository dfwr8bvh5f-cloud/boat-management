-- Office/management staff (mys_staff) had no employment start date at all,
-- unlike boat crew (staff.start_date) - added so it can be shown/edited
-- from the Salaries page the same way for both.
alter table public.mys_staff add column if not exists start_date date;
