-- Run this in your EXISTING Supabase project's SQL Editor to add a "Total Pot" feature:
-- a starting balance that admins can set, shown alongside the running realized P&L.

create table public.settings (
  id int primary key default 1,
  starting_pot numeric not null default 0,
  updated_at timestamptz default now(),
  constraint single_row check (id = 1)
);

insert into public.settings (id, starting_pot) values (1, 0);

alter table public.settings enable row level security;

create policy "settings readable by logged in users"
  on public.settings for select
  using (auth.role() = 'authenticated');

create policy "settings updatable by admin only"
  on public.settings for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
