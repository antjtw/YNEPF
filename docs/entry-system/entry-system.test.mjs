// Tests for docs/entry-system/entry-system.sql, run in a scratch Postgres (PGlite) built from the
// real supabase/schema.sql. It checks what each role can see and do, the public views, age
// categories, places left, the audit log, and that the "money to send" report always adds up.
//
//   npm install --no-save @electric-sql/pglite
//   node docs/entry-system/entry-system.test.mjs
//
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
import assert from "assert";
process.on('unhandledRejection', (e) => { console.log('ERROR: ' + (e && e.message)); process.exit(1); });
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;`);
const real = fs.readFileSync(new URL("../../supabase/schema.sql", import.meta.url), "utf8");
const draft = fs.readFileSync(new URL("../../supabase/entry-system.sql", import.meta.url), "utf8");
await db.exec(real); await db.exec(draft); await db.exec(draft);   // upgrade, then re-run: safe
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const as = async (who) => { await db.exec("reset role"); if (who) { await db.query(`select set_config('request.uid','${who}',false)`); await db.exec("set role authenticated"); } else await db.exec("set role anon"); };
const can = async (q) => { try { await db.query(q); return true; } catch (e) { return false; } };
const rows = async (q) => (await db.query(q)).rows;
ok(true, "the draft builds on the real schema, and re-running it is safe");

// ---- people: one of each role, plus a stranger
const U = { admin: "00000000-0000-0000-0000-00000000000a", entries: "00000000-0000-0000-0000-00000000000b", editor: "00000000-0000-0000-0000-00000000000c", contrib: "00000000-0000-0000-0000-00000000000d", rando: "00000000-0000-0000-0000-00000000000e" };
await db.exec("reset role");
for (const [k, id] of Object.entries(U)) await db.exec(`insert into auth.users (id,email,email_confirmed_at) values ('${id}','${k}@example.com',now())`);
await db.exec(`insert into public.editors (email, role) values ('admin@example.com','admin'),('entries@example.com','entries'),('editor@example.com','editor'),('contrib@example.com','contributor')`);
ok(!(await can(`insert into public.editors (email, role) values ('x@example.com','wizard')`)), "an unknown role is refused");

// ---- the role matrix (existing content tables, news, and the new entry tables)
await db.exec("reset role");
await db.exec(`insert into public.competitions (id, name, start_date, capacity, published, slug) values ('11111111-1111-1111-1111-111111111111','YNE March Open','2027-03-13',3,true,'2027-yne-march-open')`);
await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status) values ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','lifter@example.com','Test Lifter','1986-05-01','M','paid')`);
await db.exec(`insert into public.entry_private (entry_id, guardian_name, access_notes, access_hearing) values ('22222222-2222-2222-2222-222222222222','Parent','needs a ramp', true)`);
const post = `insert into public.posts (title, slug, body_md) values ('t', 's'||gen_random_uuid(), 'b')`;
const faq = `insert into public.faq_categories (title) values ('x')`;
const comp = `insert into public.competitions (name, start_date) values ('c','2027-01-01')`;
const readEntries = `select * from public.entries`, writeEntry = `update public.entries set club='Leeds'`, readPrivate = `select * from public.entry_private`;
const m = {};
for (const [who, id] of [["admin", U.admin], ["entries", U.entries], ["editor", U.editor], ["contrib", U.contrib], ["rando", U.rando], ["anon", null]]) {
  await as(id);
  m[who] = { post: await can(post), faq: await can(faq), comp: await can(comp),
    readEntries: (await rows(readEntries).catch(() => [])).length > 0, readPrivate: (await rows(readPrivate).catch(() => [])).length > 0,
    writeEntry: (await db.query(writeEntry).then((r) => r.affectedRows > 0).catch(() => false)) };
}
const expect = { admin: [1, 1, 1, 1, 1, 1], entries: [0, 0, 0, 1, 1, 1], editor: [1, 1, 1, 0, 0, 0], contrib: [1, 0, 0, 0, 0, 0], rando: [0, 0, 0, 0, 0, 0], anon: [0, 0, 0, 0, 0, 0] };
for (const [who, e] of Object.entries(expect)) {
  const got = ["post", "faq", "comp", "readEntries", "readPrivate", "writeEntry"].map((k) => +m[who][k]);
  ok(JSON.stringify(got) === JSON.stringify(e), `${who}: news ${e[0] ? "yes" : "no"}, FAQs ${e[1] ? "yes" : "no"}, competitions ${e[2] ? "yes" : "no"}, entries ${e[3] ? "yes" : "no"}, private ${e[4] ? "yes" : "no"}, edit entries ${e[5] ? "yes" : "no"}   (got ${got})`);
}

// ---- public views show no emails, no private flags
await as(null);
const pub = await rows(`select * from public.entries_public`);
ok(pub.length === 1 && pub[0].name === "Test Lifter" && !("email" in pub[0]) && !("date_of_birth" in pub[0]) && pub[0].age_category === "M1", "the public entries list has the name and age category, never email or date of birth");
ok(!(await can(`select email from public.waiting_list_public`)), "the public waiting list has no email column");
ok(!(await can(`select * from public.audit_log`)) , "anon cannot read the audit log");
ok((await rows(`select places_left from public.competition_entry_state`))[0].places_left === 2, "the public competition state shows places left");

// ---- age categories: derived from the year of birth, every time
await db.exec("reset role");
const cat = async (dob, d) => (await rows(`select public.age_category_on('${dob}','${d}') c`))[0].c;
const cases = [["1986-12-31", "2026-03-14", "M1"], ["1987-01-01", "2026-03-14", ""], ["1987-01-01", "2027-03-14", "M1"], ["2008-06-01", "2026-03-14", "SJ"], ["2007-06-01", "2026-03-14", "J"],
  ["2003-01-01", "2026-03-14", "J"], ["2002-12-31", "2026-03-14", ""], ["1976-06-01", "2026-03-14", "M2"], ["1966-06-01", "2026-03-14", "M3"], ["1956-06-01", "2026-03-14", "M4"], ["2013-06-01", "2026-03-14", "under14"]];
for (const [dob, d, want] of cases) ok(await cat(dob, d) === want, `born ${dob} on ${d}: ${want || "open"}`);
ok((await rows(`select public.age_on('2008-06-01','2026-03-14') a`))[0].a === 17, "exact age on the day (17: under 18, so a guardian is needed)");
ok((await rows(`select public.age_on('2008-03-14','2026-03-14') a`))[0].a === 18, "turns 18 on the day: 18");

// ---- places: held entries only count while their hold lasts
await db.exec(`delete from public.entries`);
const e = (st, extra = "") => db.exec(`insert into public.entries (competition_id, email, full_name, date_of_birth, sex, status ${extra ? ", hold_expires_at" : ""}) values ('11111111-1111-1111-1111-111111111111', 'a' || gen_random_uuid() || '@x.com', 'N', '1990-01-01', 'F', '${st}' ${extra ? ", " + extra : ""})`);
const left = async () => (await rows(`select public.places_left('11111111-1111-1111-1111-111111111111') n`))[0].n;
ok(await left() === 3, "capacity 3, nobody in: 3 left");
await e("paid"); await e("held", "now() + interval '10 minutes'"); await e("held", "now() - interval '1 minute'"); await e("cancelled"); await e("refunded");
ok(await left() === 1, "1 paid + 1 live hold = 2 taken; an expired hold, a cancellation and a refund use no place: 1 left");
await e("comped"); ok(await left() === 0, "a comped entry takes a place: none left");
await e("paid"); ok(await left() === 0, "never below zero");

// ---- audit log: who, what, before and after; cannot be changed
await db.exec("reset role"); await db.query(`select set_config('request.uid','',false)`); await db.exec(`delete from public.entries`);
await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status, club) values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','z@x.com','Zed','1990-01-01','M','paid','Hull')`);
await as(U.entries); await db.exec(`update public.entries set club='York' where id='33333333-3333-3333-3333-333333333333'`);
await as(U.entries);
const aud = await rows(`select actor_email, action, before->>'club' b, after->>'club' a from public.audit_log where table_name='entries' and row_id='33333333-3333-3333-3333-333333333333' order by id`);
ok(aud.length === 2 && aud[0].action === "insert" && aud[0].actor_email === "system" && aud[1].action === "update" && aud[1].actor_email === "entries@example.com" && aud[1].b === "Hull" && aud[1].a === "York", "the audit log records who changed what, with before and after: " + JSON.stringify(aud[1]));
await db.exec("reset role");
await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status) values ('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','kid@example.com','Kid','2010-01-01','M','paid')`);
await db.exec(`insert into public.entry_private (entry_id, guardian_name) values ('66666666-6666-6666-6666-666666666666','Parent Person')`);
await db.exec(`update public.entry_private set guardian_name = 'Secret Guardian' where entry_id = '66666666-6666-6666-6666-666666666666'`);
const gaud = await rows(`select action, coalesce(before::text, '') b, coalesce(after::text, '') a from public.audit_log where table_name='entry_private' and row_id='66666666-6666-6666-6666-666666666666' order by id`);
ok(gaud.length === 2 && gaud.every((g) => !g.b.includes("Parent") && !g.a.includes("Parent") && !g.a.includes("Secret")) && gaud[1].a.includes("redacted"), "the audit log records that a guardian record changed, but never the guardian's details");
await as(U.entries);
ok(!(await can(`delete from public.audit_log`)) && !(await can(`update public.audit_log set actor_email='x'`)) && !(await can(`insert into public.audit_log (table_name, action) values ('x','insert')`)), "nobody can change, delete or forge audit entries");

// ---- the settlement: money to send, adds up exactly
await db.exec("reset role"); await db.exec(`delete from public.entries`);
const id = (n) => `00000000-0000-0000-0000-0000000000${n}`;
await db.exec(`insert into public.payees (id, name, kind) values ('${id("f1")}','YNEPF','federation'),('${id("f2")}','Implexus Gym','host'),('${id("f3")}','White Lights Media','photographer')`);
await db.exec(`insert into public.entry_settings (competition_id, stripe_fee_policy) values ('11111111-1111-1111-1111-111111111111','federation')`);
await db.exec(`insert into public.payout_rules (competition_id, category, payee_id, percent) values
  ('11111111-1111-1111-1111-111111111111','entry','${id("f2")}',80),('11111111-1111-1111-1111-111111111111','entry','${id("f1")}',20),
  ('11111111-1111-1111-1111-111111111111','merch','${id("f2")}',100),('11111111-1111-1111-1111-111111111111','merch','${id("f1")}',0),
  ('11111111-1111-1111-1111-111111111111','photo','${id("f3")}',100),('11111111-1111-1111-1111-111111111111','photo','${id("f1")}',0)`);
await db.exec(`insert into public.addons (id, competition_id, kind, name, price_pence) values ('${id("a1")}','11111111-1111-1111-1111-111111111111','merch','T-shirt',2000),('${id("a2")}','11111111-1111-1111-1111-111111111111','photo','Photo pack',1000)`);
// 10 entries at £40; entries 1 and 2 add a T-shirt; entries 3, 4, 5 add photos; entry 10 is refunded (Stripe keeps its fee)
for (let i = 1; i <= 10; i++) {
  const eid = `00000000-0000-0000-0000-0000000001${String(i).padStart(2, "0")}`;
  const add = i <= 2 ? 2000 : i <= 5 ? 1000 : 0, total = 4000 + add;
  await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status, price_pence) values ('${eid}','11111111-1111-1111-1111-111111111111','l${i}@x.com','L${i}','1990-01-01','M','${i === 10 ? "refunded" : "paid"}', ${total})`);
  if (i <= 2) await db.exec(`insert into public.entry_addons (entry_id, addon_id, price_pence) values ('${eid}','${id("a1")}',2000)`);
  else if (i <= 5) await db.exec(`insert into public.entry_addons (entry_id, addon_id, price_pence) values ('${eid}','${id("a2")}',1000)`);
  await db.exec(`insert into public.payments (entry_id, stripe_session_id, amount_pence, stripe_fee_pence, status) values ('${eid}','cs_${i}',${total},${Math.round(total * 0.015 + 20)},'succeeded')`);
}
const settle = async () => rows(`select payee_name, payee_kind, entry_pence::int e, merch_pence::int m, photo_pence::int p, gross_pence::int g, fee_pence::int f, net_pence::int n from public.competition_settlement('11111111-1111-1111-1111-111111111111')`);
let s = await settle();
const by = Object.fromEntries(s.map((r) => [r.payee_name, r]));
// takings of the 9 live entries: entry money 9 x 4000 = 36000; merch 2 x 2000 = 4000; photos 3 x 1000 = 3000
ok(by["Implexus Gym"].e === 28800 && by["Implexus Gym"].m === 4000, "host: 80% of entry money (28,800) plus 100% of merchandise (4,000)");
ok(by["White Lights Media"].p === 3000 && by["White Lights Media"].g === 3000, "photographer: 100% of photo packages (3,000)");
ok(by["YNEPF"].e === 7200 && by["YNEPF"].g === 7200, "federation: 20% of entry money (7,200)");
const feeTotal = (await rows(`select sum(stripe_fee_pence)::int f from public.payments`))[0].f;
ok(by["YNEPF"].f === feeTotal && by["Implexus Gym"].f === 0 && by["White Lights Media"].f === 0, `policy "federation pays the fees": all ${feeTotal}p of Stripe fees (including the refunded entry's) come out of the federation's share`);
ok(s.reduce((a, r) => a + r.n, 0) === 36000 + 4000 + 3000 - feeTotal, "the rows add up exactly: takings less fees");
ok(by["YNEPF"].n === 7200 - feeTotal && by["Implexus Gym"].n === 32800 && by["White Lights Media"].n === 3000, "money to send: host 32,800 and photographer 3,000; the federation keeps what is left after fees");
await db.exec(`update public.entry_settings set stripe_fee_policy='pro_rata' where competition_id='11111111-1111-1111-1111-111111111111'`);
s = await settle();
ok(s.reduce((a, r) => a + r.n, 0) === 43000 - feeTotal && s.reduce((a, r) => a + r.f, 0) === feeTotal, `policy "shared pro rata": fees are shared by size of takings, and still add up exactly (${s.map((r) => r.payee_name + " fee " + r.f).join(", ")})`);
// awkward percentages never lose a penny
await db.exec(`delete from public.payout_rules where category='entry'`);
await db.exec(`insert into public.payout_rules (competition_id, category, payee_id, percent) values ('11111111-1111-1111-1111-111111111111','entry','${id("f2")}',33.33),('11111111-1111-1111-1111-111111111111','entry','${id("f3")}',33.33),('11111111-1111-1111-1111-111111111111','entry','${id("f1")}',33.34)`);
s = await settle();
ok(s.reduce((a, r) => a + r.e, 0) === 36000, "thirds that do not divide evenly still add up to exactly the takings: " + s.map((r) => r.e).join(" + "));
// nothing paid yet
await db.exec(`update public.entries set status='cancelled'`);
s = await settle(); ok(s.every((r) => r.g === 0 && r.n <= 0), "no paid entries: nothing is owed");

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
