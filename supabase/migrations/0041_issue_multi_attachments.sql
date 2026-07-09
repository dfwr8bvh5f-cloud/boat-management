-- Issues need more than one photo and more than one supplier quote - the
-- existing single `photo_path`/`quote_path` columns on `issues` stay as-is
-- (old issues keep displaying from them), new attachments go into this
-- table instead, one row per file.
create table if not exists public.issue_attachments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  boat_id uuid not null references public.boats (id) on delete cascade,
  kind text not null check (kind in ('photo', 'quote')),
  file_path text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists issue_attachments_issue_id_idx on public.issue_attachments (issue_id);

alter table public.issue_attachments enable row level security;

-- Same shape as the `issues` table's own policies: management full access,
-- captain full access on their own boat, owner read-only on approved issues.
drop policy if exists issue_attachments_select on public.issue_attachments;
create policy issue_attachments_select on public.issue_attachments for select
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
    or (
      public.current_role() = 'owner' and boat_id = public.current_boat_id()
      and exists (select 1 from public.issues i where i.id = issue_attachments.issue_id and i.status = 'approved')
    )
  );

drop policy if exists issue_attachments_insert on public.issue_attachments;
create policy issue_attachments_insert on public.issue_attachments for insert
  with check (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

drop policy if exists issue_attachments_delete on public.issue_attachments;
create policy issue_attachments_delete on public.issue_attachments for delete
  using (
    public.is_management()
    or (public.current_role() = 'captain' and boat_id = public.current_boat_id())
  );

-- Extend the existing issue-attachments storage read policy (0003) to also
-- allow files referenced from the new table, not just the legacy single
-- photo_path/quote_path columns.
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
      or exists (
        select 1 from public.issue_attachments a
        join public.issues i on i.id = a.issue_id
        where a.file_path = storage.objects.name
          and a.boat_id = public.current_boat_id()
          and (public.current_role() = 'captain' or i.status = 'approved')
      )
    )
  );
