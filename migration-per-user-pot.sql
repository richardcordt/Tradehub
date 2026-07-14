-- Run this in your EXISTING Supabase project's SQL Editor to switch the Total Pot
-- from one shared starting balance to a starting pot PER USER, set individually by
-- the admin. Safe to run once.

-- 1. Add a starting pot column to each user's profile
alter table public.profiles add column if not exists starting_pot numeric not null default 0;

-- 2. A helper function to check admin status without causing RLS recursion
--    (security definer lets this bypass RLS internally when checking the role)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 3. Allow admins to update any profile's starting_pot (needed for the admin panel)
drop policy if exists "profiles updatable by admin" on public.profiles;
create policy "profiles updatable by admin"
  on public.profiles for update
  using (public.is_admin());

-- 4. The old shared "settings" table/pot is no longer used and can be left in place
--    harmlessly, or removed if you'd like a tidy schema:
-- drop table if exists public.settings;
