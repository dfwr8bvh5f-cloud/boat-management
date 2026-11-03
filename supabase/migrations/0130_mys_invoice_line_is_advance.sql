-- Marks a manually-typed line on a PAID MYS invoice as an advance: the client
-- already paid for something whose cost MYS hasn't recorded as a debt yet
-- (e.g. a forklift job billed up front). While is_advance is true and the
-- line is not linked to any debt (source_id is null), its gross amount
-- (amount + vat_amount) counts as client credit on /mys/debts. Once the real
-- debt exists and is linked to the line (linkMysInvoiceLineToDebt), the
-- credit disappears because the line then has a source_id.
--
-- Additive only: a new boolean column, default false, no existing row changes.
alter table public.mys_invoice_lines add column if not exists is_advance boolean not null default false;
