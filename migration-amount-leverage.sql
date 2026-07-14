-- Run this in your EXISTING Supabase project's SQL Editor to update the trades
-- table for the new "amount in GBP + leverage" fields (symbol removed, qty renamed).
-- Safe to run once. If you have existing trade rows, their old "qty" values will
-- carry over into "amount", and leverage will default to 1 for all of them.

alter table public.trades drop column if exists symbol;
alter table public.trades rename column qty to amount;
alter table public.trades add column if not exists leverage numeric not null default 1;
