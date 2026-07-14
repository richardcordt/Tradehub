-- Run this in your EXISTING Supabase project's SQL Editor to restrict what regular
-- traders can see: from now on, a non-admin can only fetch their OWN trades and their
-- OWN profile/pot — never anyone else's. Admins are unaffected and still see everyone.
--
-- This is enforced at the database level (Row Level Security), not just hidden in the
-- app's UI, so it holds even if someone inspected the network requests directly.

-- Trades: replace the "everyone sees everything" read policy
drop policy if exists "trades readable by logged in users" on public.trades;
create policy "trades readable own or admin"
  on public.trades for select
  using (auth.uid() = user_id or public.is_admin());

-- Profiles: replace the "everyone sees everything" read policy
drop policy if exists "profiles readable by logged in users" on public.profiles;
create policy "profiles readable own or admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());
