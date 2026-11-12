// Cancels an entry and/or refunds money through Stripe. Only the entries team (and admins) can use it: the caller's
// login is checked here before anything happens, and the refund is recorded against the entry with who did it and why.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF (the login is checked inside).
//
// Secrets: STRIPE_SECRET_KEY, RESEND_API_KEY, MAIL_FROM, NOTIFY_TO (same as the other functions).
// Supabase fills in SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY by itself.
//
// Stripe keeps its processing fee on a refund, so the federation bears that fee (it is already counted in the money report).

export const STRIPE_VERSION = "2024-06-20";

export interface Plan { error?: string; refundPence: number; finalStatus: string; cancel: boolean }

// What should happen? entryStatus: paid | comped | held. paidPence: what the lifter paid. refundedPence: refunded so far.
// refundPence: how much to refund now (0 for none). cancel: also take them out of the competition (frees the place).
export function refundPlan(o: { entryStatus: string; paidPence: number; refundedPence: number; refundPence: number; cancel: boolean }): Plan {
  const left = Math.max(o.paidPence - o.refundedPence, 0);
  const fail = (error: string): Plan => ({ error, refundPence: 0, finalStatus: o.entryStatus, cancel: false });
  if (!["paid", "comped", "held"].includes(o.entryStatus)) return fail("This entry has already been cancelled or refunded.");
  if (!Number.isInteger(o.refundPence) || o.refundPence < 0) return fail("The refund amount is not valid.");
  if (o.refundPence > 0 && o.entryStatus !== "paid") return fail("There is no payment to refund on this entry.");
  if (o.refundPence > left) return fail("That is more than is left to refund (" + (left / 100).toFixed(2) + " pounds).");
  if (o.refundPence === 0 && !o.cancel) return fail("Nothing to do: choose a refund, or cancel the entry.");
  const fully = o.refundPence > 0 && o.refundedPence + o.refundPence >= o.paidPence;
  // A full refund always ends the entry. A partial refund ends it only if asked.
  const cancel = o.cancel || fully;
  return { refundPence: o.refundPence, cancel, finalStatus: !cancel ? o.entryStatus : (fully ? "refunded" : "cancelled") };
}

export function pounds(pence: number): string { return "£" + (pence / 100).toFixed(2); }

export function refundEmail(o: { name: string; competition: string; refundedPence: number; cancelled: boolean; reason?: string; entriesEmail: string }) {
  const lines = [`Hi ${o.name},`, ""];
  if (o.cancelled) lines.push(`Your entry in ${o.competition} has been cancelled.`);
  else lines.push(`We have refunded part of your entry fee for ${o.competition}. You are still entered.`);
  if (o.refundedPence > 0) lines.push(`We have refunded ${pounds(o.refundedPence)} to the card you paid with. It can take 5 to 10 working days to show on your statement.`);
  else lines.push("No refund is due on this entry.");
  if (o.reason) lines.push("", `Reason: ${o.reason}`);
  lines.push("", `If you have any questions, reply to this email or write to ${o.entriesEmail}.`, "", "YNEPF");
  return lines.join("\n");
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, apikey, authorization", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

    const url = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY") ?? svc, stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!url || !svc || !stripeKey) { console.error("function is not configured"); return reply(500, { error: "not_configured" }); }

    // Who is asking? They must be signed in and on the entries team (or an admin).
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token || token === anon) return reply(401, { error: "sign_in", message: "Please sign in again." });
    const userRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon!, authorization: `Bearer ${token}` } });
    if (!userRes.ok) return reply(401, { error: "sign_in", message: "Please sign in again." });
    const actor = (await userRes.json())?.email ?? "unknown";
    const isEntries = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
    if (!isEntries.ok || (await isEntries.json()) !== true) return reply(403, { error: "forbidden", message: "Only the entries team can cancel or refund entries." });

    let body: { entry_id?: string; refund_pence?: number; cancel?: boolean; reason?: string; notify?: boolean };
    try { body = await req.json(); } catch { return reply(400, { error: "bad_request" }); }
    const reason = String(body.reason ?? "").trim();
    if (!body.entry_id || !/^[0-9a-f-]{36}$/i.test(body.entry_id)) return reply(400, { error: "bad_request", message: "Missing entry." });
    if (!reason) return reply(400, { error: "reason", message: "Please give a reason. It is kept in the history." });

    const H = { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" };
    const db = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    const [entry] = await (await db(`entries?id=eq.${body.entry_id}&select=id,status,full_name,email,competitions(name),payments(id,status,amount_pence,stripe_payment_intent,refunds(amount_pence))`)).json();
    if (!entry) return reply(404, { error: "not_found", message: "That entry was not found." });
    const pay = (entry.payments ?? []).find((p: { status: string }) => p.status === "succeeded");
    const paid = pay?.amount_pence ?? 0;
    const refundedSoFar = (pay?.refunds ?? []).reduce((n: number, r: { amount_pence: number }) => n + r.amount_pence, 0);
    const plan = refundPlan({ entryStatus: entry.status, paidPence: paid, refundedPence: refundedSoFar, refundPence: Math.round(Number(body.refund_pence ?? 0)), cancel: body.cancel !== false });
    if (plan.error) return reply(422, { error: "not_allowed", message: plan.error });

    let stripeRefundId: string | null = null;
    if (plan.refundPence > 0) {
      const form = new URLSearchParams({ payment_intent: pay.stripe_payment_intent, amount: String(plan.refundPence), "metadata[entry_id]": entry.id, "metadata[by]": actor });
      const r = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST", headers: { authorization: `Bearer ${stripeKey}`, "stripe-version": STRIPE_VERSION, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `refund-${entry.id}-${refundedSoFar}-${plan.refundPence}` }, body: form.toString(),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.error("Stripe refund failed", r.status, JSON.stringify(j?.error ?? j)); return reply(502, { error: "stripe", message: "Stripe would not refund that: " + (j?.error?.message ?? "unknown reason") }); }
      stripeRefundId = j.id;
      const rec = await db("refunds?on_conflict=stripe_refund_id", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ payment_id: pay.id, stripe_refund_id: stripeRefundId, amount_pence: plan.refundPence, reason, created_by: actor }) });
      if (!rec.ok) { console.error("refund sent but not recorded", stripeRefundId, await rec.text()); return reply(500, { error: "not_recorded", message: "The refund WAS sent to Stripe (" + stripeRefundId + ") but could not be recorded here. Please tell the website administrator." }); }
    }
    if (plan.cancel) {
      const upd = await db(`entries?id=eq.${entry.id}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: plan.finalStatus, cancelled_at: new Date().toISOString(), cancel_reason: reason, hold_expires_at: null }) });
      if (!upd.ok) { console.error("entry not updated", await upd.text()); return reply(500, { error: "not_recorded", message: "The money moved, but the entry could not be updated. Please tell the website administrator." }); }
    }
    if (body.notify !== false) {
      const from = Deno.env.get("MAIL_FROM") ?? "YNEPF <onboarding@resend.dev>", copy = Deno.env.get("NOTIFY_TO") ?? "ynepfentries@gmail.com";
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [entry.email, copy], reply_to: copy, subject: plan.cancel ? `Your entry has been cancelled: ${entry.competitions?.name ?? ""}` : `A refund for your entry: ${entry.competitions?.name ?? ""}`,
          text: refundEmail({ name: entry.full_name, competition: entry.competitions?.name ?? "the competition", refundedPence: plan.refundPence, cancelled: plan.cancel, reason, entriesEmail: copy }) }),
      });
      if (!sent.ok) console.error("Resend failed", sent.status);
    }
    return reply(200, { ok: true, status: plan.finalStatus, refunded_pence: plan.refundPence, stripe_refund: stripeRefundId });
  });
}
