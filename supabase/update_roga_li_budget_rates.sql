-- ============================================================================
-- Backfills rate/duration on the ROGA LI 2026 budget line items that were
-- already inserted by seed_roga_li_budget_2026.sql, for every line where the
-- PDF actually had a "per duration x duration" structure (management fees,
-- docking, crew salaries, etc). Run ONCE, after that seed script.
-- ============================================================================

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where name = 'ROGA LI';
  if v_boat_id is null then
    raise exception 'No boat named ROGA LI found';
  end if;

  update public.budget_subcategories set rate = 12.50, duration = 450, duration_unit = 'ליטר'
    where boat_id = v_boat_id and category = 'diesel' and name = 'general use during the season';
  update public.budget_subcategories set rate = 12.50, duration = 100, duration_unit = 'ליטר'
    where boat_id = v_boat_id and category = 'diesel' and name = 'delivery to croatia';
  update public.budget_subcategories set rate = 8.00, duration = 700, duration_unit = 'שעות'
    where boat_id = v_boat_id and category = 'diesel' and name = 'generator hours';

  update public.budget_subcategories set rate = 110.00, duration = 40, duration_unit = 'לילות'
    where boat_id = v_boat_id and category = 'docking_out' and name = 'Greece';

  update public.budget_subcategories set rate = 1000.00, duration = 12, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'base_docking' and name = 'Nea Peramos Marina';

  update public.budget_subcategories set rate = 133.00, duration = 12, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'formalities' and name = 'TEPAI - greek tax';

  update public.budget_subcategories set rate = 200.00, duration = 4, duration_unit = 'פעמים'
    where boat_id = v_boat_id and category = 'laundry_cleaning' and name = 'cleaning service';
  update public.budget_subcategories set rate = 120.00, duration = 4, duration_unit = 'פעמים'
    where boat_id = v_boat_id and category = 'laundry_cleaning' and name = 'laundries';

  update public.budget_subcategories set rate = 12.00, duration = 93, duration_unit = 'ימים'
    where boat_id = v_boat_id and category = 'other' and name = 'storage fees';

  update public.budget_subcategories set rate = 3500.00, duration = 12, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'crew' and name = 'captain';
  update public.budget_subcategories set rate = 3000.00, duration = 6, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'crew' and name = 'stew';

  update public.budget_subcategories set rate = 1400.00, duration = 12, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'management' and name = 'management fees';

  update public.budget_subcategories set rate = 89.00, duration = 7, duration_unit = 'חודשים'
    where boat_id = v_boat_id and category = 'wifi_phone' and name = 'Starlink';

  update public.budget_subcategories set rate = 25.00, duration = 100
    where boat_id = v_boat_id and category = 'underway_expenses' and name = 'captain cost to Nea Peramos';
end $$;
