// Tells the confirmation page whether a payment has been confirmed yet, so the page only says "You're in" when it
// is true. The page asks with the Stripe session id from its own address (a long random value only the person who
// paid has). Nothing personal is returned: just a word.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF.
// Supabase fills in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by itself.

// paid | refunded | pending | unknown
export function statusFrom(rows: { status: string; entries?: { status: string } | { status: string }[] | null }[]): string {
  const row = rows[0];
  if (!row) return "unknown";
  const entry = Array.isArray(row.entries) ? row.entries[0] : row.entries;
  if (entry && (entry.status === "paid" || entry.status === "comped")) return "paid";
  if (entry && entry.status === "refunded") return "refunded";
  return "pending";
}
export const validSession = (s: string) => /^cs_[A-Za-z0-9_]{8,200}$/.test(s);
export const validEntry = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, apikey, authorization", "access-control-allow-methods": "GET, OPTIONS", vary: "origin" };
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "GET") return reply(405, { error: "method_not_allowed" });
    const q = new URL(req.url).searchParams, session = q.get("session_id") ?? "", entry = q.get("entry_id") ?? "";
    if (!validSession(session) && !validEntry(entry)) return reply(200, { status: "unknown" });
    const url = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !svc) return reply(500, { error: "not_configured" });
    const H = { apikey: svc, authorization: `Bearer ${svc}` };
    if (validSession(session)) {
      const r = await fetch(`${url}/rest/v1/payments?stripe_session_id=eq.${encodeURIComponent(session)}&select=status,entries(status)&limit=1`, { headers: H });
      if (!r.ok) { console.error("entry-status lookup failed", r.status); return reply(502, { error: "lookup_failed" }); }
      return reply(200, { status: statusFrom(await r.json()) });
    }
    // A free entry has no payment: look at the entry itself (its id is a long random value only its owner is sent).
    const r = await fetch(`${url}/rest/v1/entries?id=eq.${entry}&select=status&limit=1`, { headers: H });
    if (!r.ok) { console.error("entry-status lookup failed", r.status); return reply(502, { error: "lookup_failed" }); }
    const [row] = await r.json();
    return reply(200, { status: !row ? "unknown" : row.status === "paid" || row.status === "comped" ? "paid" : row.status === "refunded" ? "refunded" : "pending" });
  });
}
