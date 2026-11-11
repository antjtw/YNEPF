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
const wc = async (sex) => (await db.query(`select id from public.weight_classes where sex='${sex}' and active order by sort_order limit 1`)).rows[0]?.id;
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
await db.exec("set role anon");
try { await db.query(`select public.start_entry('{}'::jsonb)`); ok(false, "the browser cannot call it"); } catch { ok(true, "the browser (anon) cannot call start_entry"); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
