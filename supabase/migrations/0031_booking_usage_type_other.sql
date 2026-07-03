-- Add an "other" usage type for trips, with a free-text label the user
-- fills in when they pick it (owner/charter/exhibition don't need one).
alter type public.usage_type add value if not exists 'other';

alter table public.bookings
  add column if not exists usage_type_other text;
