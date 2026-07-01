-- ============================================================================
-- Expenses + Budget module, with a real per-record approval workflow:
--   - captain-created records start as 'pending'
--   - management-created records start as 'approved' automatically
--   - only management may transition a record to 'approved'
--   - owners only ever see 'approved' records (enforced by RLS, see below)
-- This supersedes the earlier placeholder `financial_records` table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drop the placeholder finance table this module replaces.
-- ----------------------------------------------------------------------------
drop table if exists public.financial_records;
drop type if exists public.financial_type;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('pending', 'approved');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_category') then
    create type public.expense_category as enum (
      'diesel', 'docking_out', 'base_docking', 'electricity_water', 'capital_expenses',
      'formalities', 'laundry_cleaning', 'provisions', 'repairs', 'services', 'crew',
      'management', 'lpg', 'wifi_phone', 'underway_expenses', 'owner_trip', 'company',
      'crew_food', 'boat_show', 'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('bank_transfer', 'card', 'cash', 'other');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'paid_by_type') then
    create type public.paid_by_type as enum ('crew', 'management');
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  description text not null,
  invoice_number text,
  amount numeric not null,
  category public.expense_category not null default 'other',
  payment_method public.payment_method not null default 'other',
  paid_by public.paid_by_type not null default 'crew',
  expense_date date not null default current_date,
  receipt_path text,
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_boat_id_idx on public.expenses (boat_id);

drop trigger if exists set_updated_at on public.expenses;
create trigger set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- Flat annual amount per (boat, category). Ignored for a category once
-- subcategories exist for it - the subcategory amounts are summed instead.
create table if not exists public.budget_categories (
  boat_id uuid not null references public.boats (id) on delete cascade,
  category public.expense_category not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (boat_id, category)
);

create table if not exists public.budget_subcategories (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  category public.expense_category not null,
  name text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists budget_subcategories_boat_category_idx
  on public.budget_subcategories (boat_id, category);

-- ----------------------------------------------------------------------------
-- Prevent self-approval: only management may transition a record's status
-- into 'approved'. Reusable across any table with a `status approval_status`
-- column (attach the same trigger to future approvable tables).
-- ----------------------------------------------------------------------------
create or replace function public.prevent_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' and not public.is_management() then
    raise exception 'Only management can approve records';
  end if;
  return NEW;
end;
$$;

drop trigger if exists prevent_self_approval on public.expenses;
create trigger prevent_self_approval before update on public.expenses
  for each row execute function public.prevent_self_approval();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.expenses enable row level security;
alter table public.budget_categories enable row level security;
alter table public.budget_subcategories enable row level security;

-- expenses: management sees/edits everything. Captain sees & edits every
-- status on their own boat (including approved ones - matches the source
-- app's behaviour). Owner only ever sees approved rows on their own boat.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (public.current_role() = 'owner' and boat_id = public.current_boat_id() and status = 'approved')
  );

-- Captain-authored rows must start 'pending' - only management may insert
-- an already-'approved' row (i.e. self-authored management entries).
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- budget: visible to everyone on the boat, editable by management only.
do $$
declare
  t text;
begin
  foreach t in array array['budget_categories', 'budget_subcategories']
  loop
    execute format('drop policy if exists %I_select on public.%I;', t, t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_management() or boat_id = public.current_boat_id());',
      t, t
    );

    execute format('drop policy if exists %I_write on public.%I;', t, t);
    execute format(
      'create policy %I_write on public.%I for all using (public.is_management()) with check (public.is_management());',
      t, t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Storage: private bucket for expense receipt photos.
-- Files must be uploaded under a "<boat_id>/filename.ext" path. Owners may
-- only read a receipt if the expense row referencing it is approved.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists receipts_storage_select on storage.objects;
create policy receipts_storage_select on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (
      public.is_management()
      or exists (
        select 1 from public.expenses e
        where e.receipt_path = storage.objects.name
          and e.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or e.status = 'approved')
      )
    )
  );

drop policy if exists receipts_storage_insert on storage.objects;
create policy receipts_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists receipts_storage_delete on storage.objects;
create policy receipts_storage_delete on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
