-- ============================================================================
-- Manual logo centering: instead of always auto-centering the crop, let
-- management drag sliders to pick which part of the image shows through
-- the square/frame. Stored as a 0-100 object-position pair, applied via
-- inline style wherever the logo renders.
-- ============================================================================

alter table public.boats
  add column if not exists logo_position_x numeric not null default 50,
  add column if not exists logo_position_y numeric not null default 50;

alter table public.app_settings
  add column if not exists company_logo_position_x numeric not null default 50,
  add column if not exists company_logo_position_y numeric not null default 50;
