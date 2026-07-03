-- ============================================================================
-- Let an expense be entered as a "pending" placeholder - description,
-- amount, category, but no date or payment method yet - so it doesn't
-- count toward budget/report/balance totals until those two fields are
-- filled in (all of which already filter on expense_date/payment_method
-- and naturally exclude nulls). Also adds a warranty flag.
-- ============================================================================

alter table public.expenses
  alter column expense_date drop not null,
  alter column payment_method drop not null;

alter table public.expenses add column if not exists is_warranty boolean not null default false;
