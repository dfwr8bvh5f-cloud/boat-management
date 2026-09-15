-- ============================================================================
-- MYS supplier commissions: her own invoice issued to the supplier.
--
-- mys_supplier_commission_attachments already holds the SUPPLIER's own
-- invoice(s) (what the commission is computed from). This is a separate,
-- single file - the invoice/receipt she herself issues to the supplier
-- demanding payment of the commission owed - editable from both
-- /mys/commissions and the commission row on /mys/debts.
-- ============================================================================

alter table public.mys_supplier_commissions add column if not exists commission_invoice_path text;
