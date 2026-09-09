-- ============================================================================
-- MYS business module: the management company's own financials, separate
-- from any single boat's own expenses/income/budget -
--   - mys_expenses / mys_income: MYS's own categorized operating costs and
--     manually-entered revenue.
--   - mys_invoices: invoices MYS issues to clients (a fleet boat owner or a
--     one-off client), each optionally carrying a Stripe Payment Link.
--   - mys_ad_hoc_charges: a charge against a boat outside the regular
--     managed fleet (no real boats row to attach to).
--   - expenses.mys_charge_settled_at: a boat's own expense marked
--     paid_by = 'management' (that field already existed but was never
--     exposed in the UI - see the app for where it's now surfaced) is money
--     the boat owner owes MYS back; this column marks it repaid. The
--     boat-owed-money list itself is *not* a separate synced table - it's a
--     live query over `expenses` (single source of truth stays each boat's
--     own expense row, editable only from that boat's own Expenses page).
-- Every new table is management-only (RLS: public.is_management()) - this
-- module has no captain/owner-facing surface at all.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'mys_expense_category') then
    create type public.mys_expense_category as enum (
      'salaries', 'rent', 'insurance', 'marketing', 'software', 'professional_fees', 'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'mys_invoice_status') then
    create type public.mys_invoice_status as enum ('draft', 'sent', 'paid', 'void');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- expenses: additive "repaid to MYS" marker for a paid_by='management' row.
-- Nullable, never touched by any existing query - set only from the new
-- MYS debts page (settleMysCharge), never from a boat's own Expenses page.
-- ----------------------------------------------------------------------------
alter table public.expenses add column if not exists mys_charge_settled_at timestamptz;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.mys_expenses (
  id uuid primary key default gen_random_uuid(),
  category public.mys_expense_category not null default 'other',
  description text not null,
  amount numeric not null,
  expense_date date not null default current_date,
  payment_method public.payment_method,
  receipt_path text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.mys_expenses;
create trigger set_updated_at before update on public.mys_expenses
  for each row execute function public.set_updated_at();

create table if not exists public.mys_income (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  category text,
  amount numeric not null,
  income_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.mys_income;
create trigger set_updated_at before update on public.mys_income
  for each row execute function public.set_updated_at();

create sequence if not exists public.mys_invoice_number_seq;

create table if not exists public.mys_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique default (
    'MYS-' || extract(year from current_date)::text || '-' ||
    lpad(nextval('public.mys_invoice_number_seq')::text, 4, '0')
  ),
  boat_id uuid references public.boats (id) on delete set null,
  client_name text not null,
  client_email text,
  description text not null,
  amount numeric not null,
  currency text not null default 'EUR',
  status public.mys_invoice_status not null default 'draft',
  issued_date date not null default current_date,
  due_date date,
  paid_date date,
  stripe_payment_link_id text,
  stripe_payment_link_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mys_invoices_boat_id_idx on public.mys_invoices (boat_id);
create index if not exists mys_invoices_status_idx on public.mys_invoices (status);

drop trigger if exists set_updated_at on public.mys_invoices;
create trigger set_updated_at before update on public.mys_invoices
  for each row execute function public.set_updated_at();

create table if not exists public.mys_ad_hoc_charges (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  description text not null,
  amount numeric not null,
  charge_date date not null default current_date,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_date date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.mys_ad_hoc_charges;
create trigger set_updated_at before update on public.mys_ad_hoc_charges
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security - management-only across the board, no boat-scoped
-- access at all (same "for all using/with check (public.is_management())"
-- shape already used for budget_categories/budget_subcategories in
-- 0002_expenses_budget.sql).
-- ----------------------------------------------------------------------------
alter table public.mys_expenses enable row level security;
alter table public.mys_income enable row level security;
alter table public.mys_invoices enable row level security;
alter table public.mys_ad_hoc_charges enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['mys_expenses', 'mys_income', 'mys_invoices', 'mys_ad_hoc_charges']
  loop
    execute format('drop policy if exists %I_all on public.%I;', t, t);
    execute format(
      'create policy %I_all on public.%I for all using (public.is_management()) with check (public.is_management());',
      t, t
    );
  end loop;
end $$;

-- No new storage policies needed: the existing "receipts" bucket policies
-- (0002_expenses_budget.sql) already grant management unrestricted select/
-- insert/delete via their `public.is_management()` clause, with no folder
-- restriction for that role - MYS's own receipts just use a "mys/" path
-- prefix by convention (see createMysExpenseUploadUrl) and are already
-- fully covered.
