-- ============================================================================
-- A manually-created invoice's line items now carry a real quantity/unit
-- price breakdown (product/service, quantity, price, line total) instead of
-- just a single typed amount - matching how she wants /mys/invoices'
-- creation form to work (see createMysInvoice, src/lib/actions/mys.ts).
-- amount stays the authoritative line subtotal (quantity * unit_price,
-- always recomputed server-side, never trusted from the client) - existing
-- debt-combined lines (createMysInvoiceFromDebts) keep working exactly as
-- before, with quantity defaulted to 1 and unit_price backfilled to match
-- their existing amount.
-- ============================================================================

alter table public.mys_invoice_lines
  add column if not exists quantity numeric not null default 1,
  add column if not exists unit_price numeric not null default 0;

update public.mys_invoice_lines set unit_price = amount where unit_price = 0;
