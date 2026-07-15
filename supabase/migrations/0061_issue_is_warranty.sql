-- "Warranty" used to be one of the five issue classifications. It's now a
-- standalone flag (like expenses.is_warranty) so an issue can be, say, a
-- "repair" that also happens to be under warranty, instead of one or the
-- other. The old 'warranty' enum value is left alone (existing rows keep
-- displaying correctly) - just no longer offered in the app's dropdown.
alter table public.issues add column if not exists is_warranty boolean not null default false;

-- Carry the existing signal forward once, non-destructively: any issue that
-- was classified as warranty becomes flagged as warranty going forward.
update public.issues set is_warranty = true where classification = 'warranty';
