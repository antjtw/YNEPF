#!/usr/bin/env node
/* ==========================================================================
   generate-seed.js — one-off helper that turned the original hand-written
   pages (committee.html, faqs.html, calendar.html) into supabase/seed.sql.

   The pages are now rendered from the database, so this only works against
   the ORIGINAL hand-written versions (git show main:committee.html etc.).
   It is kept so the migration is reproducible:

     mkdir -p /tmp/orig
     for f in committee faqs calendar; do git show main:$f.html > /tmp/orig/$f.html; done
     node scripts/generate-seed.js /tmp/orig > supabase/seed.sql
   ========================================================================== */
const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/generate-seed.js <folder-with-original-html>");
  process.exit(1);
}
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");

// ---- helpers --------------------------------------------------------------
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&mdash;": "—", "&ndash;": "–", "&rsquo;": "’" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp|mdash|ndash|rsquo);/g, (m) => ENT[m]);
const strip = (s) => decode(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const q = (s) => "$q$" + s + "$q$"; // dollar-quote: no escaping worries
const nz = (s) => (s === null || s === undefined ? "null" : q(s));

function inline(html) {
  return decode(
    html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (_, h, t) => "[" + t.replace(/<[^>]+>/g, "") + "](" + h + ")")
      .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, "**$2**")
      .replace(/<(em|i)>([\s\S]*?)<\/\1>/g, "*$2*")
      .replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
}

function toMarkdown(html) {
  const blocks = [];
  let rest = html;
  // Tables first
  rest = rest.replace(/<div class="table-wrap">\s*<table[\s\S]*?<\/table>\s*<\/div>/g, (t) => {
    const rows = [...t.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) =>
      [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => inline(c[1]))
    );
    const md = [
      "| " + rows[0].join(" | ") + " |",
      "| " + rows[0].map(() => "---").join(" | ") + " |",
      ...rows.slice(1).map((r) => "| " + r.join(" | ") + " |"),
    ].join("\n");
    blocks.push(md);
    return "\u0000" + (blocks.length - 1) + "\u0000";
  });
  const out = [];
  const re = /<p>([\s\S]*?)<\/p>|<ul[^>]*>([\s\S]*?)<\/ul>|\u0000(\d+)\u0000/g;
  let m;
  while ((m = re.exec(rest))) {
    if (m[1] !== undefined) out.push(inline(m[1]));
    else if (m[2] !== undefined)
      out.push([...m[2].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((l) => "- " + inline(l[1])).join("\n"));
    else out.push(blocks[+m[3]]);
  }
  return out.join("\n\n");
}

// ---- committee ------------------------------------------------------------
function committee() {
  const html = read("committee.html");
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>\s*<p class="lede">([\s\S]*?)<\/p>|<li class="person-card">([\s\S]*?)<\/li>/g;
  const sections = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) sections.push({ title: strip(m[1]), description: strip(m[2]), people: [] });
    else {
      const c = m[3];
      const get = (cls) => { const x = c.match(new RegExp('class="' + cls + '">([\\s\\S]*?)</p>')); return x ? strip(x[1]) : ""; };
      const ig = c.match(/instagram\.com\/([^/"?]+)/);
      sections[sections.length - 1].people.push({ name: get("p-name"), role: get("p-role"), blurb: get("p-blurb"), instagram: ig ? ig[1] : "" });
    }
  }
  let sql = "-- Organisation\ndo $seed$ begin\nif not exists (select 1 from public.org_sections) then\n";
  sections.forEach((s, i) => {
    sql += `with s as (insert into public.org_sections (title, description, sort_order) values (${q(s.title)}, ${q(s.description)}, ${(i + 1) * 10}) returning id)\ninsert into public.people (section_id, name, role, instagram, blurb, sort_order) values\n`;
    sql += s.people.map((p, j) => `((select id from s), ${q(p.name)}, ${q(p.role)}, ${q(p.instagram)}, ${q(p.blurb)}, ${(j + 1) * 10})`).join(",\n") + ";\n";
  });
  return sql + "end if;\nend $seed$;\n";
}

// ---- faqs -----------------------------------------------------------------
function faqs() {
  const html = read("faqs.html");
  const re = /<h2[^>]*>([\s\S]*?)<\/h2>|<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="faq-body">([\s\S]*?)<\/div>\s*<\/details>/g;
  const cats = [];
  let m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) cats.push({ title: strip(m[1]), items: [] });
    else cats[cats.length - 1].items.push({ question: strip(m[2]), answer: toMarkdown(m[3]) });
  }
  // A category with no <details> holds plain content (the packing checklist).
  // Keep it as a single FAQ so nothing is lost.
  cats.filter((c) => !c.items.length).forEach((c) => {
    const start = html.indexOf(">" + c.title + "</h2>");
    const rest = html.slice(start);
    const end = Math.min(...["<p style=", "</div>\n  </main>"].map((m) => { const i = rest.indexOf(m); return i < 0 ? Infinity : i; }));
    c.items.push({ question: "What should I pack?", answer: toMarkdown(rest.slice(rest.indexOf("</h2>") + 5, end)) });
  });
  let sql = "-- FAQs\ndo $seed$ begin\nif not exists (select 1 from public.faq_categories) then\n";
  cats.forEach((c, i) => {
    sql += `with c as (insert into public.faq_categories (title, sort_order) values (${q(c.title)}, ${(i + 1) * 10}) returning id)\ninsert into public.faqs (category_id, question, answer_md, sort_order) values\n`;
    sql += c.items.map((f, j) => `((select id from c), ${q(f.question)}, ${q(f.answer)}, ${(j + 1) * 10})`).join(",\n") + ";\n";
  });
  return sql + "end if;\nend $seed$;\n";
}

// ---- calendar -------------------------------------------------------------
const MONTHS = { jan: 1, feb: 2, mar: 3, march: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`;

function parseRange(text) {
  // "24–25 Jan 2026" | "11 Apr 2026" | "7–8 March 2026"
  const m = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s+([A-Za-z]+)\s+(\d{4})/);
  const mo = MONTHS[m[3].toLowerCase()];
  return { start: iso(m[4], mo, m[1]), end: m[2] ? iso(m[4], mo, m[2]) : null };
}
function parseTime(t) {
  if (/noon/i.test(t)) return "12:00";
  const m = t.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  let h = +m[1] % 12; if (m[3].toLowerCase() === "pm") h += 12;
  return pad(h) + ":" + (m[2] || "00");
}
function parseEntry(text, startYear) {
  // "Entry opens 29 Nov 2025 at 9am and closes 3 Jan at noon"
  const m = text.match(/opens (\d+) ([A-Za-z]+)(?: (\d{4}))? at ([^ ]+) and closes (\d+) ([A-Za-z]+) at ([^ ]+)/);
  if (!m) return null;
  const oy = +(m[3] || startYear), om = MONTHS[m[2].toLowerCase()], cm = MONTHS[m[6].toLowerCase()];
  const cy = cm < om ? oy + 1 : oy;
  return { opens: `${iso(oy, om, m[1])} ${parseTime(m[4])}`, closes: `${iso(cy, cm, m[5])} ${parseTime(m[7])}` };
}

function calendar() {
  const html = read("calendar.html");
  const arts = [...html.matchAll(/<article class="event">([\s\S]*?)<\/article>/g)].map((a) => a[1]);
  const rows = arts.map((a) => {
    const name = strip(a.match(/<h2>([\s\S]*?)<\/h2>/)[1]);
    const label = (a.match(/class="tag tag-position">([\s\S]*?)<\/span>/) || [])[1] || "";
    const descs = [...a.matchAll(/<p class="event-desc">([\s\S]*?)<\/p>/g)].map((p) => inline(p[1]));
    const lis = [...a.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((l) => inline(l[1]));
    const metas = [...a.matchAll(/<span><svg[\s\S]*?<\/svg>([\s\S]*?)<\/span>/g)].map((s) => strip(s[1]));
    const range = parseRange(metas[0]);
    const entryLine = lis.find((l) => /^Entry opens/.test(l));
    const entry = parseEntry(entryLine, range.start.slice(0, 4));
    const extraBullets = lis.filter((l) => l !== entryLine).map((l) => "- " + l);
    const description = [descs[0], extraBullets.join("\n"), ...descs.slice(1).filter((d) => d !== "More information to come.")]
      .filter(Boolean).join("\n\n");
    return { name, label: strip(label), description, range, venue: metas[1], capacity: parseInt(metas[2], 10) || null, entry };
  });
  const ts = (s) => (s ? `(${q(s)}::timestamp at time zone 'Europe/London')` : "null");
  let sql = "-- Competitions\ndo $seed$ begin\nif not exists (select 1 from public.competitions) then\ninsert into public.competitions (name, description, label, start_date, end_date, venue_name, capacity, entry_opens, entry_closes) values\n";
  sql += rows.map((r) => `(${q(r.name)}, ${q(r.description)}, ${q(r.label)}, ${q(r.range.start)}, ${nz(r.range.end)}, ${q(r.venue)}, ${r.capacity === null ? "null" : r.capacity}, ${ts(r.entry && r.entry.opens)}, ${ts(r.entry && r.entry.closes)})`).join(",\n") + ";\n";
  return sql + "end if;\nend $seed$;\n";
}

// ---- records (placeholders: paste the real sheet links in the editor) -------
function records() {
  const names = ["Men's classic", "Men's equipped", "Women's classic", "Women's equipped"];
  return "-- Records\ndo $seed$ begin\nif not exists (select 1 from public.record_sources) then\ninsert into public.record_sources (title, url, sort_order) values\n" +
    names.map((n, i) => `(${q(n)}, '', ${(i + 1) * 10})`).join(",\n") + ";\nend if;\nend $seed$;\n";
}

process.stdout.write(
  "-- Seed content, generated from the original hand-written pages.\n-- Safe to run once: each block only inserts if its table is empty.\n\n" +
  [committee(), faqs(), calendar(), records()].join("\n")
);
