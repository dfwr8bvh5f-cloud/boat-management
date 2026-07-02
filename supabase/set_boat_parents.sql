-- One-time data fix: the 0012 migration only added the parent_boat_id
-- column - it never set the actual relationships. Set them here so the
-- fleet list groups these boats correctly.
--
-- Blue Water is a sub-boat of Stephanie.
-- Michali 2 and Michali Chase are sub-boats of Michali.

update public.boats
set parent_boat_id = (select id from public.boats where name ilike 'stephanie')
where name ilike 'blue water';

update public.boats
set parent_boat_id = (select id from public.boats where name ilike 'michali')
where name ilike 'michali 2' or name ilike '%michali chase%' or name ilike '%chase michali%';

-- Verify: each sub-boat should now show its parent's name.
select b.name as boat, p.name as parent_boat
from public.boats b
left join public.boats p on p.id = b.parent_boat_id
where b.parent_boat_id is not null
order by p.name, b.name;
