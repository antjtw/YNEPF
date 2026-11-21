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
  "invalid:university": "Please choose your university from the list.",
  "invalid:university_other": "Please tell us the name of your university.",
  discount_invalid: "That discount code was not recognised. Please check it and try again.",
  discount_expired: "That discount code has expired.",
  discount_used: "That discount code has already been used.",
  discount_not_yours: "That discount code was made for a different email address.",
  duplicate_bp: "A lifter with that membership number has already entered. If this is a mistake, please contact the entries team.",
  "invalid:openipf": "Please enter your OpenIPF profile link, starting https://www.openipf.org/",
  sold_out: "Sorry, one of the extras you chose has just sold out. Please go back, untick it and try again.",
  "invalid:extras": "Something is wrong with the extras you chose. Please go back and check them.",
  no_price: "We could not work out a price for that combination. Please email the entries team.",
  "invalid:full_name": "Please enter your first and last name.",
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

export function sessionParams(o: { entryId: string; email: string; name: string; pence: number; competition: string; siteUrl: string; expiresAt: number; slug?: string; extras?: { name: string; pence: number }[] }) {
  const extras = o.extras ?? [], extrasPence = extras.reduce((n, x) => n + x.pence, 0);
  const more: Record<string, string | number> = {};
  extras.forEach((x, i) => { const k = `line_items[${i + 1}]`; more[`${k}[quantity]`] = 1; more[`${k}[price_data][currency]`] = "gbp"; more[`${k}[price_data][unit_amount]`] = x.pence; more[`${k}[price_data][product_data][name]`] = x.name; });
  return {
    ui_mode: "embedded",
    mode: "payment",
    customer_email: o.email,
    client_reference_id: o.entryId,
    return_url: `${o.siteUrl}/entry-thanks?${o.slug ? `c=${encodeURIComponent(o.slug)}&` : ""}session_id={CHECKOUT_SESSION_ID}`,
    expires_at: o.expiresAt,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": o.pence - extrasPence,
    "line_items[0][price_data][product_data][name]": `Entry: ${o.competition}`,
    "line_items[0][price_data][product_data][description]": o.name,
    ...more,
    "metadata[entry_id]": o.entryId,
    "payment_intent_data[metadata][entry_id]": o.entryId,
  };
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

// Checking a discount code is limited so codes cannot be guessed: a handful of tries per address, per few minutes.
const tries: Record<string, number[]> = {};
export function allowTry(key: string, now = Date.now(), max = 8, windowMs = 10 * 60 * 1000): boolean {
  const list = (tries[key] = (tries[key] ?? []).filter((t) => now - t < windowMs));
  if (list.length >= max) return false;
  list.push(now); return true;
}

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

// ==== entry emails: copied from supabase/email/entry-emails.ts by scripts/sync-email-template.mjs. Do not edit between these markers. ====
const gbp = (pence: number): string => "£" + (pence / 100).toFixed(2);
// "2027-02-27" -> "27 February 2027". Anything that is not an ISO date is shown as it is.
const longDate = (d: string): string => /^\d{4}-\d{2}-\d{2}/.test(d) ? new Date(d.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", { timeZone: "Europe/London", dateStyle: "long" }) : d;
const mailto = (to: string, subject: string): string => `mailto:${to}?subject=${encodeURIComponent(subject)}`;
type Extra = { name: string; option?: string; pence: number };
const extraLabel = (x: Extra) => `${x.name}${x.option ? ` (${x.option})` : ""}`;

// ---- to the lifter ----------------------------------------------------------------------------------------------------------------------
export function confirmationEmail(e: { name: string; competition: string; date: string; event: string; equipment: string; pence: number; under18: boolean; entriesEmail: string; refundsUntil?: string; category?: string; weightClass?: string; sex?: string; division?: string; club?: string; clubLabel?: string; discountPence?: number; extras?: Extra[] }): EmailSpec {
  const first = String(e.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: e.entriesEmail, noQuestions: true, why: "You are getting this email because you entered a YNEPF competition.",
    preheader: `Your entry for ${e.competition} on ${longDate(e.date)} is confirmed and paid.`,
    blocks: [
      ["h1", `You're in, ${first}.`],
      ["p", `Your entry for ${b(e.competition)} on ${esc(longDate(e.date))} is confirmed. Thank you for entering.`],
      ["details", [["Event", e.event], ["Equipment", e.equipment], e.category ? ["Category", e.category] : null, e.weightClass ? ["Weight class", `${e.sex === "F" ? "Women's" : "Men's"} ${e.weightClass} kg`] : null, e.division ? ["Federation or division", e.division] : null,
        e.club ? [e.clubLabel || "Club", e.club] : null, e.discountPence ? ["Discount", `${gbp(e.discountPence)} off`] : null,
        ...(e.extras ?? []).map((x): [string, string] => [`Extra: ${extraLabel(x)}`, gbp(x.pence)]), ["Paid", gbp(e.pence)]], "boldLast"],
      ...(e.under18 ? [["note", "<b>Under 18 on the day?</b> A parent or guardian needs to be with you at the competition.", "info"] as Block] : []),
      ...(e.refundsUntil ? [["p", `Refunds are available until entries close on ${esc(e.refundsUntil)}. After that, we cannot refund entries.`] as Block] : []),
      ["p", "<b>Need to change something, or pull out?</b> Email us and the entries team will sort it. You cannot edit an entry yourself yet, so please get in touch before entries close."],
      ["button2", "Email us about your entry", mailto(e.entriesEmail, `Changing my entry: ${e.competition}`)],
      ...RULES_AND_KIT,
      ["small", "Your name, club and weight class are shown on the entries list and the lifting order. Your date of birth is never published. If anything is wrong, or you want us to change or delete what we hold about you, just reply to this email."],
    ],
  };
}
// A refund or cancellation. A whole refund cancels the entry; a part refund leaves them entered.
export function refundEmail(o: { name: string; competition: string; refundedPence: number; cancelled: boolean; reason?: string; entriesEmail: string; siteUrl?: string }): EmailSpec {
  const first = String(o.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: o.entriesEmail, why: o.cancelled ? "You are getting this email because your entry was cancelled." : "You are getting this email because part of your entry fee was refunded.",
    preheader: o.refundedPence > 0 ? `We have refunded ${gbp(o.refundedPence)}.${o.cancelled ? "" : " You are still entered."}` : "No refund is due on this entry.",
    blocks: [
      ["h1", o.cancelled ? "Your entry has been cancelled" : "We have refunded part of your entry"],
      ["p", o.cancelled ? `Hi ${esc(first)}, your entry in ${b(o.competition)} has been cancelled.` : `Hi ${esc(first)}, we have refunded part of your entry fee for ${b(o.competition)}. <b>You are still entered.</b>`],
      ["details", o.refundedPence > 0 ? [["Refunded", gbp(o.refundedPence)], ["Back on your card", "5 to 10 working days"], o.reason ? ["Reason", o.reason] : null] : [["Refunded", "No refund is due on this entry"], o.reason ? ["Reason", o.reason] : null]],
      ...(o.cancelled && o.siteUrl ? [["p", "We are sorry we will not see you on the platform this time. Keep an eye on the calendar for the next one."] as Block, ["button", "See upcoming competitions", `${o.siteUrl.replace(/\/$/, "")}/calendar`] as Block] : []),
    ],
  };
}
// Paid after the held place was released and the competition filled: refunded in full, automatically.
export function autoRefundEmail(o: { name: string; competition: string; refundedPence: number; entriesEmail: string; joinUrl?: string }): EmailSpec {
  const first = String(o.name).trim().split(/\s+/)[0] || "there";
  return {
    entriesEmail: o.entriesEmail, why: "You are getting this email because your payment was refunded automatically.",
    preheader: "Your place was released before your payment arrived, so we have refunded you in full.",
    blocks: [
      ["h1", "We have refunded your payment"],
      ["p", `Hi ${esc(first)}, sorry: your payment arrived after your place was released, and ${b(o.competition)} has since filled. We have refunded you in full.`],
      ["details", [["Refunded", gbp(o.refundedPence)], ["Back on your account", "a few days"]]],
      ["p", "You can join the waiting list on the competition page."],
      ...(o.joinUrl ? [["button", "Join the waiting list", o.joinUrl] as Block] : []),
    ],
  };
}

// ---- notes for the competitions inbox ---------------------------------------------------------------------------------------------------------
const desk = (url: string | undefined, label: string): Block[] => url ? [["button", label, url]] : [];
export function entryNotification(e: { name: string; email: string; competition: string; date: string; event: string; equipment: string; weightClass?: string; sex?: string; category?: string; division?: string; isGuest?: boolean; club?: string; clubLabel?: string; pence: number; discountPence?: number; extras?: Extra[]; under18?: boolean; openipfUrl?: string; taken: number; capacity?: number | null; deskUrl?: string }): EmailSpec {
  const flags = [e.isGuest ? "<b>A guest:</b> the membership number needs checking." : "", e.under18 ? "<b>Under 18 on the day:</b> parent or guardian details were taken." : ""].filter(Boolean).join(" ");
  return {
    internal: true, preheader: `${e.name} has entered ${e.competition}. ${e.taken}${e.capacity ? ` of ${e.capacity}` : ""} ${e.taken === 1 && !e.capacity ? "place" : "places"} taken.`,
    blocks: [
      ["h1", "New entry"],
      ["p", `${b(e.name)} has entered ${b(e.competition)} (${esc(longDate(e.date))}).`],
      ["details", [["Event", `${e.event}, ${e.equipment.toLowerCase()}`], e.weightClass ? ["Weight class", `${e.sex === "F" ? "Women's" : "Men's"} ${e.weightClass} kg`] : null, e.category ? ["Category", e.category] : null,
        e.division ? ["Federation or division", e.division] : null, e.club ? [e.clubLabel || "Club", e.club] : null,
        e.pence > 0 ? ["Paid", `${gbp(e.pence)}${e.discountPence ? ` (after a discount of ${gbp(e.discountPence)})` : ""}`] : ["Entry", "Free: nothing to pay"],
        ...(e.extras ?? []).map((x): [string, string] => [`Extra: ${extraLabel(x)}`, gbp(x.pence)]),
        e.openipfUrl ? ["OpenIPF", `${e.openipfUrl} (checked automatically within a few minutes)`] : null, ["Email", e.email]]],
      ...(flags ? [["note", flags, "warn"] as Block] : []),
      ["p", `That is ${e.taken}${e.capacity ? ` of ${e.capacity}` : ""} ${e.taken === 1 && !e.capacity ? "place" : "places"} taken.`],
      ...desk(e.deskUrl, "Open the entries desk"),
    ],
  };
}
export function discountNotification(o: { code: string; name: string; email: string; competition: string; discountPence: number; paidPence: number; recipientName?: string; recipientEmail?: string; reason?: string; deskUrl?: string }): EmailSpec {
  const made = [o.recipientName, o.recipientEmail].filter(Boolean).join(", ");
  return {
    internal: true, preheader: `The code was used for ${o.competition}.`,
    blocks: [
      ["h1", "A discount code was used"],
      ["p", `The code ${b(o.code)} has been used for ${b(o.competition)}.`],
      ["details", [["Used by", `${o.name} (${o.email})`], ["Discount", `${gbp(o.discountPence)} off${o.paidPence > 0 ? `, so they paid ${gbp(o.paidPence)}` : ", so the entry is free"}`], made ? ["Made for", made] : null, o.reason ? ["Reason", o.reason] : null]],
      ...desk(o.deskUrl, "See every use of the codes"),
    ],
  };
}
export function refundNotification(o: { by: string; name: string; email: string; competition: string; refundedPence: number; cancelled: boolean; reason?: string; taken?: number; capacity?: number | null; deskUrl?: string }): EmailSpec {
  return {
    internal: true, preheader: o.refundedPence > 0 ? `${o.by} refunded ${gbp(o.refundedPence)} to ${o.name}.${o.cancelled ? " The place is free again." : ""}` : `${o.by} cancelled ${o.name}'s entry. No money was refunded.`,
    blocks: [
      ["h1", o.cancelled ? "Entry cancelled" : "Part refund"],
      ["p", o.refundedPence > 0 ? `${b(o.by)} refunded ${b(gbp(o.refundedPence))} to ${esc(o.name)} for their entry in ${b(o.competition)}.` : `${b(o.by)} cancelled ${esc(o.name)}'s entry in ${b(o.competition)}. No money was refunded.`],
      ["details", [o.reason ? ["Reason", o.reason] : null, ["The entry is now", o.cancelled ? "Cancelled, and the place is free" : "Still entered (a partial refund)"], ["Email", o.email],
        o.taken !== undefined ? ["Places taken", `${o.taken}${o.capacity ? ` of ${o.capacity}` : ""}`] : null]],
      ...(o.refundedPence > 0 ? [["small", "Stripe keeps its processing fee on a refund."] as Block] : []),
      ...desk(o.deskUrl, "Open the entries desk"),
    ],
  };
}
// ==== end of entry emails ====

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

    // The form asks "would this code work, and what is the new total?" before it pays.
    if (body.action === "discount") {
      const key = (req.headers.get("x-forwarded-for") ?? "").split(",")[0] + "|" + String(body.email ?? "").toLowerCase();
      if (!allowTry(key)) return reply(429, { ok: false, message: "Too many tries. Please wait a few minutes and try again." });
      const chk = await fetch(`${url}/rest/v1/rpc/check_discount`, {
        method: "POST", headers: { apikey: svc, authorization: `Bearer ${svc}`, "content-type": "application/json" },
        body: JSON.stringify({ p: { competition_id: body.competition_id, email: body.email, code: body.code, date_of_birth: body.date_of_birth, event: body.event, equipment: body.equipment } }),
      });
      const r = await chk.json().catch(() => ({}));
      if (!chk.ok || r.ok !== true) {
        const code = r?.error === "no_price" ? "no_price" : "discount_" + (r?.error ?? "invalid");
        return reply(200, { ok: false, message: MESSAGES[code] ?? MESSAGES.discount_invalid });
      }
      return reply(200, { ok: true, base_pence: r.base_pence, discount_pence: r.discount_pence, price_pence: r.price_pence });
    }
    delete body.action;

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
    const { entry_id, price_pence, competition, slug } = out as { entry_id: string; price_pence: number; competition: string; slug?: string };

    // The extras this entry took (photo package, T-shirt ...), for the payment page and the email.
    const extraRows = await (await fetch(`${url}/rest/v1/entry_addons?entry_id=eq.${entry_id}&select=price_pence,addons(name),addon_options(label)`, { headers: { apikey: svc, authorization: `Bearer ${svc}` } })).json().catch(() => []);
    const extras = (Array.isArray(extraRows) ? extraRows : []).map((x: { price_pence: number; addons?: { name: string }; addon_options?: { label: string } | null }) => ({ name: x.addons?.name ?? "Extra", option: x.addon_options?.label, pence: x.price_pence }));

    // 2. A code that takes the whole price off makes this a free entry: it is already confirmed, so there is nothing to pay.
    if ((out as { free?: boolean }).free) {
      const [row] = await (await fetch(`${url}/rest/v1/entries?id=eq.${entry_id}&select=email,full_name,event,equipment,price_pence,discount_pence,discount_code_id,discount_codes(code,recipient_name,recipient_email,reason),date_of_birth,club,sex,openipf_url,is_guest,competition_id,weight_classes(label),divisions(name,is_home),competitions(name,slug,is_university,start_date,entry_closes,capacity)`, { headers: { apikey: svc, authorization: `Bearer ${svc}` } })).json();
      if (row) {
        const from = Deno.env.get("MAIL_FROM") ?? "YNEPF <onboarding@resend.dev>", copy = Deno.env.get("NOTIFY_TO") ?? "competitions@ynepf.co.uk";
        const compYear = new Date(row.competitions.start_date).getFullYear();
        const mail = async (to: string, subject: string, spec: EmailSpec) => {
          const { html, text } = renderEmail({ ...spec, title: subject, siteUrl });
          const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [to], reply_to: copy, subject, html, text }) }).catch(() => null);
          if (!r || !r.ok) console.error("Resend failed", r?.status);
        };
        const clubLabel = row.competitions.is_university ? "University" : "Club";
        const wcRow = Array.isArray(row.weight_classes) ? row.weight_classes[0] : row.weight_classes;
        await mail(row.email, `Your entry: ${row.competitions.name}`, confirmationEmail({
          name: row.full_name, competition: row.competitions.name, date: row.competitions.start_date, event: row.event === "bench_only" ? "Bench only" : "Full power",
          equipment: row.equipment === "equipped" ? "Equipped" : "Classic", pence: row.price_pence, under18: exactAge(row.date_of_birth, row.competitions.start_date) < 18, entriesEmail: copy,
          category: ageCategory(new Date(row.date_of_birth).getFullYear(), compYear), weightClass: wcRow?.label, sex: row.sex, division: row.divisions ? row.divisions.name + (row.divisions.is_home ? "" : " (guest)") : undefined,
          club: row.club || undefined, clubLabel, discountPence: row.discount_pence || 0, extras,
          refundsUntil: row.competitions.entry_closes ? new Date(row.competitions.entry_closes).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "full", timeStyle: "short" }) : undefined }));
        // A note for the competitions inbox, so the team can see each entry arrive.
        const takenRows = await (await fetch(`${url}/rest/v1/entries?competition_id=eq.${row.competition_id}&status=in.(paid,comped)&select=id`, { headers: { apikey: svc, authorization: `Bearer ${svc}` } })).json().catch(() => []);
        await mail(copy, `New entry: ${row.full_name}, ${row.competitions.name}`, entryNotification({
          name: row.full_name, email: row.email, competition: row.competitions.name, date: row.competitions.start_date,
          event: row.event === "bench_only" ? "Bench only" : "Full power", equipment: row.equipment === "equipped" ? "Equipped" : "Classic", weightClass: wcRow?.label, sex: row.sex,
          category: ageCategory(new Date(row.date_of_birth).getFullYear(), compYear), division: row.divisions ? row.divisions.name + (row.divisions.is_home ? "" : " (guest)") : undefined,
          isGuest: !!row.is_guest, club: row.club || undefined, clubLabel, pence: row.price_pence, discountPence: row.discount_pence || 0, extras,
          under18: exactAge(row.date_of_birth, row.competitions.start_date) < 18, openipfUrl: row.openipf_url || undefined,
          taken: Array.isArray(takenRows) ? takenRows.length : 0, capacity: row.competitions.capacity,
          deskUrl: siteUrl && row.competition_id ? `${siteUrl}/admin/#competitions/${row.competition_id}/entries` : undefined }));
        // A discount code was used: a second note, so redemptions are easy to follow.
        const dc = Array.isArray(row.discount_codes) ? row.discount_codes[0] : row.discount_codes;
        if (row.discount_code_id && dc?.code) {
          await mail(copy, `Discount code used: ${dc.code}, ${row.full_name}`, discountNotification({
            code: dc.code, name: row.full_name, email: row.email, competition: row.competitions.name, discountPence: row.discount_pence || 0, paidPence: row.price_pence,
            recipientName: dc.recipient_name || undefined, recipientEmail: dc.recipient_email || undefined, reason: dc.reason || undefined,
            deskUrl: siteUrl && row.competition_id ? `${siteUrl}/admin/#competitions/${row.competition_id}/discounts` : undefined }));
        }
      }
      return reply(200, { free: true, entry_id, slug });
    }

    // 3. Stripe embedded Checkout. Stripe's shortest allowed life is 30 minutes; our own hold is shorter
    //    and is what decides whether the place is still ours (the webhook handles a late payment).
    const params = sessionParams({
      entryId: entry_id, email: String(body.email ?? "").trim().toLowerCase(), name: String(body.full_name ?? "").trim(),
      pence: price_pence, competition, slug, siteUrl, extras: extras.map((x) => ({ name: x.option ? `${x.name} (${x.option})` : x.name, pence: x.pence })), expiresAt: Math.floor(Date.now() / 1000) + 31 * 60,
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
