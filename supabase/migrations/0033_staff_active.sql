-- ============================================================================
-- Active/inactive flag for staff, shown instead of the approval-status
-- badge on the staff list, and used to sort inactive members to the
-- bottom of the list.
-- ============================================================================

alter table public.staff
  add column if not exists active boolean not null default true;

-- cascade: a storage RLS policy (staff_files_storage_select) reads through
-- this view, so it gets dropped along with it and must be recreated below.
drop view if exists public.staff_visible cascade;
create view public.staff_visible as
select
  s.id,
  s.boat_id,
  s.name,
  s.position,
  s.date_of_birth,
  s.nationality,
  s.phone,
  s.start_date,
  case when public.is_management() or public.current_role() = 'owner' then s.salary else null end as salary,
  s.payment_method,
  s.resume_path,
  s.photo_path,
  s.status,
  s.active,
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
