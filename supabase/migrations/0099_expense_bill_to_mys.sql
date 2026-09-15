-- ============================================================================
-- A boat expense flagged paid_by='management' was, until now, assumed to
-- always mean "MYS fronted this and the boat/owner owes it back" - the
-- entire /mys/debts "charges" query is built on that assumption. In
-- practice paid_by='management' is also used loosely for routine
-- operational costs the management company just happened to cover (a
-- day worker, uniforms, a courier shipment, an electrician) that were
-- never meant to become a client-billed debt.
--
-- bill_to_mys makes that distinction explicit instead of guessed: only
-- rows with bill_to_mys = true show up as a debt on /mys/debts. The
-- checkbox for it appears (only when paid_by='management' is picked) on
-- both the boat's own expense form and MYS's boat_payment/ad-hoc mirrors.
--
-- Every *existing* paid_by='management' row (open or already-settled)
-- defaults to false here per her explicit request - she reviews and
-- re-checks the ones that were genuinely a client debt. New rows default
-- to true at the column level so a freshly-checked "management" checkbox
-- keeps its historical behavior unless the new checkbox is unticked.
-- ============================================================================

alter table public.expenses
  add column if not exists bill_to_mys boolean not null default true;

update public.expenses set bill_to_mys = false where paid_by = 'management';

-- Same distinction on a recurring template, so a future confirmed
-- occurrence from an existing paid_by='management' template doesn't
-- recreate the exact same clutter this migration just cleared out.
alter table public.expense_recurring_templates
  add column if not exists bill_to_mys boolean not null default true;

update public.expense_recurring_templates set bill_to_mys = false where paid_by = 'management';
