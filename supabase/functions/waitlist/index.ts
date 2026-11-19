// The automatic waiting list. Three jobs, chosen by "action" in the request:
//
//   join   Someone joins the waiting list for a full competition (name and email). They get an email with their place in the queue.
//   offer  The entry page asks "does this offer link work?" and, if so, gets the name and email to fill in.
//   run    Looks after every waiting list: ends offers that ran out (and emails), sends the one reminder, and offers
//          free places to the people who have waited longest (and emails them a personal link). It also emails priority
//          entry links to everyone on a competition's priority list once the priority window opens, and looks up the OpenIPF
//          results of lifters who have just entered (best total and GL points over the last 12 months, then the qualifying check). It is run on a timer
//          (see docs/entry-system/schedule-waitlist.sql) and by the entries team's "Check now" button.
//   openipf_run  The entries team asks for the OpenIPF lookups that are waiting to be done now (the timer also does them).
//   priority_send  The entries team sends priority links now (to one person or everyone still waiting), or sends a fresh link to someone.
//
// ONE self-contained file: paste it in as index.ts. Deploy with "Verify JWT" switched OFF (the checks are inside).
//
// Secrets: RESEND_API_KEY, MAIL_FROM, NOTIFY_TO, SITE_URL (as the other functions), and a new one, CRON_SECRET: any long random
// text. The timer sends it so only the timer (or a signed-in entries team member) can run the list.
// Supabase fills in SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY by itself.

export const MESSAGES: Record<string, string> = {
  closed: "Entries for this competition are closed, so the waiting list is closed too.",
  not_full: "There are places left, so you can enter now instead of joining the waiting list.",
  already_entered: "You have already entered this competition. Check your email for the confirmation.",
  "invalid:email": "Please check your email address.",
  "invalid:full_name": "Please enter your first and last name.",
};

export function errorCode(message: string): string {
  const m = String(message ?? "").replace(/^.*?ERROR:\s*/s, "").split("\n")[0].trim();
  return m in MESSAGES ? m : "unknown";
}

// A long random value for the personal link. Only its hash is kept in the database.
export function newToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" });
}
export const offerLink = (siteUrl: string, slug: string, token: string) => `${siteUrl.replace(/\/$/, "")}/enter?c=${encodeURIComponent(slug)}&offer=${encodeURIComponent(token)}`;

type Who = { name: string; competition: string; date?: string; entriesEmail: string };
const sign = (o: Who, more: string[] = []) => [...more, "", `If you have any questions, reply to this email or write to ${o.entriesEmail}.`, "", "YNEPF"].join("\n");

export function joinedEmail(o: Who & { position: number; hours: number }) {
  return sign(o, [
    `Hi ${o.name},`, "",
    `You are on the waiting list for ${o.competition}${o.date ? ` (${o.date})` : ""}. You are number ${o.position} in the queue.`, "",
    `If a place becomes free we will email you a personal link and you will have ${o.hours} hours to use it. You do not need to do anything now.`,
    "If you no longer want a place, you can ignore any email we send you and the place will pass to the next person.",
  ]);
}
export function offerEmail(o: Who & { link: string; expiresAt: string }) {
  return sign(o, [
    `Hi ${o.name},`, "",
    `Good news: a place has come up in ${o.competition}${o.date ? ` (${o.date})` : ""} and it is being held for you.`, "",
    `Enter here: ${o.link}`, "",
    `The place is yours until ${when(o.expiresAt)} (UK time). After that it goes to the next person on the waiting list.`,
    "The link is for you only, so please do not share it. Your entry is only confirmed once you have completed the form and paid.",
  ]);
}
export function reminderEmail(o: Who & { expiresAt: string; slug: string; siteUrl: string }) {
  return sign(o, [
    `Hi ${o.name},`, "",
    `A reminder: the place being held for you in ${o.competition} runs out on ${when(o.expiresAt)} (UK time).`, "",
    "Use the personal link in our earlier email to enter. If you no longer want the place, you do not need to do anything and it will pass to the next person.",
  ]);
}
export function expiredEmail(o: Who & { slug: string; siteUrl: string }) {
  return sign(o, [
    `Hi ${o.name},`, "",
    `The place we were holding for you in ${o.competition} has now gone to the next person on the waiting list, because it was not taken up in time.`, "",
    `If you still want to enter, you can join the waiting list again at ${o.siteUrl.replace(/\/$/, "")}/enter?c=${encodeURIComponent(o.slug)} and you will be added to the back of the queue.`,
  ]);
}

export function priorityEmail(o: Who & { link: string; windowStart: string; opens?: string; points?: boolean }) {
  return sign(o, [
    `Hi ${o.name || "there"},`, "",
    `You can enter ${o.competition}${o.date ? ` (${o.date})` : ""} early, with priority entry.`, "",
    `Your personal link works from ${when(o.windowStart)} (UK time)${o.opens ? `, before general entry opens on ${when(o.opens)}` : ""}:`,
    o.link, "",
    "Please enter with the email address this message was sent to, and keep the link to yourself: it only works once. You can still enter when general entry opens if you would rather wait.",
    ...(o.points ? ["", "This is your thank-you for volunteering. Priority entry costs 1 volunteer point, taken only once your entry is confirmed. If you do not use the link, you keep the point."] : []),
  ]);
}

// ---- Volunteers: the sign-up confirmation, the "change your answers" link, and a note for the inbox -------------------------------
export const VOLUNTEER_MESSAGES: Record<string, string> = {
  closed: "Volunteer sign-up for this competition is closed.",
  exists: "You have already signed up. Use “Change your answers” at the bottom of the form and we will email you a link.",
  bad_token: "That link has expired or is not right. Ask for a new one at the bottom of the form.",
  "invalid:over18": "Volunteers must be 18 or over.", "invalid:email": "Please check your email address.", "invalid:name": "Please enter your first and last name.",
  "invalid:mobile": "Please check your mobile number, or leave it empty.", "invalid:tshirt": "Please choose a T-shirt size.", "invalid:choices": "Please tick at least one role you could do.",
};
export function volunteerCode(message: string): string {
  const m = String(message ?? ""); for (const k of Object.keys(VOLUNTEER_MESSAGES)) if (m.includes(k)) return k; return "unknown";
}
export const volunteerLink = (siteUrl: string, slug: string, token: string) => `${siteUrl.replace(/\/$/, "")}/volunteer?c=${encodeURIComponent(slug)}&edit=${encodeURIComponent(token)}`;
export function volunteerSignupEmail(o: Who & { lines: string[]; link: string; edited: boolean }) {
  return sign(o, [
    `Hi ${o.name || "there"},`, "",
    o.edited ? `Your volunteer answers for ${o.competition} have been updated. You said you could help with:` : `Thank you for signing up to volunteer at ${o.competition}${o.date ? ` (${o.date})` : ""}. You said you could help with:`,
    ...o.lines.map((l) => `- ${l}`), "",
    "We will be in touch about the rota. If you have been given a role and your plans change, please tell us in advance: if you do not turn up and have not told us, you lose your volunteer points.", "",
    "To change what you said you can do, use your personal link (keep it to yourself):", o.link,
  ]);
}
export function volunteerLinkEmail(o: Who & { link: string }) {
  return sign(o, [`Hi ${o.name || "there"},`, "", `Here is your personal link to see and change your volunteer answers for ${o.competition}:`, o.link, "", "If you did not ask for this, you can ignore this email."]);
}
// ---- Volunteer points: the one-time code, the discount code, and a note for the inbox when a code is made ---------------------------------
export function pointsCodeEmail(o: { name: string; code: string; entriesEmail?: string }) {
  return [`Hi ${o.name || "there"},`, "", `Your code to look at and spend your volunteer points is ${o.code}.`, "It works for 15 minutes and can be used once. If you did not ask for it, you can ignore this email: nothing has changed.", "", `Yorkshire & North East Powerlifting Federation${o.entriesEmail ? `\n${o.entriesEmail}` : ""}`].join("\n");
}
export function pointsDiscountEmail(o: { name: string; code: string; competition: string; pounds: number; points: number; expires?: string; link: string; entriesEmail?: string }) {
  return [`Hi ${o.name || "there"},`, "", `Here is your £${o.pounds} discount for ${o.competition}:`, "", o.code, "",
    `Type it into the discount box on the entry form, using this email address: ${o.link}`,
    `It can be used once${o.expires ? ` and runs out on ${when(o.expires)}` : ""}. The ${o.points} points it is worth are taken from your balance when your entry is confirmed.`, "",
    `Yorkshire & North East Powerlifting Federation${o.entriesEmail ? `\n${o.entriesEmail}` : ""}`].join("\n");
}
export function pointsRedeemedNotification(o: { name: string; email: string; competition: string; pounds: number; points: number; code: string; deskUrl?: string }) {
  return [`${o.name} (${o.email}) turned ${o.points} volunteer points into a £${o.pounds} discount code for ${o.competition}.`, "", `Code: ${o.code}`, "The points come off their balance when an entry using the code is confirmed.",
    ...(o.deskUrl ? ["", `Discount codes and who has used them: ${o.deskUrl}`] : [])].join("\n");
}
// An internal note when the quarterly committee points are awarded.
export function committeePointsNotification(o: { people: { name: string; email: string; quarter: string }[]; deskUrl?: string }) {
  const by = new Map<string, string[]>(); for (const p of o.people) by.set(p.quarter, [...(by.get(p.quarter) ?? []), `${p.name} <${p.email}>`]);
  return ["Committee and executive points have been awarded (3 points each, for being part of the committee on the last day of the quarter).", "",
    ...[...by.entries()].flatMap(([q, who]) => [`${q}: ${who.length} ${who.length === 1 ? "person" : "people"}`, ...who.map((w) => `- ${w}`), ""]),
    ...(o.deskUrl ? [`The points list: ${o.deskUrl}`] : [])].join("\n");
}
export function pointsReleasedNotification(o: { name: string; email: string; competition: string; points: number; code: string; deskUrl?: string }) {
  return [`${o.name} (${o.email}) gave back an unused discount code for ${o.competition}, so its ${o.points} points are free to spend again.`, "", `Code switched off: ${o.code}`, "No points were spent or added: an unused code only holds its points.",
    ...(o.deskUrl ? ["", `Discount codes: ${o.deskUrl}`] : [])].join("\n");
}
export function volunteerNotification(o: { name: string; email: string; competition: string; lines: string[]; edited: boolean; deskUrl?: string }) {
  return [`${o.edited ? "A volunteer changed their answers" : "A new volunteer has signed up"} for ${o.competition}.`, "", `${o.name} (${o.email})`, ...o.lines.map((l) => `- ${l}`),
    ...(o.edited ? ["", "If they are already in a role they no longer ticked, the rota builder flags it so you can change it."] : []), ...(o.deskUrl ? ["", `Open the rota: ${o.deskUrl}`] : [])].join("\n");
}

// An internal note to the competitions inbox when priority entry links go out, so the team can see who was sent one.
export function prioritySentNotification(o: { competition: string; sent: { name: string; email: string }[]; failed: { name: string; email: string }[]; deskUrl?: string }) {
  const who = (p: { name: string; email: string }) => `- ${p.name ? p.name + " " : ""}<${p.email}>`;
  return [
    `Priority entry links for ${o.competition} have been emailed.`, "",
    `Sent to ${o.sent.length} ${o.sent.length === 1 ? "person" : "people"}:`, ...(o.sent.length ? o.sent.map(who) : ["- nobody"]),
    ...(o.failed.length ? ["", `Could not be sent to ${o.failed.length} (they will be tried again at the next check):`, ...o.failed.map(who)] : []),
    ...(o.deskUrl ? ["", `See who has been sent a link, and who has used it: ${o.deskUrl}`] : []),
  ].join("\n");
}

export function liftingOrderEmail(o: Who & { link: string; kind: "provisional" | "final" }) {
  return sign(o, [
    `Hi ${o.name || "there"},`, "",
    `The ${o.kind} lifting order for ${o.competition}${o.date ? ` (${o.date})` : ""} is now online:`,
    o.link, "",
    o.kind === "provisional"
      ? "This is the provisional lifting order. Entry is still open, so it may change before the competition. Please check your flight and session, and get in touch if anything looks wrong."
      : "This is the final lifting order. Entry has closed. Please check your flight and session, and get in touch straight away if anything looks wrong.",
  ]);
}

// ---- OpenIPF -------------------------------------------------------------------------------------------------------------
// A lifter's profile address looks like https://www.openipf.org/u/agatasitko. Their results are a CSV at /api/liftercsv/<name>.
export function openipfSlug(url: string): string | null {
  const m = String(url ?? "").trim().match(/^https?:\/\/(?:www\.)?openipf\.org\/u\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/i);
  return m ? m[1].toLowerCase() : null;
}

// A small, careful CSV reader (handles quoted fields, commas and doubled quotes inside them).
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const norm = (s: string) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/#\d+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
// Do the entrant's name and the name on the profile look like the same person? Every word of the shorter name must be in the longer one.
export function namesMatch(a: string, b: string): boolean {
  const x = norm(a).split(" ").filter(Boolean), y = norm(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w));
}

// Best total and best GL points over the 12 months up to the competition, for the same event and kit as the entry.
export function summariseResults(rows: Record<string, string>[], o: { event: string; equipment: string; compStart: string }) {
  const end = new Date(o.compStart + "T00:00:00Z"), start = new Date(end); start.setUTCFullYear(start.getUTCFullYear() - 1);
  const wantEvent = o.event === "bench_only" ? "B" : "SBD";
  const kitOk = (k: string) => o.equipment === "equipped" ? !/^(raw|wraps)$/i.test(k) : /^(raw|wraps)$/i.test(k);
  const name = rows.length ? rows[0].Name ?? "" : "";
  let bestTotal: number | null = null, bestGlp: number | null = null, count = 0;
  for (const r of rows) {
    const d = new Date((r.Date ?? "") + "T00:00:00Z"), total = parseFloat(r.TotalKg ?? "");
    if (isNaN(d.getTime()) || d < start || d > end || r.Event !== wantEvent || !kitOk(r.Equipment ?? "") || !(total > 0)) continue;
    count++;
    if (bestTotal === null || total > bestTotal) bestTotal = total;
    const g = parseFloat(r.Goodlift ?? ""); if (!isNaN(g) && (bestGlp === null || g > bestGlp)) bestGlp = g;
  }
  return { name, bestTotal, bestGlp, count };
}

// Looks one lifter up. status: found | not_found | error. (fetchImpl is replaceable so this can be tested.)
export async function lookupLifter(slug: string, o: { event: string; equipment: string; compStart: string; entryName: string }, fetchImpl: typeof fetch = fetch) {
  let res: Response;
  try { res = await fetchImpl(`https://www.openipf.org/api/liftercsv/${encodeURIComponent(slug)}`, { headers: { "user-agent": "YNEPF entry system (ynepf.co.uk)" } }); }
  catch { return { status: "error", note: "OpenIPF did not answer. It will be tried again." } as const; }
  if (res.status === 404) return { status: "not_found", note: "There is no OpenIPF profile at that address." } as const;
  if (!res.ok) return { status: "error", note: `OpenIPF answered with an error (${res.status}). It will be tried again.` } as const;
  const rows = parseCsv(await res.text());
  if (!rows.length) return { status: "not_found", note: "That OpenIPF profile has no results yet." } as const;
  const s = summariseResults(rows, o);
  const notes: string[] = [];
  if (!namesMatch(o.entryName, s.name)) notes.push(`The profile is for "${s.name}", which does not look like the entry name. Check it is the right person.`);
  if (s.count === 0) notes.push(`No ${o.event === "bench_only" ? "bench" : "full power"} ${o.equipment === "equipped" ? "equipped" : "classic"} results in the 12 months before the competition.`);
  return { status: "found", name: s.name, best_total_kg: s.bestTotal, best_glp: s.bestGlp, note: notes.join(" ") } as const;
}

// Joining is limited so the list cannot be flooded: a handful of tries per address, per few minutes.
const tries: Record<string, number[]> = {};
export function allowTry(key: string, now = Date.now(), max = 6, windowMs = 10 * 60 * 1000): boolean {
  const list = (tries[key] = (tries[key] ?? []).filter((t) => now - t < windowMs));
  if (list.length >= max) return false;
  list.push(now); return true;
}

if (typeof Deno !== "undefined") {
  Deno.serve(async (req: Request) => {
    const origin = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
    const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "content-type, apikey, authorization, x-cron-secret", "access-control-allow-methods": "POST, OPTIONS", vary: "origin" };
    const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

    const url = Deno.env.get("SUPABASE_URL"), svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY") ?? svc;
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    if (!url || !svc || !siteUrl) { console.error("function is not configured"); return reply(500, { error: "not_configured" }); }
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return reply(400, { error: "bad_request" }); }

    const H = { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" };
    const rpc = (fn: string, args: Record<string, unknown>) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
    const from = Deno.env.get("MAIL_FROM") ?? "YNEPF <onboarding@resend.dev>", copy = Deno.env.get("NOTIFY_TO") ?? "competitions@ynepf.co.uk";
    const send = async (to: string, subject: string, text: string): Promise<boolean> => {
      const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], reply_to: copy, subject, text }) });
      if (!r.ok) console.error("Resend failed", r.status);
      return r.ok;
    };
    const comp = async (id: string) => {
      const r = await fetch(`${url}/rest/v1/competitions?id=eq.${encodeURIComponent(id)}&select=id,name,slug,start_date,entry_opens`, { headers: H });
      const [c] = await r.json().catch(() => []);
      return c as { id: string; name: string; slug: string; start_date: string; entry_opens: string | null } | undefined;
    };
    const dateText = (d?: string) => d ? new Date(d).toLocaleDateString("en-GB", { timeZone: "Europe/London", dateStyle: "long" }) : undefined;
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0];
    const action = String(body.action ?? "");

    // Makes each person's personal link (only its hash is kept) and emails it. If the email fails the person goes back to
    // "waiting to be sent" and the next check tries again.
    const sendPriority = async (c: { id: string; name: string; slug: string; start_date: string; entry_opens: string | null }, people: { id: string; email: string; name: string; points?: boolean }[], force: boolean) => {
      const sres = await fetch(`${url}/rest/v1/entry_settings?competition_id=eq.${encodeURIComponent(c.id)}&select=priority_hours`, { headers: H });
      const [st] = await sres.json().catch(() => []);
      const hours = Number(st?.priority_hours ?? 24);
      const windowStart = c.entry_opens ? new Date(new Date(c.entry_opens).getTime() - hours * 3600 * 1000).toISOString() : new Date().toISOString();
      let sent = 0, failed = 0;
      const sentTo: { name: string; email: string }[] = [], failedTo: { name: string; email: string }[] = [];
      for (const p of people) {
        const tok = newToken();
        const iss = await rpc("priority_issue", { iid: p.id, th: await sha256Hex(tok), force });
        if (!iss.ok) { console.error("priority link not made", await iss.text()); failed++; failedTo.push({ name: p.name, email: p.email }); continue; }
        const ok = await send(p.email, `Your priority entry link: ${c.name}`, priorityEmail({ name: p.name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy, link: offerLink(siteUrl, c.slug, tok).replace("&offer=", "&invite="), windowStart, opens: c.entry_opens ?? undefined, points: !!p.points }));
        if (ok) { sent++; sentTo.push({ name: p.name, email: p.email }); } else { failed++; failedTo.push({ name: p.name, email: p.email }); await rpc("priority_unissue", { iid: p.id }); }
      }
      if (sent || failed) await send(copy, `Priority entry links sent: ${c.name}`, prioritySentNotification({ competition: c.name, sent: sentTo, failed: failedTo, deskUrl: `${siteUrl}/admin/#competitions/${c.id}/discounts` }));
      return { sent, failed };
    };

    // Looks up the lifters waiting for an OpenIPF check, politely (one at a time, a second apart), and stores what is found.
    const processOpenipf = async (max = 10) => {
      const list: { id: string; url: string; name: string; event: string; equipment: string; comp_start: string }[] = await (await rpc("openipf_pending", { max_rows: max })).json().catch(() => []);
      let done = 0;
      for (const e of Array.isArray(list) ? list : []) {
        const slug = openipfSlug(e.url);
        const result = slug
          ? await lookupLifter(slug, { event: e.event, equipment: e.equipment, compStart: e.comp_start, entryName: e.name })
          : { status: "not_found", note: "That is not an OpenIPF profile address. It should look like https://www.openipf.org/u/name." } as const;
        await rpc("openipf_save", { eid: e.id, p: { ...result, slug: slug ?? "" } });
        done++;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return done;
    };

    // ---- someone joins ----------------------------------------------------------------------------------------
    if (action === "join") {
      if (!allowTry(ip + "|" + String(body.email ?? "").toLowerCase())) return reply(429, { error: "slow_down", message: "Too many tries. Please wait a few minutes and try again." });
      // A signed-in entries team member may join an unpublished (test) competition. Decided here from their login.
      let allowUnpublished = false;
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (token && token !== anon && body.preview === true) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        if (who.ok && (await who.json()) === true) allowUnpublished = true;
      }
      const r = await rpc("waitlist_join", { p: { competition_id: body.competition_id, email: body.email, full_name: body.full_name, allow_unpublished: allowUnpublished } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        const code = errorCode(out?.message ?? "");
        if (code === "unknown") { console.error("waitlist_join failed", JSON.stringify(out)); return reply(500, { error: "failed", message: "Sorry, something went wrong. Please try again." }); }
        return reply(422, { error: code, message: MESSAGES[code] });
      }
      const c = await comp(String(body.competition_id));
      if (c && !out.already) {
        await send(String(body.email).trim().toLowerCase(), `You are on the waiting list: ${c.name}`,
          joinedEmail({ name: String(body.full_name).trim(), competition: c.name, date: dateText(c.start_date), entriesEmail: copy, position: out.position, hours: out.window_hours ?? 48 }));
      }
      return reply(200, { ok: true, position: out.position, already: !!out.already });
    }

    // ---- does this offer link work? ---------------------------------------------------------------------------------
    if (action === "offer") {
      if (!allowTry(ip + "|offer", Date.now(), 30)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const r = await rpc("waitlist_offer_info", { p: { competition_id: body.competition_id, offer: body.offer } });
      const out = await r.json().catch(() => ({ ok: false }));
      return reply(200, r.ok ? out : { ok: false });
    }

    // ---- look after the lists ---------------------------------------------------------------------------------------
    if (action === "run") {
      const secret = Deno.env.get("CRON_SECRET") ?? "";
      let allowed = !!secret && req.headers.get("x-cron-secret") === secret;
      if (!allowed) {
        const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (token && token !== anon) {
          const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
          allowed = who.ok && (await who.json()) === true;
        }
      }
      if (!allowed) return reply(401, { error: "not_allowed" });

      const listRes = await rpc("waitlist_competitions", {});
      let ids: string[] = await listRes.json().catch(() => []);
      if (body.competition_id) ids = ids.filter((i) => i === body.competition_id);
      const done = { offers: 0, reminders: 0, expired: 0, failed: 0, priority: 0, openipf: 0 };
      for (const id of ids) {
        const c = await comp(id);
        if (!c) continue;
        const who = (name: string) => ({ name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy });
        // 1. offers that ran out, and reminders
        const events: { kind: string; email: string; name: string; expires_at: string }[] = await (await rpc("waitlist_sweep", { c: id })).json().catch(() => []);
        for (const e of Array.isArray(events) ? events : []) {
          if (e.kind === "expired") { if (await send(e.email, `Your place has gone to the next person: ${c.name}`, expiredEmail({ ...who(e.name), slug: c.slug, siteUrl }))) done.expired++; else done.failed++; }
          if (e.kind === "reminder") { if (await send(e.email, `Reminder: your place is held until ${when(e.expires_at)}`, reminderEmail({ ...who(e.name), expiresAt: e.expires_at, slug: c.slug, siteUrl }))) done.reminders++; else done.failed++; }
        }
        // 2. offer free places to the longest-waiting
        const next: { waiting_id: string; email: string; name: string }[] = await (await rpc("waitlist_candidates", { c: id })).json().catch(() => []);
        for (const n of Array.isArray(next) ? next : []) {
          const tok = newToken();
          const mk = await rpc("waitlist_make_offer", { wid: n.waiting_id, token_hash: await sha256Hex(tok) });
          if (!mk.ok) { console.error("offer not made", await mk.text()); continue; }
          const expiresAt = String(await mk.json());
          const sent = await send(n.email, `A place has come up: ${c.name}`, offerEmail({ ...who(n.name), link: offerLink(siteUrl, c.slug, tok), expiresAt }));
          if (sent) { done.offers++; await send(copy, `Offered a place: ${n.name} (${c.name})`, `A place in ${c.name} was offered to ${n.name} (${n.email}) from the waiting list. They have until ${when(expiresAt)}.`); }
          else { done.failed++; await rpc("waitlist_unoffer", { wid: n.waiting_id }); }   // keep their place in the queue; try again next time
        }
      }
      // Priority entry links for competitions whose priority window has opened.
      if (!body.competition_id) {
        await rpc("priority_fill", {});           // everyone with a volunteer point joins the priority list first
        const pids: string[] = await (await rpc("priority_competitions", {})).json().catch(() => []);
        for (const id of Array.isArray(pids) ? pids : []) {
          const c = await comp(id); if (!c) continue;
          const people: { id: string; email: string; name: string }[] = await (await rpc("priority_pending", { c: id })).json().catch(() => []);
          const r = await sendPriority(c, Array.isArray(people) ? people : [], false);
          done.priority += r.sent; done.failed += r.failed;
        }
      }
      if (!body.competition_id) {
        // committee and executive points, once a quarter has ended
        const cres = await rpc("committee_points_award", {});
        const cp = await cres.json().catch(() => null) as { awarded: number; people: { name: string; email: string; quarter: string }[] } | null;
        if (cres.ok && cp && cp.awarded > 0) await send(copy, "Committee points awarded", committeePointsNotification({ people: cp.people, deskUrl: `${siteUrl}/admin/#points` }));
        done.openipf = await processOpenipf(10);
      }
      return reply(200, { ok: true, ...done });
    }

    // ---- the entries team asks for the OpenIPF lookups now -----------------------------------------------------------
    if (action === "openipf_run") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      let allowed = false;
      if (token && token !== anon) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        allowed = who.ok && (await who.json()) === true;
      }
      if (!allowed) return reply(401, { error: "not_allowed" });
      return reply(200, { ok: true, openipf: await processOpenipf(5) });
    }

    // ---- the entries team sends priority links now ------------------------------------------------------------------
    if (action === "priority_send") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      let allowed = false;
      if (token && token !== anon) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        allowed = who.ok && (await who.json()) === true;
      }
      if (!allowed) return reply(401, { error: "not_allowed" });
      const c = await comp(String(body.competition_id ?? ""));
      if (!c) return reply(404, { error: "not_found" });
      const only = body.invite_id ? String(body.invite_id) : null;
      const people: { id: string; email: string; name: string }[] = await (await rpc("priority_pending", { c: c.id, only_id: only, include_sent: !!only })).json().catch(() => []);
      const r = await sendPriority(c, Array.isArray(people) ? people : [], !!only);
      return reply(200, { ok: true, ...r });
    }

    // ---- a volunteer signs up, or changes their answers with their personal link ------------------------------------
    if (action === "volunteer_signup") {
      if (!allowTry(ip + "|vol", Date.now(), 12)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const r = await rpc("volunteer_signup", { p: { slug: body.slug, name: body.name, email: body.email, mobile: body.mobile, tshirt: body.tshirt, over18: body.over18, note: body.note, choices: body.choices, token: body.token } });
      const out = await r.json().catch(() => null);
      if (!r.ok || !out) { const code = volunteerCode(JSON.stringify(out ?? {})); if (code === "unknown") { console.error("volunteer_signup failed", JSON.stringify(out)); return reply(500, { ok: false, error: "failed", message: "We could not save your sign-up. Please try again in a moment." }); } return reply(422, { ok: false, error: code, message: VOLUNTEER_MESSAGES[code] }); }
      const c = { id: "", name: out.competition as string, slug: out.slug as string };
      const who = { name: out.name as string, competition: c.name, entriesEmail: copy };
      await send(out.email, `${out.edited ? "Your volunteer answers" : "You are signed up to volunteer"}: ${c.name}`, volunteerSignupEmail({ ...who, lines: out.lines, link: volunteerLink(siteUrl, c.slug, out.token), edited: !!out.edited }));
      await send(copy, `${out.edited ? "Volunteer changed their answers" : "New volunteer"}: ${out.name}, ${c.name}`, volunteerNotification({ name: out.name, email: out.email, competition: c.name, lines: out.lines, edited: !!out.edited, deskUrl: `${siteUrl}/admin/` }));
      return reply(200, { ok: true, edited: !!out.edited });
    }
    // "Email me my link": says plainly when there is no sign-up for that email (a volunteer list is not secret), and is limited per address.
    if (action === "volunteer_link") {
      if (!allowTry(ip + "|vollink", Date.now(), 8)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const r = await rpc("volunteer_link", { p_slug: body.slug, p_email: body.email });
      const out = await r.json().catch(() => null);
      if (!r.ok || !out) return reply(500, { ok: false, message: "We could not do that just now. Please try again in a moment." });
      if (!out.found) return reply(200, { ok: true, found: false });
      const sent = await send(out.email, `Your volunteer link: ${out.competition}`, volunteerLinkEmail({ name: out.name, competition: out.competition, entriesEmail: copy, link: volunteerLink(siteUrl, out.slug, out.token) }));
      return reply(200, { ok: true, found: true, sent });
    }

    // ---- spend your volunteer points: ask for a one-time code, look at the options, turn points into a discount code ----------------
    if (action === "points_start" || action === "points_options" || action === "points_redeem" || action === "points_release") {
      if (!allowTry(ip + "|points", Date.now(), 20)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const email = String(body.email ?? "").trim().toLowerCase();
      if (action === "points_start") {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
        const r = await rpc("points_login_start", { p_email: email, th: await sha256Hex(code) });
        const out = await r.json().catch(() => null);
        if (!r.ok || !out) return reply(500, { ok: false, message: "We could not do that just now. Please try again in a moment." });
        if (out.error === "rate") return reply(429, { ok: false, message: "That is a few codes already. Please wait an hour and try again." });
        if (out.error === "invalid_email") return reply(400, { ok: false, message: "That email address does not look right." });
        if (out.send) await send(email, "Your volunteer points code", pointsCodeEmail({ name: out.name, code, entriesEmail: copy }));
        return reply(200, { ok: true });          // the same answer whether or not the address has points
      }
      const th = await sha256Hex(String(body.code ?? "").replace(/\s/g, ""));
      if (action === "points_options") {
        const r = await rpc("points_options", { p_email: email, th });
        const out = await r.json().catch(() => null);
        if (!r.ok || !out) return reply(500, { ok: false, message: "We could not do that just now. Please try again in a moment." });
        return reply(200, out.ok ? out : { ok: false, message: "That code did not work. It may have run out, or been used. You can ask for a new one." });
      }
      if (action === "points_release") {
        const rr = await rpc("points_release", { p_email: email, th, p_code: String(body.code_id ?? "") });
        const ro = await rr.json().catch(() => null);
        if (!rr.ok || !ro) return reply(500, { ok: false, message: "We could not do that just now. Please try again in a moment." });
        if (!ro.ok) return reply(200, { ok: false, message: ({ code: "That code did not work. It may have run out. You can ask for a new one.", not_found: "That discount code is not there any more.", in_use: "That code is already being used for an entry, so it cannot be given back." } as Record<string, string>)[ro.error] ?? "We could not do that." });
        await send(copy, `Discount code given back: ${email}`, pointsReleasedNotification({ name: email, email, competition: ro.competition, points: ro.points, code: ro.code, deskUrl: `${siteUrl}/admin/#competitions` }));
        return reply(200, { ok: true, code: ro.code, points: ro.points, available: ro.available, balance: ro.balance });
      }
      const r = await rpc("points_redeem", { p_email: email, th, comp: String(body.competition_id ?? ""), steps: Number(body.steps ?? 0) });
      const out = await r.json().catch(() => null);
      if (!r.ok || !out) return reply(500, { ok: false, message: "We could not do that just now. Please try again in a moment." });
      if (!out.ok) {
        const msg: Record<string, string> = { code: "That code did not work. It may have run out, or been used. You can ask for a new one.", points: "You do not have enough free points for that.", steps: "Choose between 1 and 5 discounts.", competition: "Entry for that competition is not open to this." };
        return reply(200, { ok: false, message: msg[out.error] ?? "We could not do that." });
      }
      const pounds = out.discount_pence / 100;
      await send(email, `Your £${pounds} discount: ${out.competition}`, pointsDiscountEmail({ name: out.name, code: out.code, competition: out.competition, pounds, points: out.points, expires: out.expires_at, link: `${siteUrl}/enter?c=${encodeURIComponent(out.slug)}`, entriesEmail: copy }));
      await send(copy, `Volunteer points spent: ${out.name || email}`, pointsRedeemedNotification({ name: out.name || email, email, competition: out.competition, pounds, points: out.points, code: out.code, deskUrl: `${siteUrl}/admin/#competitions/${String(body.competition_id)}/discounts` }));
      return reply(200, { ok: true, code: out.code, pounds, points: out.points, competition: out.competition, available_after: out.available_after, slug: out.slug });
    }

    // ---- the entries team shares the published lifting order with everyone in it ------------------------------------
    if (action === "share_lifting_order") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      let allowed = false;
      if (token && token !== anon) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        allowed = who.ok && (await who.json()) === true;
      }
      if (!allowed) return reply(401, { error: "not_allowed" });
      const c = await comp(String(body.competition_id ?? ""));
      if (!c) return reply(404, { error: "not_found" });
      const info = await (await rpc("lifting_order_share_info", { c: c.id })).json().catch(() => null) as { published: boolean; closed: boolean; people: { email: string; name: string }[] } | null;
      if (!info) return reply(404, { error: "not_found" });
      if (!info.published) return reply(409, { error: "not_published" });
      const kind = info.closed ? "final" : "provisional";
      const link = `${siteUrl}/lifting/?c=${encodeURIComponent(c.slug || c.id)}`;
      let sent = 0, failed = 0;
      for (const p of info.people ?? []) {
        const ok = await send(p.email, `The ${kind} lifting order: ${c.name}`, liftingOrderEmail({ name: p.name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy, link, kind }));
        if (ok) sent++; else failed++;
      }
      if (sent) await rpc("lifting_order_mark_shared", { c: c.id, kind, n: sent });
      await send(copy, `Lifting order shared: ${c.name}`, `The ${kind} lifting order for ${c.name} was emailed to ${sent} ${sent === 1 ? "lifter" : "lifters"}${failed ? `, and ${failed} could not be sent` : ""}. Link: ${link}`);
      return reply(200, { ok: true, kind, sent, failed });
    }

    return reply(400, { error: "bad_request" });
  });
}
