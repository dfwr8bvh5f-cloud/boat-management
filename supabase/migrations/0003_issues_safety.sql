-- ============================================================================
-- Technical issues/tasks module (supersedes `maintenance_records`) + safety
-- equipment tracking (extends the `documents` table, matching the source app
-- where safety items are simply documents with doc_type = 'safety').
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drop the placeholder table this module replaces.
-- ----------------------------------------------------------------------------
drop table if exists public.maintenance_records;
drop type if exists public.maintenance_status;

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'issue_classification') then
    create type public.issue_classification as enum ('capital', 'maintenance', 'repair', 'service', 'warranty');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'issue_area') then
    create type public.issue_area as enum ('interior', 'exterior', 'technical', 'equipment');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'issue_op_status') then
    create type public.issue_op_status as enum ('not_started', 'pending', 'in_progress', 'completed', 'cancelled');
  end if;
end $$;

-- Extend the documents module with a 'safety' category for safety equipment.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a DO/PL-pgSQL block, so
-- this must stay a plain top-level statement (IF NOT EXISTS makes it safe
-- to re-run).
alter type public.document_type add value if not exists 'safety';

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats (id) on delete cascade,
  title text not null,
  classification public.issue_classification not null default 'repair',
  area public.issue_area not null default 'technical',
  location text,
  supplier text,
  estimated_cost numeric,
  payment_method public.payment_method,
  due_date date,
  assigned_to text,
  notes text,
  photo_path text,
  quote_path text,
  op_status public.issue_op_status not null default 'not_started',
  status public.approval_status not null default 'pending',
  created_by uuid references public.profiles (id) on delete set null,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists issues_boat_id_idx on public.issues (boat_id);

drop trigger if exists set_updated_at on public.issues;
create trigger set_updated_at before update on public.issues
  for each row execute function public.set_updated_at();

drop trigger if exists prevent_self_approval on public.issues;
create trigger prevent_self_approval before update on public.issues
  for each row execute function public.prevent_self_approval();

-- Safety equipment tracking: extra fields on top of the existing `documents`
-- table (a safety item is a document with doc_type = 'safety').
alter table public.documents add column if not exists last_checked_date date;

-- ----------------------------------------------------------------------------
-- Row Level Security (same shape as `expenses`: management full access,
-- captain full access on their own boat, owner read-only approved rows).
-- ----------------------------------------------------------------------------
alter table public.issues enable row level security;

drop policy if exists issues_select on public.issues;
create policy issues_select on public.issues for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (public.current_role() = 'owner' and boat_id = public.current_boat_id() and status = 'approved')
  );

drop policy if exists issues_insert on public.issues;
create policy issues_insert on public.issues for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id() and status = 'pending')
  );

drop policy if exists issues_update on public.issues;
create policy issues_update on public.issues for update
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  )
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists issues_delete on public.issues;
create policy issues_delete on public.issues for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- ----------------------------------------------------------------------------
-- Storage: private bucket for issue photos + supplier quotes. Same folder
-- and approval-aware read rules as the `receipts` bucket.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('issue-attachments', 'issue-attachments', false)
on conflict (id) do nothing;

drop policy if exists issue_attachments_storage_select on storage.objects;
create policy issue_attachments_storage_select on storage.objects for select
  using (
    bucket_id = 'issue-attachments'
    and (
      public.is_management()
      or exists (
        select 1 from public.issues i
        where (i.photo_path = storage.objects.name or i.quote_path = storage.objects.name)
          and i.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or i.status = 'approved')
      )
    )
  );

drop policy if exists issue_attachments_storage_insert on storage.objects;
create policy issue_attachments_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'issue-attachments'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );

drop policy if exists issue_attachments_storage_delete on storage.objects;
create policy issue_attachments_storage_delete on storage.objects for delete
  using (
    bucket_id = 'issue-attachments'
    and (
      public.is_management()
      or (
        public.current_role() = 'captain'
        and (storage.foldername(name))[1] = public.current_boat_id()::text
      )
    )
  );
