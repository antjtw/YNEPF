// Copies the shared email code into every Edge Function that sends email, between marker comments.
// The functions are pasted into Supabase one at a time and cannot import each other, so this keeps the copies identical.
//   supabase/email/template.ts      -> every function that sends email (the layout, buttons, and the HTML + plain text renderer)
//   supabase/email/entry-emails.ts  -> entry-checkout, stripe-webhook, entry-refund (confirmation, refund and "new entry" emails)
//   supabase/qr/qr.ts              -> waitlist (the QR code in the day pass email), and assets/js/qr.js (the same code, for the pass page)
// Run after editing any of them:  node scripts/sync-email-template.mjs      (add --check to only test that the copies match)
import fs from "node:fs";
const root = new URL("../supabase/", import.meta.url);
const fn = (n) => new URL(`functions/${n}/index.ts`, root);
const regions = [
  { name: "email template", from: "email/template.ts", to: ["waitlist", "stripe-webhook", "entry-checkout", "entry-refund", "send-contact"] },
  { name: "entry emails", from: "email/entry-emails.ts", to: ["stripe-webhook", "entry-checkout", "entry-refund"] },
  { name: "qr code maker", from: "qr/qr.ts", to: ["waitlist"] },       // day pass QR codes: the PNG for the email
];
const check = process.argv.includes("--check");
let bad = 0;
for (const r of regions) {
  const START = `// ==== ${r.name}: copied from supabase/${r.from} by scripts/sync-email-template.mjs. Do not edit between these markers. ====`;
  const END = `// ==== end of ${r.name} ====`;
  const code = fs.readFileSync(new URL(r.from, root), "utf8").replace(/^(\/\/.*\n)+\n?/, "").trim();
  for (const t of r.to) {
    const file = fn(t), src = fs.readFileSync(file, "utf8");
    const a = src.indexOf(START), b = src.indexOf(END);
    if (a < 0 || b < 0) { console.error(`markers for "${r.name}" missing in ${t}`); bad++; continue; }
    const next = src.slice(0, a) + START + "\n" + code + "\n" + src.slice(b);
    if (next !== src) { if (check) { console.error(`out of date: ${r.name} in ${t}`); bad++; } else fs.writeFileSync(file, next); }
  }
}
// The pass page draws the same QR code in the browser: build assets/js/qr.js from the same source (types removed, wrapped so it adds one name to the page).
{
  const { stripTypeScriptTypes } = await import("node:module");
  const body = stripTypeScriptTypes(fs.readFileSync(new URL("qr/qr.ts", root), "utf8")).replace(/^(\/\/.*\n)+\n?/, "").trim();
  const out = `/* Built from supabase/qr/qr.ts by scripts/sync-email-template.mjs. Do not edit: edit that file and run the script. */\n(function () {\n  "use strict";\n${body.replace(/^/gm, "  ")}\n  window.YNEPF_QR = { qrMatrix: qrMatrix, qrSvg: qrSvg };\n})();\n`;
  const file = new URL("../assets/js/qr.js", import.meta.url);
  const had = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (had !== out) { if (check) { console.error("out of date: assets/js/qr.js"); bad++; } else fs.writeFileSync(file, out); }
}
if (bad) process.exit(1);
console.log(check ? "email code copies are up to date" : "email code copied into the functions");
