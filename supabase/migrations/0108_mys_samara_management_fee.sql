-- SAMARA never had a "Management fees" template (see 0107's own comment -
-- only ROGA LI had one before that migration; SAMARA only got a "Storage
-- fees" row). She now wants the regular monthly management fee billed for
-- SAMARA too, same as the rest of the fleet. Amount starts at 0 - she fills
-- in the real monthly figure the first time it appears on the reminder
-- (its "permanent" edit choice), same as every other template seeded this
-- way (see 0106, 0107).
insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day, charge_label)
select b.id, 'monthly', null, 'Management fees'
from public.boats b
where b.name = 'SAMARA'
on conflict (boat_id, charge_label) do nothing;
