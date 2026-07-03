-- ============================================================================
-- Phone number on crew records, shown as a click-to-call link in the UI.
-- ============================================================================

alter table public.staff
  add column if not exists phone text;

drop view if exists public.staff_visible;
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
