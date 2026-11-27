-- New document categories "vessel" (registration, licences, Open sea
-- certificate, survey certificates) and "contract" (general contracts:
-- marina, suppliers, ...), offered in the boat documents upload/edit
-- dropdowns. Additive only: adds two enum values, no existing value or row
-- is touched. ALTER TYPE ... ADD VALUE cannot run inside a transaction/DO
-- block (see migration 0003's note) - must stay plain top-level statements,
-- and the new values cannot be used until this has been committed, which is
-- why existing rows are re-categorised separately in 0138 (run 0137 first).
-- Must be applied manually.
alter type public.document_type add value if not exists 'vessel';
alter type public.document_type add value if not exists 'contract';
