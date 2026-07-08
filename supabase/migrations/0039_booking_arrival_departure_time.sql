-- Owner trips need an actual arrival/departure time (not just the port),
-- e.g. for coordinating pickup with the captain - additive columns only,
-- existing bookings simply have both as null.
alter table public.bookings
  add column if not exists departure_time time,
  add column if not exists arrival_time time;
