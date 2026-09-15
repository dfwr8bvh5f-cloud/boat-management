-- ============================================================================
-- MYS debts: partial-payment tracking for boat charges and ad-hoc charges.
--
-- Mirrors mys_invoice_payments (0084_mys_invoice_payments.sql) but for the
-- other two "money owed to MYS" debt kinds on /mys/debts - a boat's own
-- paid_by='management' expense (settled via expenses.mys_charge_settled_at)
-- and an mys_ad_hoc_charges row (settled via status='paid'). Exactly one of
-- expense_id/ad_hoc_charge_id is set per row.
-- ============================================================================

create table if not exists public.mys_debt_settlements (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid references public.expenses (id) on delete cascade,
  ad_hoc_charge_id uuid references public.mys_ad_hoc_charges (id) on delete cascade,
  amount numeric not null,
  paid_date date not null default current_date,
  payment_method public.payment_method,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint mys_debt_settlements_one_target check (
    (case when expense_id is not null then 1 else 0 end
     + case when ad_hoc_charge_id is not null then 1 else 0 end) = 1
  )
);

create index if not exists mys_debt_settlements_expense_id_idx on public.mys_debt_settlements (expense_id);
create index if not exists mys_debt_settlements_ad_hoc_charge_id_idx on public.mys_debt_settlements (ad_hoc_charge_id);

alter table public.mys_debt_settlements enable row level security;

drop policy if exists mys_debt_settlements_all on public.mys_debt_settlements;
create policy mys_debt_settlements_all on public.mys_debt_settlements
  for all using (public.is_management()) with check (public.is_management());
