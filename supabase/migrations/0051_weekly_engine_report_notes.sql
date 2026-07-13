-- Optional free-text notes at the bottom of the weekly engine/fuel report
-- (e.g. anything worth flagging that doesn't fit the hours/fuel fields) -
-- nullable, no effect on existing rows.
alter table public.weekly_engine_reports add column if not exists notes text;
