-- One-time data backfill (no schema change): boat expenses mirrored from a
-- "boat_payment" mys_expenses row were always created with payment_method
-- null, so they stayed in the boat's pending/draft box even after the MYS
-- row was marked paid. Copies the MYS row's payment_method onto its linked
-- boat expense where they differ. Idempotent; review before applying.
update public.expenses e
set payment_method = m.payment_method
from public.mys_expenses m
where m.linked_expense_id = e.id
  and m.payment_method is not null
  and e.payment_method is distinct from m.payment_method;
