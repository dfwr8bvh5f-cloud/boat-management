-- One-time import of Lulu's confirmed charter bookings from the ViewYacht
-- listing (https://viewyacht.com/10265-lulu), which lists dates and
-- pickup/dropoff ports but no charterer name - customer_name is left blank
-- per her instruction. Run this once in the Supabase SQL editor.
--
-- Row count: 12 bookings (Jul 2026 - Oct 2027), all usage_type = charter,
-- status = approved (already shown as "Booked" on the source site).
--
-- NOTE: also (re-)applies migration 0022 (departure_port/arrival_port
-- columns) in case it was never run on this database - that's what caused
-- the "column departure_port does not exist" error on the first attempt.
alter table public.bookings
  add column if not exists departure_port text,
  add column if not exists arrival_port text;

do $$
declare
  v_boat_id uuid;
begin
  select id into v_boat_id from public.boats where lower(name) in ('לולו', 'lulu') limit 1;
  if v_boat_id is null then
    raise exception 'Boat not found by name (tried ''לולו'' / ''LULU'') - check the boat name in the boats table';
  end if;

  insert into public.bookings (boat_id, customer_name, start_date, end_date, usage_type, departure_port, arrival_port, status, notes)
  values
    (v_boat_id, '', '2026-07-03', '2026-07-07', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-07-08', '2026-07-15', 'charter'::public.usage_type, 'Lefkas, Greece', 'Kefalonia, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-07-16', '2026-07-23', 'charter'::public.usage_type, 'Kefalonia, Greece', 'Kefalonia, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-07-25', '2026-08-01', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-08-02', '2026-08-09', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-08-10', '2026-08-17', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-08-18', '2026-08-27', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-08-30', '2026-09-05', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-09-06', '2026-09-10', 'charter'::public.usage_type, 'Lefkas, Greece', 'Kefalonia, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-09-11', '2026-09-18', 'charter'::public.usage_type, 'Kefalonia, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2026-09-19', '2026-09-26', 'charter'::public.usage_type, 'Lefkas, Greece', 'Lefkas, Greece', 'approved', 'יובא מ-ViewYacht'),
    (v_boat_id, '', '2027-10-02', '2027-10-09', 'charter'::public.usage_type, 'Corfu, Greece', 'Kefalonia, Greece', 'approved', 'יובא מ-ViewYacht');
end $$;
