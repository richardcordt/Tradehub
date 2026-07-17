-- Run this in your EXISTING Supabase project's SQL Editor to add a trading fees
-- field, entered when a trade is closed. The fee is subtracted from that trade's
-- P&L everywhere it's used (ledger, pots, the pot-over-time chart, etc).

alter table public.trades add column if not exists fees numeric not null default 0;
