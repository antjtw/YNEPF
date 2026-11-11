// Starts an entry: checks the rules, holds a place, and opens a Stripe embedded Checkout.
//
// The entry form posts here. The work is done in the database function start_entry(), so two
// people can never take the last place. Then a Stripe Checkout Session is created and its
// client secret is returned so the payment form can appear inside our own page.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF.
//
// Secrets (Edge Functions > Secrets):
//   STRIPE_SECRET_KEY        sk_test_... while testing, sk_live_... at launch. NEVER put this anywhere else.
//   STRIPE_PUBLISHABLE_KEY   pk_test_... / pk_live_... (safe to show; sent back to the form)
//   SITE_URL                 https://www.ynepf.co.uk (or the preview address while testing)
//   ALLOWED_ORIGIN           optional; leave unset while testing on preview addresses
// Supabase fills in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by itself.

// Stripe changes option names between API versions. Pinning one means a new default on the account cannot break us.
export const STRIPE_VERSION = "2024-06-20";

// Plain words for the codes start_entry() raises.
export const MESSAGES: Record<string, string> = {
  closed: "Entries for this competition are closed.",
  not_open: "Entries for this competition have not opened yet, or your priority link does not match this email address.",
  full: "Sorry, this competition is full. Please join the waiting list.",
  already_entered: "You have already entered this competition. Check your email for the confirmation.",
  guest_not_open: "Entries from outside the Yorkshire & North East division have not opened yet. Please come back later.",
  "invalid:division": "Please choose the federation or division you are part of.",
  "invalid:club": "Please choose your club from the list, or choose unattached.",
  duplicate_bp: "A lifter with that membership number has already entered. If this is a mistake, please contact the entries team.",
  "invalid:openipf": "Please enter your OpenIPF profile link, starting https://www.openipf.org/",
  no_price: "We could not work out a price for that combination. Please email the entries team.",
  "invalid:full_name": "Please enter your full name.",
  "invalid:email": "Please check your email address.",
  "invalid:date_of_birth": "Please check your date of birth.",
  "invalid:too_young": "Lifters must be at least 14 in the year of the competition.",
  "invalid:sex": "Please choose men's or women's.",
  "invalid:eligibility": "Please confirm you are eligible to enter.",
  "invalid:event": "Please choose an event.",
  "invalid:equipment": "Please choose equipment.",
  "invalid:weight_class": "Please choose a weight class that matches men's or women's.",
  "invalid:guardian": "A parent or guardian's name, phone, email and consent are needed for lifters under 18.",
  "invalid:access_consent": "Please tick the box to agree we can keep your access needs so we can help you on the day.",
};

// The code is the text after the last "ERROR:" and before any detail line.
export function errorCode(message: string): string {
  const m = String(message ?? "").replace(/^.*?ERROR:\s*/s, "").split("\n")[0].trim();
  return m in MESSAGES ? m : "unknown";
}

// Stripe wants form-encoded bodies with bracketed keys.
export function formEncode(obj: Record<string, string | number>): string {
  return Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export function sessionParams(o: { entryId: string; email: string; name: string; pence: number; competition: string; siteUrl: string; expiresAt: number }) {
  return {
    ui_mode: "embedded",
    mode: "payment",
    customer_email: o.email,
    client_reference_id: o.entryId,
    return_url: `${o.siteUrl}/entry-thanks?session_id={CHECKOUT_SESSION_ID}`,
    expires_at: o.expiresAt,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": o.pence,
    "line_items[0][price_data][product_data][name]": `Entry: ${o.competition}`,
    "line_items[0][price_data][product_data][description]": o.name,
    "metadata[entry_id]": o.entryId,
    "payment_intent_data[metadata][entry_id]": o.entryId,
  };
}

if (typeof Deno !== "undefined") {
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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!stripeKey || !url || !svc) { console.error("function is not configured"); return reply(500, { error: "not_configured" }); }
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (!siteUrl) { console.error("SITE_URL is not set"); return reply(500, { error: "not_configured" }); }

    // A signed-in entries team member may preview an unpublished (test) competition. This is decided here from
    // their login, never from anything the browser says about itself.
    delete body.allow_unpublished;
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token && token !== Deno.env.get("SUPABASE_ANON_KEY") && body.preview === true) {
      const who = await fetch(`${url}/rest/v1/rpc/is_entries`, {
        method: "POST", headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? svc, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}",
      });
      if (who.ok && (await who.json()) === true) body.allow_unpublished = true;
    }
    delete body.preview;

    // 1. Rules, price and a held place, all in one database step.
    const rpc = await fetch(`${url}/rest/v1/rpc/start_entry`, {
      method: "POST",
      headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" },
      body: JSON.stringify({ p: body }),
    });
    const out = await rpc.json().catch(() => ({}));
    if (!rpc.ok) {
      const code = errorCode(out?.message ?? "");
      if (code === "unknown") { console.error("start_entry failed", JSON.stringify(out)); return reply(500, { error: "failed" }); }
      return reply(422, { error: code, message: MESSAGES[code] });
    }
    const { entry_id, price_pence, competition } = out as { entry_id: string; price_pence: number; competition: string };

    // 2. A free entry (price 0) needs no payment.
    if (price_pence === 0) {
      await fetch(`${url}/rest/v1/entries?id=eq.${entry_id}`, {
        method: "PATCH",
        headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "comped", paid_at: new Date().toISOString() }),
      });
      return reply(200, { free: true, entry_id });
    }

    // 3. Stripe embedded Checkout. Stripe's shortest allowed life is 30 minutes; our own hold is shorter
    //    and is what decides whether the place is still ours (the webhook handles a late payment).
    const params = sessionParams({
      entryId: entry_id, email: String(body.email ?? "").trim().toLowerCase(), name: String(body.full_name ?? "").trim(),
      pence: price_pence, competition, siteUrl, expiresAt: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${stripeKey}`, "stripe-version": STRIPE_VERSION, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `entry-${entry_id}` },
      body: formEncode(params),
    });
    const session = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Stripe failed", res.status, JSON.stringify(session?.error ?? session));
      await fetch(`${url}/rest/v1/entries?id=eq.${entry_id}`, {   // give the place back
        method: "PATCH",
        headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "payment could not be started" }),
      });
      return reply(502, { error: "payment_unavailable", message: "We could not start the payment. Please try again in a moment." });
    }
    await fetch(`${url}/rest/v1/payments`, {
      method: "POST",
      headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ entry_id, stripe_session_id: session.id, amount_pence: price_pence, status: "pending" }),
    });
    return reply(200, {
      client_secret: session.client_secret,
      publishable_key: Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "",
      entry_id,
      price_pence,
    });
  });
}
