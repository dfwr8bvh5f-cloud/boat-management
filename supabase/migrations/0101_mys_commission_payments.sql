-- Partial-payment tracking for supplier commissions - mirrors
-- mys_invoice_payments/mys_debt_settlements (0084/0093). A commission
-- previously only supported one blind "mark paid" click for its full
-- total_amount at once; this lets a payment for less than the full amount
-- be recorded, with the commission staying 'unpaid' (showing only the
-- remaining balance on /mys/debts) until payments sum up to total_amount,
-- at which point it flips to 'paid' - see addMysSupplierCommissionPayment,
-- src/lib/actions/mys-commissions.ts.
create table if not exists public.mys_commission_payments (
  id uuid primary key default gen_random_uuid(),
  commission_id uuid not null references public.mys_supplier_commissions (id) on delete cascade,
  amount numeric not null,
  paid_date date not null default current_date,
  payment_method public.payment_method,
  mys_income_id uuid references public.mys_income(id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists mys_commission_payments_commission_id_idx on public.mys_commission_payments (commission_id);

alter table public.mys_commission_payments enable row level security;

drop policy if exists mys_commission_payments_all on public.mys_commission_payments;
create policy mys_commission_payments_all on public.mys_commission_payments
  for all using (public.is_management()) with check (public.is_management());
