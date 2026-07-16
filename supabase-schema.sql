-- Run this once in your Supabase project's SQL Editor (Dashboard > SQL Editor > New query).
-- This is for a BRAND NEW project. If you already ran an earlier version of this file,
-- use the migration-*.sql files instead to update your existing tables.

-- 1. Profiles table: one row per user, holds username, role, and their starting pot
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  role text not null default 'trader' check (role in ('admin','trader')),
  starting_pot numeric not null default 0,
  created_at timestamptz default now()
);

-- 2. Trades table
create table public.trades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  side text not null check (side in ('LONG','SHORT')),
  amount numeric not null,        -- stake in USD
  leverage numeric not null default 1,
  entry_price numeric not null,
  entry_date date not null,
  notes text,
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  exit_price numeric,
  exit_date date,
  created_at timestamptz default now()
);

-- 3. Withdrawals: admin-only records of profit taken out of a user's pot
create table public.withdrawals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  amount numeric not null check (amount > 0),
  withdrawal_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- 4. Deposits: admin-only records of money added to a user's pot
create table public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  username text not null,
  amount numeric not null check (amount > 0),
  deposit_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- 5. Auto-create a profile row whenever someone signs up.
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

-- 4. Helper function to check admin status without RLS recursion
--    (security definer lets this check bypass RLS internally)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 5. Row Level Security
alter table public.profiles enable row level security;
alter table public.trades enable row level security;
alter table public.withdrawals enable row level security;
alter table public.deposits enable row level security;

-- Everyone logged in can see their own profile; admins can see everyone's
-- (needed for the admin "assign user" dropdown, per-user pots, and usernames on trades).
create policy "profiles readable own or admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- Only admins can edit a profile (used to set each user's starting pot).
create policy "profiles updatable by admin"
  on public.profiles for update
  using (public.is_admin());

-- A trader can see their own trades; an admin can see everyone's.
create policy "trades readable own or admin"
  on public.trades for select
  using (auth.uid() = user_id or public.is_admin());

-- Insert: a trader can log a trade for themselves; an admin can log for anyone.
create policy "insert own trades or admin any"
  on public.trades for insert
  with check (
    auth.uid() = user_id
    or public.is_admin()
  );

-- Update: a trader can edit/open/close their own trades; an admin can edit any.
create policy "update own trades or admin any"
  on public.trades for update
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- Delete: same rule as update.
create policy "delete own trades or admin any"
  on public.trades for delete
  using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- Withdrawals: a trader can see their own; only admins can create or delete.
create policy "withdrawals readable own or admin"
  on public.withdrawals for select
  using (auth.uid() = user_id or public.is_admin());

create policy "withdrawals insertable by admin only"
  on public.withdrawals for insert
  with check (public.is_admin());

create policy "withdrawals deletable by admin only"
  on public.withdrawals for delete
  using (public.is_admin());

-- Deposits: a trader can see their own; only admins can create or delete.
create policy "deposits readable own or admin"
  on public.deposits for select
  using (auth.uid() = user_id or public.is_admin());

create policy "deposits insertable by admin only"
  on public.deposits for insert
  with check (public.is_admin());

create policy "deposits deletable by admin only"
  on public.deposits for delete
  using (public.is_admin());
