-- Generalizes the management-fee reminder templates (0102) to support more
-- than one recurring charge type per boat - she wants SAMARA and ROGA LI
-- also billed monthly storage fees, in addition to ROGA LI's existing
-- management fee. The table/column names keep their original
-- "management_fee" naming (a full rename would touch a lot of code for no
-- functional benefit) but now represent any recurring boat charge,
-- distinguished by charge_label.

alter table public.mys_management_fee_templates
  add column if not exists charge_label text not null default 'Management fees';

-- A boat could only ever have one row before (unique on boat_id alone) -
-- now unique per (boat, charge_label) so e.g. ROGA LI can have both a
-- "Management fees" row and a separate "Storage fees" row.
alter table public.mys_management_fee_templates
  drop constraint if exists mys_management_fee_templates_boat_id_key;
alter table public.mys_management_fee_templates
  add constraint mys_management_fee_templates_boat_id_charge_label_key unique (boat_id, charge_label);

-- SAMARA and ROGA LI's new storage-fee rows - amount 0 to start (she fills
-- in the real monthly figure from the reminder popup's "permanent" edit
-- choice the first time it appears, never guessed here). Monthly, last day
-- of the month minus 4 days - the same default most of the fleet already
-- uses for its management fee; tell her if a fixed day is wanted instead.
insert into public.mys_management_fee_templates (boat_id, frequency, trigger_day, charge_label)
select b.id, 'monthly', null, 'Storage fees'
from public.boats b
where b.name in ('SAMARA', 'ROGA LI')
on conflict (boat_id, charge_label) do nothing;
