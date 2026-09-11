-- Links a "boat_payment" mys_expenses row (a cost she covered on a real
-- fleet boat's behalf, with an optional markup%) to the mirrored expenses
-- row created on that boat's own ledger, so the boat owes back the final
-- marked-up amount and it shows up on /mys/debts. Only ever set when the
-- boat_payment's client_name matched a real boat at creation time.
alter table public.mys_expenses
  add column if not exists linked_expense_id uuid references public.expenses(id) on delete set null;
