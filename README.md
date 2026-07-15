# Ledger — trade log with per-user accounts

A small terminal-styled app for logging trades: everyone can see the public ledger,
each trader manages their own positions, and an admin can log or manage trades for anyone.
Free to host — Supabase (database + auth) and Vercel or Netlify (hosting) both have
generous free tiers.

## 1. Create a Supabase project

1. Go to https://supabase.com, sign up, and create a new project (free tier).
2. In the dashboard, open **SQL Editor > New query**, paste the contents of
   `supabase-schema.sql` from this folder, and run it. This creates the tables,
   security rules, and the "first sign-up becomes admin" logic.
3. Go to **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
4. (Optional but recommended for a quick test) Go to **Authentication > Providers > Email**
   and turn **off** "Confirm email" while you're testing, so you can sign up and log in
   immediately without checking an inbox. Turn it back on before sharing the app widely.

## 2. Run it locally

You'll need [Node.js](https://nodejs.org) installed.

```bash
cd trade-ledger
cp .env.example .env
# edit .env and paste in your Project URL and anon key
npm install
npm run dev
```

Open the local URL it prints. Sign up — the first account you create becomes admin.

## 3. Deploy it for free

**Option A — Vercel**
1. Push this folder to a GitHub repo.
2. Go to https://vercel.com, sign in with GitHub, click "New Project", pick the repo.
3. It will auto-detect Vite. Before deploying, add your two environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) under Project Settings > Environment Variables.
4. Deploy. You'll get a free `yourproject.vercel.app` URL anyone can use.

**Option B — Netlify**
Same idea: connect the GitHub repo at https://netlify.com, set the build command to
`npm run build` and publish directory to `dist`, add the same two environment variables,
and deploy.

## How accounts work

- Sign-up uses email + password (via Supabase Auth) plus a display username.
- The **first person ever to sign up becomes admin** automatically. Everyone after
  that signs up as a regular trader.
- Traders can log, close, reopen, and delete only their own trades.
- The admin can do all of that for any user, from the Admin tab.
- Everyone can see the full public Ledger, filterable by user.
- Real login sessions persist across reloads (unlike the in-chat prototype version).

## How pots work

- Each trader has their own **starting pot**, set individually by the admin
  (Admin tab → "Starting pots by user").
- Every trader's individual **pot** = their starting pot + their own realized P&L.
  This is visible to everyone on the Ledger tab under "Pots by user".
- The header's **Total Pot** is the sum of everyone's individual pots.

## Installing it like an app (no app store needed)

This app is set up as a **Progressive Web App (PWA)**. Once deployed, anyone can add
it to their phone's home screen and it'll open full-screen with its own icon, just
like a normal app — no App Store or Play Store required.

**On iPhone (Safari):**
1. Open your deployed site in Safari (must be Safari, not Chrome, for this to work on iOS)
2. Tap the Share icon (square with an arrow)
3. Tap "Add to Home Screen"

**On Android (Chrome):**
1. Open your deployed site in Chrome
2. Tap the "⋮" menu → "Add to Home screen" (or Chrome may prompt automatically)

That's it — the icon, splash screen, and full-screen behavior are already configured.

## Notes

- To promote someone to admin later, or add more admins, run in the SQL Editor:
  `update public.profiles set role = 'admin' where username = 'their-username';`
- Password reset / "forgot password" emails work automatically via Supabase Auth
  once you configure an email provider in Supabase (Authentication > Email Templates) —
  worth doing before sharing this with real users.
