// Keeps the list of clubs in step with the English Powerlifting Association (affiliated clubs) and British
// Powerlifting (approved clubs) websites. It reads the two public pages and stores club NAMES only (and the
// region British Powerlifting files a club under). Contact names, emails and phone numbers on those pages are
// never read into our database.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF. It is safe to call
// often: it does nothing if it already ran in the last 12 hours.
//
// It is run by the "Refresh club list" button in the editor and, if you set it up, on a schedule (see
// docs/entry-system/schedule-club-sync.sql). If either website changes shape and fewer clubs than expected are
// found, the function stops and leaves the existing list alone.
//
// Supabase fills in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by itself.

const EPA_URL = "https://www.englishpowerlifting.co.uk/affiliated-clubs";
const BP_URL = "https://www.britishpowerlifting.org/approved-clubs";
const MIN_EPA = 30;   // the EPA page lists around 65 clubs; far fewer means the page has changed
const MIN_BP = 10;    // the British Powerlifting register lists around 30

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };
export function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[​ ]/g, " ").replace(/\s+/g, " ").trim();
}
const clean = (s: string) => decode(s.replace(/<[^>]*>/g, " "));

// EPA: a table. The first cell of each row is the club name, the second begins "Club Contact:".
export function parseEpaAffiliated(html: string): string[] {
  const names: string[] = [];
  const re = /<td[^>]*wixui-table__cell[^>]*>\s*<div[^>]*>\s*<div[^>]*>([^<]*)<\/div>\s*<\/div>\s*<\/td>\s*<td[^>]*wixui-table__cell[^>]*>\s*<div[^>]*>\s*<div[^>]*>\s*(?:Message Details:\s*)?Club Contact/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) { const n = decode(m[1]); if (n && n.length <= 120) names.push(n); }
  return [...new Set(names)];
}

// British Powerlifting: region headings, then a card per club with the name in <p class="title-medium">.
export function parseBpApproved(html: string): { name: string; region: string }[] {
  const start = html.indexOf("Register of Approved Clubs");
  const end = html.indexOf("Home Country", start < 0 ? 0 : start);
  const body = start < 0 ? "" : html.slice(start, end < 0 ? undefined : end);
  const out: { name: string; region: string }[] = [];
  let region = "";
  const re = /<p[^>]*class="[^"]*title-large[^"]*"[^>]*>([\s\S]*?)<\/p>|<p[^>]*class="[^"]*title-medium[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) region = clean(m[1]);
    else { const n = clean(m[2]); if (n && n.length <= 120) out.push({ name: n, region }); }
  }
  const seen = new Set<string>();
  return out.filter((c) => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

// What to store: one row per club. A club on both lists is stored once, as an EPA club, keeping the region.
export function mergeClubs(epa: string[], bp: { name: string; region: string }[]) {
  const rows = new Map<string, { name: string; source: string; region: string }>();
  for (const n of epa) rows.set(n.toLowerCase(), { name: n, source: "epa_affiliated", region: "" });
  for (const c of bp) {
    const k = c.name.toLowerCase(), have = rows.get(k);
    if (have) have.region = c.region; else rows.set(k, { name: c.name, source: "bp_approved", region: c.region });
  }
  return [...rows.values()];
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, apikey, authorization", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

    const url = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !svc) return reply(500, { error: "not_configured" });
    const H = { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" };
    const db = (path: string, init: RequestInit = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });

    // Do nothing if it ran in the last 12 hours.
    const last = (await (await db("site_settings?key=eq.clubs_sync&select=value")).json())[0]?.value;
    if (last?.at && Date.now() - new Date(last.at).getTime() < 12 * 3600 * 1000) return reply(200, { skipped: true, reason: "ran recently", last });

    const get = async (u: string) => {
      const r = await fetch(u, { headers: { "user-agent": "YNEPF club list sync (runs every few weeks)", accept: "text/html" } });
      if (!r.ok) throw new Error(`${u} answered ${r.status}`);
      return r.text();
    };
    const started = new Date().toISOString();
    const note = async (v: Record<string, unknown>) => db("site_settings?on_conflict=key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ key: "clubs_sync", value: v }) });
    try {
      const [epaHtml, bpHtml] = await Promise.all([get(EPA_URL), get(BP_URL)]);
      const epa = parseEpaAffiliated(epaHtml), bp = parseBpApproved(bpHtml);
      if (epa.length < MIN_EPA || bp.length < MIN_BP) {
        await note({ at: started, ok: false, epa: epa.length, bp: bp.length, message: "A website looks different to what was expected, so the club list was left as it was." });
        return reply(200, { ok: false, epa: epa.length, bp: bp.length, message: "A website looks different, list left unchanged" });
      }
      const rows = mergeClubs(epa, bp).map((c) => ({ ...c, active: true, last_seen: started }));
      const up = await db("clubs?on_conflict=name_key", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
      if (!up.ok) throw new Error("saving clubs failed: " + (await up.text()));
      // Clubs that have dropped off both lists stop being offered (manual ones are left alone).
      await db(`clubs?source=in.(epa_affiliated,bp_approved)&last_seen=lt.${encodeURIComponent(started)}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ active: false }) });
      await note({ at: started, ok: true, epa: epa.length, bp: bp.length, total: rows.length });
      return reply(200, { ok: true, epa: epa.length, bp: bp.length, total: rows.length });
    } catch (e) {
      console.error("sync-clubs failed", String(e));
      await note({ at: started, ok: false, message: "The sync failed. See the function logs." });
      return reply(502, { error: "sync_failed" });
    }
  });
}
