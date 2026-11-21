// A branded HTML email layout for the YNEPF emails, plus a few small building blocks.
//
// How it is built, and why (see README.md in this folder for the research):
//   * Tables for layout and inline styles, because Outlook (Word's engine) and Gmail ignore or strip most modern CSS.
//   * A "bulletproof" button: a table cell with the background colour, and a link inside. It works with images off.
//   * Web-safe system fonts only. Web fonts only work in Apple Mail, so there is no point loading one.
//   * A hidden preheader (the grey preview line in the inbox), a 600px column, and a plain text twin of every email.
//   * Light design that holds up when a client darkens it. A small <style> block improves it where dark mode is supported.
//
// The functions are pure: they take data and return a string, so the same code can run in an Edge Function.

export const BRAND = {
  navy: "#152C41", navyDeep: "#07121A", navyTint: "#E8EDF2", page: "#F6F8FA", iron: "#AA482C", ironDark: "#8B3C25", ironTint: "#F9EDE7",
  gold: "#D6B778", text: "#242525", muted: "#585A5B", line: "#C9D4E0", sageBg: "#E8F6EB", sageText: "#2C5238",
  name: "Yorkshire & North East Powerlifting Federation", short: "YNEPF",
};
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif`;

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- building blocks (each returns an HTML string) --------------------------------------------------
export const h1 = (t) => `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;color:${BRAND.navy};">${esc(t)}</h1>`;
export const p = (t, o = {}) => `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${o.muted ? BRAND.muted : BRAND.text};">${t}</p>`;
export const small = (t) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.muted};">${t}</p>`;
export const h2 = (t) => `<h2 style="margin:8px 0 12px;font-family:${FONT};font-size:18px;line-height:1.3;font-weight:700;color:${BRAND.navy};">${esc(t)}</h2>`;
// A link inside a paragraph. In the plain text version it becomes "text (address)".
export const a = (href, text) => `<a class="lnk" href="${esc(href)}" target="_blank" style="color:${BRAND.navy};font-weight:600;text-decoration:underline;">${esc(text)}</a>`;
export const strong = (t) => `<strong style="color:${BRAND.navy};">${esc(t)}</strong>`;

// The main call to action. The cell carries the colour and size, so it still looks like a button with images blocked.
export function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr>
    <td align="center" bgcolor="${BRAND.iron}" style="border-radius:10px;background-color:${BRAND.iron};">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td></tr></table>`;
}
// A quieter button, for a second action next to the main one (outlined, not filled).
export function buttonSecondary(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>
    <td align="center" style="border:2px solid ${BRAND.iron};border-radius:10px;">
      <a class="btn2" href="${esc(href)}" target="_blank" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:${BRAND.ironDark};text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td></tr></table>`;
}
// For when the link is also worth showing in full (some people copy and paste it).
export const linkFallback = (href) => small(`If the button does not work, copy this link into your browser:<br><a class="lnk" href="${esc(href)}" style="color:${BRAND.navy};word-break:break-all;">${esc(href)}</a>`);

// A code to read out or type, such as a one-time code or a discount code.
export const codeBox = (code) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;"><tr>
  <td class="bg-code" align="center" bgcolor="${BRAND.navyTint}" style="background-color:${BRAND.navyTint};border-radius:10px;padding:18px 16px;">
    <span class="t-code" style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:4px;color:${BRAND.navy};">${esc(code)}</span>
  </td></tr></table>`;

// A label and value list, for entry details and receipts.
export function details(rows, o = {}) {
  const tr = rows.filter(Boolean).map(([k, v], i, a) => {
    const last = i === a.length - 1, b = last ? "" : `border-bottom:1px solid ${BRAND.line};`;
    return `<tr><td valign="top" class="details-rule" style="padding:10px 12px 10px 0;${b}font-family:${FONT};font-size:14px;line-height:1.5;color:${BRAND.muted};width:38%;">${esc(k)}</td>
      <td valign="top" class="details-rule" style="padding:10px 0;${b}font-family:${FONT};font-size:15px;line-height:1.5;color:${BRAND.text};${o.boldLast && last ? "font-weight:700;" : ""}">${esc(v)}</td></tr>`;
  }).join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">${tr}</table>`;
}

// A short note that sits apart from the main text: a deadline, a warning, "good to know".
export function note(html, kind = "info") {
  const c = kind === "good" ? [BRAND.sageBg, "#4C8F62", BRAND.sageText] : kind === "warn" ? [BRAND.ironTint, BRAND.iron, "#5A2514"] : [BRAND.navyTint, BRAND.navy, BRAND.navy];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;"><tr>
    <td class="note-${kind}" bgcolor="${c[0]}" style="background-color:${c[0]};border-left:4px solid ${c[1]};border-radius:6px;padding:14px 16px;font-family:${FONT};font-size:15px;line-height:1.55;color:${c[2]};">${html}</td></tr></table>`;
}
// A message someone else wrote, kept apart from our own words (used for contact form messages).
export const quote = (t) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;"><tr>
  <td class="bg-code" bgcolor="${BRAND.page}" style="background-color:${BRAND.page};border-left:4px solid ${BRAND.line};border-radius:6px;padding:14px 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};white-space:pre-wrap;">${esc(t)}</td></tr></table>`;
export const bullets = (items) => `<ul style="margin:0 0 16px;padding:0 0 0 20px;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};">${items.map((i) => `<li style="margin:0 0 6px;">${esc(i)}</li>`).join("")}</ul>`;

// ---- the full email ----------------------------------------------------------------------------------
// o: { preheader, body (html), entriesEmail, siteUrl, why (why they are getting this), unsubscribe? }
export function layout(o) {
  const site = (o.siteUrl || "https://www.ynepf.co.uk").replace(/\/$/, "");
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
    <!-- header -->
    <tr><td bgcolor="${BRAND.navy}" style="background-color:${BRAND.navy};border-radius:14px 14px 0 0;border-bottom:4px solid ${BRAND.gold};padding:22px 32px;" class="pad">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:14px;"><img src="${site}/assets/img/email-logo.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;"></td>
        <td valign="middle" style="font-family:${FONT};color:#FFFFFF;"><div style="font-size:18px;line-height:1.2;font-weight:700;color:#FFFFFF;">YNEPF${o.internal ? ' <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background-color:#D6B778;color:#07121A;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;vertical-align:2px;">Internal</span>' : ""}</div>
          <div style="font-size:12px;line-height:1.4;color:#C9D4E0;">${o.internal ? "A note from the website for the entries team" : esc(BRAND.name)}</div></td>
      </tr></table>
    </td></tr>
    <!-- content -->
    <tr><td class="bg-card pad t-body" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:32px 32px 12px;">
      ${o.body}
    </td></tr>
    <!-- sign off -->
    <tr><td class="bg-card pad t-body" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:${o.internal ? "0 32px 8px" : "0 32px 32px"};border-radius:0 0 14px 14px;">
      ${o.internal ? "" : o.noQuestions ? "" : p("Any questions? Just reply to this email" + (o.entriesEmail ? ` or write to <a class="lnk" href="mailto:${esc(o.entriesEmail)}" style="color:${BRAND.navy};font-weight:600;">${esc(o.entriesEmail)}</a>` : "") + ".")}
      ${o.internal ? "" : `<p style="margin:0;font-family:${FONT};font-size:16px;line-height:1.6;color:${BRAND.text};">Thanks,<br><strong style="color:${BRAND.navy};">The YNEPF team</strong></p>`}
    </td></tr>
    <!-- footer -->
    <tr><td class="pad" style="padding:20px 32px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
      <span class="t-muted" style="color:${BRAND.muted};">${esc(o.why || (o.internal ? "An automatic note from the YNEPF website, sent to the competitions inbox." : "You are getting this email because of something you did on our website."))}<br>
      ${esc(BRAND.name)} &middot; <a href="${site}" style="color:${BRAND.muted};">www.ynepf.co.uk</a>${o.internal ? "" : ` &middot; <a href="${site}/privacy" style="color:${BRAND.muted};">Privacy</a>`}</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ---- one description, two outputs ---------------------------------------------------------------------
// An email is written once as a list of blocks, and turned into both the HTML and the plain text version, so the two never drift apart.
//   ["h1", "text"] ["p", "text with <b>html</b>"] ["details", [[label, value], ...]] ["button", label, href] ["code", "ABC123"]
//   ["note", "html", "info" | "warn" | "good"] ["bullets", [..]] ["small", "html"]
// Inline html allowed in p / note / small: <b>, <a>. The text version strips it.
const plain = (h) => String(h).replace(/<br\s*\/?>/gi, "\n").replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/gi, (_, u, t) => (u.startsWith("mailto:") ? t : t && t !== u ? `${t} (${u})` : u)).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
export const link = a;
export const b = (t) => `<strong style="color:${BRAND.navy};">${esc(t)}</strong>`;

export function render(e) {
  const html = [], text = [];
  for (const k of e.blocks) {
    const [t, a, c] = k;
    if (t === "h1") { html.push(h1(a)); text.push(a, ""); }
    else if (t === "h2") { html.push(h2(a)); text.push(a.toUpperCase(), ""); }
    else if (t === "p") { html.push(p(a)); text.push(plain(a), ""); }
    else if (t === "small") { html.push(small(a)); text.push(plain(a), ""); }
    else if (t === "details") { html.push(details(a, { boldLast: c === "boldLast" })); text.push(...a.filter(Boolean).map(([x, y]) => `${x}: ${y}`), ""); }
    else if (t === "button") { html.push(button(a, c)); if (k[3] === "fallback") html.push(linkFallback(c)); text.push(`${a}: ${c}`, ""); }
    else if (t === "code") { html.push(codeBox(a)); text.push(`   ${a}`, ""); }
    else if (t === "button2") { html.push(buttonSecondary(a, c)); text.push(`${a}: ${String(c).replace(/^mailto:/, "").split("?")[0]}`, ""); }
    else if (t === "quote") { html.push(quote(a)); text.push(`> ${String(a).replace(/\n/g, "\n> ")}`, ""); }
    else if (t === "note") { html.push(note(a, c)); text.push(plain(a), ""); }
    else if (t === "bullets") { html.push(bullets(a)); text.push(...a.map((x) => `- ${x}`), ""); }
  }
  const siteUrl = e.siteUrl || "https://www.ynepf.co.uk";
  const outHtml = layout({ title: e.subject, preheader: e.preheader, body: html.join("\n"), entriesEmail: e.entriesEmail, siteUrl, why: e.why, noQuestions: e.noQuestions, internal: e.internal });
  const outText = e.internal ? [...text, e.why || "An automatic note from the YNEPF website, sent to the competitions inbox."].join("\n") : [...text, ...(e.noQuestions ? [] : [`Any questions? Just reply to this email${e.entriesEmail ? ` or write to ${e.entriesEmail}` : ""}.`, ""]), "Thanks,", "The YNEPF team", "", e.why || "", `${BRAND.name} - www.ynepf.co.uk`].join("\n");
  return { subject: e.subject, html: outHtml, text: outText };
}
