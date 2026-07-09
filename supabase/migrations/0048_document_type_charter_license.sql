-- New document category for private boats: a charter license (needed only
-- when a normally-private boat is chartered as an exception), replacing
-- the generic "sailing license" option in the upload form. ALTER TYPE ...
-- ADD VALUE cannot run inside a transaction/DO block (see migration
-- 0003's note) - must stay a plain top-level statement.
alter type public.document_type add value if not exists 'charter_license';
