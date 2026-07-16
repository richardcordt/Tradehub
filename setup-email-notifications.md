# Email notifications when a trade is opened or closed

This sends a real email to a trader's own account email whenever one of their trades
is opened or closed — whether they did it themselves or an admin did it for them.

This needs a few things browsers can't do alone, so it's set up as a small
**Supabase Edge Function**, triggered by a **Database Webhook**, sending email via
**Gmail SMTP** (so you don't need to buy or verify a domain — just a Gmail account).

## 1. Get a Gmail "App Password"

1. Go to your Google Account → **Security**
2. Turn on **2-Step Verification** if it isn't already on (required for app passwords)
3. Search Google Account settings for **"App Passwords"**, create one for "Mail"
4. Copy the 16-character password it gives you — you'll need it below

(You can use any Gmail address for this, including a fresh one made just for sending
these notifications, e.g. `yourledgerapp@gmail.com`.)

## 2. Install the Supabase CLI and deploy the function

You'll need [Node.js](https://nodejs.org) already installed (you have this from the
main app setup).

```powershell
npm install -g supabase
supabase login
```

This opens a browser to log in. Then, from inside your `trade-ledger` project folder:

```powershell
supabase link --project-ref YOUR_PROJECT_REF
```

(Find your project ref in the Supabase dashboard URL: `supabase.com/dashboard/project/YOUR_PROJECT_REF`)

```powershell
supabase functions deploy trade-notify --no-verify-jwt
```

The `--no-verify-jwt` flag is needed because the database webhook calling this
function won't have a normal user login token.

## 3. Set the function's secrets

Pick a random password-like string for `WEBHOOK_SECRET` yourself (this just stops
random people on the internet from triggering emails by guessing your function's URL).

```powershell
supabase secrets set SMTP_HOSTNAME=smtp.gmail.com SMTP_PORT=465 SMTP_USERNAME=youraddress@gmail.com SMTP_PASSWORD=your16digitapppassword WEBHOOK_SECRET=some-random-string-you-make-up
```

## 4. Create the Database Webhook

In the Supabase dashboard:
1. Go to **Database → Webhooks → Create a new webhook**
2. Name: `trade-notify`
3. Table: `trades`
4. Events: check **Insert** and **Update**
5. Type: **HTTP Request**
6. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/trade-notify`
7. HTTP Headers: add one —
   - Key: `x-webhook-secret`
   - Value: the same random string you used for `WEBHOOK_SECRET` above
8. Save

## That's it

From now on:
- Opening a trade (self-added or admin-added) emails that trader
- Closing a trade emails that trader
- Reopening a trade, editing other fields, or deleting a trade does **not** send an email

## Notes

- Emails come from whatever Gmail address you used — traders will see that as the sender.
- Gmail's free sending limit is 500 emails/day, which is very unlikely to be a problem here.
- If you'd rather not use a personal Gmail account long-term, this same function works
  with any SMTP provider (just change `SMTP_HOSTNAME`/`SMTP_PORT` and credentials) —
  e.g. a proper transactional service if you get a domain down the line.
- To check if something's not working: Supabase dashboard → Edge Functions → `trade-notify`
  → Logs, shows every invocation and any errors.
