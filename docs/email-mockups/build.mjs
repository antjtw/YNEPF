// Renders the sample emails to ./out and a side-by-side preview page. Run: node docs/email-mockups/build.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { render } from "./email-template.mjs";
import { SAMPLES } from "./samples.mjs";
const out = new URL("./out/", import.meta.url); mkdirSync(out, { recursive: true });
const site = process.env.MOCK_SITE || "../../..";   // the logo comes from the site's own folder when previewing locally
const cards = [];
for (const [id, s] of Object.entries(SAMPLES)) {
  const r = render({ ...s, siteUrl: site });
  writeFileSync(new URL(`${id}.html`, out), r.html); writeFileSync(new URL(`${id}.txt`, out), r.text);
  cards.push(`<section><h2>${s.label} <small>to ${s.to}</small></h2><p class="subj"><b>Subject:</b> ${s.subject}<br><b>Preview line:</b> ${s.preheader}</p>
    <div class="pair"><iframe src="${id}.html" title="${s.label}, HTML"></iframe><pre>${r.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre></div></section>`);
}
writeFileSync(new URL("index.html", out), `<!doctype html><meta charset="utf-8"><title>YNEPF email mockups</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;margin:0;background:#e8edf2;color:#242525}main{max-width:1200px;margin:0 auto;padding:24px}h1{color:#152c41}h2{color:#152c41;margin:40px 0 4px}h2 small{font-weight:400;color:#585a5b;font-size:14px}.subj{margin:0 0 12px;color:#585a5b}
.pair{display:grid;grid-template-columns:660px 1fr;gap:16px;align-items:start}iframe{width:100%;height:900px;border:1px solid #c9d4e0;border-radius:8px;background:#fff}pre{white-space:pre-wrap;background:#fff;border:1px solid #c9d4e0;border-radius:8px;padding:16px;margin:0;font:13px/1.5 ui-monospace,Menlo,monospace}
@media(max-width:1100px){.pair{grid-template-columns:1fr}}</style><main><h1>YNEPF emails: mockups</h1><p>Left: the HTML email. Right: the plain text version that goes with it.</p>${cards.join("")}</main>`);
console.log("wrote", Object.keys(SAMPLES).length, "emails to docs/email-mockups/out");
