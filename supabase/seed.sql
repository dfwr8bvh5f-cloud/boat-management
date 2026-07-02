-- ============================================================================
-- Sample data - run this once in the Supabase SQL editor (after all
-- migrations) to seed a couple of demo boats so the app isn't empty.
-- Safe to skip entirely, and safe to delete these boats later from the app
-- once you've added your real fleet.
-- ============================================================================

insert into public.boats (name, model, registration_number, year_built, length_meters, home_port, status, notes)
values
  ('Sea Breeze', 'Sunseeker 68', 'IL-4471-B', 2019, 20.7, 'מרינה הרצליה', 'active', 'סירת צארטר ראשית'),
  ('Blue Horizon', 'Ferretti 550', 'IL-2290-A', 2021, 16.8, 'מרינה תל אביב', 'active', null),
  ('Golden Wave', 'Azimut 78', 'IL-5512-C', 2017, 23.5, 'מרינה אשקלון', 'maintenance', 'בתחזוקה מתוכננת');
