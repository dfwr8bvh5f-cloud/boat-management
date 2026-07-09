-- Two more selectable document categories: company documents and bank
-- documents, per request. ALTER TYPE ... ADD VALUE cannot run inside a
-- transaction/DO block (see migration 0003's note) - must stay a plain
-- top-level statement.
alter type public.document_type add value if not exists 'company_docs';
alter type public.document_type add value if not exists 'bank';
