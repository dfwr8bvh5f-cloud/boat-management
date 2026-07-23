-- ============================================================================
-- A charter future-income row's MYBA contract needs to support more than one
-- file (extra pages, an addendum, a signed appendix). `incomes.contract_document_id`
-- only ever pointed at a single documents row, mirroring how `documents.booking_id`
-- already lets many document rows attach to one booking. Adding the same
-- shaped `income_id` column lets many document rows attach to one income row
-- the same way - no RLS changes needed, since documents_select/insert/update/
-- delete (0007) and documents_storage_select (0007) key off boat_id + status
-- only, never booking_id, so they already cover income_id rows unchanged.
-- `contract_document_id` stays as-is for backward compatibility with rows
-- created before this migration.
-- ============================================================================

alter table public.documents
  add column if not exists income_id uuid references public.incomes (id) on delete set null;

create index if not exists documents_income_id_idx on public.documents (income_id);
