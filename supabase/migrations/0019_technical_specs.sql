-- ============================================================================
-- Technical specs module: structured equipment records (engines,
-- watermakers, air conditioners, etc.) with quantity and free-text info,
-- shown between Issues and Safety Equipment under the Maintenance tab.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'technical_spec_category') then
    create type public.technical_spec_category as enum ('engine', 'watermaker', 'air_conditioner', 'other');
  end if;
end $$;

create table if not exists public.technical_specs (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  category public.technical_spec_category not null default 'other',
  name text not null,
  quantity integer,
  details text,
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technical_specs_boat_id_idx on public.technical_specs (boat_id);

drop trigger if exists set_updated_at on public.technical_specs;
create trigger set_updated_at before update on public.technical_specs
  for each row execute function public.set_updated_at();

drop trigger if exists prevent_self_approval on public.technical_specs;
create trigger prevent_self_approval before update on public.technical_specs
  for each row execute function public.prevent_self_approval();

-- Row Level Security - same shape as `issues`: management full access,
-- captain full access on their own boat, owner read-only approved rows.
alter table public.technical_specs enable row level security;

drop policy if exists technical_specs_select on public.technical_specs;
create policy technical_specs_select on public.technical_specs for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (public.current_role() = 'owner' and boat_id = public.current_boat_id() and status = 'approved')
  );

drop policy if exists technical_specs_insert on public.technical_specs;
create policy technical_specs_insert on public.technical_specs for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists technical_specs_update on public.technical_specs;
create policy technical_specs_update on public.technical_specs for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists technical_specs_delete on public.technical_specs;
create policy technical_specs_delete on public.technical_specs for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );
