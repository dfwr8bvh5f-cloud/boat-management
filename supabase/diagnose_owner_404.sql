-- Run this in the Supabase SQL editor to find out why the owner account
-- for "רוגע לי" gets a 404 on their boat page.

-- 1. Is there more than one boat named "רוגע לי"? (duplicate boat rows
--    would mean the owner's profile might be linked to a different row
--    than the one you expect.)
select id, name, boat_type, status, created_at
from boats
where name ilike '%רוגע לי%'
order by created_at;

-- 2. What does the owner's profile actually have stored for boat_id?
--    Replace the email below with the owner's real email address.
select p.id, p.email, p.full_name, p.role, p.boat_id, b.name as boat_name
from profiles p
left join boats b on b.id = p.boat_id
where p.role = 'owner'
order by p.created_at desc;
