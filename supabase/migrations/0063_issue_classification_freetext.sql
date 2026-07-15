-- Classification used to be a fixed enum (capital/maintenance/repair/
-- service/warranty). The form now offers those same four as presets plus
-- an "Other" option that reveals a free-text box - widening the column to
-- plain text lets it store either. All existing values are preserved
-- exactly (an enum value converts to the identical string).
alter table public.issues alter column classification type text using classification::text;
alter table public.issues alter column classification drop default;
