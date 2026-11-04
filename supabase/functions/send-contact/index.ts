// Emails the federation when someone uses the website contact form.
//
// The contact page posts here directly. Nothing is stored: the message goes
// straight to the entries inbox, with the sender's address as the reply-to, so
// whoever looks after the inbox just hits Reply. Sends through Resend (resend.com).
//
// Deploy with "Verify JWT" switched OFF (the website's publishable key is not a
// JWT, and visitors are not signed in). Anyone can call this function, so it
// validates everything and limits how often one address can use it.
//
// Secrets (Edge Functions > Secrets, or `supabase secrets set`):
//   RESEND_API_KEY   required
//   NOTIFY_TO        optional, defaults to ynepfentries@gmail.com
//   MAIL_FROM        optional, defaults to "YNEPF website <onboarding@resend.dev>"
//   ALLOWED_ORIGIN   optional, the website address (for example https://ynepf.vercel.app).
//                    Leave unset to allow any website to call it.
import { buildEmail, validateContact } from "./build-email.ts";

const HOUR = 60 * 60 * 1000;
const sent: { at: number; email: string }[] = [];   // best-effort, per running instance

function allowed(email: string): boolean {
  const now = Date.now();
  while (sent.length && now - sent[0].at > HOUR) sent.shift();
  if (sent.length >= 60) return false;
  if (sent.filter((s) => s.email === email.toLowerCase()).length >= 3) return false;
  sent.push({ at: now, email: email.toLowerCase() });
  return true;
}

Deno.serve(async (req: Request) => {
  const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
  const cors = {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "content-type, apikey, authorization",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "origin",
  };
  const reply = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });
  if (origin !== "*" && req.headers.get("origin") && req.headers.get("origin") !== origin) return reply(403, { error: "forbidden" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "bad_request" }); }

  const problem = validateContact(body);
  if (problem) return reply(400, { error: "invalid", detail: problem });
  if (!allowed(String(body.email))) return reply(429, { error: "rate_limited" });

  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) { console.error("RESEND_API_KEY is not set"); return reply(500, { error: "not_configured" }); }

  const email = buildEmail(body as never, {
    from: Deno.env.get("MAIL_FROM") ?? "YNEPF website <onboarding@resend.dev>",
    to: Deno.env.get("NOTIFY_TO") ?? "ynepfentries@gmail.com",
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(email),
  });
  if (!res.ok) { console.error("Resend failed", res.status, await res.text()); return reply(502, { error: "send_failed" }); }
  return reply(200, { ok: true });
});
