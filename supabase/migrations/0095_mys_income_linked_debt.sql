-- ============================================================================
-- MYS income: link a manually-entered income row to the open debt it
-- actually settles.
--
-- mys_income.mys_invoice_id already covers the invoice case (auto-set when
-- addMysInvoicePayment fully pays an invoice). These three new columns cover
-- the other three debt kinds on /mys/debts, set when she links an income
-- entry to an open boat charge, ad-hoc charge, or supplier commission -
-- exactly one of the four is ever set for a given linked income row (or none
-- for a plain, unlinked income entry).
-- ============================================================================
alter table public.mys_income
  add column if not exists linked_expense_id uuid references public.expenses(id) on delete set null,
  add column if not exists linked_ad_hoc_charge_id uuid references public.mys_ad_hoc_charges(id) on delete set null,
  add column if not exists linked_commission_id uuid references public.mys_supplier_commissions(id) on delete set null;
