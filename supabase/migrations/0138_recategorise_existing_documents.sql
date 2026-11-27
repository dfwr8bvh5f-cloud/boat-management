-- Re-categorise existing documents into the reworked category set.
-- REQUIRES 0137 to have been applied (and committed) first.
--
-- Only data that maps unambiguously is moved; nothing is deleted and no
-- schema changes. Rows are matched on doc_type (and name where noted), never
-- guessed:
--   * charter_license / license / registration (old "sailing licence",
--     "registration certificate" and charter licence options)  -> vessel
--   * company_docs whose name is the "Open sea certificate"   -> vessel
-- Left untouched on purpose:
--   * company_docs (E-mitroo, other company papers) - label is now
--     "Company & regulatory" so the value stays as is
--   * bank - label is now "Finance", value stays as is
--   * myba_contract / invoice - auto-created and looked up by the
--     bookings / future-income flows, which depend on these values
--   * insurance, crew, safety, other
-- Must be applied manually.

update public.documents
   set doc_type = 'vessel'
 where doc_type in ('charter_license', 'license', 'registration');

update public.documents
   set doc_type = 'vessel'
 where doc_type = 'company_docs'
   and name ilike '%open sea%';
