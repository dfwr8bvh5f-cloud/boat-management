-- ============================================================================
-- Departure/arrival port fields on bookings, shown on the passenger
-- manifest alongside the existing sailing_area/dates.
-- ============================================================================

alter table public.bookings
  add column if not exists departure_port text,
  add column if not exists arrival_port text;
