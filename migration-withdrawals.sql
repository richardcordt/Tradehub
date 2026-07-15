-- Run this in your EXISTING Supabase project's SQL Editor to add profit withdrawals:
-- admin-only records of money taken out of a user's pot. Reduces that user's pot and
-- is shown as a visible line item (not just a silent subtraction).

create table public.withdrawals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  amount numeric not null check (amount > 0),
  withdrawal_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

alter table public.withdrawals enable row level security;

-- A trader can see their own withdrawals; admin sees everyone's.
create policy "withdrawals readable own or admin"
  on public.withdrawals for select
  using (auth.uid() = user_id or public.is_admin());

-- Only admins can record or remove a withdrawal.
create policy "withdrawals insertable by admin only"
  on public.withdrawals for insert
  with check (public.is_admin());

create policy "withdrawals deletable by admin only"
  on public.withdrawals for delete
  using (public.is_admin());
