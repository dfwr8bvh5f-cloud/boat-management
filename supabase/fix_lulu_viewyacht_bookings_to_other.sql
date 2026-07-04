-- Converts the 12 ViewYacht-imported bookings for Lulu (previously entered
-- as usage_type = charter with empty customer name and full port details)
-- into simple usage_type = other entries with just a short detail label,
-- per her request for less information shown. Run once in the Supabase
-- SQL editor.
update public.bookings
set
  usage_type = 'other'::public.usage_type,
  usage_type_other = 'צ''רטר',
  customer_name = 'צ''רטר',
  departure_port = null,
  arrival_port = null,
  sailing_area = null,
  price = null
where notes = 'יובא מ-ViewYacht';
