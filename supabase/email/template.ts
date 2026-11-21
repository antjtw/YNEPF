// The YNEPF email template. THIS FILE IS THE SOURCE: scripts/sync-email-template.mjs copies it into each Edge Function
// (they are pasted into Supabase one at a time, so they cannot import it). Do not edit the copies.
//
// One email is described once, as a list of blocks, and turned into BOTH an HTML email and a plain text email:
//   renderEmail({ preheader, blocks: [["h1", "Title"], ["p", `Hello ${esc(name)}`], ["button", "Open it", url]] }) -> { html, text }
//
// Rules that keep it safe and reliable (see docs/email-mockups/README.md for the research):
//   * Tables and inline styles, so Outlook and Gmail show it properly. A "button" is a table cell with a link inside.
//   * System fonts only (web fonts do not work in Gmail or Outlook).
//   * Always escape anything a person typed (names, reasons, messages) with esc() before it goes inside a "p", "note" or "small".
//     The "h1", "bullets", "details", "code", "quote" and button blocks escape their own text.

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

function layout(o: { title?: string; preheader?: string; body: string; entriesEmail?: string; siteUrl: string; why?: string; noQuestions?: boolean; internal?: boolean }): string {
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
        <td valign="middle" style="font-family:${FONT};color:#FFFFFF;"><div style="font-size:18px;line-height:1.2;font-weight:700;color:#FFFFFF;">YNEPF${o.internal ? ' <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background-color:#D6B778;color:#07121A;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;vertical-align:2px;">Internal</span>' : ""}</div>
          <div style="font-size:12px;line-height:1.4;color:#C9D4E0;">${o.internal ? "A note from the website for the entries team" : esc(BRAND.name)}</div></td>
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
  const out = layout({ title: e.title, preheader: e.preheader, body, entriesEmail: e.entriesEmail, siteUrl, why: e.why, noQuestions: e.noQuestions, internal: e.internal });
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
