-- Area used to be a fixed enum (interior/exterior/technical/equipment).
-- The form now offers those same four as presets plus an "Other" option
-- that reveals a free-text box - widening the column to plain text lets it
-- store either, same treatment as classification in migration 0063.
alter table public.issues alter column area type text using area::text;
alter table public.issues alter column area drop default;
