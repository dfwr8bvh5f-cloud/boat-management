-- ============================================================================
-- Salaries module: recurring monthly salary rows for boat crew (staff) and
-- MYS office/management staff (mys_staff, new - office people aren't tied
-- to any boat, so they don't fit the boat-scoped `staff` table; same
-- "parallel mys_*-prefixed table" convention already used for
-- mys_expenses/mys_income etc. rather than loosening staff.boat_id's own
-- not-null constraint).
--
-- A salary_periods row is per (staff member, worked month) - "Salary stew-
-- October" means October's work, paid the following month, per her own
-- confirmation. Marking one "paid" creates the matching expense
-- immediately: one row in the boat's own expenses (crew) or mys_expenses
-- (office), or two rows - one cash, one bank, suffixed "- Cash"/"- Bank" -
-- when the payment is split between both. The linked_* columns record
-- exactly which expense row(s) a period created, so paid can be reversed
-- cleanly without guessing which row to delete.
--
-- Entirely management-only (no captain/owner visibility at all, unlike
-- `staff` itself) - salary figures are sensitive and this whole module is
-- operated by her directly.
-- ============================================================================

create table if not exists public.mys_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text,
  nationality text,
  phone text,
  salary numeric,
  payment_method public.payment_method,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.mys_staff;
create trigger set_updated_at before update on public.mys_staff
  for each row execute function public.set_updated_at();

alter table public.mys_staff enable row level security;

drop policy if exists mys_staff_all on public.mys_staff;
create policy mys_staff_all on public.mys_staff for all
  using (public.is_management())
  with check (public.is_management());

create table if not exists public.salary_periods (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete cascade,
  mys_staff_id uuid references public.mys_staff (id) on delete cascade,
  period_month date not null,
  base_amount numeric not null,
  full_month boolean not null default true,
  days_worked integer,
  days_in_month integer,
  prorated_amount numeric,
  bonus_amount numeric,
  cash_amount numeric,
  bank_amount numeric,
  notes text,
  paid boolean not null default false,
  paid_at timestamptz,
  linked_cash_boat_expense_id uuid references public.expenses (id) on delete set null,
  linked_bank_boat_expense_id uuid references public.expenses (id) on delete set null,
  linked_cash_mys_expense_id uuid references public.mys_expenses (id) on delete set null,
  linked_bank_mys_expense_id uuid references public.mys_expenses (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_periods_one_staff check (
    (staff_id is not null and mys_staff_id is null) or (staff_id is null and mys_staff_id is not null)
  ),
  -- Plain (non-partial) unique constraints, not partial indexes - Postgres
  -- treats every NULL as distinct under a standard unique constraint, so
  -- these still only ever block a real duplicate (same staff member, same
  -- month) while quietly allowing any number of NULL staff_id or NULL
  -- mys_staff_id rows. A partial index would enforce the identical rule,
  -- but supabase-js's upsert(..., { onConflict }) can't target one - it
  -- always emits a bare `ON CONFLICT (cols)`, which Postgres only resolves
  -- against a non-partial constraint - and upsert is exactly how
  -- upsertSalaryPeriod (src/lib/actions/salaries.ts) creates-or-updates
  -- this month's row for a given staff member.
  constraint salary_periods_staff_month_unique unique (staff_id, period_month),
  constraint salary_periods_mys_staff_month_unique unique (mys_staff_id, period_month)
);

create index if not exists salary_periods_period_month_idx on public.salary_periods (period_month);

drop trigger if exists set_updated_at on public.salary_periods;
create trigger set_updated_at before update on public.salary_periods
  for each row execute function public.set_updated_at();

alter table public.salary_periods enable row level security;

drop policy if exists salary_periods_all on public.salary_periods;
create policy salary_periods_all on public.salary_periods for all
  using (public.is_management())
  with check (public.is_management());

create table if not exists public.staff_loans (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff (id) on delete cascade,
  mys_staff_id uuid references public.mys_staff (id) on delete cascade,
  amount numeric not null,
  loan_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_loans_one_staff check (
    (staff_id is not null and mys_staff_id is null) or (staff_id is null and mys_staff_id is not null)
  )
);

drop trigger if exists set_updated_at on public.staff_loans;
create trigger set_updated_at before update on public.staff_loans
  for each row execute function public.set_updated_at();

alter table public.staff_loans enable row level security;

drop policy if exists staff_loans_all on public.staff_loans;
create policy staff_loans_all on public.staff_loans for all
  using (public.is_management())
  with check (public.is_management());

-- Repayment tracking is manual (she records how much was deducted/repaid
-- each time) rather than automatic deduction from a future salary_periods
-- row - her own explicit choice.
create table if not exists public.staff_loan_repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.staff_loans (id) on delete cascade,
  amount numeric not null,
  repaid_on date not null default current_date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists staff_loan_repayments_loan_id_idx on public.staff_loan_repayments (loan_id);

alter table public.staff_loan_repayments enable row level security;

drop policy if exists staff_loan_repayments_all on public.staff_loan_repayments;
create policy staff_loan_repayments_all on public.staff_loan_repayments for all
  using (public.is_management())
  with check (public.is_management());
