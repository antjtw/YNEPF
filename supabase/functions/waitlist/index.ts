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

// ==== email template: copied from supabase/email/template.ts by scripts/sync-email-template.mjs. Do not edit between these markers. ====
export const BRAND = {
  navy: "#152C41", navyTint: "#E8EDF2", page: "#F6F8FA", iron: "#AA482C", ironDark: "#8B3C25", ironTint: "#F9EDE7",
  gold: "#D6B778", text: "#242525", muted: "#585A5B", line: "#C9D4E0", sageBg: "#E8F6EB", sageText: "#2C5238",
  name: "Yorkshire & North East Powerlifting Federation", short: "YNEPF",
};
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;
const SITE_DEFAULT = "https://www.ynepf.co.uk";

export const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Bold text inside a paragraph, and a link inside a paragraph. In the plain text version a link becomes "text (address)".
export const b = (t: unknown): string => `<strong style="color:${BRAND.navy};">${esc(t)}</strong>`;
export const a = (href: string, text: string): string => `<a class="lnk" href="${esc(href)}" target="_blank" style="color:${BRAND.navy};font-weight:600;text-decoration:underline;">${esc(text)}</a>`;

type Note = "info" | "warn" | "good";
export type Block =
  | ["h1", string] | ["h2", string]
  | ["p", string] | ["small", string]                       // html allowed: escape anything typed by a person
  | ["details", Array<[string, string] | null | false | undefined>] | ["details", Array<[string, string] | null | false | undefined>, "boldLast"]
  | ["button", string, string] | ["button", string, string, "fallback"] | ["button2", string, string]
  | ["code", string] | ["note", string, Note] | ["bullets", string[]] | ["quote", string];
export interface EmailSpec {
  preheader?: string; blocks: Block[]; entriesEmail?: string; siteUrl?: string; why?: string; title?: string;
  noQuestions?: boolean;                                   // leave out the generic "Any questions?" line
  internal?: boolean;                                      // a note for the team: "Internal" tag, no sign-off
  tag?: string; headerNote?: string;                       // for an internal email: the gold tag (default "Internal") and the line under YNEPF (default "A note from the website for the entries team")
}

const small = (t: string) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.muted};">${t}</p>`;
const para = (t: string) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};">${t}</p>`;
const heading = (t: string) => `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.navy};">${esc(t)}</h1>`;
const subheading = (t: string) => `<h2 style="margin:8px 0 12px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:700;color:${BRAND.navy};">${esc(t)}</h2>`;
const button = (label: string, href: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
    <td align="center" bgcolor="${BRAND.iron}" style="border-radius:10px;background-color:${BRAND.iron};">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td></tr></table>`;
const buttonSecondary = (label: string, href: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>
    <td align="center" style="border:2px solid ${BRAND.iron};border-radius:10px;">
      <a class="btn2" href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:${BRAND.ironDark};text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td></tr></table>`;
const linkFallback = (href: string) => small(`If the button does not work, copy this link into your browser:<br><a class="lnk" href="${esc(href)}" style="color:${BRAND.navy};word-break:break-all;">${esc(href)}</a>`);
const codeBox = (code: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;"><tr>
  <td class="bg-code" align="center" bgcolor="${BRAND.navyTint}" style="background-color:${BRAND.navyTint};border-radius:10px;padding:18px 16px;">
    <span class="t-code" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:4px;color:${BRAND.navy};">${esc(code)}</span>
  </td></tr></table>`;
function detailsTable(rows: Array<[string, string] | null | false | undefined>, boldLast: boolean) {
  const list = rows.filter((r): r is [string, string] => !!r);
  const tr = list.map(([k, v], i) => {
    const last = i === list.length - 1, line = last ? "" : `border-bottom:1px solid ${BRAND.line};`;
    return `<tr><td valign="top" class="details-rule" style="padding:10px 12px 10px 0;${line}font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.muted};width:38%;">${esc(k)}</td>
      <td valign="top" class="details-rule" style="padding:10px 0;${line}font-family:${FONT};font-size:15px;line-height:1.5;color:${BRAND.text};${boldLast && last ? "font-weight:700;" : ""}">${esc(v)}</td></tr>`;
  }).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">${tr}</table>`;
}
function noteBox(html: string, kind: Note) {
  const c = kind === "good" ? [BRAND.sageBg, "#4C8F62", BRAND.sageText] : kind === "warn" ? [BRAND.ironTint, BRAND.iron, "#5A2514"] : [BRAND.navyTint, BRAND.navy, BRAND.navy];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;"><tr>
    <td class="note-${kind}" bgcolor="${c[0]}" style="background-color:${c[0]};border-left:4px solid ${c[1]};border-radius:6px;padding:14px 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${c[2]};">${html}</td></tr></table>`;
}
const quoteBox = (t: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;"><tr>
  <td class="bg-code" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};border-left:4px solid ${BRAND.line};border-radius:6px;padding:14px 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};white-space:pre-wrap;">${esc(t)}</td></tr></table>`;
const bulletList = (items: string[]) => `<ul style="margin:0 0 16px;padding:0 0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};">${items.map((i) => `<li style="margin:0 0 6px;">${esc(i)}</li>`).join("")}</ul>`;

// "<a href>text</a>" -> "text (address)", other tags removed. For the plain text version.
const plain = (h: string): string => String(h).replace(/<br\s*\/?>/gi, "\n")
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (_m, u: string, t: string) => (u.startsWith("mailto:") ? t : t && t !== u ? `${t} (${u})` : u))
  .replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function layout(o: { title?: string; preheader?: string; body: string; entriesEmail?: string; siteUrl: string; why?: string; noQuestions?: boolean; internal?: boolean; tag?: string; headerNote?: string }): string {
  const site = o.siteUrl;
  return `<!DOCTYPE html>
<html lang="en-GB" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(o.title || BRAND.short)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  @media only screen and (max-width:620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg-page { background-color:#0E1A26 !important; }
    .bg-card { background-color:#16283A !important; }
    .t-body, .t-body p, .t-body li, .t-body td { color:#E6ECF2 !important; }
    .t-body h1, .t-body strong { color:#FFFFFF !important; }
    .t-muted, .t-muted a { color:#AAB7C4 !important; }
    .lnk { color:#9CC3EA !important; }
    .btn2 { color:#F2B9A3 !important; }
    .bg-code { background-color:#0E1A26 !important; }
    .t-code { color:#FFFFFF !important; }
    .note-info { background-color:#1F3A52 !important; color:#E6ECF2 !important; border-left-color:#9CC3EA !important; }
    .note-warn { background-color:#3A2218 !important; color:#F6DDD2 !important; border-left-color:#D9825F !important; }
    .note-good { background-color:#1D3A28 !important; color:#D7F0DE !important; border-left-color:#6BBF86 !important; }
    .note-info b, .note-warn b, .note-good b { color:#FFFFFF !important; }
    .details-rule { border-bottom-color:#2B4157 !important; }
  }
</style>
</head>
<body class="bg-page" style="margin:0;padding:0;background-color:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${esc(o.preheader || "")}${"&nbsp;&zwnj;".repeat(40)}</div>
<table role="presentation" class="bg-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.page};">
<tr><td align="center" style="padding:24px 12px 32px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
    <tr><td bgcolor="${BRAND.navy}" style="background-color:${BRAND.navy};border-radius:14px 14px 0 0;border-bottom:4px solid ${BRAND.gold};padding:22px 32px;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:14px;"><img src="${esc(site)}/assets/img/email-logo.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;"></td>
        <td valign="middle" style="font-family:${FONT};color:#FFFFFF;"><div style="font-size:18px;line-height:1.2;font-weight:700;color:#FFFFFF;">YNEPF${o.internal ? ` <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background-color:#D6B778;color:#07121A;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;vertical-align:2px;">${esc(o.tag || "Internal")}</span>` : ""}</div>
          <div style="font-size:12px;line-height:1.4;color:#C9D4E0;">${o.internal ? esc(o.headerNote || "A note from the website for the entries team") : esc(BRAND.name)}</div></td>
      </tr></table>
    </td></tr>
    <tr><td class="bg-card pad t-body" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 32px 12px;">
      ${o.body}
    </td></tr>
    <tr><td class="bg-card pad t-body" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:${o.internal ? "0 32px 8px" : "0 32px 32px"};border-radius:0 0 14px 14px;">
      ${o.internal || o.noQuestions ? "" : para("Any questions? Just reply to this email" + (o.entriesEmail ? ` or write to <a class="lnk" href="mailto:${esc(o.entriesEmail)}" style="color:${BRAND.navy};font-weight:600;">${esc(o.entriesEmail)}</a>` : "") + ".")}
      ${o.internal ? "" : `<p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};">Thanks,<br><strong style="color:${BRAND.navy};">The YNEPF team</strong></p>`}
    </td></tr>
    <tr><td class="pad" style="padding:20px 32px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
      <span class="t-muted" style="color:${BRAND.muted};">${esc(o.why || (o.internal ? "An automatic note from the YNEPF website, sent to the competitions inbox." : "You are getting this email because of something you did on our website."))}<br>
      ${esc(BRAND.name)} &middot; <a href="${esc(site)}" style="color:${BRAND.muted};">www.ynepf.co.uk</a>${o.internal ? "" : ` &middot; <a href="${esc(site)}/privacy" style="color:${BRAND.muted};">Privacy</a>`}</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function renderEmail(e: EmailSpec): { html: string; text: string } {
  const html: string[] = [], text: string[] = [];
  for (const k of e.blocks) {
    const t = k[0];
    if (t === "h1") { html.push(heading(k[1])); text.push(k[1], ""); }
    else if (t === "h2") { html.push(subheading(k[1])); text.push(k[1].toUpperCase(), ""); }
    else if (t === "p") { html.push(para(k[1])); text.push(plain(k[1]), ""); }
    else if (t === "small") { html.push(small(k[1])); text.push(plain(k[1]), ""); }
    else if (t === "details") { html.push(detailsTable(k[1], k[2] === "boldLast")); text.push(...k[1].filter((r): r is [string, string] => !!r).map(([x, y]) => `${x}: ${y}`), ""); }
    else if (t === "button") { html.push(button(k[1], k[2])); if (k[3] === "fallback") html.push(linkFallback(k[2])); text.push(`${k[1]}: ${k[2]}`, ""); }
    else if (t === "button2") { html.push(buttonSecondary(k[1], k[2])); text.push(`${k[1]}: ${k[2].startsWith("mailto:") ? k[2].slice(7).split("?")[0] : k[2]}`, ""); }
    else if (t === "code") { html.push(codeBox(k[1])); text.push(`   ${k[1]}`, ""); }
    else if (t === "quote") { html.push(quoteBox(k[1])); text.push(`> ${String(k[1]).replace(/\n/g, "\n> ")}`, ""); }
    else if (t === "note") { html.push(noteBox(k[1], k[2])); text.push(plain(k[1]), ""); }
    else if (t === "bullets") { html.push(bulletList(k[1])); text.push(...k[1].map((x) => `- ${x}`), ""); }
  }
  const siteUrl = (e.siteUrl || SITE_DEFAULT).replace(/\/$/, "");
  const body = html.join("\n");
  const out = layout({ title: e.title, preheader: e.preheader, body, entriesEmail: e.entriesEmail, siteUrl, why: e.why, noQuestions: e.noQuestions, internal: e.internal, tag: e.tag, headerNote: e.headerNote });
  const why = e.why || (e.internal ? "An automatic note from the YNEPF website, sent to the competitions inbox." : "");
  const tail = e.internal ? [why]
    : [...(e.noQuestions ? [] : [`Any questions? Just reply to this email${e.entriesEmail ? ` or write to ${e.entriesEmail}` : ""}.`, ""]), "Thanks,", "The YNEPF team", "", why, `${BRAND.name} - www.ynepf.co.uk`];
  return { html: out, text: [...text, ...tail].join("\n") };
}

// The reminder that goes in the confirmation, the entries-closed and the lifting order emails. The links are the IPF's own pages.
export const TECH_RULES_URL = "https://www.powerlifting.sport/rules/codes/info/technical-rules";
export const APPROVED_LIST_URL = "https://www.powerlifting.sport/rules/codes/info/approved-list";
export const RULES_AND_KIT: Block[] = [
  ["h2", "Before competition day"],
  ["p", `Please make sure you know the current ${a(TECH_RULES_URL, "IPF Technical Rules")}. It is up to you to have read and understood them before you lift.`],
  ["p", `Please also check that your kit is on the ${a(APPROVED_LIST_URL, "IPF approved list")}. Any kit that is not compliant will be rejected, and referees will not make exceptions, so check it now rather than at weigh-in.`],
  ["p", `Not sure about something? Email us at ${a("mailto:info@ynepf.co.uk", "info@ynepf.co.uk")} and we will help.`],
];
// ==== end of email template ====

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

// ---- the emails. Each builder describes one email; send() turns it into HTML and plain text (see the email template above). --------------
type Who = { name: string; competition: string; date?: string; entriesEmail: string };
const hi = (name?: string) => `Hi ${esc(name || "there")}`;
const named = (o: { competition: string; date?: string }) => `${b(o.competition)}${o.date ? ` (${esc(o.date)})` : ""}`;
const WHY_ENTERED = "You are getting this email because you are entered in this competition.";

export function joinedEmail(o: Who & { position: number; hours: number }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: `You are number ${o.position} in the queue. You do not need to do anything now.`,
    why: "You are getting this email because you joined the waiting list for this competition.",
    blocks: [
      ["h1", "You're on the waiting list"],
      ["p", `${hi(o.name)}, ${named(o)} is full at the moment, so we have put you on the waiting list.`],
      ["details", [["Your place in the queue", String(o.position)], ["Time to take a place", `${o.hours} hours`]]],
      ["p", `If a place becomes free, we will email you a personal link and you will have ${o.hours} hours to use it. You do not need to do anything now.`],
      ["small", "If you no longer want a place, you can ignore any email we send you and the place will pass to the next person."],
    ],
  };
}
export function offerEmail(o: Who & { link: string; expiresAt: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: `A place is being held for you until ${when(o.expiresAt)}.`,
    why: "You are getting this email because you joined the waiting list for this competition.",
    blocks: [
      ["h1", "Good news, a place has come up"],
      ["p", `A place in ${named(o)} is being held for you.`],
      ["button", "Claim your place", o.link, "fallback"],
      ["note", `<b>Held until ${esc(when(o.expiresAt))} (UK time).</b> After that it goes to the next person on the waiting list.`, "warn"],
      ["small", "The link is just for you, so please do not share it. Your entry is only confirmed once you have filled in the form and paid. If you no longer want the place, you do not need to do anything."],
    ],
  };
}
export function reminderEmail(o: Who & { expiresAt: string; slug: string; siteUrl: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: `Your place in ${o.competition} runs out soon.`,
    why: "You are getting this email because a place is being held for you.",
    blocks: [
      ["h1", "Your place runs out soon"],
      ["p", `${hi(o.name)}, a quick reminder: the place we are holding for you in ${b(o.competition)} runs out on <b>${esc(when(o.expiresAt))}</b> (UK time).`],
      ["note", "To enter, use the personal link in our earlier email, <b>\"A place has come up\"</b>. If you no longer want the place, you do not need to do anything and it will pass to the next person.", "warn"],
    ],
  };
}
export function expiredEmail(o: Who & { slug: string; siteUrl: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: "You can join the waiting list again if you still want to enter.",
    why: "You are getting this email because the place held for you ran out.",
    blocks: [
      ["h1", "Your place has gone to the next person"],
      ["p", `${hi(o.name)}, the place we were holding for you in ${b(o.competition)} was not taken up in time, so it has gone to the next person on the waiting list.`],
      ["p", "If you still want to enter, you can join the waiting list again. You will go to the back of the queue."],
      ["button", "Join the waiting list again", `${o.siteUrl.replace(/\/$/, "")}/enter?c=${encodeURIComponent(o.slug)}`],
    ],
  };
}

export function priorityEmail(o: Who & { link: string; windowStart: string; opens?: string; points?: boolean }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: `Enter ${o.competition} early, before general entry opens. Your link works once.`,
    why: o.points ? "You are getting this email because you volunteered at a YNEPF competition." : "You are getting this email because you asked for a priority entry link.",
    blocks: [
      ["h1", "Enter early with priority access"],
      ["p", o.points ? `${hi(o.name)}, thank you for volunteering. You can enter ${named(o)} before general entry opens.` : `${hi(o.name)}, you can enter ${named(o)} before general entry opens.`],
      ["button", "Enter with priority", o.link, "fallback"],
      ["details", [["Your link works from", when(o.windowStart)], o.opens ? ["General entry opens", when(o.opens)] : null]],
      ["note", "Please enter with the email address this was sent to, and keep the link to yourself. It only works once.", "warn"],
      ["p", `${o.points ? "Priority entry costs 1 volunteer point, taken only once your entry is confirmed. If you do not use the link, you keep your point. " : ""}You can still enter when general entry opens if you would rather wait.`],
      ...(o.points ? [["small", "Do not want these emails? Reply and tell us, and we will stop sending them. You keep your points."] as Block] : []),
    ],
  };
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
export const rotaLink = (siteUrl: string, slug: string) => `${siteUrl.replace(/\/$/, "")}/rota?c=${encodeURIComponent(slug)}`;
export function volunteerSignupEmail(o: Who & { lines: string[]; link: string; edited: boolean }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: o.edited ? "Your volunteer answers have been updated." : "Thank you for signing up. Here is what you said you could help with.",
    why: "You are getting this email because you signed up to volunteer.",
    blocks: [
      ["h1", o.edited ? "Your answers are updated" : "Thank you for volunteering"],
      ["p", o.edited ? `${hi(o.name)}, your volunteer answers for ${b(o.competition)} have been updated. You said you could help with:`
        : `${hi(o.name)}, thank you for signing up to volunteer at ${named(o)}. You said you could help with:`],
      ["bullets", o.lines],
      ["p", "We will be in touch about the rota."],
      ["note", "If you are given a role and your plans change, please tell us in advance. If you do not turn up and have not told us, you lose your volunteer points.", "warn"],
      ["p", "Need to change what you said you can do? Use your personal link. Please keep it to yourself."],
      ["button", "Change your answers", o.link, "fallback"],
    ],
  };
}
export function volunteerLinkEmail(o: Who & { link: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: "Your personal link to see and change your volunteer answers.",
    why: "You are getting this email because someone asked for your volunteer link.",
    blocks: [
      ["h1", "Your volunteer link"],
      ["p", `${hi(o.name)}, here is your personal link to see and change your volunteer answers for ${b(o.competition)}.`],
      ["button", "See or change your answers", o.link, "fallback"],
      ["small", "Did not ask for this? You can ignore this email."],
    ],
  };
}
// The rota is published: each volunteer with a role is told what they are doing, with a link to the whole rota.
export function rotaEmail(o: Who & { roles: { session: string; when?: string; role: string }[]; link: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, noQuestions: true, preheader: `Here is what you are doing at ${o.competition}, and when.`,
    why: "You are getting this email because you volunteered and have a role on the rota.",
    blocks: [
      ["h1", "The rota is published"],
      ["p", `${hi(o.name)}, the rota for ${named(o)} is now live. Thank you for helping. This is what you are doing:`],
      ["details", o.roles.map((r) => [r.session + (r.when ? ` (${r.when})` : ""), r.role] as [string, string])],
      ["button", "See the full rota", o.link],
      ["note", "<b>If your plans change, please tell us in advance.</b> If you do not turn up and have not told us, you lose your volunteer points. If you tell us beforehand, it costs you nothing.", "warn"],
      ["p", "Please arrive in good time before your session starts. If anything looks wrong, reply to this email."],
    ],
  };
}
// ---- Volunteer points: the one-time code, the discount code, and a note for the inbox when a code is made ---------------------------------
export function pointsCodeEmail(o: { name: string; code: string; entriesEmail?: string }): EmailSpec {
  const shown = /^\d{6}$/.test(o.code) ? `${o.code.slice(0, 3)} ${o.code.slice(3)}` : o.code;
  return {
    entriesEmail: o.entriesEmail, preheader: `Your one-time code is ${shown}. It works for 15 minutes.`,
    why: "You are getting this email because someone asked to look at volunteer points for this address.",
    blocks: [
      ["h1", "Your one-time code"],
      ["p", "Use this code to look at and spend your volunteer points. It works for 15 minutes and can be used once."],
      ["code", shown],
      ["small", "Did not ask for this? You can ignore this email. Nothing has changed."],
    ],
  };
}
export function pointsDiscountEmail(o: { name: string; code: string; competition: string; pounds: number; points: number; expires?: string; link: string; entriesEmail?: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, preheader: `Your discount code for ${o.competition}. It can be used once.`,
    why: "You are getting this email because you spent volunteer points.",
    blocks: [
      ["h1", `Your £${o.pounds} discount`],
      ["p", `${hi(o.name)}, here is your discount for ${b(o.competition)}. Thank you for everything you do for the federation.`],
      ["code", o.code],
      ["button", "Enter the competition", o.link, "fallback"],
      ["details", [["Worth", `£${o.pounds}.00 (${o.points} points)`], o.expires ? ["Use by", when(o.expires)] : null, ["How", "Type the code into the discount box, using this email address"]]],
      ["small", "It can be used once. The points are only taken from your balance when your entry is confirmed."],
    ],
  };
}
// Internal notes: for the team, sent to the competitions inbox. They carry a button to the right page in the editor.
const note = (o: { deskUrl?: string }, label: string): Block[] => o.deskUrl ? [["button", label, o.deskUrl]] : [];
export function pointsRedeemedNotification(o: { name: string; email: string; competition: string; pounds: number; points: number; code: string; deskUrl?: string }): EmailSpec {
  return { internal: true, preheader: `${o.name} turned ${o.points} points into a £${o.pounds} discount code.`, blocks: [
    ["h1", "Points turned into a discount"],
    ["p", `${b(o.name)} (${esc(o.email)}) turned ${o.points} volunteer points into a £${o.pounds} discount code for ${b(o.competition)}.`],
    ["details", [["Code", o.code]]],
    ["small", "The points come off their balance when an entry using the code is confirmed."], ...note(o, "Discount codes and who has used them")] };
}
// An internal note when the quarterly committee points are awarded.
export function committeePointsNotification(o: { people: { name: string; email: string; quarter: string }[]; deskUrl?: string }): EmailSpec {
  const by = new Map<string, string[]>(); for (const p of o.people) by.set(p.quarter, [...(by.get(p.quarter) ?? []), `${p.name} <${p.email}>`]);
  return { internal: true, preheader: `Committee points awarded to ${o.people.length} ${o.people.length === 1 ? "person" : "people"}.`, blocks: [
    ["h1", "Committee points awarded"],
    ["p", "Committee and executive points have been awarded: 3 points each, for being part of the committee on the last day of the quarter."],
    ...[...by.entries()].flatMap(([q, who]): Block[] => [["h2", `${q}: ${who.length} ${who.length === 1 ? "person" : "people"}`], ["bullets", who]]), ...note(o, "See the points list")] };
}
export function pointsReleasedNotification(o: { name: string; email: string; competition: string; points: number; code: string; deskUrl?: string }): EmailSpec {
  return { internal: true, preheader: `An unused code was switched off. Its ${o.points} points are free to spend again.`, blocks: [
    ["h1", "A discount code was given back"],
    ["p", `${esc(o.name)} (${esc(o.email)}) gave back an unused discount code for ${b(o.competition)}, so its ${o.points} points are free to spend again.`],
    ["details", [["Code switched off", o.code]]],
    ["small", "No points were spent or added: an unused code only holds its points."], ...note(o, "Discount codes")] };
}
export function volunteerNotification(o: { name: string; email: string; competition: string; lines: string[]; edited: boolean; deskUrl?: string }): EmailSpec {
  return { internal: true, preheader: `${o.name} ${o.edited ? "changed their volunteer answers" : "has signed up to volunteer"}.`, blocks: [
    ["h1", o.edited ? "A volunteer changed their answers" : "New volunteer"],
    ["p", `${o.edited ? "A volunteer changed their answers" : "A new volunteer has signed up"} for ${b(o.competition)}.`],
    ["details", [["Name", o.name], ["Email", o.email]]], ["bullets", o.lines],
    ...(o.edited ? [["small", "If they are already in a role they no longer ticked, the rota builder flags it so you can change it."] as Block] : []), ...note(o, "Open the rota")] };
}
// An internal note to the competitions inbox when priority entry links go out, so the team can see who was sent one.
export function prioritySentNotification(o: { competition: string; sent: { name: string; email: string }[]; failed: { name: string; email: string }[]; deskUrl?: string }): EmailSpec {
  const who = (p: { name: string; email: string }) => `${p.name ? p.name + " " : ""}<${p.email}>`;
  return { internal: true, preheader: `Sent to ${o.sent.length}${o.failed.length ? `. ${o.failed.length} could not be sent and will be tried again` : ""}.`, blocks: [
    ["h1", "Priority links sent"],
    ["p", `Priority entry links for ${b(o.competition)} have been emailed to ${o.sent.length} ${o.sent.length === 1 ? "person" : "people"}:`],
    ["bullets", o.sent.length ? o.sent.map(who) : ["nobody"]],
    ...(o.failed.length ? [["note", `Could not be sent to ${o.failed.length} (they will be tried again at the next check): ${o.failed.map((p) => esc(who(p))).join("; ")}`, "warn"] as Block] : []),
    ...note(o, "See who has used a link")] };
}
export function offeredNotification(o: { name: string; email: string; competition: string; expiresAt: string }): EmailSpec {
  return { internal: true, preheader: `${o.name} has until ${when(o.expiresAt)} to take the place.`, blocks: [
    ["h1", "A place was offered"],
    ["p", `A place in ${b(o.competition)} was offered to ${b(o.name)} (${esc(o.email)}) from the waiting list. They have until <b>${esc(when(o.expiresAt))}</b>.`]] };
}
// A lifting order email, and an automatic "entries are closed" email. The rules and kit reminder goes in both.
export function liftingOrderEmail(o: Who & { link: string; kind: "provisional" | "final" }): EmailSpec {
  const final = o.kind === "final";
  return {
    entriesEmail: o.entriesEmail, noQuestions: true, why: WHY_ENTERED,
    preheader: final ? "The final lifting order is online. Please check your flight and session." : "Check your flight and session. Entry is still open, so it may change.",
    blocks: [
      ["h1", final ? "The final lifting order is here" : "The lifting order is online"],
      ["p", `${hi(o.name)}, the ${o.kind} lifting order for ${named(o)} is now online.`],
      ["button", final ? "See the final lifting order" : "See the lifting order", o.link],
      ["note", final ? "<b>This is the final order.</b> Entries have closed. Please check your flight and session, and reply to this email straight away if anything looks wrong."
        : "<b>This is the provisional order.</b> Entry is still open, so it may change before the competition. Please check your flight and session, and reply to this email if anything looks wrong.", "warn"],
      ...RULES_AND_KIT,
    ],
  };
}
export function entriesClosedEmail(o: Who & { link?: string }): EmailSpec {
  return {
    entriesEmail: o.entriesEmail, noQuestions: true, why: WHY_ENTERED, preheader: "No more changes to entries. The final lifting order will follow in the next few days.",
    blocks: [
      ["h1", "Entries are now closed"],
      ["p", `${hi(o.name)}, entries for ${named(o)} have now closed. Thank you for entering.`],
      ["note", "<b>There can be no more changes to entries, and we cannot offer refunds for dropouts.</b>", "warn"],
      ["p", o.link ? "The final lifting order will be published in the next few days, and we will email you as soon as it is ready. In the meantime, you can see the provisional order below."
        : "We are putting the lifting order together, and it will be published in the next few days. We will email you as soon as it is ready."],
      ...(o.link ? [["button2", "See the provisional lifting order", o.link] as Block] : []),
      ...RULES_AND_KIT,
    ],
  };
}
// ---- Manage your entry: the one-time code, and the emails about change and cancellation requests -----------------------------------------
export function entryCodeEmail(o: { name: string; code: string; entriesEmail?: string }): EmailSpec {
  const shown = /^\d{6}$/.test(o.code) ? `${o.code.slice(0, 3)} ${o.code.slice(3)}` : o.code;
  return {
    entriesEmail: o.entriesEmail, preheader: `Your one-time code is ${shown}. It works for 15 minutes.`,
    why: "You are getting this email because someone asked to manage an entry for this address.",
    blocks: [
      ["h1", "Your one-time code"],
      ["p", `${hi(o.name)}, use this code to look at your entry and ask for changes. It works for 15 minutes and can be used more than once until then.`],
      ["code", shown],
      ["small", "Did not ask for this? You can ignore this email. Nothing has changed."],
    ],
  };
}
const rows = (m: Record<string, string>): Array<[string, string]> => Object.entries(m ?? {}).map(([k, v]) => [k, String(v)] as [string, string]);
const changeRows = (before: Record<string, string>, after: Record<string, string>): Array<[string, string]> =>
  Object.keys(after ?? {}).map((k) => [k, before && before[k] ? `${before[k]} to ${after[k]}` : String(after[k])] as [string, string]);
export function requestReceivedEmail(o: Who & { kind: "change" | "cancel"; before: Record<string, string>; after: Record<string, string>; note?: string; open: boolean; link: string }): EmailSpec {
  const cancel = o.kind === "cancel";
  return {
    entriesEmail: o.entriesEmail, why: "You are getting this email because you asked for a change to your entry.",
    preheader: cancel ? "We have your cancellation request. The entries team will look at it." : "We have your request. Nothing changes until the entries team approves it.",
    blocks: [
      ["h1", cancel ? "We have your cancellation request" : "We have your request"],
      ["p", cancel ? `${hi(o.name)}, we have your request to cancel your entry in ${b(o.competition)}. The entries team will look at it and email you.`
        : `${hi(o.name)}, we have your request to change your entry in ${b(o.competition)}. It has been sent to the entries team. <b>Nothing changes until they approve it</b>, and we will email you either way.`],
      ["details", changeRows(o.before, o.after)],
      ...(o.note ? [["small", `Your note: ${esc(o.note)}`] as Block] : []),
      ...(cancel ? [["note", o.open ? "Refunds are available until entries close. The entries team will tell you what is refunded." : "Entries have closed, so there is no refund. Cancelling means your place is freed up and the lifting order is updated.", o.open ? "info" : "warn"] as Block] : []),
      ["button2", "See your request", o.link],
    ],
  };
}
export function requestDecidedEmail(o: Who & { kind: "change" | "cancel"; approved: boolean; before: Record<string, string>; after: Record<string, string>; reason?: string; link: string }): EmailSpec {
  const cancel = o.kind === "cancel";
  return {
    entriesEmail: o.entriesEmail, why: "You are getting this email because you asked for a change to your entry.",
    preheader: o.approved ? "Your change has been made." : cancel ? "We could not cancel your entry." : "We could not make that change.",
    blocks: o.approved ? [
      ["h1", "Your change has been made"],
      ["p", `${hi(o.name)}, the entries team has approved your request for ${b(o.competition)}.`],
      ["details", rows(o.after)],
      ["p", "If you are in the lifting order, the team will update it. We will email you when the lifting order is published, as usual."],
      ["button2", "See your entry", o.link],
    ] : [
      ["h1", cancel ? "We could not cancel your entry" : "We could not make that change"],
      ["p", `${hi(o.name)}, the entries team could not approve your request for ${b(o.competition)}. ${cancel ? "Your entry stays as it is." : "Your entry has not changed."}`],
      ["note", `<b>Reason:</b> ${esc(o.reason || "")}`, "warn"],
      ["p", "If you think something is wrong, reply to this email and we will look again."],
      ["button2", "See your entry", o.link],
    ],
  };
}
export function requestNotification(o: { name: string; email: string; competition: string; kind: "change" | "cancel"; before: Record<string, string>; after: Record<string, string>; note?: string; open: boolean; deskUrl?: string }): EmailSpec {
  const cancel = o.kind === "cancel";
  return { internal: true, preheader: `${o.name} has asked ${cancel ? "to cancel" : "for a change"} in ${o.competition}.`, blocks: [
    ["h1", cancel ? "Cancellation requested" : "Change requested"],
    ["p", `${b(o.name)} (${esc(o.email)}) has asked ${cancel ? "to cancel their entry" : "to change their entry"} in ${b(o.competition)}.`],
    ["details", [...changeRows(o.before, o.after), o.note ? ["Their note", o.note] as [string, string] : null]],
    ...(cancel && !o.open ? [["note", "<b>Entries have closed:</b> no refund is due.", "warn"] as Block] : []),
    ...(o.deskUrl ? [["button", "View request", o.deskUrl] as Block] : []),
  ] };
}
// Internal: what the automatic emails did.
export function liftingSharedNotification(o: { competition: string; kind: "provisional" | "final"; sent: number; failed: number; link: string }): EmailSpec {
  return { internal: true, preheader: `The ${o.kind} lifting order was emailed to ${o.sent} ${o.sent === 1 ? "lifter" : "lifters"}.`, blocks: [
    ["h1", o.kind === "final" ? "Final lifting order sent" : "Lifting order sent"],
    ["p", `The ${o.kind} lifting order for ${b(o.competition)} was emailed to <b>${o.sent} ${o.sent === 1 ? "lifter" : "lifters"}</b>${o.failed ? `, and ${o.failed} could not be sent` : ""}.`],
    ["button", "See the lifting order", o.link]] };
}
export function entriesClosedNotification(o: { competition: string; sent: number; failed: number; orderPublished: boolean; deskUrl?: string }): EmailSpec {
  return { internal: true, preheader: `The entries closed email went to ${o.sent} ${o.sent === 1 ? "lifter" : "lifters"}.`, blocks: [
    ["h1", "Entries closed email sent"],
    ["p", `Entries for ${b(o.competition)} have closed. The "entries are now closed" email was sent to <b>${o.sent} ${o.sent === 1 ? "lifter" : "lifters"}</b>${o.failed ? `, and ${o.failed} could not be sent` : ""}.`],
    ["note", o.orderPublished ? "A provisional lifting order is published, so the email linked to it. When the final order is ready, use <b>Finalise lifting order</b> on the lifting order page and lifters are emailed."
      : "No lifting order is published yet, so the email said it will follow in the next few days. When it is ready, use <b>Finalise lifting order</b> on the lifting order page and lifters are emailed.", "info"],
    ...note(o, "Open the lifting order")] };
}
export function rotaSharedNotification(o: { competition: string; sent: number; failed: number; link: string }): EmailSpec {
  return { internal: true, preheader: `The rota was emailed to ${o.sent} ${o.sent === 1 ? "volunteer" : "volunteers"}.`, blocks: [
    ["h1", "Rota published and emailed"],
    ["p", `The rota for ${b(o.competition)} was emailed to <b>${o.sent} ${o.sent === 1 ? "volunteer" : "volunteers"}</b>${o.failed ? `, and ${o.failed} could not be sent` : ""}.`],
    ["button", "See the rota", o.link]] };
}

// ---- OpenIPF -------------------------------------------------------------------------------------------------------------
// A lifter's profile address looks like https://www.openipf.org/u/agatasitko. Their results are a CSV at /api/liftercsv/<name>.
export function openipfSlug(url: string): string | null {
  const m = String(url ?? "").trim().match(/^https?:\/\/(?:www\.)?openipf\.org\/u\/([A-Za-z0-9][A-Za-z0-9._-]*)\/?(?:[?#].*)?$/i);
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
    // Email services limit how fast you can send (usually a few a second), and a bulk send (entries closed, the lifting order, the rota) goes to
    // everyone in turn. So sends are paced, and one the service turns away for going too fast is tried again after a pause instead of being lost.
    let lastSent = 0;
    const send = async (to: string, subject: string, spec: EmailSpec): Promise<boolean> => {
      const { html, text } = renderEmail({ ...spec, title: subject, siteUrl });
      for (let attempt = 0; attempt < 4; attempt++) {
        const wait = lastSent + 550 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastSent = Date.now();
        const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], reply_to: copy, subject, html, text }) });
        if (r.status !== 429) { if (!r.ok) console.error("Resend failed", r.status); return r.ok; }
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      }
      console.error("Resend kept refusing (rate limit)");
      return false;
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
      // Two limits: per address (so one person cannot keep retrying) and per visitor overall (so one visitor cannot join the list with endless different
      // addresses, which would make us email strangers). Each join sends an email.
      if (!allowTry(ip + "|" + String(body.email ?? "").toLowerCase()) || !allowTry(ip + "|join", Date.now(), 6)) return reply(429, { error: "slow_down", message: "Too many tries. Please wait a few minutes and try again." });
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
      const done = { offers: 0, reminders: 0, expired: 0, failed: 0, priority: 0, openipf: 0, closed: 0 };
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
          if (sent) { done.offers++; await send(copy, `Offered a place: ${n.name} (${c.name})`, offeredNotification({ name: n.name, email: n.email, competition: c.name, expiresAt })); }
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
      // Entries have closed: everyone entered is emailed once (and the entries team gets a note). It links to the provisional lifting order if there is one.
      if (!body.competition_id) {
        const closedIds: string[] = await (await rpc("entries_closed_pending", {})).json().catch(() => []);
        for (const id of Array.isArray(closedIds) ? closedIds : []) {
          const c = await comp(id); if (!c) continue;
          const info = await (await rpc("entries_closed_info", { c: id })).json().catch(() => null) as { order_published: boolean; people: { email: string; name: string }[] } | null;
          if (!info) continue;
          const link = info.order_published ? `${siteUrl}/lifting/?c=${encodeURIComponent(c.slug || c.id)}` : undefined;
          let sent = 0, failed = 0;
          for (const p of info.people ?? []) {
            const ok = await send(p.email, `Entries are now closed: ${c.name}`, entriesClosedEmail({ name: p.name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy, link }));
            if (ok) sent++; else failed++;
          }
          if (sent || !(info.people ?? []).length) await rpc("entries_closed_mark", { c: id });      // marked once anyone has been emailed, so nobody gets it twice
          if (sent || failed) await send(copy, `Entries closed email sent: ${c.name}`, entriesClosedNotification({ competition: c.name, sent, failed, orderPublished: info.order_published, deskUrl: `${siteUrl}/admin/#competitions/${c.id}` }));
          done.closed += sent; done.failed += failed;
        }
      }
      if (!body.competition_id) {
        await rpc("points_codes_expire", {});       // unused points codes that have run out leave an "expired" line in the history
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

    // ---- manage your entry: a one-time emailed code, then look at the entry, change small things, or ask the team for a change or to cancel ----
    if (action === "entry_start" || action === "entry_portal" || action === "entry_update" || action === "entry_request" || action === "entry_withdraw") {
      if (!allowTry(ip + "|entry", Date.now(), 30)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const email = String(body.email ?? "").trim().toLowerCase();
      const sorry = { ok: false, message: "We could not do that just now. Please try again in a moment." };
      if (action === "entry_start") {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
        const r = await rpc("entry_login_start", { p_email: email, th: await sha256Hex(code) });
        const out = await r.json().catch(() => null);
        if (!r.ok || !out) return reply(500, sorry);
        if (out.error === "rate") return reply(429, { ok: false, message: "That is a few codes already. Please wait an hour and try again." });
        if (out.error === "invalid_email") return reply(400, { ok: false, message: "That email address does not look right." });
        if (out.send) await send(email, "Your code to manage your entry", entryCodeEmail({ name: out.name, code, entriesEmail: copy }));
        return reply(200, { ok: true });          // the same answer whether or not the address has an entry
      }
      const th = await sha256Hex(String(body.code ?? "").replace(/\s/g, ""));
      const BAD_CODE = "That code did not work. It may have run out, or been used too many times. You can ask for a new one.";
      const ERR: Record<string, string> = {
        closed: "Entries have closed, so entries cannot be changed now. You can still ask to cancel.", not_found: "We could not find that entry.", pending: "You already have a request waiting. Withdraw it first if you want to ask for something else.",
        nothing: "Choose what you would like to change.", "invalid:weight_class": "That weight class is not available for you.", "invalid:equipment": "That choice of equipment is not available.",
        "invalid:full_name": "Please enter your first and last name.", "invalid:instagram": "That does not look like an Instagram handle.", "invalid:club": "Please choose your club from the list.",
        "invalid:university": "Please enter your university.", "invalid:openipf": "Enter your OpenIPF profile link, starting https://www.openipf.org/", "invalid:bp_number": "Please enter your membership number.", "invalid:kind": "We could not do that.",
      };
      const rpcOut = async (fn: string, args: Record<string, unknown>) => { const r = await rpc(fn, args); const out = await r.json().catch(() => null); return { r, out }; };
      if (action === "entry_portal") {
        const { r, out } = await rpcOut("entry_portal", { p_email: email, th });
        if (!r.ok || !out) return reply(500, sorry);
        return reply(200, out.ok ? out : { ok: false, message: BAD_CODE });
      }
      if (action === "entry_update") {
        const { r, out } = await rpcOut("entry_update", { p_email: email, th, eid: String(body.entry_id ?? ""), p: body.changes ?? {} });
        if (!r.ok || !out) return r.status === 400 ? reply(200, { ok: false, message: "We could not do that." }) : reply(500, sorry);
        if (!out.ok) return reply(200, { ok: false, error: out.error, message: out.error === "code" ? BAD_CODE : ERR[out.error] ?? "We could not do that." });
        return reply(200, out);
      }
      if (action === "entry_withdraw") {
        const { r, out } = await rpcOut("entry_request_withdraw", { p_email: email, th, rid: String(body.request_id ?? "") });
        if (!r.ok || !out) return reply(500, sorry);
        return reply(200, out.ok ? out : { ok: false, message: out.error === "code" ? BAD_CODE : "We could not find that request." });
      }
      // entry_request
      const { r, out } = await rpcOut("entry_request_create", { p_email: email, th, eid: String(body.entry_id ?? ""), p: { kind: body.kind, weight_class_id: body.weight_class_id, equipment: body.equipment, note: body.note } });
      if (!r.ok || !out) return reply(500, sorry);
      if (!out.ok) return reply(200, { ok: false, error: out.error, message: out.error === "code" ? BAD_CODE : ERR[out.error] ?? "We could not do that." });
      const who = { name: out.name as string, competition: out.competition as string, date: dateText(out.start_date), entriesEmail: copy };
      await send(email, out.kind === "cancel" ? `We have your cancellation request: ${out.competition}` : `We have your request: ${out.competition}`, requestReceivedEmail({ ...who, kind: out.kind, before: out.before, after: out.after, note: out.note, open: !!out.open, link: `${siteUrl}/my-entry?email=${encodeURIComponent(email)}` }));
      await send(copy, `${out.kind === "cancel" ? "Cancellation requested" : "Change requested"}: ${out.name}, ${out.competition}`, requestNotification({ name: out.name, email: out.email, competition: out.competition, kind: out.kind, before: out.before, after: out.after, note: out.note, open: !!out.open, deskUrl: `${siteUrl}/admin/#competitions/${out.competition_id}/entries` }));
      return reply(200, { ok: true, id: out.id, kind: out.kind });
    }

    // ---- the entries team decides a request: approve (a change is made) or decline (with a reason the lifter is emailed) ----
    if (action === "entry_request_decide") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      let allowed = false, actor = "";
      if (token && token !== anon) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        allowed = who.ok && (await who.json()) === true;
        if (allowed) { const u = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon!, authorization: `Bearer ${token}` } }); actor = String((await u.json().catch(() => ({})))?.email ?? ""); }
      }
      if (!allowed) return reply(401, { error: "not_allowed" });
      const approve = body.approve === true;
      const r = await rpc("entry_request_decide", { rid: String(body.request_id ?? ""), approve, reason: String(body.reason ?? ""), actor });
      const out = await r.json().catch(() => null);
      if (!r.ok || !out) { console.error("entry_request_decide failed", JSON.stringify(out)); return reply(500, { ok: false, message: "That did not work. Please try again." }); }
      if (!out.ok) return reply(200, { ok: false, error: out.error, message: ({ not_pending: "That request has already been dealt with.", reason: "Please give a reason: it is emailed to the lifter.", entry_not_cancelled: "Cancel the entry first, then approve the request.", entry_not_live: "That entry is no longer live.", "invalid:weight_class": "That weight class is no longer allowed for this lifter." } as Record<string, string>)[out.error] ?? "We could not do that." });
      const kind = out.kind as "change" | "cancel";
      // A cancellation that is approved has already had its own email (from Cancel or refund). Everything else tells the lifter the outcome.
      if (!(kind === "cancel" && out.status === "approved")) {
        await send(out.email, out.status === "approved" ? `Your change has been made: ${out.competition}` : kind === "cancel" ? `We could not cancel your entry: ${out.competition}` : `We could not make that change: ${out.competition}`,
          requestDecidedEmail({ name: out.name, competition: out.competition, date: dateText(out.start_date), entriesEmail: copy, kind, approved: out.status === "approved", before: out.before, after: out.after, reason: out.reason, link: `${siteUrl}/my-entry?email=${encodeURIComponent(out.email)}` }));
      }
      return reply(200, { ok: true, status: out.status, kind, lifting_order: out.lifting_order, qualification: out.qualification });
    }

    // ---- the lifting order is published (provisional) or marked final: email the lifters in it ---------------------------------------
    // The editor calls this after it has published the order. Provisional is only sent while entries are open, and final once it has been marked final.
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
      const info = await (await rpc("lifting_order_share_info", { c: c.id })).json().catch(() => null) as { published: boolean; closed: boolean; final: boolean; people: { email: string; name: string }[] } | null;
      if (!info) return reply(404, { error: "not_found" });
      if (!info.published) return reply(409, { error: "not_published" });
      const kind = info.final ? "final" : "provisional";
      if (kind === "provisional" && info.closed) return reply(409, { error: "closed" });         // after entries close, the only lifting order email is the final one
      const link = `${siteUrl}/lifting/?c=${encodeURIComponent(c.slug || c.id)}`;
      let sent = 0, failed = 0;
      for (const p of info.people ?? []) {
        const ok = await send(p.email, `The ${kind} lifting order: ${c.name}`, liftingOrderEmail({ name: p.name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy, link, kind }));
        if (ok) sent++; else failed++;
      }
      if (sent) await rpc("lifting_order_mark_shared", { c: c.id, kind, n: sent });
      await send(copy, `Lifting order shared: ${c.name}`, liftingSharedNotification({ competition: c.name, kind, sent, failed, link }));
      return reply(200, { ok: true, kind, sent, failed });
    }

    // ---- the rota is published: each volunteer with a role is told what they are doing (once; publishing again does not email again) ----
    if (action === "rota_share") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      let allowed = false;
      if (token && token !== anon) {
        const who = await fetch(`${url}/rest/v1/rpc/is_entries`, { method: "POST", headers: { apikey: anon!, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
        allowed = who.ok && (await who.json()) === true;
      }
      if (!allowed) return reply(401, { error: "not_allowed" });
      const c = await comp(String(body.competition_id ?? ""));
      if (!c) return reply(404, { error: "not_found" });
      const info = await (await rpc("rota_share_info", { c: c.id })).json().catch(() => null) as { published: boolean; emailed_at: string | null; people: { email: string; name: string; roles: { session: string; when: string; role: string }[] }[] } | null;
      if (!info) return reply(404, { error: "not_found" });
      if (!info.published) return reply(409, { error: "not_published" });
      if (info.emailed_at) return reply(200, { ok: true, already: true, sent: 0, failed: 0 });
      const link = rotaLink(siteUrl, c.slug);
      let sent = 0, failed = 0;
      for (const p of info.people ?? []) {
        const ok = await send(p.email, `The rota is published: ${c.name}`, rotaEmail({ name: p.name, competition: c.name, date: dateText(c.start_date), entriesEmail: copy, roles: p.roles, link }));
        if (ok) sent++; else failed++;
      }
      if (sent || !(info.people ?? []).length) await rpc("rota_mark_emailed", { c: c.id, n: sent });
      if (sent || failed) await send(copy, `Rota published: ${c.name}`, rotaSharedNotification({ competition: c.name, sent, failed, link }));
      return reply(200, { ok: true, sent, failed });
    }

    return reply(400, { error: "bad_request" });
  });
}
