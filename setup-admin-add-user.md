# Enabling "Add User" (admin creates accounts instantly, no verification)

This feature is code-only — no database migration needed. But it only truly skips
verification if your Supabase project has email confirmation turned off.

## One-time setup

1. In Supabase: **Authentication → Providers → Email**
2. Turn **off** "Confirm email"
3. Save

## Important trade-off

This setting is project-wide — it applies to **every** sign-up, not just ones the
admin creates. So:

- Admin-created accounts work instantly, as requested. ✅
- If you ever expose the public "Sign Up" screen to strangers (rather than only
  admin adding people), anyone could sign up instantly too, with no email check.

For a small private trading log where the admin is the only one adding people,
this is usually fine. If you'd rather keep email verification for public
self-signups while still letting the admin bypass it, that requires a small
server-side function (a Supabase Edge Function using the service role key) instead
of the simpler approach used here — let me know if you want that built instead.

## How it works

The Admin tab now has an "Add User" form (username, email, password). It creates
the account using a second, isolated Supabase client in the browser so it doesn't
swap out the admin's own logged-in session. The new account is a regular trader by
default — the existing "first user becomes admin" rule only applies to the very
first sign-up ever, so accounts added this way come through as traders.
