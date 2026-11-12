// Receives Stripe's messages ("this payment succeeded", "this checkout expired") and updates the entry.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF
// (Stripe is not a signed-in user; the message is checked with Stripe's signing secret instead).
//
// In Stripe: Developers > Webhooks > add the function's URL, listening for
//   checkout.session.completed, checkout.session.expired
//
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_...), RESEND_API_KEY,
//          MAIL_FROM, NOTIFY_TO (the entries inbox gets a copy of every confirmation).
// Supabase fills in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by itself.

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

// Checks Stripe's signature header ("t=...,v1=...") against the raw body. Rejects old messages (replays).
export async function verifySignature(payload: string, header: string, secret: string, now = Date.now(), toleranceSec = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").map((p) => p.trim()).filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`)));
  return sigs.some((s) => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

// The year they turn the age decides the category, not the day (the same rule as the database).
export function ageCategory(yearOfBirth: number, competitionYear: number): string {
  const d = competitionYear - yearOfBirth;
  return d < 14 ? "" : d <= 18 ? "Sub-junior" : d <= 23 ? "Junior" : d <= 39 ? "Open" : d <= 49 ? "Masters 1 (M1)" : d <= 59 ? "Masters 2 (M2)" : d <= 69 ? "Masters 3 (M3)" : "Masters 4 (M4)";
}
// Exact age on the day (the under-18 guardian rule uses this, not the calendar year).
export function exactAge(dob: string, on: string): number {
  const b = new Date(dob), c = new Date(on);
  let a = c.getUTCFullYear() - b.getUTCFullYear();
  if (c.getUTCMonth() < b.getUTCMonth() || (c.getUTCMonth() === b.getUTCMonth() && c.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
export function pounds(pence: number): string { return "£" + (pence / 100).toFixed(2); }

export function confirmationEmail(e: { name: string; competition: string; date: string; event: string; equipment: string; pence: number; under18: boolean; entriesEmail: string; refundsUntil?: string; category?: string; division?: string; club?: string; discountPence?: number; extras?: { name: string; option?: string; pence: number }[] }) {
  const lines = [
    `Hi ${e.name},`, "",
    `You are entered in ${e.competition} (${e.date}). Thank you!`, "",
    `Event: ${e.event}`, `Equipment: ${e.equipment}`, ...(e.category ? [`Category: ${e.category}`] : []), ...(e.division ? [`Federation or division: ${e.division}`] : []), ...(e.club ? [`Club: ${e.club}`] : []),
    ...(e.discountPence ? [`Discount applied: ${pounds(e.discountPence)} off`] : []),
    ...((e.extras ?? []).map((x) => `Extra: ${x.name}${x.option ? ` (${x.option})` : ""}, ${pounds(x.pence)}`)), `Paid: ${pounds(e.pence)}`, "",
  ];
  if (e.under18) lines.push("Because you are under 18 on the day, a parent or guardian must be with you at the competition.", "");
  if (e.refundsUntil) lines.push(`Refunds are available until entries close on ${e.refundsUntil}. After that, entries cannot be refunded.`, "");
  lines.push(
    "Your name, club and weight class will be shown on the entries list and the lifting order. Your date of birth is never published.", "",
    `If anything is wrong, or you would like us to change or delete the information we hold about you, reply to this email or write to ${e.entriesEmail}.`, "",
    "YNEPF",
  );
  return lines.join("\n");
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const url = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!secret || !stripeKey || !url || !svc) { console.error("function is not configured"); return new Response("not configured", { status: 500 }); }

    const payload = await req.text();
    if (!(await verifySignature(payload, req.headers.get("stripe-signature") ?? "", secret))) return new Response("bad signature", { status: 400 });
    const event = JSON.parse(payload);

    const H = { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" };
    const db = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
    const rpc = async (fn: string, args: Record<string, unknown>) => (await db(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) })).json();
    const stripe = (path: string, body?: string) => fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: { authorization: `Bearer ${stripeKey}`, "stripe-version": "2024-06-20", ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) }, body,
    }).then((r) => r.json());

    // Each Stripe message is handled once, however many times it is delivered.
    const seen = await db(`stripe_events?id=eq.${encodeURIComponent(event.id)}&select=id,processed_at`);
    const prior = (await seen.json())[0];
    if (prior?.processed_at) return new Response("already done", { status: 200 });
    if (!prior) await db("stripe_events", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ id: event.id, type: event.type }) });

    try {
      const session = event.data.object;
      const entryId = session.client_reference_id ?? session.metadata?.entry_id;

      if (event.type === "checkout.session.completed" && session.payment_status === "paid" && entryId) {
        const state = await rpc("confirm_entry_payment", { e: entryId });
        const pi = session.payment_intent
          ? await stripe(`payment_intents/${session.payment_intent}?expand[]=latest_charge.balance_transaction`) : null;
        const charge = pi?.latest_charge ?? {};
        await db(`payments?stripe_session_id=eq.${encodeURIComponent(session.id)}`, {
          method: "PATCH", headers: { prefer: "return=minimal" },
          body: JSON.stringify({
            status: "succeeded", stripe_payment_intent: session.payment_intent ?? null,
            stripe_fee_pence: charge.balance_transaction?.fee ?? 0, card_brand: charge.payment_method_details?.card?.brand ?? "",
            card_last4: charge.payment_method_details?.card?.last4 ?? "", receipt_url: charge.receipt_url ?? "",
          }),
        });
        const [row] = await (await db(`entries?id=eq.${entryId}&select=email,full_name,event,equipment,price_pence,date_of_birth,club,discount_pence,divisions(name,is_home),competitions(name,start_date,entry_closes)`)).json();
        const from = Deno.env.get("MAIL_FROM") ?? "YNEPF <onboarding@resend.dev>";
        const copy = Deno.env.get("NOTIFY_TO") ?? "ynepfentries@gmail.com";
        const send = (to: string[], subject: string, text: string) => fetch("https://api.resend.com/emails", {
          method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
          body: JSON.stringify({ from, to, subject, text, reply_to: copy }),
        }).then((r) => { if (!r.ok) console.error("Resend failed", r.status); });

        if (state === "paid" && row) {
          const xr = await (await db(`entry_addons?entry_id=eq.${entryId}&select=price_pence,addons(name),addon_options(label)`)).json().catch(() => []);
          const extras = (Array.isArray(xr) ? xr : []).map((x: { price_pence: number; addons?: { name: string }; addon_options?: { label: string } | null }) => ({ name: x.addons?.name ?? "Extra", option: x.addon_options?.label, pence: x.price_pence }));
          const compYear = new Date(row.competitions.start_date).getFullYear(), age = exactAge(row.date_of_birth, row.competitions.start_date);
          await send([row.email, copy], `Your entry: ${row.competitions.name}`, confirmationEmail({
            name: row.full_name, competition: row.competitions.name, date: row.competitions.start_date,
            event: row.event === "bench_only" ? "Bench only" : "Full power", equipment: row.equipment === "equipped" ? "Equipped" : "Classic",
            pence: row.price_pence, under18: age < 18, entriesEmail: copy, category: ageCategory(new Date(row.date_of_birth).getFullYear(), compYear), division: row.divisions ? row.divisions.name + (row.divisions.is_home ? "" : " (guest)") : undefined, club: row.club || undefined, discountPence: row.discount_pence || 0, extras,
            refundsUntil: row.competitions.entry_closes ? new Date(row.competitions.entry_closes).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" }) : undefined,
          }));
        } else if (state === "no_place" && row && session.payment_intent) {
          // Paid after the hold ran out and the competition filled in the meantime: refund in full.
          const refund = await stripe("refunds", `payment_intent=${encodeURIComponent(session.payment_intent)}`);
          const [pay] = await (await db(`payments?stripe_session_id=eq.${encodeURIComponent(session.id)}&select=id`)).json();
          if (pay && refund.id) {
            await db("refunds", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ payment_id: pay.id, stripe_refund_id: refund.id, amount_pence: row.price_pence, reason: "Paid after the place was released and the competition filled", created_by: "system" }) });
            await db(`entries?id=eq.${entryId}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "refunded", cancel_reason: "Paid after hold expired; competition full" }) });
          }
          await send([row.email, copy], `Your payment for ${row.competitions.name} has been refunded`,
            `Hi ${row.full_name},\n\nSorry: your payment arrived after your place was released and the competition has since filled, so we have refunded you in full (${pounds(row.price_pence)}). It can take a few days to reach your account.\n\nYou can join the waiting list on the competition page.\n\nYNEPF`);
        }
      } else if (event.type === "charge.refunded") {
        // A refund made in Stripe itself (or by our own refund function): make sure it is recorded here too.
        const charge = event.data.object, pi = charge.payment_intent;
        if (pi) {
          const [pay] = await (await db(`payments?stripe_payment_intent=eq.${encodeURIComponent(pi)}&select=id,amount_pence,entry_id`)).json();
          if (pay) {
            const list = await stripe(`refunds?payment_intent=${encodeURIComponent(pi)}&limit=100`);
            for (const r of (list.data ?? [])) {
              if (r.status === "failed" || r.status === "canceled") continue;
              // Ours are recorded first with the reason and who did it; this only adds ones we have not seen.
              await db("refunds?on_conflict=stripe_refund_id", { method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ payment_id: pay.id, stripe_refund_id: r.id, amount_pence: r.amount, reason: "Refunded in Stripe", created_by: "stripe" }) });
            }
            const total = (list.data ?? []).filter((r: { status: string }) => r.status !== "failed" && r.status !== "canceled").reduce((n: number, r: { amount: number }) => n + r.amount, 0);
            if (total >= pay.amount_pence) await db(`entries?id=eq.${pay.entry_id}&status=eq.paid`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "refunded", cancelled_at: new Date().toISOString(), cancel_reason: "Refunded in Stripe" }) });
          }
        }
      } else if (event.type === "checkout.session.expired") {
        await db(`payments?stripe_session_id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "expired" }) });
        if (entryId) await db(`entries?id=eq.${entryId}&status=eq.held`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "checkout expired" }) });
      }
      await db(`stripe_events?id=eq.${encodeURIComponent(event.id)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ processed_at: new Date().toISOString() }) });
      return new Response("ok", { status: 200 });
    } catch (err) {
      console.error("webhook failed", String(err));
      return new Response("failed", { status: 500 });    // Stripe will try again
    }
  });
}
