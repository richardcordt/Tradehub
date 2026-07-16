-- Run this in your EXISTING Supabase project's SQL Editor to add admin-recorded
-- deposits: money added to a user's pot (e.g. topping up their trading account),
-- separate from their one-time starting pot. Mirrors the withdrawals feature.

create table public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  amount numeric not null check (amount > 0),
  deposit_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

alter table public.deposits enable row level security;

-- A trader can see their own deposits; admin sees everyone's.
create policy "deposits readable own or admin"
  on public.deposits for select
  using (auth.uid() = user_id or public.is_admin());

-- Only admins can record or remove a deposit.
create policy "deposits insertable by admin only"
  on public.deposits for insert
  with check (public.is_admin());

create policy "deposits deletable by admin only"
  on public.deposits for delete
  using (public.is_admin());
