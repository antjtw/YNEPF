// Emails the federation when someone uses the website contact form.
//
// Triggered by a Supabase Database Webhook on INSERT into public.contact_messages
// (see the README, "Email notifications"). Sends through Resend (resend.com).
//
// Secrets (Edge Functions > Secrets, or `supabase secrets set`):
//   RESEND_API_KEY   required
//   WEBHOOK_SECRET   recommended: also add it as a header "x-webhook-secret" on the webhook
//   NOTIFY_TO        optional, defaults to ynepfentries@gmail.com
//   MAIL_FROM        optional, defaults to "YNEPF website <onboarding@resend.dev>"
import { buildEmail } from "./build-email.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) return new Response("unauthorised", { status: 401 });

  let payload: { type?: string; table?: string; record?: Record<string, string> };
  try { payload = await req.json(); } catch { return new Response("bad request", { status: 400 }); }
  if (payload.type !== "INSERT" || payload.table !== "contact_messages" || !payload.record) return new Response("ignored");

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return new Response("RESEND_API_KEY is not set", { status: 500 });

  const email = buildEmail(payload.record as never, {
    from: Deno.env.get("MAIL_FROM") ?? "YNEPF website <onboarding@resend.dev>",
    to: Deno.env.get("NOTIFY_TO") ?? "ynepfentries@gmail.com",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });
  if (!res.ok) { console.error("Resend failed", res.status, await res.text()); return new Response("send failed", { status: 502 }); }
  return new Response("sent");
});
