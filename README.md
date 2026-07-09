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

## Notes

- To promote someone to admin later, or add more admins, run in the SQL Editor:
  `update public.profiles set role = 'admin' where username = 'their-username';`
- Password reset / "forgot password" emails work automatically via Supabase Auth
  once you configure an email provider in Supabase (Authentication > Email Templates) —
  worth doing before sharing this with real users.
