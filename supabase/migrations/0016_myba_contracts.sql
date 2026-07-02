-- ============================================================================
-- MYBA contract scanning: a signed charter contract can be uploaded, scanned
-- by AI, and turned automatically into a booking + future income entries.
-- ============================================================================

alter type public.document_type add value if not exists 'myba_contract';

alter table public.bookings
  add column if not exists booking_reference text;

alter table public.incomes
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;

alter table public.documents
  add column if not exists booking_id uuid references public.bookings (id) on delete set null;
