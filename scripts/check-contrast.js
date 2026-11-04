#!/usr/bin/env node
/* ==========================================================================
   check-contrast.js — checks the site's text/background pairings against
   WCAG 2.1 AA, straight from the palette (assets/css/palette.css).

   Usage:  node scripts/check-contrast.js
   Exits non-zero if any pairing fails, so it can run in CI.
   Needs 4.5:1 for normal text and 3:1 for large text and UI components.
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "assets", "css", "palette.css"), "utf8");
const P = {};
for (const m of css.matchAll(/--([a-z]+-\d+):\s*(#[0-9A-Fa-f]{6})/g)) P[m[1]] = m[2];
const hex = (n) => (n.startsWith("#") ? n : P[n]);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// mix(fg over bg at alpha), like color-mix(in srgb, fg alpha%, bg)
const over = (fg, bg, a) => rgb(hex(fg)).map((v, i) => v * a + rgb(hex(bg))[i] * (1 - a));
const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const W = "#FFFFFF";
const PAGE = "navy-10";                                               // the off-white page background
const ghostTint = toHex(over("iron-600", PAGE, 0.12));
const footerBg = "navy-950";
const pairs = [
  // [label, fg, bg, min]
  ["Body text on the page", "grey-900", PAGE, 4.5],
  ["Body text on a white card", "grey-900", W, 4.5],
  ["Headings (navy-800) on the page", "navy-800", PAGE, 4.5],
  ["Headings (navy-800) on white", "navy-800", W, 4.5],
  ["Muted text on the page", "grey-700", PAGE, 4.5],
  ["Muted text on white", "grey-700", W, 4.5],
  ["Muted text on the tab tray", "grey-700", "navy-50", 4.5],
  ["Link on the page", "navy-700", PAGE, 4.5],
  ["Link on white", "navy-700", W, 4.5],
  ["Visited link on the page", "iron-700", PAGE, 4.5],
  ["Visited link on white", "iron-700", W, 4.5],
  ["Link hover on the page", "navy-950", PAGE, 4.5],
  ["Header nav text on the page", "navy-800", PAGE, 4.5],
  ["Header nav text, hover/current (navy-50)", "navy-950", "navy-50", 4.5],
  ["Menu button text on navy-50", "navy-800", "navy-50", 4.5],
  ["Primary button text", W, "iron-600", 4.5],
  ["Primary button text, hover fill", W, "iron-700", 4.5],
  ["Primary button text, pressed fill", W, "iron-800", 4.5],
  ["Secondary button text on the page", "iron-700", PAGE, 4.5],
  ["Secondary button text on white", "iron-700", W, 4.5],
  ["Secondary button text, hover fill", W, "iron-600", 4.5],
  ["Ghost button text on the page", "iron-700", PAGE, 4.5],
  ["Ghost button text on hover tint", "iron-800", ghostTint, 4.5],
  ["Secondary (on dark) text on navy-800", W, "navy-800", 4.5],
  ["Button outline vs the page (UI 3:1)", "iron-600", PAGE, 3],
  ["Form field border vs white (UI 3:1)", "grey-500", W, 3],
  ["Focus: navy-950 ring vs the page (UI 3:1)", "navy-950", PAGE, 3],
  ["Focus: link ink on gold highlight", "navy-950", "gold-300", 4.5],
  ["Focus: gold ring vs navy-950 (UI 3:1)", "gold-300", "navy-950", 3],
  ["Hero headline accent (iron-700) on the page", "iron-700", PAGE, 4.5],
  ["Tab text on the tray", "navy-700", "navy-50", 4.5],
  ["Selected tab text on white", "navy-950", W, 4.5],
  ["Tag: open", "sage-800", "sage-100", 4.5],
  ["Tag: closed", "grey-800", "grey-100", 4.5],
  ["Tag: label", "rose-800", "rose-100", 4.5],
  ["Tag: entries full", "gold-800", "gold-100", 4.5],
  ["Tag: alpha", "navy-800", W, 4.5],
  ["Service notice text on navy-50", "navy-800", "navy-50", 4.5],
  ["Error text on error background", "rose-800", "rose-50", 4.5],
  ["Success text on success background", "sage-800", "sage-50", 4.5],
  ["Person role / meta (muted) on white", "grey-700", W, 4.5],
  ["Avatar: iron", "iron-800", "iron-100", 4.5],
  ["Avatar: navy", "navy-800", "navy-100", 4.5],
  ["Avatar: gold", "gold-800", "gold-100", 4.5],
  ["Avatar: sage", "sage-800", "sage-100", 4.5],
  ["Avatar: rose", "rose-800", "rose-100", 4.5],
  ["Table head (muted) on navy-10", "grey-700", "navy-10", 4.5],
  ["Card (white): title on white", "navy-800", W, 4.5],
  ["Card (white): text on white", "grey-700", W, 4.5],
  ["Card (inverted navy): title on navy-800", W, "navy-800", 4.5],
  ["Card (inverted navy): text on navy-800", "navy-100", "navy-800", 4.5],
  ["Card (iron option): white on iron-600", W, "iron-600", 4.5],
  ["Call to action: white on navy-800", W, "navy-800", 4.5],
  ["Call to action: body text on navy-800", "navy-100", "navy-800", 4.5],
  ["Lifting hero: white on navy-800", W, "navy-800", 4.5],
  ["Lifting hero: kicker on navy-800", "navy-100", "navy-800", 4.5],
  ["Flight label: white on navy-800", W, "navy-800", 4.5],
  ["Footer text on navy-950", "navy-100", footerBg, 4.5],
  ["Footer links (white) on navy-950", W, footerBg, 4.5],
  ["Footer headings (navy-200) on navy-950", "navy-200", footerBg, 4.5],
  ["Drawer links on white", "navy-800", W, 4.5],
  ["Drawer secondary links (muted) on white", "grey-700", W, 4.5],
];
let fail = 0;
console.log("Contrast  Needs  Pairing");
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(rgb(hex(fg)), rgb(hex(bg)));
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${(ok ? "PASS " : "FAIL ") + r.toFixed(2).padStart(5)}:1  ${String(min).padStart(3)}:1  ${label}`);
}
console.log(fail ? `\n${fail} pairing(s) FAIL` : `\nAll ${pairs.length} pairings pass WCAG 2.1 AA`);
process.exit(fail ? 1 : 0);
