#!/usr/bin/env node
/* ==========================================================================
   build.js — refresh inlined partials and produce a deployable dist/.

   The header and footer live once in assets/partials/. They are inlined
   directly into every page between marker comments:
     <!-- @partial:header start --> ... <!-- @partial:header end -->
   so the source pages are fully self-contained and work when opened from
   disk (file://) with no server and no JavaScript needed for the nav.

   Running this script:
     1. re-inlines the current partials into every source page (idempotent),
        so editing a partial updates all pages,
     2. writes each page's address and link-preview tags (canonical, Open Graph)
        between <!-- @seo start --> and <!-- @seo end -->, and
     3. regenerates robots.txt and sitemap.xml.
   The top-level files are the site: deploy the project root.

   Usage:  node build.js
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;

// The site's one main address (the plain ynepf.co.uk redirects here), and the link-preview picture.
const SITE_URL = "https://www.ynepf.co.uk";
const SITE_NAME = "Yorkshire &amp; North East Powerlifting Federation";
const SHARE_IMAGE = SITE_URL + "/assets/img/share.jpg";
const SHARE_ALT = "A lifter pulling a deadlift, beside the words: The home of drug tested powerlifting in Yorkshire and the North East";
const FALLBACK_DESCRIPTION = "The home of drug tested powerlifting in Yorkshire and the North East. Find upcoming competitions, records, news and how to get involved.";
// These pages show different content for different addresses (post.html?p=..., /lifting-order/...), so
// they get the general link preview but no fixed canonical address and are left out of the sitemap.
const DYNAMIC = ["post.html", "lifting/index.html"];

const header = fs.readFileSync(path.join(ROOT, "assets/partials/header.html"), "utf8").trim();
const footer = fs.readFileSync(path.join(ROOT, "assets/partials/footer.html"), "utf8").trim();

const HDR = ["<!-- @partial:header start -->", "<!-- @partial:header end -->"];
const FTR = ["<!-- @partial:footer start -->", "<!-- @partial:footer end -->"];

const pages = [
  "index.html",
  "calendar.html",
  "committee.html",
  "records.html",
  "lifting/index.html",
  "news.html",
  "post.html",
  "faqs.html",
  "chairperson.html",
  "rules.html",
  "contact.html",
  "enter.html",
  "entries.html",
  "entry-thanks.html",
  "glp-calculator.html",
  "rules/the-lifts.html",
  "rules/categories.html",
  "rules/squat.html",
  "rules/bench-press.html",
  "rules/deadlift.html",
  "rules/failed-lift.html",
  "rules/classic-kit.html",
  "rules/equipped-kit.html",
  "rules/belts-wraps-sleeves.html",
  "rules/shoes-socks-headwear.html",
  "rules/general-kit-rules.html",
  "rules/equipment-check.html",
  "rules/platform-and-bar.html",
  "rules/discs.html",
  "rules/racks-bench-clocks.html",
  "rules/weigh-in.html",
  "rules/round-system.html",
  "rules/loading-errors.html",
  "rules/conduct-and-safety.html",
  "rules/gl-points.html",
  "rules/roles.html",
  "rules/referee-signals.html",
  "rules/referee-roles.html",
  "rules/become-a-referee.html",
  "rules/the-jury.html",
  "rules/technical-committee.html",
  "rules/world-records.html",
  "rules/coach-responsibilities.html",
  "rules/team-competition.html",
  "rules/anti-doping.html",
];

// Depth-relative prefix: number of "/" in the page path = how many ../ needed.
function rootFor(rel) {
  const depth = rel.split("/").length - 1;
  return "../".repeat(depth);
}

function setActive(html, block) {
  const m = html.match(/<body[^>]*data-page="([^"]+)"/);
  if (!m) return block;
  const key = m[1];
  return block.replace(
    new RegExp('(<a href="[^"]+" data-nav="' + key + '")', "g"),
    '$1 aria-current="page"'
  );
}

function reinline(html, root) {
  const hdr = header.replace(/\{\{ROOT\}\}/g, root);
  const hb = HDR[0] + "\n" + setActive(html, hdr) + "\n" + HDR[1];
  const fb = FTR[0] + "\n" + footer.replace(/\{\{ROOT\}\}/g, root) + "\n" + FTR[1];
  const hRe = new RegExp(HDR[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + HDR[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const fRe = new RegExp(FTR[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s\\S]*?" + FTR[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (html.includes("<!--#include header-->")) html = html.replace("<!--#include header-->", hb);
  else if (hRe.test(html)) html = html.replace(hRe, hb);
  if (html.includes("<!--#include footer-->")) html = html.replace("<!--#include footer-->", fb);
  else if (fRe.test(html)) html = html.replace(fRe, fb);
  return html;
}

// Re-inline partials into source pages. The top-level files are the site —
// they are self-contained and use relative paths, so deploy the project root.
// The address a page is served at (vercel.json has cleanUrls on: no .html).
function pageUrl(rel) { return rel === "index.html" ? SITE_URL + "/" : SITE_URL + "/" + rel.replace(/\.html$/, ""); }
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/i.test(html);

// Canonical address and link-preview tags, written between markers so re-running replaces them.
function seoBlock(rel, html) {
  if (isNoindex(html)) return "";
  const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || SITE_NAME).trim();
  const desc = ((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || FALLBACK_DESCRIPTION).trim();
  const url = DYNAMIC.indexOf(rel) < 0 ? pageUrl(rel) : "";
  const shareTitle = rel === "index.html" ? SITE_NAME : title;
  return [
    "  <!-- @seo start (written by build.js) -->",
    url ? '  <link rel="canonical" href="' + url + '">' : "",
    '  <meta property="og:type" content="website">',
    '  <meta property="og:site_name" content="' + SITE_NAME + '">',
    '  <meta property="og:locale" content="en_GB">',
    '  <meta property="og:title" content="' + shareTitle + '">',
    '  <meta property="og:description" content="' + desc + '">',
    url ? '  <meta property="og:url" content="' + url + '">' : "",
    '  <meta property="og:image" content="' + SHARE_IMAGE + '">',
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    '  <meta property="og:image:alt" content="' + SHARE_ALT + '">',
    '  <meta name="twitter:card" content="summary_large_image">',
    "  <!-- @seo end -->"
  ].filter(Boolean).join("\n");
}
function withSeo(rel, html) {
  const re = /[ \t]*<!-- @seo start[\s\S]*?<!-- @seo end -->\n?/;
  const block = seoBlock(rel, html);
  html = html.replace(re, "");
  return block ? html.replace("</head>", block + "\n</head>") : html;
}

pages.forEach((rel) => {
  const p = path.join(ROOT, rel);
  fs.writeFileSync(p, withSeo(rel, reinline(fs.readFileSync(p, "utf8"), rootFor(rel))), "utf8");
  console.log("inlined", rel);
});

// robots.txt and sitemap.xml: every page that can be found and indexed (not the editor, not noindex pages,
// not the pages whose content depends on the address).
const indexable = pages.filter((rel) => DYNAMIC.indexOf(rel) < 0 && !isNoindex(fs.readFileSync(path.join(ROOT, rel), "utf8")));
fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  indexable.map((rel) => "  <url><loc>" + pageUrl(rel) + "</loc></url>").join("\n") + "\n</urlset>\n", "utf8");
fs.writeFileSync(path.join(ROOT, "robots.txt"),
  "# The editor (/admin) is marked noindex on the page itself, which only works if crawlers may read it.\n" +
  "User-agent: *\nAllow: /\n\nSitemap: " + SITE_URL + "/sitemap.xml\n", "utf8");
console.log("sitemap.xml:", indexable.length, "pages; robots.txt written");

console.log("\nDone. The top-level files are the site — deploy the project root.");
