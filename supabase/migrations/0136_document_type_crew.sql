-- New document category "crew" (staff documents), offered in the boat
-- documents upload/edit dropdowns. Additive only: adds one enum value, no
-- existing value or row is touched. ALTER TYPE ... ADD VALUE cannot run
-- inside a transaction/DO block (see migration 0003's note) - must stay a
-- plain top-level statement. Must be applied manually.
alter type public.document_type add value if not exists 'crew';
