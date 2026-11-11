// Tests for start_entry(): the rules, the price, and the held place. Run in a scratch Postgres.
//   npm install --no-save @electric-sql/pglite
//   node docs/entry-system/start-entry.test.mjs
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
process.on("unhandledRejection", (e) => { console.log("ERROR: " + (e && e.message)); process.exit(1); });
const db = new PGlite();
await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin; create schema auth;
 create table auth.users (id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.uid', true),'')::uuid $$;`);
for (const f of ["schema.sql", "entry-system.sql"]) await db.exec(fs.readFileSync(new URL("../../supabase/" + f, import.meta.url), "utf8"));
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + n); };
const C = "11111111-1111-1111-1111-111111111111";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${C}','YNE March Open','2027-03-13',2,true,'x','yne');
 insert into public.entry_settings (competition_id) values ('${C}');
 insert into public.entry_stages (competition_id,kind,name,opens_at) values ('${C}','general','General',now() - interval '1 day');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values
  ('${C}',1,'Sub-junior',null,'SJ',2500),('${C}',2,'Bench only','bench_only',null,2500),('${C}',3,'Full power','full_power',null,6000);`);
const wc = async (sex) => (await db.query(`select id from public.weight_classes where sex='${sex}' and active and label = '${sex === "M" ? "83" : "63"}'`)).rows[0]?.id;
let wcM = await wc("M"), wcF = await wc("F");
if (!wcM) { await db.exec(`insert into public.weight_classes (sex,label,upper_kg) values ('M','83',83),('F','63',63)`); wcM = await wc("M"); wcF = await wc("F"); }
const good = { competition_id: C, email: "A@Example.com", full_name: "Alex Lifter", date_of_birth: "1990-06-01", sex: "M", event: "full_power", equipment: "classic", weight_class_id: wcM, eligibility_confirmed: true };
const start = async (o) => { try { const r = await db.query(`select public.start_entry($1::jsonb) r`, [JSON.stringify({ ...good, ...o })]); return r.rows[0].r; } catch (e) { return { error: e.message }; } };

let r = await start({});
ok(r.price_pence === 6000 && r.entry_id, "an adult full-power entry is priced £60 and a place is held");
ok((await db.query(`select email, status from public.entries where id='${r.entry_id}'`)).rows[0].email === "a@example.com", "the email is stored in lower case");
ok((await db.query(`select public.places_left('${C}') n`)).rows[0].n === 1, "the held place counts straight away");
r = await start({ event: "bench_only" });
ok(r.price_pence === 2500, "bench only is priced £25; trying again replaces the earlier hold instead of taking a second place");
ok((await db.query(`select public.places_left('${C}') n`)).rows[0].n === 1, "still one place left after the second attempt");
r = await start({ date_of_birth: "2010-01-01" });
ok(r.error === "invalid:guardian", "an under-18 without guardian details is refused");
r = await start({ email: "kid@example.com", date_of_birth: "2010-01-01", guardian_name: "P Parent", guardian_phone: "07", guardian_email: "p@example.com", guardian_consent: true });
ok(r.price_pence === 2500, "a sub-junior is priced by the sub-junior rule (first match wins)");
ok((await db.query(`select guardian_name g from public.entry_private where entry_id='${r.entry_id}'`)).rows[0].g === "P Parent", "guardian details are kept for the under-18");
r = await start({ email: "late@example.com" });
ok(r.error === "full", "when the places are gone, a new entry is told 'full'");
await db.exec(`update public.entries set hold_expires_at = now() - interval '1 minute' where status='held'`);
r = await start({ email: "late@example.com", access_hearing: true });
ok(r.error === "invalid:access_consent", "access needs without the agreement tick are refused");
r = await start({ email: "late@example.com", access_hearing: true, access_consent: true });
ok(r.entry_id, "once holds expire the places come back");
ok((await db.query(`select guardian_name g, access_hearing h, delete_after::text d from public.entry_private where entry_id='${r.entry_id}'`)).rows[0].g === "", "adults never get guardian details stored");
await db.exec(`update public.entries set status='paid' where id='${r.entry_id}'`);
r = await start({ email: "late@example.com" });
ok(r.error === "already_entered", "someone already entered is told so");
for (const [o, code] of [[{ sex: "X" }, "invalid:sex"], [{ eligibility_confirmed: false }, "invalid:eligibility"], [{ event: "squat" }, "invalid:event"], [{ weight_class_id: wcF }, "invalid:weight_class"], [{ date_of_birth: "2020-01-01" }, "invalid:too_young"], [{ email: "nope", full_name: "Z" }, "invalid:email"], [{ full_name: " " }, "invalid:full_name"]]) {
  r = await start({ email: "z@example.com", ...o }); ok(r.error === code, `refused: ${code}`);
}
await db.exec(`update public.competitions set entries_closed_manually = true`);
ok((await start({ email: "z@example.com" })).error === "closed", "closed by hand means closed");
await db.exec(`update public.competitions set entries_closed_manually = false; update public.entry_stages set opens_at = now() + interval '1 day'`);
ok((await start({ email: "z@example.com" })).error === "not_open", "before the stage opens: not open yet");
await db.exec("reset role");
await db.exec(`update public.entry_stages set opens_at = now() - interval '1 day'; update public.entries set status='cancelled'`);
const conf = async (id) => (await db.query(`select public.confirm_entry_payment('${id}') r`)).rows[0].r;
r = await start({ email: "p1@example.com" });
ok((await conf(r.entry_id)) === "paid" && (await conf(r.entry_id)) === "paid", "a payment inside the hold marks the entry paid, and a repeat is harmless");
await db.exec(`update public.entries set hold_expires_at = now() - interval '1 minute', status='held', paid_at=null where id='${r.entry_id}'`);
ok((await conf(r.entry_id)) === "paid", "a late payment is still accepted when a place is free");
await db.exec(`update public.entries set status='paid' where id='${r.entry_id}'`);
const r2 = await start({ email: "p2@example.com" });
await db.exec(`update public.entries set status='paid' where id='${r2.entry_id}'`);
ok((await start({ email: "p3@example.com" })).error === "full", "(setup) the competition is now full");
await db.exec(`update public.entries set status='held', hold_expires_at = now() - interval '1 minute', paid_at=null where id='${r.entry_id}'`);
await db.exec(`insert into public.entries (competition_id,email,full_name,date_of_birth,sex,status) values ('${C}','filler@example.com','Filler','1990-01-01','M','paid')`);
ok((await conf(r.entry_id)) === "no_place", "a late payment when the competition is now full is told 'no_place' so it can be refunded");
// ---- save_entry_settings (the entries team's admin screen)
await db.exec("reset role");
const U = { entries: "00000000-0000-0000-0000-00000000000b", editor: "00000000-0000-0000-0000-00000000000c" };
for (const [k, id] of Object.entries(U)) await db.exec(`insert into auth.users (id,email,email_confirmed_at) values ('${id}','${k}@example.com',now())`);
await db.exec(`insert into public.editors (email, role) values ('entries@example.com','entries'),('editor@example.com','editor')`);
const C2 = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug) values ('${C2}','New Open','2027-05-01',50,true,'new')`);
const settings = { entry_method: "yne", capacity: 50, events: ["full_power", "bench_only"], equipment: ["classic"], hold_minutes: 15, general_opens_at: "2027-01-01T10:00:00Z", prices: { sub_junior: 2500, bench_only: 2500, full_power: 6000 } };
const save = async (who, o) => { await db.exec("reset role"); await db.query(`select set_config('request.uid','${U[who]}',false)`); await db.exec("set role authenticated");
  try { await db.query(`select public.save_entry_settings('${C2}', $1::jsonb)`, [JSON.stringify({ ...settings, ...o })]); return "ok"; } catch (e) { return e.message; } };
ok((await save("editor", {})) === "forbidden", "an editor cannot change entry settings");
ok((await save("entries", {})) === "ok", "the entries team can");
await db.exec("reset role");
ok((await db.query(`select count(*)::int n from public.price_rules where competition_id='${C2}'`)).rows[0].n === 3, "three price rules were written");
ok((await db.query(`select entry_method m from public.competitions where id='${C2}'`)).rows[0].m === "yne", "online entry is switched on");
ok((await save("entries", { prices: { bench_only: 2000, full_power: 5000 } })) === "ok" && (await db.query(`select count(*)::int n, min(price_pence)::int lo from public.price_rules where competition_id='${C2}'`)).rows[0].n === 2, "saving again replaces the price rules (no duplicates)");
ok((await save("entries", { events: ["curl"] })) === "invalid:events", "an unknown event is refused");
ok((await save("entries", { hold_minutes: 90 })) === "invalid:hold_minutes", "a hold longer than Stripe allows is refused");
ok((await save("entries", { prices: { bench_only: 2000 } })) === "invalid:price_full_power", "a missing price for an offered event is refused");
ok((await save("entries", { general_opens_at: null })) === "invalid:general_opens_at", "an opening time is required");
await db.exec("reset role");
await db.exec("reset role");
await db.exec(`update public.competitions set published = false where id = '${C}'; update public.entry_stages set opens_at = now() - interval '1 day' where competition_id='${C}'; update public.entries set status='cancelled' where competition_id='${C}'`);
ok((await start({ email: "t1@example.com" })).error === "closed", "an unpublished (test) competition cannot be entered by the public");
ok((await start({ email: "t1@example.com", allow_unpublished: true })).entry_id, "...but the entries team can preview it");
await db.exec(`update public.competitions set published = true where id = '${C}'`);
await db.exec("reset role");
await db.exec(`update public.entries set status='cancelled' where competition_id='${C}'`);
const sjClass = (await db.query(`select id from public.weight_classes where sex='M' and label='53'`)).rows[0].id;
ok((await start({ email: "sj1@example.com", weight_class_id: sjClass })).error === "invalid:weight_class", "an adult cannot enter the sub-junior-only 53 kg class");
r = await start({ email: "sj2@example.com", weight_class_id: sjClass, date_of_birth: "2010-01-01", guardian_name: "P", guardian_phone: "07", guardian_email: "p@example.com", guardian_consent: true });
ok(r.entry_id, "a sub-junior can");
await db.exec("set role anon");
try { await db.query(`select public.start_entry('{}'::jsonb)`); ok(false, "the browser cannot call it"); } catch { ok(true, "the browser (anon) cannot call start_entry"); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
