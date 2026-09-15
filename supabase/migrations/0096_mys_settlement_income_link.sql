-- ============================================================================
-- MYS debts: link each partial/full payment to the income row it
-- auto-records.
--
-- Previously, addMysInvoicePayment only ever created a mys_income row once
-- an invoice reached fully-paid, and addMysDebtSettlement (boat charges /
-- ad-hoc charges) never created one at all - a partial payment against any
-- debt kind simply didn't show up on /mys/income. Now every recorded
-- payment (partial or full) gets its own mys_income row immediately, and
-- these two columns let editing/deleting that payment later keep its
-- income entry in sync (see updateMysDebtSettlement/deleteMysDebtSettlement,
-- src/lib/actions/mys.ts). Nullable + on delete set null: deleting the
-- income row directly (deleteMysIncome) just disconnects the two, it
-- doesn't reopen or delete the payment/settlement itself.
-- ============================================================================
alter table public.mys_debt_settlements
  add column if not exists mys_income_id uuid references public.mys_income(id) on delete set null;

alter table public.mys_invoice_payments
  add column if not exists mys_income_id uuid references public.mys_income(id) on delete set null;
