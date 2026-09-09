-- ============================================================================
-- MYS clients + extra mys_income fields.
--
-- mys_clients is a small, name-only pick list used to populate the "client"
-- dropdown on the debts page's ad-hoc-charge form and the income form's
-- "paying client" field, alongside the fleet's own boats. It is deliberately
-- NOT a foreign key target for mys_ad_hoc_charges.client_name or the new
-- mys_income.client_name - both stay plain text (same shape mys_invoices'
-- own client_name already has), so nothing about existing rows changes and
-- a client picked from this list is just a name suggestion, not a required
-- relationship.
-- ============================================================================

create table if not exists public.mys_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.mys_clients enable row level security;

drop policy if exists mys_clients_all on public.mys_clients;
create policy mys_clients_all on public.mys_clients for all using (public.is_management()) with check (public.is_management());

-- ----------------------------------------------------------------------------
-- mys_income: additive fields for the income entry form - who paid, how, and
-- whether an invoice was issued for it. All nullable/defaulted, so every
-- existing row stays valid untouched.
-- ----------------------------------------------------------------------------
alter table public.mys_income add column if not exists client_name text;
alter table public.mys_income add column if not exists payment_method public.payment_method;
alter table public.mys_income add column if not exists invoice_issued boolean not null default false;
