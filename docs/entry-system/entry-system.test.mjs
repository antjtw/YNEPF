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
const clearEntries = async () => { await db.exec("reset role"); await db.exec(`delete from public.refunds`); await db.exec(`delete from public.payments`); await db.exec(`delete from public.entries`); };
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
await clearEntries();
const e = (st, extra = "") => db.exec(`insert into public.entries (competition_id, email, full_name, date_of_birth, sex, status ${extra ? ", hold_expires_at" : ""}) values ('11111111-1111-1111-1111-111111111111', 'a' || gen_random_uuid() || '@x.com', 'N', '1990-01-01', 'F', '${st}' ${extra ? ", " + extra : ""})`);
const left = async () => (await rows(`select public.places_left('11111111-1111-1111-1111-111111111111') n`))[0].n;
ok(await left() === 3, "capacity 3, nobody in: 3 left");
await e("paid"); await e("held", "now() + interval '10 minutes'"); await e("held", "now() - interval '1 minute'"); await e("cancelled"); await e("refunded");
ok(await left() === 1, "1 paid + 1 live hold = 2 taken; an expired hold, a cancellation and a refund use no place: 1 left");
await e("comped"); ok(await left() === 0, "a comped entry takes a place: none left");
await e("paid"); ok(await left() === 0, "never below zero");

// ---- audit log: who, what, before and after; cannot be changed
await db.exec("reset role"); await db.query(`select set_config('request.uid','',false)`); await clearEntries();
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

// ---- the settlement: the federation keeps a fixed amount per entry, the host gets the rest, the federation absorbs discounts
await clearEntries();
const id = (n) => `00000000-0000-0000-0000-0000000000${n}`;
const COMP = "11111111-1111-1111-1111-111111111111";
await db.exec(`update public.payees set id = '${id("f1")}' where kind = 'federation'`);   // the federation is already there: the install adds it
await db.exec(`insert into public.payees (id, name, kind) values ('${id("f2")}','Implexus Gym','host'),('${id("f3")}','White Lights Media','photographer')`);
ok((await rows(`select key, pence from public.federation_fees order by key`)).map((r) => r.key + ":" + r.pence).join() === "bench_only:750,full_power:1200,sub_junior:450", "the federation's fixed amounts start as £12 full power, £7.50 bench only, £4.50 sub-junior");
await db.exec(`update public.competitions set host_payee_id = '${id("f2")}' where id = '${COMP}'`);
await db.exec(`insert into public.payout_rules (competition_id, category, payee_id, percent) values
  ('${COMP}','merch','${id("f2")}',100),('${COMP}','merch','${id("f1")}',0),('${COMP}','photo','${id("f3")}',100),('${COMP}','photo','${id("f1")}',0)`);
await db.exec(`insert into public.addons (id, competition_id, kind, name, price_pence) values ('${id("a1")}','${COMP}','merch','T-shirt',2000),('${id("a2")}','${COMP}','photo','Photo pack',1000)`);
let n = 0;
const mkEntry = async (o) => {
  n++; const eid = `00000000-0000-0000-0000-0000000002${String(n).padStart(2, "0")}`;
  const e = { dob: "1990-01-01", event: "full_power", status: "paid", price: 4000, list: "null", discount: 0, addon: null, fee: 70, ...o };
  const total = e.price + (e.addon ? e.addon.price : 0);
  await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status, event, price_pence, discount_pence, list_price_pence) values ('${eid}','${COMP}','s${n}@x.com','S${n}','${e.dob}','M','${e.status}','${e.event}', ${total}, ${e.discount}, ${e.list})`);
  if (e.addon) await db.exec(`insert into public.entry_addons (entry_id, addon_id, price_pence) values ('${eid}','${id(e.addon.id)}',${e.addon.price})`);
  if (total > 0) await db.exec(`insert into public.payments (entry_id, stripe_session_id, amount_pence, stripe_fee_pence, status) values ('${eid}','cs_s${n}',${total},${e.fee},'succeeded')`);
  return eid;
};
const settle = async () => rows(`select payee_name, payee_kind, entry_pence::int e, merch_pence::int m, photo_pence::int p, gross_pence::int g, fee_pence::int f, net_pence::int n from public.competition_settlement('${COMP}')`);
const byName = (s) => Object.fromEntries(s.map((r) => [r.payee_name, r]));
// the worked example: a £40 full power entry: the federation keeps £12 and the host receives £28
await mkEntry({});
let s1 = byName(await settle());
ok(s1["Implexus Gym"].e === 2800 && s1["YNEPF"].e === 1200, "a £40 full power entry: the host receives £28 and the federation keeps £12: " + JSON.stringify(s1));
// ...and a £20 T-shirt goes wholly to the host: £48 in total
await clearEntries();
await mkEntry({ addon: { id: "a1", price: 2000 } });
s1 = byName(await settle());
ok(s1["Implexus Gym"].e === 2800 && s1["Implexus Gym"].m === 2000 && s1["Implexus Gym"].g === 4800 && s1["YNEPF"].g === 1200, "with a £20 T-shirt the host receives £48 in total, and the federation still keeps £12");
// each kind of entry: bench, sub-junior, master (full power rate), and a discounted one
await clearEntries();
await mkEntry({ event: "bench_only", price: 2500 });                                  // bench: federation £7.50, host £17.50
await mkEntry({ dob: "2010-03-03", price: 1500 });                                    // sub-junior: federation £4.50, host £10.50
await mkEntry({ dob: "2010-03-03", event: "bench_only", price: 2500 });                 // sub-junior bench only: same as bench, federation £7.50, host £17.50
await mkEntry({ dob: "1960-03-03" });                                                 // master: full power rate: £12 / £28
await mkEntry({ price: 2000, discount: 2000, list: 4000 });                           // paid £20 of £40: host still £28, the federation absorbs £8
await mkEntry({ addon: { id: "a2", price: 1000 } });                                  // photo pack £10 goes to the photographer
await mkEntry({ status: "refunded", price: 4000 });                                   // refunded: not counted (Stripe still keeps its fee)
let s = await settle(); let by = byName(s);
ok(by["Implexus Gym"].e === 1750 + 1050 + 1750 + 2800 + 2800 + 2800, "host entry money: 17.50 + 10.50 + 17.50 + 28 + 28 + 28 = £114: " + by["Implexus Gym"].e);
ok(by["YNEPF"].e === (750 + 450 + 750 + 1200 + (2000 - 2800) + 1200), "the federation's entry money: 7.50 + 4.50 + 7.50 (sub-junior bench) + 12 - 8 (the discount it absorbs) + 12: " + by["YNEPF"].e);
ok(by["White Lights Media"].p === 1000 && by["White Lights Media"].g === 1000, "the photographer gets the whole of the photo packages");
const fees = (await rows(`select sum(stripe_fee_pence)::int f from public.payments p join public.entries e on e.id = p.entry_id where e.competition_id = '${COMP}'`))[0].f;
ok(by["YNEPF"].f === fees && by["Implexus Gym"].f === 0 && by["White Lights Media"].f === 0, `the federation pays all ${fees}p of Stripe fees, including on the refunded entry`);
const cash = 2500 + 1500 + 2500 + 4000 + 2000 + 5000;   // what the live entries actually paid (the refunded one is excluded)
ok(s.reduce((a, r) => a + r.n, 0) === cash - fees, "the rows add up exactly: cash taken less fees: " + s.reduce((a, r) => a + r.n, 0) + " = " + (cash - fees));
// a free place (a comped entry) is the full price to the host: the federation absorbs it
const freeId = await mkEntry({ status: "comped", price: 0, list: 4000 });
const sFree = byName(await settle());
ok(sFree["Implexus Gym"].e === by["Implexus Gym"].e + 2800 && sFree["YNEPF"].e === by["YNEPF"].e - 2800, "a free place pays the host in full (£28) and the federation absorbs it");
// older entries have no list price saved: it is worked out from what was paid plus the discount
await db.exec(`update public.entries set list_price_pence = null where price_pence = 2000 and discount_pence = 2000`);
ok(byName(await settle())["Implexus Gym"].e === sFree["Implexus Gym"].e, "an entry with no saved list price uses what was paid plus the discount");
// a fee below the federation's amount: the host cannot be paid a negative amount
await clearEntries();
await mkEntry({ price: 1000, fee: 0 });
s = byName(await settle());
ok(s["Implexus Gym"].e === 0 && s["YNEPF"].e === 1000, "if the entry fee is less than the federation's amount, the federation keeps the lot and the host is not paid a negative amount");
// the fixed amounts can be changed
await clearEntries();
// the defaults for NEW competitions can change without touching a competition that already exists
await db.exec(`update public.federation_fees set pence = 1500 where key = 'full_power'`);
await mkEntry({});
s = byName(await settle()); ok(s["Implexus Gym"].e === 2800 && s["YNEPF"].e === 1200, "changing the defaults does NOT change an existing competition's report: past competitions keep the amounts they started with");
await db.exec(`insert into public.competitions (id, name, start_date, capacity, published, slug) values ('55555555-5555-5555-5555-555555555555','Later Open','2028-03-01',10,true,'later')`);
ok((await rows(`select fee_full_power_pence f, fee_bench_only_pence b, fee_sub_junior_pence j from public.competitions where id = '55555555-5555-5555-5555-555555555555'`))[0].f === 1500, "a competition made afterwards starts with the new amounts");
ok((await rows(`select fee_full_power_pence f from public.competitions where id = '${COMP}'`))[0].f === 1200, "...and the old one still has its own");
await db.exec(`update public.federation_fees set pence = 1200 where key = 'full_power'`);
// one competition's amounts can be changed by the entries team only
const saveFees = async (who, o) => { await as(who); try { await db.query(`select public.save_competition_fees('${COMP}', $1::jsonb)`, [JSON.stringify(o)]); return "ok"; } catch (e) { return e.message; } finally { await db.exec("reset role"); } };
ok((await saveFees(U.editor, { full_power: 1000, bench_only: 600, sub_junior: 300 })) === "forbidden" && (await saveFees(null, { full_power: 1, bench_only: 1, sub_junior: 1 })) !== "ok", "editors and the public cannot change a competition's amounts");
ok((await saveFees(U.entries, { full_power: 1000, bench_only: 600, sub_junior: -1 })) === "invalid:fees", "negative amounts are refused");
ok((await saveFees(U.entries, { full_power: 1500, bench_only: 750, sub_junior: 450 })) === "ok", "the entries team can change one competition's amounts");
s = byName(await settle()); ok(s["Implexus Gym"].e === 2500 && s["YNEPF"].e === 1500, "...and that changes that competition's split: host £25, federation £15");
await saveFees(U.entries, { full_power: 1200, bench_only: 750, sub_junior: 450 });
// with no host set, all the entry money stays with the federation
await db.exec(`update public.competitions set host_payee_id = null where id = '${COMP}'`);
s = byName(await settle()); ok(!s["Implexus Gym"] || s["Implexus Gym"].e === 0, "with no host set, the host gets no entry money (it stays with the federation)");
await db.exec(`update public.competitions set host_payee_id = '${id("f2")}' where id = '${COMP}'`);
// nothing paid
await db.exec(`update public.entries set status='cancelled'`);
s = await settle(); ok(s.every((r) => r.e === 0 && r.m === 0 && r.p === 0), "no paid entries: nothing is owed");
// only the entries team may change the fixed amounts
const askFees = async (who) => { await as(who); try { return (await db.query(`update public.federation_fees set pence = pence where key = 'full_power'`)).affectedRows; } catch (e) { return -1; } finally { await db.exec("reset role"); } };
ok((await askFees(U.editor)) <= 0 && (await askFees(null)) <= 0 && (await askFees(U.entries)) === 1, "only the entries team can change the federation's fixed amounts");

// setting up who gets paid (host, merchandise, photos), then the report adds up
await db.exec("reset role");
const CC = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into public.competitions (id, name, start_date, capacity, published, slug) values ('${CC}','Payout Open','2027-06-01',20,true,'payout')`);
const setup = async (who, o) => { await as(who); try { return (await db.query(`select public.save_payout_setup('${CC}', $1::jsonb) r`, [JSON.stringify(o)])).rows[0].r; } catch (e) { return { error: e.message }; } finally { await db.exec("reset role"); } };
ok((await setup(U.editor, { host_name: "Leeds Gym" })).error === "forbidden" && (await setup(null, { host_name: "x" })).error !== undefined, "only the entries team can set who gets paid");
ok((await setup(U.entries, { host_name: "" })).error === "invalid:host_name" && (await setup(U.entries, { host_name: "X", host_merch_percent: 120 })).error === "invalid:percent", "a host is needed, and percentages are 0 to 100");
ok((await setup(U.entries, { host_name: "Leeds Gym", host_merch_percent: 100, photographer_name: "White Lights Media", photographer_percent: 100 })).host_id, "the setup is saved");
ok((await db.query(`select host_payee_id is not null h from public.competitions where id = '${CC}'`)).rows[0].h, "the competition now knows its host");
await db.exec(`insert into public.entries (competition_id, email, full_name, date_of_birth, sex, status, event, price_pence) values ('${CC}','p1@x.com','P1','1990-01-01','M','paid','full_power',4000),('${CC}','p2@x.com','P2','1990-01-01','M','paid','full_power',2000),('${CC}','p3@x.com','P3','1990-01-01','M','comped','full_power',0)`);
await db.exec(`insert into public.payments (entry_id, stripe_session_id, amount_pence, stripe_fee_pence, status) select id, 'cs_pay_' || email, price_pence, 70, 'succeeded' from public.entries where competition_id = '${CC}' and price_pence > 0`);
await as(U.entries);
const money = (await db.query(`select payee_name n, payee_kind k, gross_pence::int g, fee_pence::int f, net_pence::int net from public.competition_settlement('${CC}')`)).rows;
const mh = Object.fromEntries(money.map((r) => [r.n, r]));
ok(mh["Leeds Gym"].g === 2800 + 800 && mh["YNEPF"].g === 6000 - 3600 && mh["YNEPF"].f === 140 && mh["YNEPF"].net === 2400 - 140 && mh["Leeds Gym"].net === 3600, "£40 entry (host £28), a £20 entry (host £8, as the fee is only £20 and the federation keeps £12) and a free place with no saved price (host £0): " + JSON.stringify(money));
ok(money.reduce((a, r) => a + r.net, 0) === 6000 - 140, "the report adds up: takings less fees");
await setup(U.entries, { host_name: "leeds gym", host_merch_percent: 100 });
ok((await db.query(`select count(*)::int n from public.payees where lower(name) = 'leeds gym'`)).rows[0].n === 1, "a host is found by name, not made twice");
ok((await db.query(`select count(*)::int n from public.payout_rules where competition_id = '${CC}' and category = 'photo'`)).rows[0].n === 0, "saving again replaces the old split (no photographer this time)");
await db.exec("reset role");

// a competition the federation runs itself (not a franchise): it keeps the whole entry fee, and the photo package goes to the photographer
await db.exec("reset role");
await db.exec(`update public.entries set status='cancelled'; update public.competitions set is_franchise = false where id = '${COMP}'`);
await mkEntry({ addon: { id: "a2", price: 4049 } });          // £40 entry + £40.49 photo package
await mkEntry({});                                              // £40 entry
await mkEntry({ price: 2000, discount: 2000, list: 4000 });     // £20 paid of £40: the federation just receives £20
s = byName(await settle());
ok(!s["Implexus Gym"] || (s["Implexus Gym"].e === 0 && s["Implexus Gym"].g === 0), "not a franchise: the host is owed nothing for entries");
ok(s["YNEPF"].e === 4000 + 4000 + 2000 && s["YNEPF"].p === 0, "the federation keeps all of the entry money (£100): " + JSON.stringify(s["YNEPF"]));
ok(s["White Lights Media"].p === 4049 && s["White Lights Media"].g === 4049, "the photo package money goes to the photographer: " + JSON.stringify(s["White Lights Media"]));
await db.exec(`update public.competitions set is_franchise = true where id = '${COMP}'`);
s = byName(await settle()); ok(s["Implexus Gym"] && s["Implexus Gym"].e > 0, "switch it back to a franchise and the host is paid again");
// payout setup for a competition that is not a franchise: no host needed
await db.exec(`insert into public.competitions (id, name, start_date, capacity, published, slug, is_franchise) values ('77777777-7777-7777-7777-777777777777','Own Open','2027-07-01',20,true,'own',false)`);
await as(U.entries);
let ownSetup; try { ownSetup = (await db.query(`select public.save_payout_setup('77777777-7777-7777-7777-777777777777', '{"photographer_name":"White Lights Media","photographer_percent":100}'::jsonb) r`)).rows[0].r; } catch (e) { ownSetup = { error: e.message }; }
await db.exec("reset role");
ok(ownSetup.host_id === null && ownSetup.photographer_id, "no host is needed when it is not a franchise: " + JSON.stringify(ownSetup));
// the money report: only the entries team (admins included) can ask for it
const askSettlement = async (who) => { await as(who); try { await db.query(`select * from public.competition_settlement('11111111-1111-1111-1111-111111111111')`); return "allowed"; } catch (e) { return /forbidden|permission denied/.test(e.message) ? "refused" : e.message; } };
ok((await askSettlement(null)) === "refused" && (await askSettlement(U.editor)) === "refused" && (await askSettlement(U.contrib)) === "refused" && (await askSettlement(U.rando)) === "refused", "the public, editors, contributors and other signed-in people are refused the money report");
ok((await askSettlement(U.entries)) === "allowed" && (await askSettlement(U.admin)) === "allowed", "the entries team and admins can see it");
await db.exec("reset role");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
