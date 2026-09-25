-- ============================================================================
-- Lets her attach more than one "invoice I issued" file to a supplier
-- commission (mys_supplier_commissions.commission_invoice_path was a single
-- text column - only ever one file). Reuses the existing
-- mys_supplier_commission_attachments table (already one-to-many, already
-- storing the supplier's own invoice files) instead of a second dedicated
-- table, distinguishing the two purposes with a new `kind` column.
--
-- Every already-attached single-file commission_invoice_path is backfilled
-- into this same table as its own 'issued'-kind row, so nothing uploaded
-- before this change goes missing. commission_invoice_path itself is left
-- in place (not dropped) - the app stops writing to it going forward, but
-- existing data stays untouched.
-- ============================================================================

alter table public.mys_supplier_commission_attachments
  add column if not exists kind text not null default 'supplier' check (kind in ('supplier', 'issued'));

insert into public.mys_supplier_commission_attachments (commission_id, file_path, kind, created_by)
select id, commission_invoice_path, 'issued', created_by
from public.mys_supplier_commissions
where commission_invoice_path is not null;
