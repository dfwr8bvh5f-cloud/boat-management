-- Optional free-text notes on a document (e.g. "renewal submitted, waiting
-- on the port authority" or "copy kept with the captain") - nullable, no
-- effect on existing rows.
alter table public.documents add column if not exists notes text;
