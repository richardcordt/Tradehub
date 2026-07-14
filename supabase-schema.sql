-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).

-- 1. Profiles table: one row per user, holds username + role
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  role text not null default 'trader' check (role in ('admin','trader')),
  created_at timestamptz default now()
);

-- 2. Trades table
create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  side text not null check (side in ('LONG','SHORT')),
  amount numeric not null,        -- stake in GBP
  leverage numeric not null default 1,
  entry_price numeric not null,
  entry_date date not null,
  notes text,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  exit_price numeric,
  exit_date date,
  created_at timestamptz default now()
);

-- 3. Auto-create a profile row whenever someone signs up.
--    The very first person to ever sign up becomes admin automatically;
--    everyone after that is a regular trader.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  user_count int;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    case when user_count = 0 then 'admin' else 'trader' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Row Level Security
alter table public.profiles enable row level security;
alter table public.trades enable row level security;

-- Anyone logged in can see all profiles (needed for the admin "assign user" dropdown
-- and to show usernames on the ledger) and all trades (the public ledger view).
create policy "profiles readable by logged in users"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "trades readable by logged in users"
  on public.trades for select
  using (auth.role() = 'authenticated');

-- Insert: a trader can log a trade for themselves; an admin can log for anyone.
create policy "insert own trades or admin any"
  on public.trades for insert
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Update: a trader can edit/open/close their own trades; an admin can edit any.
create policy "update own trades or admin any"
  on public.trades for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Delete: same rule as update.
create policy "delete own trades or admin any"
  on public.trades for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
