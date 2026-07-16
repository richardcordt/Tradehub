// Supabase Edge Function: emails a trader when one of their trades is opened or closed.
// Triggered by a Database Webhook on the "trades" table (INSERT and UPDATE events).
// Sends via SMTP (configured for Gmail by default) so no custom domain is required.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts"

const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")
const SMTP_HOSTNAME = Deno.env.get("SMTP_HOSTNAME") ?? "smtp.gmail.com"
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? "465")
const SMTP_USERNAME = Deno.env.get("SMTP_USERNAME")!
const SMTP_PASSWORD = Deno.env.get("SMTP_PASSWORD")!

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are automatically available to every
// Edge Function — no need to set them yourself.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return "—"
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

serve(async (req) => {
  try {
    // Simple shared-secret check so random requests can't trigger emails.
    if (WEBHOOK_SECRET) {
      const provided = req.headers.get("x-webhook-secret")
      if (provided !== WEBHOOK_SECRET) {
        return new Response("unauthorized", { status: 401 })
      }
    }

    const payload = await req.json()
    const { type, record, old_record } = payload

    let subject = ""
    let body = ""

    if (type === "INSERT") {
      subject = `Trade opened: ${record.side} $${fmt(record.amount)} @ ${record.leverage}x`
      body =
        `A trade was opened on your account.\n\n` +
        `Side: ${record.side}\n` +
        `Amount: $${fmt(record.amount)}\n` +
        `Leverage: ${record.leverage}x\n` +
        `Entry price: ${record.entry_price}\n` +
        `Entry date: ${record.entry_date}\n` +
        (record.notes ? `Notes: ${record.notes}\n` : "")
    } else if (type === "UPDATE" && record.status === "CLOSED" && old_record?.status !== "CLOSED") {
      // only fires the moment a trade actually transitions into CLOSED,
      // not on every future edit to an already-closed trade
      subject = `Trade closed: ${record.side} $${fmt(record.amount)} @ ${record.leverage}x`
      body =
        `A trade was closed on your account.\n\n` +
        `Side: ${record.side}\n` +
        `Amount: $${fmt(record.amount)}\n` +
        `Leverage: ${record.leverage}x\n` +
        `Entry price: ${record.entry_price}\n` +
        `Exit price: ${record.exit_price}\n` +
        `Exit date: ${record.exit_date}\n`
    } else {
      // not an event we notify on (e.g. reopening a trade, or unrelated field edits)
      return new Response("ignored", { status: 200 })
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(record.user_id)
    if (userError || !userData?.user?.email) {
      return new Response("no email found for this user", { status: 200 })
    }

    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOSTNAME,
        port: SMTP_PORT,
        tls: true,
        auth: { username: SMTP_USERNAME, password: SMTP_PASSWORD },
      },
    })

    await client.send({
      from: SMTP_USERNAME,
      to: userData.user.email,
      subject,
      content: body,
    })

    await client.close()

    return new Response("sent", { status: 200 })
  } catch (err) {
    console.error(err)
    return new Response(String(err), { status: 500 })
  }
})
