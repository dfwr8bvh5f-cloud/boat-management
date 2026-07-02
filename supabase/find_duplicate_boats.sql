-- Diagnostic: list every boat named "labadie" along with how much data is
-- linked to each row, so you can tell which one is the real boat and which
-- is a stray duplicate before deleting anything.

select
  b.id,
  b.name,
  b.boat_type,
  b.status,
  b.created_at,
  (select count(*) from public.expenses e where e.boat_id = b.id) as expenses_count,
  (select count(*) from public.issues i where i.boat_id = b.id) as issues_count,
  (select count(*) from public.staff s where s.boat_id = b.id) as staff_count,
  (select count(*) from public.documents d where d.boat_id = b.id) as documents_count,
  (select count(*) from public.bookings bk where bk.boat_id = b.id) as bookings_count
from public.boats b
where b.name ilike '%labadie%'
order by b.created_at;
