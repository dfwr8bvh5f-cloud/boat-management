-- ============================================================================
-- Add a third cash transaction type: cash received directly in hand (e.g.
-- handed over by an owner or guest), distinct from a bank withdrawal.
-- Both count as inflow to the cash box; only a real withdrawal touches the
-- tracked bank balance.
-- ============================================================================

alter type public.cash_tx_type add value if not exists 'received';
