-- ============================================================================
-- Staff & payroll module.
--
-- Salary is genuinely sensitive: management and owner may see it, captain
-- may not - even though captain can create/edit crew records. Row Level
-- Security alone can't mask a single column, so this uses the standard
-- Supabase pattern: lock the base table's SELECT down to management only,
-- and expose a classic (non security-invoker) view that re-implements the
-- same row-visibility rules as every other approval-aware table but nulls
-- out `salary` unless the caller is management or owner. Because the view
-- is *not* security-invoker, it runs with its owner's (bypasses-RLS)
-- privileges against the base table, so captain gets rows through the view
-- that a direct query against `staff` would correctly deny them.
-- ============================================================================

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  name text not null,
  position text,
  date_of_birth date,
  nationality text,
  start_date date not null default current_date,
  salary numeric,
  payment_method public.payment_method,
  resume_path text,
  photo_path text,
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staff_boat_id_idx on public.staff (boat_id);

drop trigger if exists set_updated_at on public.staff;
create trigger set_updated_at before update on public.staff
  for each row execute function public.set_updated_at();

drop trigger if exists prevent_self_approval on public.staff;
create trigger prevent_self_approval before update on public.staff
  for each row execute function public.prevent_self_approval();

alter table public.staff enable row level security;

-- Direct table SELECT is management-only; everyone else must read through
-- the salary-masking view below.
drop policy if exists staff_select on public.staff;
create policy staff_select on public.staff for select
  using (public.is_management());

drop policy if exists staff_insert on public.staff;
create policy staff_insert on public.staff for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists staff_update on public.staff;
create policy staff_update on public.staff for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists staff_delete on public.staff;
create policy staff_delete on public.staff for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- ----------------------------------------------------------------------------
-- Salary-masking read view. Deliberately not `security_invoker` - it must
-- run with the owning role's table access so captain (whose direct SELECT
-- on `staff` is denied above) can still read masked rows through it.
-- ----------------------------------------------------------------------------
drop view if exists public.staff_visible;
create view public.staff_visible as
select
  s.id,
  s.boat_id,
  s.name,
  s.position,
  s.date_of_birth,
  s.nationality,
  s.start_date,
  case when public.is_management() or public.current_role() = 'owner' then s.salary else null end as salary,
  s.payment_method,
  s.resume_path,
  s.photo_path,
  s.status,
  s.created_by,
  s.approved_by,
  s.approved_at,
  s.created_at,
  s.updated_at
from public.staff s
where
  public.is_management()
  or (public.current_role() = 'captain' and s.boat_id = public.current_boat_id())
  or (public.current_role() = 'owner' and s.boat_id = public.current_boat_id() and s.status = 'approved');

grant select on public.staff_visible to authenticated;

-- ----------------------------------------------------------------------------
-- Storage: private bucket for crew photos + resumes. Same boat-scoped,
-- approval-aware pattern as receipts/issue-attachments (files themselves
-- aren't as sensitive as salary, so no extra masking needed here).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('staff-files', 'staff-files', false)
on conflict (id) do nothing;

-- NOTE: this deliberately queries staff_visible (not staff directly) - the
-- base table's SELECT policy is management-only, which would make this
-- EXISTS check always fail for captain/owner if it queried `staff` itself.
drop policy if exists staff_files_storage_select on storage.objects;
create policy staff_files_storage_select on storage.objects for select
  using (
    bucket_id = 'staff-files'
    and (
      public.is_management()
      or exists (
        select 1 from public.staff_visible s
        where s.photo_path = storage.objects.name or s.resume_path = storage.objects.name
      )
    )
  );

drop policy if exists staff_files_storage_insert on storage.objects;
create policy staff_files_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'staff-files'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists staff_files_storage_delete on storage.objects;
create policy staff_files_storage_delete on storage.objects for delete
  using (
    bucket_id = 'staff-files'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
