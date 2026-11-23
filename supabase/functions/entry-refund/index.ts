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
export function confirmationEmail(e: { name: string; competition: string; date: string; event: string; equipment: string; pence: number; under18: boolean; entriesEmail: string; refundsUntil?: string; category?: string; weightClass?: string; sex?: string; division?: string; club?: string; clubLabel?: string; discountPence?: number; extras?: Extra[]; manageUrl?: string }): EmailSpec {
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
      ...(e.manageUrl ? [
        ["p", "<b>Need to change something, or pull out?</b> You can do it online until entries close. Your name, club and Instagram update straight away. A different weight class, or cancelling, goes to the entries team to approve."] as Block,
        ["button", "Manage your entry", e.manageUrl] as Block,
        ["small", `To change your event, date of birth or sex, or anything to do with money, email us at ${a(mailto(e.entriesEmail, `Changing my entry: ${e.competition}`), e.entriesEmail)} instead.`] as Block,
      ] : [
        ["p", "<b>Need to change something, or pull out?</b> Email us and the entries team will sort it, before entries close."] as Block,
        ["button2", "Email us about your entry", mailto(e.entriesEmail, `Changing my entry: ${e.competition}`)] as Block,
      ]),
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
    const [entry] = await (await db(`entries?id=eq.${body.entry_id}&select=id,status,full_name,email,competition_id,competitions(name,capacity),payments(id,status,amount_pence,stripe_payment_intent,refunds(amount_pence))`)).json();
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
    const from = Deno.env.get("MAIL_FROM") ?? "YNEPF <onboarding@resend.dev>", copy = Deno.env.get("NOTIFY_TO") ?? "competitions@ynepf.co.uk";
    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
    const mail = (to: string[], subject: string, spec: EmailSpec) => {
      const { html, text } = renderEmail({ ...spec, title: subject, siteUrl });
      return fetch("https://api.resend.com/emails", {
        method: "POST", headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, reply_to: copy, subject, html, text }),
      }).then((r) => { if (!r.ok) console.error("Resend failed", r.status); }).catch((e) => console.error("Resend failed", e));
    };
    // The lifter hears about it (unless the entries team chose not to tell them)...
    if (body.notify !== false) {
      await mail([entry.email], plan.cancel ? `Your entry has been cancelled: ${entry.competitions?.name ?? ""}` : `A refund for your entry: ${entry.competitions?.name ?? ""}`,
        refundEmail({ name: entry.full_name, competition: entry.competitions?.name ?? "the competition", refundedPence: plan.refundPence, cancelled: plan.cancel, reason, entriesEmail: copy, siteUrl }));
    }
    // ...and the competitions inbox always gets a note, so the team can see every refund and cancellation.
    const takenRows = await (await db(`entries?competition_id=eq.${entry.competition_id}&status=in.(paid,comped)&select=id`)).json().catch(() => []);
    await mail([copy], plan.refundPence > 0 ? `Refund: ${pounds(plan.refundPence)}, ${entry.full_name}, ${entry.competitions?.name ?? ""}` : `Cancelled: ${entry.full_name}, ${entry.competitions?.name ?? ""}`,
      refundNotification({ by: actor, name: entry.full_name, email: entry.email, competition: entry.competitions?.name ?? "the competition", refundedPence: plan.refundPence, cancelled: plan.cancel, reason,
        taken: Array.isArray(takenRows) ? takenRows.length : undefined, capacity: entry.competitions?.capacity, deskUrl: siteUrl && entry.competition_id ? `${siteUrl}/admin/#competitions/${entry.competition_id}/entries` : undefined }));
    return reply(200, { ok: true, status: plan.finalStatus, refunded_pence: plan.refundPence, stripe_refund: stripeRefundId });
  });
}
