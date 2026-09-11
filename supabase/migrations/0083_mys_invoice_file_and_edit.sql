-- Lets her attach the real invoice document (issued through her external
-- accounting software) to an mys_invoices row, viewable/downloadable from
-- the app - same "invoice_path" naming/semantics as mys_income.invoice_path
-- (0079_mys_income_invoice_upload.sql), just on a different table.
alter table public.mys_invoices
  add column if not exists invoice_path text null;
