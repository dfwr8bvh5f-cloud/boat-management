-- ============================================================================
-- Make the boat-photos bucket public (boat logos + gallery photos, not
-- financial/personal documents). Private buckets need a fresh signed URL on
-- every page render, which defeated Vercel's image-optimization cache (a
-- new token every load looks like a brand-new image each time) and forced
-- serving full, unresized originals straight to the browser - slow to load
-- on the fleet list where many boats' photos render at once.
--
-- A public bucket serves a plain, stable URL for the same path every time,
-- so the optimizer can cache and resize it properly. Anyone with the exact
-- URL could view a boat photo without logging in - the URL itself is not
-- discoverable or guessable, and this only affects boat photos/logos, never
-- financial records, documents, or personal data (those stay on private
-- buckets with signed URLs, unaffected by this change).
--
-- Upload/replace/delete permissions are unchanged - still management or the
-- boat's own captain only (see 0011_boat_specs_photos.sql).
-- ============================================================================

update storage.buckets set public = true where id = 'boat-photos';
