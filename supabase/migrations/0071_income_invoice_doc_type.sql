-- ============================================================================
-- A charter future-income row can now also have its own sales invoice
-- attached (separate from the MYBA contract) - stored the same way, as a
-- documents row linked via income_id (0070), just tagged with this new
-- doc_type so it can be told apart from a contract when resolving each
-- income row's attachments. Mirrors how 'myba_contract' itself was added
-- as a new document_type value in 0016_myba_contracts.sql.
-- ============================================================================

alter type public.document_type add value if not exists 'invoice';
