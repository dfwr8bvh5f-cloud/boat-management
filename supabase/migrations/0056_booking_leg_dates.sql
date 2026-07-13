-- ============================================================================
-- Optional start/end dates per leg, bounded to the parent booking's own
-- start_date/end_date (enforced server-side in addBookingLeg - a leg is
-- part of one trip, it can't claim days outside that trip).
-- ============================================================================

alter table public.booking_legs add column if not exists start_date date;
alter table public.booking_legs add column if not exists end_date date;
