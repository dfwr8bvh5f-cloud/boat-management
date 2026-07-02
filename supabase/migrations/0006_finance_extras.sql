-- ============================================================================
-- Remaining Finance sub-tabs: actual/future income, cash transactions,
-- recurring expenses, and a per-boat bank balance.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'income_type') then
    create type public.income_type as enum ('actual', 'future');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cash_tx_type') then
    create type public.cash_tx_type as enum ('withdrawal', 'usage');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Income (actual + future), same approval-aware shape as expenses.
-- ----------------------------------------------------------------------------
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  source text not null,
  amount numeric not null,
  income_date date not null default current_date,
  type public.income_type not null default 'actual',
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incomes_boat_id_idx on public.incomes (boat_id);

drop trigger if exists set_updated_at on public.incomes;
create trigger set_updated_at before update on public.incomes
  for each row execute function public.set_updated_at();

drop trigger if exists prevent_self_approval on public.incomes;
create trigger prevent_self_approval before update on public.incomes
  for each row execute function public.prevent_self_approval();

-- ----------------------------------------------------------------------------
-- Cash transactions (withdrawal/usage), same approval-aware shape.
-- ----------------------------------------------------------------------------
create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  type public.cash_tx_type not null,
  amount numeric not null,
  tx_date date not null default current_date,
  notes text,
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cash_transactions_boat_id_idx on public.cash_transactions (boat_id);

drop trigger if exists set_updated_at on public.cash_transactions;
create trigger set_updated_at before update on public.cash_transactions
  for each row execute function public.set_updated_at();

drop trigger if exists prevent_self_approval on public.cash_transactions;
create trigger prevent_self_approval before update on public.cash_transactions
  for each row execute function public.prevent_self_approval();

-- ----------------------------------------------------------------------------
-- Recurring expense templates. No approval workflow (matches the source
-- app - it's a schedule/template, not a transaction; confirming a payment
-- creates a real, approval-tracked row in `expenses` instead). Visible
-- read-only to everyone on the boat, editable by management + captain.
-- ----------------------------------------------------------------------------
create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  description text not null,
  amount numeric not null,
  category public.expense_category not null default 'other',
  payment_method public.payment_method not null default 'other',
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  last_paid_month text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_boat_id_idx on public.recurring_expenses (boat_id);

drop trigger if exists set_updated_at on public.recurring_expenses;
create trigger set_updated_at before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- One bank balance row per boat. Balance is management-only to edit
-- directly; captain/owner can still view it and log income against it.
-- ----------------------------------------------------------------------------
create table if not exists public.bank_balances (
  boat_id uuid primary key references public.boats (id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- Captain may not directly edit bank_balances (RLS below is management-only),
-- but recording a cash withdrawal should still adjust it automatically, same
-- as the source app. SECURITY DEFINER lets this narrow, purpose-built
-- operation bypass that restriction without opening balance edits generally.
create or replace function public.apply_cash_withdrawal(p_boat_id uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.is_management()
    or (public.current_role() = 'captain' and p_boat_id = public.current_boat_id())
  ) then
    raise exception 'Not authorized';
  end if;

  insert into public.bank_balances (boat_id, balance, updated_at)
  values (p_boat_id, -p_amount, now())
  on conflict (boat_id) do update
    set balance = public.bank_balances.balance - p_amount, updated_at = now();
end;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.incomes enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.bank_balances enable row level security;

-- incomes + cash_transactions: identical approval-aware pattern to expenses.
do $$
declare
  t text;
begin
  foreach t in array array['incomes', 'cash_transactions']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()) or (public.current_role() = ''owner'' and boat_id = public.current_boat_id() and status = ''approved''));',
      t, t
    );

    execute format('drop policy if exists %I_insert on public.%I;', t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id() and status = ''pending''));',
      t, t
    );

    execute format('drop policy if exists %I_update on public.%I;', t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id())) with check (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()));',
      t, t
    );

    execute format('drop policy if exists %I_delete on public.%I;', t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_management() or (public.current_role() = ''captain'' and boat_id = public.current_boat_id()));',
      t, t
    );
  end loop;
end $$;

-- recurring_expenses: simple boat-scoped visibility, no approval concept.
drop policy if exists recurring_expenses_select on public.recurring_expenses;
create policy recurring_expenses_select on public.recurring_expenses for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists recurring_expenses_insert on public.recurring_expenses;
create policy recurring_expenses_insert on public.recurring_expenses for insert
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

drop policy if exists recurring_expenses_update on public.recurring_expenses;
create policy recurring_expenses_update on public.recurring_expenses for update
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()))
  with check (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

drop policy if exists recurring_expenses_delete on public.recurring_expenses;
create policy recurring_expenses_delete on public.recurring_expenses for delete
  using (public.is_management() or (public.current_role() = 'captain' and boat_id = public.current_boat_id()));

-- bank_balances: visible to everyone on the boat, editable by management only.
drop policy if exists bank_balances_select on public.bank_balances;
create policy bank_balances_select on public.bank_balances for select
  using (public.is_management() or boat_id = public.current_boat_id());

drop policy if exists bank_balances_write on public.bank_balances;
create policy bank_balances_write on public.bank_balances for all
  using (public.is_management())
  with check (public.is_management());
