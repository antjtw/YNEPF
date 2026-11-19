// Tests for the automatic waiting list: joining, offers, taking a place, running out, reminders. Run in a scratch Postgres.
//   npm install --no-save @electric-sql/pglite
//   node docs/entry-system/waitlist.test.mjs
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
const q = async (sql, params) => (await db.query(sql, params)).rows;
const can = async (sql) => { try { await db.query(sql); return true; } catch { return false; } };
const W = "33333333-3333-3333-3333-333333333333";
const U = { entries: "00000000-0000-0000-0000-00000000000b", editor: "00000000-0000-0000-0000-00000000000c" };
await db.exec(`insert into auth.users (id,email,email_confirmed_at) values ('${U.entries}','entries@example.com',now()),('${U.editor}','editor@example.com',now());
 insert into public.editors (email, role) values ('entries@example.com','entries'),('editor@example.com','editor');
 insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${W}','Wait Open','2027-03-13',1,true,'wait-open','yne');
 insert into public.entry_settings (competition_id) values ('${W}');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values ('${W}',1,'Full power','full_power',null,6000);`);
const wc = (await q(`select id from public.weight_classes where sex='M' and active and label = '83'`))[0]?.id || (await (async () => { await db.exec(`insert into public.weight_classes (sex,label,upper_kg) values ('M','83',83)`); return (await q(`select id from public.weight_classes where sex='M' and label='83'`))[0].id; })());
const home = (await q(`select id from public.divisions where name = 'Yorkshire & North East'`))[0].id;
const good = { division_id: home, club: "Unattached", competition_id: W, full_name: "Alex Lifter", date_of_birth: "1990-06-01", sex: "M", event: "full_power", equipment: "classic", weight_class_id: wc, bp_number: "TBC", eligibility_confirmed: true };
const start = async (o) => { try { return (await q(`select public.start_entry($1::jsonb) r`, [JSON.stringify({ ...good, ...o })]))[0].r; } catch (e) { return { error: e.message }; } };
const call = async (fn, args) => { try { return (await q(`select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) r`, args))[0].r; } catch (e) { return { error: e.message }; } };
const join = (email, name = "Person", extra = {}) => call("waitlist_join", [JSON.stringify({ competition_id: W, email, full_name: name, ...extra })]);
const hash = (t) => q(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') h`, [t]).then((r) => r[0].h);
const left = async () => (await q(`select public.places_left('${W}') n`))[0].n;
const sweep = async () => (await q(`select public.waitlist_sweep('${W}') r`))[0].r;
const cands = async () => (await q(`select public.waitlist_candidates('${W}') r`))[0].r;
const wid = async (email) => (await q(`select id from public.waiting_list where competition_id='${W}' and email=$1`, [email]))[0]?.id;
const state = async (email) => (await q(`select status from public.waiting_list where competition_id='${W}' and email=$1`, [email]))[0]?.status;

// one place, free: nobody needs the list
ok((await join("a@x.com")).error === "not_full", "while there is a place, joining the list is refused (just enter)");
ok((await q(`select entries_full f, entry_url u, waitlist_url w from public.competitions_public where id='${W}'`))[0].f === false, "the calendar shows the competition as open while there is a place");

// someone takes the only place: now it is full, and the waiting list opens by itself
const first = await start({ email: "first@x.com" });
ok(first.entry_id && (await left()) === 0, "the last place is held");
const view = (await q(`select entries_full f, entry_url u, waitlist_url w from public.competitions_public where id='${W}'`))[0];
ok(view.f === true && view.u === "" && view.w === "/enter?c=wait-open", "no places left: the calendar says full, and the waiting list link switches on by itself: " + JSON.stringify(view));
ok((await start({ email: "late@x.com" })).error === "full", "a new entry is told it is full");
await db.exec(`update public.entries set status = 'paid', paid_at = now() where id = '${first.entry_id}'`);

// joining
let j = await join("a@x.com", "Ann"); ok(j.position === 1 && j.already === false, "first to join is number 1: " + JSON.stringify(j));
j = await join("b@x.com", "Bea"); ok(j.position === 2, "second is number 2");
j = await join("A@X.com", "Ann Again"); ok(j.position === 1 && j.already === true, "joining twice keeps the same place (and is not case sensitive)");
ok((await join("first@x.com")).error === "already_entered", "someone already entered cannot join");
ok((await join("nope")).error === "invalid:email" && (await join("c@x.com", "")).error === "invalid:full_name", "email and name are checked");
await db.exec(`update public.competitions set entries_closed_manually = true where id = '${W}'`);
ok((await join("c@x.com", "Cat")).error === "closed", "closed means no more joining");
await db.exec(`update public.competitions set entries_closed_manually = false where id = '${W}'`);
ok((await q(`select count(*)::int n from public.waiting_list_public where competition_id='${W}'`))[0].n === 2, "the public list shows names and positions only");

// still full: nobody to offer
ok((await cands()).length === 0, "no place, no offer");

// a place frees up: the longest-waiting person is offered it, and only one
await db.exec(`update public.entries set status = 'cancelled', cancelled_at = now() where id = '${first.entry_id}'`);
ok((await left()) === 1, "a cancellation frees the place");
let c = await cands(); ok(c.length === 1 && c[0].email === "a@x.com", "the person who has waited longest is next: " + JSON.stringify(c));
const tok = "token-for-ann-1234567890", th = await hash(tok);
const exp = await call("waitlist_make_offer", [c[0].waiting_id, th]);
ok(exp && (await state("a@x.com")) === "offered", "the offer is made");
ok((await left()) === 0 && (await cands()).length === 0, "an offered place is held for them: nobody else can take it, and nobody else is offered it");
ok((await start({ email: "late@x.com" })).error === "full", "the public cannot take the offered place");
ok((await call("waitlist_make_offer", [await wid("b@x.com"), await hash("x")])).error?.includes("no_place"), "a second offer is refused when there is no place");
let info = await call("waitlist_offer_info", [JSON.stringify({ competition_id: W, offer: tok })]);
ok(info.ok === true && info.email === "a@x.com" && info.name === "Ann Again", "the offer link is recognised and gives the name and email");
ok((await call("waitlist_offer_info", [JSON.stringify({ competition_id: W, offer: "wrong" })])).ok === false, "a wrong link is not");
ok((await start({ email: "b@x.com", offer: tok })).error === "full", "someone else cannot use Ann's link");
// Ann takes it
let mine = await start({ email: "a@x.com", offer: tok, full_name: "Ann" });
ok(mine.entry_id && (await left()) === 0, "with her link Ann can enter although it is full, and the place is counted once");
const row = (await q(`select source, waiting_id from public.entries where id = '${mine.entry_id}'`))[0];
ok(row.source === "offer" && row.waiting_id === (await wid("a@x.com")), "the entry remembers it came from the waiting list");
ok((await start({ email: "b@x.com" })).error === "full", "still full for everyone else while Ann pays");
// Ann's hold runs out, she tries again with the same link
await db.exec(`update public.entries set hold_expires_at = now() - interval '1 minute' where id = '${mine.entry_id}'`);
ok((await left()) === 0, "her hold ended, but her offer still holds the place");
mine = await start({ email: "a@x.com", offer: tok, full_name: "Ann" });
ok(mine.entry_id, "she can try again with the same link while the offer lasts");
await db.exec(`update public.entries set status = 'paid', paid_at = now() where id = '${mine.entry_id}'`);
ok((await sweep()).length === 0 && (await state("a@x.com")) === "entered", "once she has paid, the list marks her as entered (no 'expired' email)");
ok((await q(`select outcome from public.offers where waiting_id = '${await wid("a@x.com")}'`))[0].outcome === "entered", "and the offer is closed as taken up");

// Bea: offered, does nothing, lapses; the next in line gets the place
await join("d@x.com", "Dee");
await db.exec(`update public.entries set status = 'cancelled' where id = '${mine.entry_id}'`);
c = await cands(); ok(c.length === 1 && c[0].email === "b@x.com", "next in line is Bea (Dee joined after her)");
await call("waitlist_make_offer", [c[0].waiting_id, await hash("bea-token")]);
// halfway: a reminder, once
await db.exec(`update public.offers set expires_at = now() + interval '6 hours' where waiting_id = '${await wid("b@x.com")}'`);
let ev = await sweep(); ok(ev.length === 1 && ev[0].kind === "reminder" && ev[0].email === "b@x.com", "close to the end, one reminder is due: " + JSON.stringify(ev));
ok((await sweep()).length === 0, "and only once");
// ran out
await db.exec(`update public.offers set expires_at = now() - interval '1 minute' where waiting_id = '${await wid("b@x.com")}'`);
ev = await sweep(); ok(ev.length === 1 && ev[0].kind === "expired" && (await state("b@x.com")) === "lapsed", "an offer that runs out lapses and an 'expired' email is due");
ok((await left()) === 1, "the place is free again");
c = await cands(); ok(c.length === 1 && c[0].email === "d@x.com", "and goes to the next person, Dee: " + JSON.stringify(c));
// the email could not be sent: take the offer back
await call("waitlist_make_offer", [c[0].waiting_id, await hash("dee-token")]);
await call("waitlist_unoffer", [c[0].waiting_id]);
ok((await state("d@x.com")) === "waiting" && (await left()) === 1, "if the email fails the offer is taken back and Dee keeps her place in the queue");
// Bea can rejoin, at the back (once the place is taken again)
await db.exec(`update public.competitions set capacity = 0 where id = '${W}'`);
j = await join("b@x.com", "Bea"); ok(j.position === 2 || j.position === 1, "someone whose offer lapsed can join again");
ok((await q(`select status from public.waiting_list where email='b@x.com'`))[0].status === "waiting", "...and is back in the queue");
await db.exec(`update public.competitions set capacity = 1 where id = '${W}'`);

// by hand: offers can be switched off
await db.exec(`update public.entry_settings set offer_automatic = false where competition_id = '${W}'`);
ok((await cands()).length === 0, "if offers are set to manual, nobody is offered automatically");
await db.exec(`update public.entry_settings set offer_automatic = true where competition_id = '${W}'`);
await db.exec(`update public.competitions set entry_closes = now() - interval '1 hour' where id = '${W}'`);
ok((await cands()).length === 0, "after entries close, nobody is offered a place");
await db.exec(`update public.competitions set entry_closes = null where id = '${W}'`);
// more places added: more offers
await db.exec(`update public.competitions set capacity = 3 where id = '${W}'`);
ok((await cands()).length === 2, "adding places means more people are offered (the two still waiting)");

// ---- a place that frees up belongs to the queue: the public cannot grab it before the timer makes the offer
await db.exec("reset role");
const Q = "44444444-4444-4444-4444-444444444444";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${Q}','Queue Open','2027-03-13',1,true,'queue-open','yne');
 insert into public.entry_settings (competition_id) values ('${Q}');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values ('${Q}',1,'Full power','full_power',null,6000);`);
const qstart = async (o) => { try { return (await q(`select public.start_entry($1::jsonb) r`, [JSON.stringify({ ...good, competition_id: Q, ...o })]))[0].r; } catch (e) { return { error: e.message }; } };
const qleft = async (fn) => (await q(`select public.${fn}('${Q}') n`))[0].n;
const qview = async () => (await q(`select entries_full f, entry_url u, waitlist_url w from public.competitions_public where id='${Q}'`))[0];
const e1 = await qstart({ email: "holder@x.com" }); await db.exec(`update public.entries set status='paid', paid_at=now() where id='${e1.entry_id}'`);
await call("waitlist_join", [JSON.stringify({ competition_id: Q, email: "next@x.com", full_name: "Next" })]);
await db.exec(`update public.entries set status = 'cancelled' where id = '${e1.entry_id}'`);
ok((await qleft("places_left")) === 1 && (await qleft("places_open")) === 0, "a place frees up, but it is not open to the public while someone is waiting for it");
const qv = await qview(); ok(qv.f === true && qv.u === "" && qv.w === "/enter?c=queue-open", "so the calendar still says full and offers the waiting list, not Enter now: " + JSON.stringify(qv));
ok((await qstart({ email: "stranger@x.com" })).error === "full", "and a stranger cannot take it in the gap before the offer goes out");
j = await call("waitlist_join", [JSON.stringify({ competition_id: Q, email: "newer@x.com", full_name: "Newer" })]);
ok(j.position === 2, "someone arriving now joins the back of the queue (not told to just enter): " + JSON.stringify(j));
// the queue is served, then empties: Enter now comes back by itself
const qc = (await q(`select public.waitlist_candidates('${Q}') r`))[0].r; ok(qc.length === 1 && qc[0].email === "next@x.com", "the timer offers it to the head of the queue");
await db.exec(`update public.waiting_list set status = 'removed' where competition_id = '${Q}'`);
ok((await qleft("places_open")) === 1, "once nobody is waiting, the free place is open again");
const qv2 = await qview(); ok(qv2.f === false && qv2.u === "/enter?c=queue-open", "and Enter now comes back on the calendar by itself: " + JSON.stringify(qv2));
ok((await qstart({ email: "anyone@x.com" })).entry_id, "anyone can take it");

// ---- priority entry: a list per competition; links are made and sent when the window opens ----
await db.exec("reset role");
const PR = "55555555-5555-5555-5555-555555555555";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method,entry_opens) values ('${PR}','Priority Open','2027-06-12',10,true,'priority-open','yne', now() + interval '3 days');
 insert into public.entry_settings (competition_id) values ('${PR}');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values ('${PR}',1,'Full power','full_power',null,6000);`);
const pstart = async (o) => { try { return (await q(`select public.start_entry($1::jsonb) r`, [JSON.stringify({ ...good, competition_id: PR, ...o })]))[0].r; } catch (e) { return { error: e.message }; } };
const asUser = async (who, fn) => { await db.exec("reset role"); await db.query(`select set_config('request.uid','${who}',false)`); await db.exec("set role authenticated"); try { return await fn(); } finally { await db.exec("reset role"); } };
const add = (people, who = U.entries) => asUser(who, () => call("priority_add", [PR, JSON.stringify(people)]));
ok((await add([{ email: "vol@x.com", name: "Vol One" }], U.editor)).error?.includes("forbidden"), "only the entries team can build a priority list");
ok((await add([{ email: "not-an-email" }])).error?.includes("invalid:email"), "a bad email is refused, and says which");
ok((await add([{ email: "Vol@X.com", name: "Vol One" }, { email: "vol2@x.com", name: "" }, { email: "vol@x.com", name: "Vol One again" }])) === 2, "people are added without any link yet (a repeat replaces)");
const inv = async () => q(`select email, full_name, token_hash is null as pending, sent_at is not null as sent from public.invites where competition_id = '${PR}' order by email`);
let rowsP = await inv(); ok(rowsP.length === 2 && rowsP.every((r) => r.pending && !r.sent) && rowsP.find((r) => r.email === "vol@x.com").full_name === "Vol One again", "they wait, with no link made: " + JSON.stringify(rowsP));
ok((await q(`select public.priority_competitions() r`))[0].r.length === 0, "entry opens in 3 days, priority starts 24 hours before: nothing is due yet");
await db.exec(`update public.entry_settings set priority_hours = 96 where competition_id = '${PR}'`);
ok((await q(`select public.priority_competitions() r`))[0].r.includes(PR), "set the window to 96 hours and the links are due now");
const pend = (await q(`select public.priority_pending('${PR}') r`))[0].r; ok(pend.length === 2, "the timer would send to both");
const ptok = "priority-token-1234567890";
await call("priority_issue", [pend[0].id, await hash(ptok), false]);
ok((await q(`select public.priority_pending('${PR}') r`))[0].r.length === 1, "once issued, a person is no longer waiting");
ok((await call("priority_issue", [pend[0].id, await hash("x"), false])).error?.includes("not_waiting"), "a link is not made twice by accident");
ok((await pstart({ email: pend[0].email, invite: ptok })).entry_id, "with the link, they can enter before general entry opens (here 3 days early, inside the 96 hour window)");
ok((await pstart({ email: "someone@else.com", invite: ptok })).error === "not_open", "someone else cannot use that person's link");
await db.exec(`update public.entry_settings set priority_hours = 24 where competition_id = '${PR}'`);
await db.exec(`update public.entries set status = 'cancelled' where competition_id = '${PR}'`);
ok((await pstart({ email: pend[0].email, invite: ptok })).error === "not_open", "outside the window the link does not work yet");
await db.exec(`update public.entry_settings set priority_hours = 96 where competition_id = '${PR}'`);
await call("priority_issue", [pend[0].id, await hash("new-token-abcdef"), true]);
ok((await pstart({ email: pend[0].email, invite: ptok })).error === "not_open", "re-sending replaces the old link");
ok((await pstart({ email: pend[0].email, invite: "new-token-abcdef" })).entry_id, "and the new one works");
await call("priority_unissue", [pend[1].id]);
rowsP = await inv(); ok(rowsP.find((r) => r.email === pend[1].email).pending, "an email that failed to send goes back to waiting, to be tried again");

// ---- OpenIPF lookup: pending list, saving results, qualification ----
await db.exec("reset role");
const OI = "66666666-6666-6666-6666-666666666666";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${OI}','Qualifier Open','2027-06-12',20,true,'qualifier-open','yne')`);
const wc83 = (await q(`select id from public.weight_classes where sex='M' and label='83'`))[0].id;
const setQual = (o, who = U.entries) => asUser(who, () => call("save_entry_settings", [OI, JSON.stringify({ entry_method: "yne", events: ["full_power"], equipment: ["classic"], prices: { full_power: 6000 }, ...o })]));
const mkOi = async (n, o = {}) => {
  const eid = `00000000-0000-0000-0000-0000000009${String(n).padStart(2, "0")}`;
  const e = { status: "paid", url: "https://www.openipf.org/u/lifter" + n, ...o };
  await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status, event, equipment, weight_class_id, openipf_url, paid_at) values ('${eid}','${OI}','oi${n}@x.com','Lifter ${n}','1990-01-01','M','${e.status}','full_power','classic','${wc83}','${e.url}', now())`);
  return eid;
};
const saveOi = (eid, o) => call("openipf_save", [eid, JSON.stringify(o)]);
const oi = async (eid) => (await q(`select openipf_status s, openipf_name nm, best_total_kg::float t, best_glp::float g, qualification ql, openipf_tries tr, openipf_slug sl from public.entries where id = '${eid}'`))[0];
const eA = await mkOi(1), eB = await mkOi(2, { url: "" }), eC = await mkOi(3, { status: "held" });
let pendingOi = (await q(`select public.openipf_pending(10) r`))[0].r;
ok(pendingOi.length === 1 && pendingOi[0].id === eA && pendingOi[0].url.includes("lifter1") && pendingOi[0].comp_start === "2027-06-12" && pendingOi[0].event === "full_power", "only paid entries with a link are waiting to be looked up: " + JSON.stringify(pendingOi));
ok((await oi(eB)).s === "skipped" && (await oi(eC)).s === "pending", "a paid entry with no link is skipped; one still being paid for waits");
// a qualifying standard of GL points
ok((await setQual({ qualification: "glp", qualification_glp: 100 }, U.editor)).error?.includes("forbidden"), "only the entries team sets the standard");
ok((await setQual({ qualification: "glp" })).error?.includes("invalid:qualification_glp") && (await setQual({ qualification: "nonsense" })).error?.includes("invalid:qualification"), "a GL standard needs a sensible number; unknown kinds are refused");
const setGlp = await setQual({ qualification: "glp", qualification_glp: 100 }); ok(!setGlp?.error, "set a minimum of 100 GL points: " + JSON.stringify(setGlp));
ok((await q(`select qualification_mode m, qualification_glp::float g, openipf_mode o from public.entry_settings where competition_id = '${OI}'`))[0].m === "glp", "the standard is saved, and the link becomes required");
await saveOi(eA, { status: "found", slug: "lifter1", name: "Agata Sitko", best_total_kg: 612.5, best_glp: 133.37, note: "" });
let ra = await oi(eA); ok(ra.s === "found" && ra.t === 612.5 && ra.g === 133.37 && ra.nm === "Agata Sitko" && ra.ql === "met", "found: best total, GL points and name stored, and 133.37 meets 100: " + JSON.stringify(ra));
const eD = await mkOi(4); await saveOi(eD, { status: "found", slug: "lifter4", name: "Low Lifter", best_total_kg: 400, best_glp: 80 });
ok((await oi(eD)).ql === "not_met", "80 GL points does not meet 100");
const eE = await mkOi(5); await saveOi(eE, { status: "found", slug: "lifter5", name: "New Lifter", best_total_kg: null, best_glp: null, note: "No results for this event and kit in the last 12 months" });
ok((await oi(eE)).ql === "not_met", "a profile with no recent result for this event is not qualified");
const eF = await mkOi(6); await saveOi(eF, { status: "not_found", note: "No OpenIPF profile at that address" });
ok((await oi(eF)).s === "not_found" && (await oi(eF)).ql === "unknown", "no profile: qualification cannot be worked out (unknown)");
// errors are retried later, a few times
const eG = await mkOi(7); await saveOi(eG, { status: "error", note: "OpenIPF did not answer" });
ok((await oi(eG)).s === "error" && (await oi(eG)).tr === 1, "an error is recorded, with a count");
ok(!(await q(`select public.openipf_pending(10) r`))[0].r.some((x) => x.id === eG), "and not retried straight away");
await db.exec(`update public.entries set openipf_checked_at = now() - interval '1 hour' where id = '${eG}'`);
ok((await q(`select public.openipf_pending(10) r`))[0].r.some((x) => x.id === eG), "an hour later it is tried again");
await db.exec(`update public.entries set openipf_tries = 5 where id = '${eG}'`);
ok(!(await q(`select public.openipf_pending(10) r`))[0].r.some((x) => x.id === eG), "after five failures it stops trying (the entries team can press check again)");
// changing the standard re-works every entry
await setQual({ qualification: "glp", qualification_glp: 70 });
ok((await oi(eD)).ql === "met", "lowering the standard to 70 makes the 80 pointer qualify straight away");
// qualifying totals by weight class
ok((await setQual({ qualification: "totals", qualifying_totals: [{ sex: "M", label: "999", total_kg: 400 }] })).error?.includes("invalid:qualifying_class"), "a weight class that does not exist is refused");
await setQual({ qualification: "totals", qualifying_totals: [{ sex: "M", label: "83", total_kg: 450 }] });
ok((await oi(eA)).ql === "met" && (await oi(eD)).ql === "not_met", "totals: 612.5 beats 450, 400 does not");
await setQual({ qualification: "totals", qualifying_totals: [{ sex: "F", label: "63", total_kg: 300 }] });
ok((await oi(eA)).ql === "unknown", "no standard set for the lifter's class: unknown");
await setQual({ qualification: "none" });
ok((await oi(eA)).ql === "unknown", "no standard: nothing to qualify against");
// changing the link starts again
await db.exec(`update public.entries set openipf_url = 'https://www.openipf.org/u/other' where id = '${eA}'`);
ra = await oi(eA); ok(ra.s === "pending" && ra.t === null && ra.nm === "" && ra.tr === 0, "a new link clears the old result and queues a fresh lookup");
await db.exec(`update public.entries set openipf_url = '' where id = '${eA}'`);
ok((await oi(eA)).s === "skipped", "removing the link skips the lookup");
// the entries team can ask again
await db.exec(`update public.entries set openipf_url = 'https://www.openipf.org/u/lifter1', openipf_status = 'found' where id = '${eA}'`);
ok((await asUser(U.editor, () => call("openipf_recheck", [eA]))).error?.includes("forbidden"), "an editor cannot ask for a recheck");
await asUser(U.entries, () => call("openipf_recheck", [eA]));
ok((await oi(eA)).s === "pending", "the entries team can: it goes back to pending");

// ---- lifting order: saving the builder's arrangement ----
await db.exec("reset role");
const LO = "77777777-7777-7777-7777-777777777777", LO2 = "88888888-8888-8888-8888-888888888888";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${LO}','Order Open','2027-06-12',20,true,'order-open','yne'),('${LO2}','Other Open','2027-06-13',20,true,'other-open','yne')`);
const lo = async (n, o = {}) => { const id = `00000000-0000-0000-0000-0000000008${String(n).padStart(2, "0")}`;
  await db.exec(`insert into public.entries (id, competition_id, email, full_name, date_of_birth, sex, status, event, equipment, weight_class_id) values ('${id}','${o.comp || LO}','lo${n}@x.com','Lo ${n}','1990-01-01','M','${o.status || "paid"}','full_power','classic','${wc83}')`); return id; };
const l1 = await lo(1), l2 = await lo(2), l3 = await lo(3), lOther = await lo(4, { comp: LO2 }), lCancelled = await lo(5, { status: "cancelled" });
const saveLo = (who, payload) => asUser(who, () => call("lifting_order_save", [LO, JSON.stringify(payload)]));
const arrangement = (flightsA, flightsB) => ({ settings: { days: 2, sessions: null, max_full_power: 12, max_per_flight: 18, prime_time: true, prime_women: 10, prime_men: 12, women_first: false },
  sessions: [{ day: 1, session_no: 1, prime: false, flights: [{ letter: "A", lifters: flightsA }] }, { day: 2, session_no: 1, prime: true, name: "Prime time", flights: [{ letter: "B", locked: true, lifters: flightsB }] }] });
ok((await saveLo(U.editor, arrangement([], []))).error?.includes("forbidden"), "an editor cannot save a lifting order");
const good1 = arrangement([{ entry_id: l1, reason: "first" }, { entry_id: l2, lot_number: 7 }], [{ entry_id: l3, locked: true }]);
ok(!(await saveLo(U.entries, good1))?.error, "the entries team can save one");
const rowsLo = async () => q(`select s.day, s.session_no, s.is_prime_time p, f.letter, f.locked fl, a.entry_id, a.position pos, a.locked al, a.lot_number lot, a.reason from public.lo_sessions s join public.lo_flights f on f.session_id = s.id join public.lo_assignments a on a.flight_id = f.id where s.competition_id = '${LO}' order by f.letter, a.position`);
let got = await rowsLo(); ok(got.length === 3 && got[0].entry_id === l1 && got[0].pos === 1 && got[1].entry_id === l2 && got[1].pos === 2 && got[1].lot === 7 && got[2].letter === "B" && got[2].p === true && got[2].fl === true && got[2].al === true, "sessions, flights and positions are stored in order: " + JSON.stringify(got.map((r) => [r.letter, r.pos])));
const set = (await q(`select days, max_full_power_per_flight mf, max_per_flight ma, prime_time_enabled pt, prime_time_women pw, prime_time_men pm, women_first wf from public.lifting_orders where competition_id = '${LO}'`))[0];
ok(set.days === 2 && set.mf === 12 && set.ma === 18 && set.pt === true && set.pw === 10 && set.pm === 12 && set.wf === false, "the settings are stored too: " + JSON.stringify(set));
// saving again replaces everything
await saveLo(U.entries, arrangement([{ entry_id: l3 }], [{ entry_id: l1 }]));
got = await rowsLo(); ok(got.length === 2 && got.find((r) => r.letter === "A").entry_id === l3 && got.find((r) => r.letter === "B").entry_id === l1, "saving again replaces the earlier arrangement, leaving nothing behind");
// times and the seconds-per-attempt setting are stored with the order
await saveLo(U.entries, { settings: { seconds_per_attempt: 50 }, sessions: [{ day: 1, session_no: 1, weigh_in_at: "2027-06-12T08:00:00Z", lift_off_at: "2027-06-12T10:00:00Z", awards_at: null, flights: [{ letter: "A", lifters: [{ entry_id: l1 }] }] }] });
const tms = (await q(`select to_char(s.weigh_in_at at time zone 'utc','HH24:MI') w, to_char(s.lift_off_at at time zone 'utc','HH24:MI') l, s.awards_at a, lo.seconds_per_attempt sp from public.lo_sessions s join public.lifting_orders lo on lo.competition_id = s.competition_id where s.competition_id = '${LO}'`))[0];
ok(tms.w === "08:00" && tms.l === "10:00" && tms.a === null && tms.sp === 50, "session times and seconds per attempt are saved: " + JSON.stringify(tms));
await saveLo(U.entries, arrangement([{ entry_id: l3 }], [{ entry_id: l1 }]));
// the show GLP / show total choices are saved, and reach the public view
await saveLo(U.entries, { settings: { show_glp: false, show_total: false }, sessions: [{ day: 1, session_no: 1, flights: [{ letter: "A", lifters: [{ entry_id: l1 }] }] }] });
const shows = (await q(`select show_glp g, show_total t from public.lifting_orders where competition_id = '${LO}'`))[0];
ok(shows.g === false && shows.t === false, "show GLP and show total are saved: " + JSON.stringify(shows));
const pv = (await asUser(U.entries, async () => (await db.query(`select show_glp, show_total from public.lifting_order_preview('${LO}')`)).rows))[0];
ok(pv && pv.show_glp === false && pv.show_total === false, "and the preview rows carry them");
await saveLo(U.entries, arrangement([{ entry_id: l3 }], [{ entry_id: l1 }]));
ok((await q(`select show_glp g from public.lifting_orders where competition_id = '${LO}'`))[0].g === true, "they default to shown");
// the same letter on two different days is fine (letters start again each day)
ok(!(await saveLo(U.entries, { settings: {}, sessions: [{ day: 1, session_no: 1, flights: [{ letter: "A", lifters: [{ entry_id: l1 }] }] }, { day: 2, session_no: 1, flights: [{ letter: "A", lifters: [{ entry_id: l2 }] }] }] }))?.error, "flight A on day 1 and flight A on day 2 can both be saved");
await saveLo(U.entries, arrangement([{ entry_id: l3 }], [{ entry_id: l1 }]));
// bad input is refused and the saved arrangement is left exactly as it was
const before = JSON.stringify(await rowsLo());
for (const [what, payload, msg] of [
  ["a lifter twice", arrangement([{ entry_id: l1 }], [{ entry_id: l1 }]), "duplicate_lifter"],
  ["a lifter from another competition", arrangement([{ entry_id: lOther }], []), "invalid:lifter"],
  ["a cancelled entry", arrangement([{ entry_id: lCancelled }], []), "invalid:lifter"],
  ["a flight letter used twice", { settings: {}, sessions: [{ day: 1, session_no: 1, flights: [{ letter: "A", lifters: [] }, { letter: "A", lifters: [] }] }] }, "invalid:flight_letter"]]) {
  const r = await saveLo(U.entries, payload); ok(r.error?.includes(msg), "refused: " + what + " (" + (r.error || "").slice(0, 60) + ")");
}
ok(JSON.stringify(await rowsLo()) === before, "and a refused save changes nothing");

// publishing
const pubLo = (who, flag) => asUser(who, () => call("lifting_order_publish", [LO, flag]));
const stLo = async () => (await q(`select status, published_as pa from public.lifting_orders where competition_id = '${LO}'`))[0];
ok((await pubLo(U.editor, true)).error?.includes("forbidden"), "an editor cannot publish");
ok(!(await pubLo(U.entries, true)).error && (await stLo()).status === "published" && (await stLo()).pa === "provisional", "the entries team can publish: provisional while entry is open");
await db.exec("reset role");
ok((await q(`select lifting_published lp from public.competitions_public where id = '${LO}'`))[0]?.lp === true, "the calendar view says it is published");
await db.exec("set role anon");
const pubRows = (await db.query(`select * from public.lifting_order_public where competition_id = '${LO}'`)).rows;
ok(pubRows.length === 2 && !("lot_number" in pubRows[0]) && !("email" in pubRows[0]) && !("date_of_birth" in pubRows[0]) && pubRows[0].flight, "the public can read the published order, with no lot numbers, emails or birth dates");
await db.exec("reset role");
ok(!(await pubLo(U.entries, false)).error && (await stLo()).status === "draft", "unpublish returns it to a draft");
const prev = (who) => asUser(who, async () => { try { return (await db.query(`select * from public.lifting_order_preview('${LO}')`)).rows; } catch (e) { return { error: e.message }; } });
const pr = await prev(U.entries);
ok(Array.isArray(pr) && pr.length === 2 && !("lot_number" in pr[0]) && !("email" in pr[0]), "the entries team can preview a draft order (no lot numbers or emails)");
ok((await prev(U.editor)).error?.includes("forbidden"), "an editor cannot preview");
await db.exec("set role anon"); ok(!(await can(`select * from public.lifting_order_preview('${LO}')`)), "the public cannot call the preview"); await db.exec("reset role");
await db.exec("set role anon");
ok((await db.query(`select * from public.lifting_order_public where competition_id = '${LO}'`)).rows.length === 0, "and the public sees nothing again");
await db.exec("reset role");
await db.exec(`update public.competitions set entry_closes = now() - interval '1 day' where id = '${LO}'`);
await pubLo(U.entries, true); ok((await stLo()).pa === "final", "published after entry closes it is final");
ok((await asUser(U.entries, () => call("lifting_order_publish", [LO2, true]))).error?.includes("invalid:empty_order"), "an empty order cannot be published");
// sharing with lifters: who gets the email, and whether it is provisional or final
const shareInfo = async () => (await q(`select public.lifting_order_share_info('${LO}') r`))[0].r;
let si = await shareInfo();
ok(si.published === true && si.closed === true && si.people.length === 2 && si.people.every((p) => p.email && p.name), "share info: published, closed (so final), one entry per address: " + JSON.stringify(si).slice(0, 120));
await db.exec(`update public.competitions set entry_closes = now() + interval '5 days' where id = '${LO}'`);
ok((await shareInfo()).closed === false, "while entry is open it is provisional");
await db.exec(`update public.competitions set entries_closed_manually = true where id = '${LO}'`);
ok((await shareInfo()).closed === true, "closing entry by hand makes it final");
await db.exec(`update public.competitions set entries_closed_manually = false where id = '${LO}'`);
await db.exec(`update public.entries set email = 'shared@x.com' where competition_id = '${LO}'`);
si = await shareInfo(); ok(si.people.length === 1 && /Lo \d and Lo \d/.test(si.people[0].name), "two lifters on one address get one email: " + JSON.stringify(si.people));
await q(`select public.lifting_order_mark_shared('${LO}', 'final', 3)`);
ok((await q(`select shared_as sa, shared_count n, shared_at is not null has from public.lifting_orders where competition_id = '${LO}'`))[0].n === 3, "the share is recorded");
await db.exec("set role authenticated");
ok(!(await can(`select public.lifting_order_share_info('${LO}')`)) && !(await can(`select public.lifting_order_mark_shared('${LO}', 'final', 1)`)), "signed-in users cannot call the share functions (only our server can)");
await db.exec("reset role");

// the entry page asks the database for the time (so a phone with the wrong clock is not told entry is closed)
await db.exec("set role anon");
const stime = (await db.query("select public.server_time() t")).rows[0].t;
ok(stime && Math.abs(new Date(stime) - Date.now()) < 60000, "anyone can read the server time: " + stime);
await db.exec("reset role");

// ---- volunteers: sign-up form and rota ----
await db.exec("reset role");
const VC = "99999999-9999-9999-9999-999999999999";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method) values ('${VC}','Vol Open','2027-07-10',20,true,'vol-open','yne')`);
const roleId = async (n) => (await q(`select id from public.vol_roles where name = $1`, [n]))[0].id;
const [rTable, rMc, rCrew, rSetupCrew, rChief] = [await roleId("Table"), await roleId("MC"), await roleId("Platform crew"), await roleId("Set up crew"), await roleId("Chief referee")];
ok((await q(`select count(*)::int n from public.vol_roles`))[0].n >= 15, "the role catalogue is loaded");
const form = async (slug = "vol-open") => (await q(`select public.volunteer_form($1) f`, [slug]))[0].f;
await db.exec("set role anon");
ok((await form()).open === false, "no rota yet: the form is closed");
await db.exec("reset role");
await db.exec(`insert into public.vol_rota (competition_id, signup_open) values ('${VC}', false)`);
const [s1] = await q(`insert into public.vol_sessions (competition_id, area, label, when_text, sort_order) values ('${VC}','session','Session 1; Saturday AM','Weigh-in 08:00',10) returning id`);
const [s2] = await q(`insert into public.vol_sessions (competition_id, area, label, sort_order) values ('${VC}','setup','Set up; Friday PM',20) returning id`);
for (const [sid, rid, n] of [[s1.id, rTable, 2], [s1.id, rMc, 1], [s1.id, rCrew, 4], [s1.id, rChief, 1], [s2.id, rSetupCrew, 6]]) for (let i = 1; i <= n; i++) await db.exec(`insert into public.vol_places (vol_session_id, role_id, position) values ('${sid}','${rid}',${i})`);
await db.exec("set role anon");
ok((await form()).open === false, "sign-up not switched on: closed");
await db.exec("reset role"); await db.exec(`update public.vol_rota set signup_open = true where competition_id = '${VC}'`); await db.exec("set role anon");
const fm = await form();
ok(fm.open && fm.sessions.length === 2 && JSON.stringify(fm.sessions[0].roles.map((r) => r.name)) === '["Table","MC","Platform crew"]' && fm.sessions[1].roles[0].name === "Set up crew", "the form lists sessions and only the roles volunteers can choose (no referees): " + JSON.stringify(fm.sessions.map((x) => x.roles.map((r) => r.name))));
let lastSignup = null;
const signup = async (o) => { const prev = await db.query("select current_user u").then((r) => r.rows[0].u); await db.exec("reset role"); try { lastSignup = (await db.query(`select public.volunteer_signup($1::jsonb) r`, [JSON.stringify({ slug: "vol-open", name: "Vic Volunteer", email: "Vic@X.com", mobile: "07700 900123", tshirt: "L", over18: true, choices: [{ session_id: s1.id, role_id: rMc }], ...o })])).rows[0].r; return null; } catch (e) { return e.message; } finally { if (prev !== "postgres" && prev !== "pglite") await db.exec("set role " + prev); } };
ok(!(await signup({})), "a valid sign-up works");
for (const [what, o, msg] of [["under 18 / not ticked", { over18: false }, "invalid:over18"], ["a bad email", { email: "nope" }, "invalid:email"], ["no T-shirt size", { tshirt: "" }, "invalid:tshirt"], ["a made-up size", { tshirt: "HUGE" }, "invalid:tshirt"],
  ["no roles chosen", { choices: [] }, "invalid:choices"], ["a role that is not on the form (chief referee)", { choices: [{ session_id: s1.id, role_id: rChief }] }, "invalid:choices"], ["a bad mobile", { mobile: "abc" }, "invalid:mobile"], ["a short name", { name: "V" }, "invalid:name"], ["the wrong competition", { slug: "nope" }, "closed"]]) {
  const e = await signup(o); ok(e && e.includes(msg), "refused: " + what + " (" + (e || "accepted").slice(0, 50) + ")");
}
await db.exec("reset role");
let su = await q(`select s.email, s.full_name, s.mobile, s.tshirt, (select count(*)::int from public.vol_signup_roles r where r.signup_id = s.id) n from public.vol_signups s where competition_id = '${VC}'`);
ok(su.length === 1 && su[0].email === "vic@x.com" && su[0].n === 1 && su[0].tshirt === "L", "stored with a lower case email: " + JSON.stringify(su));
await db.exec("set role anon");
ok((await signup({ name: "Someone Else", choices: [{ session_id: s1.id, role_id: rTable }] }))?.includes("exists"), "signing up again with an email that already signed up is refused: nobody can overwrite another person's answers by typing their address");
await db.exec("reset role");
const vtok = (await q(`select edit_token t from public.vol_signups where competition_id = '${VC}'`))[0].t;
ok(vtok && vtok.length >= 60, "every sign-up has a long secret link token");
ok((await signup({ token: "wrong", name: "x y", choices: [{ session_id: s1.id, role_id: rTable }] }))?.includes("bad_token"), "a wrong token is refused");
ok(!(await signup({ token: vtok, name: "Vic V Changed", email: "ignored@x.com", choices: [{ session_id: s1.id, role_id: rTable }, { session_id: s2.id, role_id: rSetupCrew }] })) && lastSignup.edited === true && lastSignup.email === "vic@x.com" && lastSignup.lines.length === 2, "with the token they can change their answers (the email stays theirs): " + JSON.stringify(lastSignup).slice(0, 160));
await db.exec("set role anon");
const fm2 = (await q(`select public.volunteer_form('vol-open', $1) f`, [vtok]))[0].f;
ok(fm2.mine && fm2.mine.name === "Vic V Changed" && fm2.mine.choices.length === 2 && fm2.mine.tshirt === "L", "the form can be filled in with their own answers from the token");
ok((await q(`select public.volunteer_form('vol-open', 'nope') f`))[0].f.bad_token === true && !(await q(`select public.volunteer_form('vol-open') f`))[0].f.mine, "a wrong token gives nothing, and no token shows no answers");
ok(!(await can(`select public.volunteer_signup('{}'::jsonb)`)) && !(await can(`select public.volunteer_link('vol-open', 'vic@x.com')`)), "the public cannot call the sign-up or link functions directly (only our server can)");
await db.exec("reset role");
const lk = (await q(`select public.volunteer_link('vol-open', 'VIC@x.com') r`))[0].r, lk2 = (await q(`select public.volunteer_link('vol-open', 'nobody@x.com') r`))[0].r;
ok(lk.found === true && lk.token === vtok && lk2.found === false, "the link lookup finds a sign-up by email, and says so when there is none");
await db.exec("reset role");
su = await q(`select s.full_name, (select count(*)::int from public.vol_signup_roles r where r.signup_id = s.id) n from public.vol_signups s where competition_id = '${VC}'`);
ok(su.length === 1 && su[0].full_name === "Vic V Changed" && su[0].n === 2, "still one person, now with two choices");
// referees: a roster with levels, shown on the rota
await db.exec(`insert into public.vol_referees (name, email, level) values ('Rhea Referee', 'rhea@x.com', 'bp_national')`);
ok(!(await q(`select 1 from public.vol_referees where lower(name) = 'rhea referee'`)).length === false, "the referee roster stores a level");
await db.exec("set role anon"); ok(!(await can(`select * from public.vol_referees`)), "the public cannot read the referee roster"); await db.exec("reset role");
ok((await q(`select count(*)::int n from public.vol_people where email = 'vic@x.com'`))[0].n === 1, "and in the people list");
// the public cannot read people's details
await db.exec("set role anon");
ok(!(await can(`select * from public.vol_signups`)) && !(await can(`select * from public.vol_people`)) && !(await can(`select * from public.vol_places`)), "the public cannot read sign-ups, people or places");
// the rota: nothing public until published, then names only
await db.exec("reset role");
const [pl] = await q(`select id from public.vol_places where vol_session_id = '${s1.id}' and role_id = '${rMc}' limit 1`);
await db.exec(`update public.vol_places set person_name = 'Mia MC', email = 'mia@x.com', level = 'British Powerlifting National referee' where id = '${pl.id}'`);
await db.exec("set role anon");
ok((await db.query(`select * from public.rota_public where competition_id = '${VC}'`)).rows.length === 0, "an unpublished rota shows nothing");
await db.exec("reset role"); await db.exec(`update public.vol_rota set status = 'published' where competition_id = '${VC}'`); await db.exec("set role anon");
const pub = (await db.query(`select * from public.rota_public where competition_id = '${VC}'`)).rows;
ok(pub.length === 1 && pub[0].name === "Mia MC" && pub[0].role === "MC" && pub[0].level === "British Powerlifting National referee" && !("email" in pub[0]) && !("mobile" in pub[0]), "the published rota shows names, roles and levels, with no emails or mobile numbers");
await db.exec("reset role");
const prevRows = async (who) => asUser(who, async () => { try { return (await db.query(`select * from public.rota_preview('${VC}')`)).rows; } catch (e) { return { error: e.message }; } });
await db.exec(`update public.vol_rota set status = 'draft' where competition_id = '${VC}'`);
ok((await prevRows(U.entries)).length === 1 && (await prevRows(U.editor)).error?.includes("forbidden"), "the entries team can preview a draft rota; an editor cannot");
// the entries team manages everything; an editor cannot
await db.exec("reset role"); await db.query(`select set_config('request.uid','${U.entries}',false)`); await db.exec("set role authenticated");
ok(await can(`update public.vol_places set person_name = 'Someone' where id = '${pl.id}'`) && (await q(`select count(*)::int n from public.vol_signups`))[0].n >= 1, "the entries team can read sign-ups and edit places");
await db.exec("reset role"); await db.query(`select set_config('request.uid','${U.editor}',false)`); await db.exec("set role authenticated");
ok((await q(`select count(*)::int n from public.vol_signups`))[0].n === 0, "an editor sees no sign-ups");
await db.exec("reset role");

// ---- volunteer points: ledger, expiry, tick-off, adjustments, import ----
await db.exec("reset role");
const bal = async (e, at = "now()") => (await q(`select public.points_balance('${e}', ${at}) b`))[0].b;
const pe = async (fn, who, arg) => asUser(who, async () => { try { return (await db.query(`select public.${fn}($1::jsonb) r`, [JSON.stringify(arg)])).rows[0].r; } catch (e) { return { error: e.message }; } });
await db.exec(`insert into public.vol_people (email, full_name) values ('fifo@x.com','Fifo Person'), ('vic@x.com','Vic V Changed') on conflict (email) do nothing`);
// earned 3 points two years and a month ago (expired), 2 a year ago, 1 last month; spent 1 six months ago: the spend uses the oldest unexpired lot
await db.exec(`insert into public.points_ledger (email, delta, reason, kind, earned_at) values
  ('fifo@x.com', 3, 'old', 'import', now() - interval '25 months'),
  ('fifo@x.com', 2, 'a year ago', 'import', now() - interval '12 months'),
  ('fifo@x.com', 1, 'last month', 'import', now() - interval '1 month'),
  ('fifo@x.com', -1, 'spent', 'spent', now() - interval '6 months')`);
ok((await bal("fifo@x.com")) === 3, "points expire 24 months after earning, and a spend uses the oldest live lot first (it took one from the 25 month old lot, which was still live six months ago): balance " + (await bal("fifo@x.com")));
ok((await bal("fifo@x.com", "now() - interval '7 months'")) === 5 - 0, "balance as it was seven months ago (the 25 month old points were still live): " + (await bal("fifo@x.com", "now() - interval '7 months'")));
await db.exec(`insert into public.points_ledger (email, delta, reason, kind, earned_at) values ('fifo@x.com', 1, 'soon', 'import', now() - interval '23 months 20 days')`);
const ov = (await asUser(U.entries, async () => (await db.query(`select * from public.points_overview() where email = 'fifo@x.com'`)).rows))[0];
ok(ov && ov.balance === 4 && ov.expiring === 1 && ov.earned === 7 && ov.spent === 1, "the overview shows balance, what is about to expire, and totals: " + JSON.stringify(ov));
ok((await asUser(U.editor, async () => { try { await db.query(`select * from public.points_overview()`); return "ok"; } catch (e) { return e.message; } })).includes("forbidden"), "an editor cannot see the overview");
// tick-off on the day
const placeOf = async (sid, rid, n = 1) => (await q(`select id from public.vol_places where vol_session_id = '${sid}' and role_id = '${rid}' and position = ${n}`))[0].id;
await db.exec(`update public.vol_places set person_name = 'Vic V Changed', email = 'vic@x.com' where id = '${await placeOf(s1.id, rMc)}'`);
const plMc = await placeOf(s1.id, rMc);
const mark = (st, who = U.entries) => asUser(who, async () => { try { return (await db.query(`select public.vol_mark($1::uuid, $2) r`, [plMc, st])).rows[0].r; } catch (e) { return { error: e.message }; } });
ok((await mark("arrived", U.editor)).error?.includes("forbidden"), "an editor cannot tick people off");
let m = await mark("arrived");
ok(m.points === 1 && (await bal("vic@x.com")) === 1, "arrived: they earn the role's point");
ok((await mark("arrived")).points === 0 && (await bal("vic@x.com")) === 1, "ticking arrived twice does not pay twice");
await mark("planned"); ok((await bal("vic@x.com")) === 0, "undoing arrived takes the point back");
await mark("arrived");
await asUser(U.entries, () => pe("points_adjust", U.entries, { email: "vic@x.com", delta: 4, reason: "Thank you for the extra work" }));
ok((await bal("vic@x.com")) === 5, "a manual thank-you adds points");
m = await mark("no_show");
ok(m.points === -4 && (await bal("vic@x.com")) === 0, "no show: this place stops counting and they lose the rest of their balance too, so nothing is left (" + JSON.stringify(m) + ")");
await mark("cancelled"); ok((await bal("vic@x.com")) === 4, "undoing a no-show gives the forfeited points back");
await mark("no_show"); await mark("planned"); await mark("cancelled");
ok((await q(`select status from public.vol_places where id = '${plMc}'`))[0].status === "cancelled" && (await bal("vic@x.com")) === 4, "told us in advance (cancelled): no points lost");
// adjustments: take away, never below zero, reason needed
let adj = await pe("points_adjust", U.entries, { email: "vic@x.com", delta: -2, reason: "Half price BP membership (5)" });
ok(adj.balance === 2, "taking points away (a spend) lowers the balance: " + JSON.stringify(adj));
ok((await pe("points_adjust", U.entries, { email: "vic@x.com", delta: -9, reason: "x" })).error?.includes("insufficient"), "cannot spend more than the balance");
ok((await pe("points_adjust", U.entries, { email: "vic@x.com", delta: 1, reason: "" })).error?.includes("invalid:reason"), "a reason is required");
ok((await pe("points_adjust", U.entries, { email: "new@x.com", delta: 1, reason: "r" })).error?.includes("invalid:name"), "a new person needs a name");
ok((await pe("points_adjust", U.editor, { email: "vic@x.com", delta: 1, reason: "r" })).error?.includes("forbidden"), "only the entries team can adjust points");
// the ledger is append only and shows who did what
await asUser(U.entries, async () => {
  ok(!(await can(`update public.points_ledger set delta = 99`)) && !(await can(`delete from public.points_ledger`)), "nobody can change or delete a ledger row");
});
ok((await q(`select count(*)::int n from public.points_ledger where email = 'vic@x.com' and created_by <> ''`))[0].n >= 3, "rows record who made them");
// import: safe to run twice, sums match
const imp = { rows: [{ key: "r1:a", email: "imp@x.com", name: "Imp One", date: "2025-03-01", delta: 2, reason: "Volunteered: March Open" }, { key: "r1:b", email: "imp@x.com", name: "Imp One", date: "2025-04-12", delta: -1, reason: "Spent: NESC" }, { key: "r2:a", email: "BAD", date: "2025-03-01", delta: 1, reason: "x" }] };
let ir = await pe("points_import", U.entries, imp);
ok(ir.inserted === 2 && ir.skipped === 1 && (await bal("imp@x.com")) === 1, "import adds the rows and skips the bad one: " + JSON.stringify(ir));
ir = await pe("points_import", U.entries, imp); ok(ir.inserted === 0 && (await bal("imp@x.com")) === 1, "importing the same sheet again changes nothing");
// helpers at a competition we did not staff
const hp = await pe("points_award_helpers", U.entries, { competition_id: VC, rows: [{ name: "Hal Helper", email: "hal@x.com", points: 2 }, { name: "No Email", email: "" }] });
ok(hp.awarded === 1 && hp.skipped === 1 && (await bal("hal@x.com")) === 2, "helpers at a franchise competition earn points once: " + JSON.stringify(hp));
ok((await pe("points_award_helpers", U.entries, { competition_id: VC, rows: [{ name: "Hal Helper", email: "hal@x.com", points: 2 }] })).awarded === 0, "and not twice");
// the public list is names and points only
await db.exec("set role anon");
const pubPts = (await db.query(`select * from public.points_public_list() order by points desc`)).rows;
ok(pubPts.length >= 3 && Object.keys(pubPts[0]).sort().join() === "name,points" && !pubPts.some((x) => x.points <= 0), "the public points list shows names and points only, never zero: " + JSON.stringify(pubPts[0]));
ok(!(await can(`select public.points_balance('vic@x.com')`)) && !(await can(`select * from public.points_ledger`)), "the public cannot read the ledger or call balances");
await db.exec("reset role");


// ---- stage 3: priority links from points, points spent when an entry is confirmed, self-service discount codes
const PC = "a3a3a3a3-0000-4000-8000-000000000003";
await db.exec(`update public.entry_settings set priority_from_points = false where competition_id = '${PR}'`);          // the earlier priority tests keep their own people
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method,entry_opens) values ('${PC}','Points Open','2027-05-15',50,true,'points-open','yne', now() + interval '10 hours');
 insert into public.entry_settings (competition_id) values ('${PC}');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values ('${PC}',1,'Full power','full_power',null,6000);
 select public.points_insert('pat@x.com', 5, 'Volunteered: test', 'earned', now(), null, null, 'p3:a');
 select public.points_insert('old@x.com', 1, 'Volunteered: long ago', 'earned', now() - interval '3 years', null, null, 'p3:b');
 insert into public.vol_people (email, full_name) values ('pat@x.com', 'Pat Helper') on conflict do nothing;`);
await db.exec(`insert into public.invites (competition_id, email, full_name) values ('${PC}', 'man@x.com', 'Manual Person');
 select public.points_insert('man@x.com', 3, 'Volunteered: test', 'earned', now(), null, null, 'p3:c');`);
const s3_n = (await q(`select public.priority_fill() n`))[0].n;
ok(s3_n >= 1 && (await q(`select email from public.invites where competition_id = '${PC}' and from_points order by email`)).every((x) => x.email !== "old@x.com" && x.email !== "man@x.com") && (await q(`select 1 from public.invites where competition_id = '${PC}' and email = 'pat@x.com' and from_points`)).length === 1, "priority_fill: people with an unexpired point and no link already get one (pat), not an expired one (old) or a hand-made one (man)");
ok((await q(`select public.priority_fill() n`))[0].n === 0, "and running it again adds nobody");
let invs = (await q(`select email, from_points, token_hash from public.invites where competition_id = '${PC}' order by email`));
ok(invs.length >= 2 && invs.find((x) => x.email === "pat@x.com").from_points && !invs.find((x) => x.email === "man@x.com").from_points && invs.every((x) => !x.token_hash), "priority list: pat from points, the hand-made one unchanged, both waiting to be sent");
ok((await q(`select public.priority_competitions() r`))[0].r.includes(PC), "the timer picks the competition up");
const s3_patInv = (await q(`select id from public.invites where competition_id='${PC}' and email='pat@x.com'`))[0].id;
await q(`select public.priority_issue('${s3_patInv}', $1)`, [await hash("pat-token")]);
const s3_manInv = (await q(`select id from public.invites where competition_id='${PC}' and email='man@x.com'`))[0].id;
await q(`select public.priority_issue('${s3_manInv}', $1)`, [await hash("man-token")]);
const s3_sp = (o) => q(`select public.start_entry($1::jsonb) r`, [JSON.stringify({ ...good, competition_id: PC, ...o })]).then((r) => r[0].r).catch((e) => ({ error: e.message }));
const s3_e1 = await s3_sp({ email: "pat@x.com", full_name: "Pat Helper", invite: "pat-token" });
ok(s3_e1.entry_id && s3_e1.price_pence === 6000, "pat enters with their link before general entry opens: " + JSON.stringify(s3_e1));
ok((await bal("pat@x.com")) === 5, "nothing is spent while the entry is only started");
ok((await q(`select public.confirm_entry_payment('${s3_e1.entry_id}') r`))[0].r === "paid" && (await bal("pat@x.com")) === 4, "confirmed: the priority link costs one point");
await q(`select public.confirm_entry_payment('${s3_e1.entry_id}')`);
ok((await bal("pat@x.com")) === 4 && (await q(`select count(*)::int n from public.points_ledger where import_key like 'priority:%'`))[0].n === 1, "confirming again does not spend it twice");
const s3_e2 = await s3_sp({ email: "man@x.com", full_name: "Manual Person", invite: "man-token", date_of_birth: "1991-02-03" });
await q(`select public.confirm_entry_payment('${s3_e2.entry_id}')`);
ok((await bal("man@x.com")) === 3, "a link made by hand costs no points");
// self-service: ask for a code, look at the options, turn points into a discount code
const s3_lg = async (email, code) => q(`select public.points_login_start($1, $2) r`, [email, await hash(code)]).then((r) => r[0].r);
ok((await s3_lg("pat@x.com", "111111")).send === true && (await s3_lg("nobody@x.com", "222222")).send === false && (await s3_lg("not an email", "3")).ok === false, "a code is only made for an address with points history, and the answer tells a stranger nothing");
const s3_opt = async (email, code) => q(`select public.points_options($1, $2) r`, [email, await hash(code)]).then((r) => r[0].r);
ok((await s3_opt("pat@x.com", "999999")).ok === false, "a wrong code shows nothing");
let s3_o1 = await s3_opt("pat@x.com", "111111");
ok(s3_o1.ok && s3_o1.balance === 4 && s3_o1.reserved === 0 && s3_o1.available === 4 && s3_o1.competitions.some((x) => x.id === PC), "the right code shows balance, points set aside and what is free: " + JSON.stringify({ ...s3_o1, competitions: s3_o1.competitions.length }));
const PD = "a3a3a3a3-0000-4000-8000-000000000004";
await db.exec(`insert into public.competitions (id,name,start_date,capacity,published,slug,entry_method,entry_opens) values ('${PD}','Discount Open','2027-07-10',50,true,'discount-open','yne', now() - interval '1 day');
 insert into public.entry_settings (competition_id) values ('${PD}');
 insert into public.price_rules (competition_id,sort_order,label,event,age_category,price_pence) values ('${PD}',1,'Full power','full_power',null,6000);`);
const s3_rd = async (email, code, comp, steps) => q(`select public.points_redeem($1, $2, $3::uuid, $4) r`, [email, await hash(code), comp, steps]).then((r) => r[0].r).catch((e) => ({ error: e.message }));
ok((await s3_rd("pat@x.com", "111111", PD, 2)).error === "points", "£40 needs 8 points: refused when there are only 4");
const s3_red = await s3_rd("pat@x.com", "111111", PD, 1);
ok(s3_red.ok && s3_red.discount_pence === 2000 && s3_red.points === 4 && /^PAT/.test(s3_red.code) && s3_red.available_after === 0, "4 points buy a £20 code: " + JSON.stringify(s3_red));
ok((await s3_opt("pat@x.com", "111111")).ok === false, "the emailed code works once");
const s3_dc = (await q(`select recipient_email, points_cost, kind, value, max_uses, competition_id from public.discount_codes where code = $1`, [s3_red.code]))[0];
ok(s3_dc.recipient_email === "pat@x.com" && s3_dc.points_cost === 4 && s3_dc.kind === "amount" && s3_dc.value === 2000 && s3_dc.max_uses === 1 && s3_dc.competition_id === PD, "the code is for that person, that competition, once");
await s3_lg("pat@x.com", "333333"); ok((await s3_opt("pat@x.com", "333333")).available === 0 && (await s3_opt("pat@x.com", "333333")).reserved === 4, "points in an unused code are set aside, so they cannot be spent twice");
ok((await bal("pat@x.com")) === 4, "but the balance only drops when the code is used");
await db.exec(`update public.competitions set entry_opens = now() - interval '1 hour' where id = '${PC}'`);
const s3_e3 = await s3_sp({ competition_id: PD, email: "pat@x.com", full_name: "Pat Helper", discount_code: s3_red.code, date_of_birth: "1992-01-01" });
ok(s3_e3.price_pence === 4000 && s3_e3.discount_pence === 2000, "the code takes £20 off: " + JSON.stringify(s3_e3));
ok((await bal("pat@x.com")) === 4, "still not spent: the entry is not confirmed");
await q(`select public.confirm_entry_payment('${s3_e3.entry_id}')`);
ok((await bal("pat@x.com")) === 0 && (await q(`select points_spent_at from public.discount_codes where code = $1`, [s3_red.code]))[0].points_spent_at, "confirmed: the 4 points come off");
// five wrong tries lock a code; five requests an hour is the limit
await s3_lg("pat@x.com", "444444"); for (let i = 0; i < 5; i++) await s3_opt("pat@x.com", "wrong" + i);
ok((await s3_opt("pat@x.com", "444444")).ok === false, "five wrong tries lock the code");
await db.exec(`delete from public.points_login`); for (let i = 0; i < 5; i++) await s3_lg("pat@x.com", "c" + i);
ok((await s3_lg("pat@x.com", "c9")).error === "rate", "no more than five codes an hour for one address");
await db.exec("set role anon");
ok(!(await can(`select public.priority_fill()`)) && !(await can(`select public.points_options('pat@x.com', 'x')`)) && !(await can(`select public.points_redeem('pat@x.com', 'x', '${PC}', 1)`)) && !(await can(`select public.points_login_start('pat@x.com', 'x')`)) && !(await can(`select * from public.points_login`)), "the public cannot call any of these, or read the codes");
await db.exec("reset role");


// ---- edit a volunteer: name, mobile, T-shirt, email
const vu = (who, arg) => pe("vol_person_update", who, arg);
await db.exec(`insert into public.vol_people (email, full_name, mobile) values ('edit@x.com', 'Edd Old', '07000') on conflict do nothing;
 select public.points_insert('edit@x.com', 3, 'Volunteered: test', 'earned', now(), null, null, 'v21:a');
 insert into public.vol_signups (competition_id, email, full_name, mobile) values ('${VC}', 'edit@x.com', 'Edd Old', '07000');
 insert into public.discount_codes (code, recipient_email, kind, value, points_cost) values ('EDD-20OFF-AAAAAA', 'edit@x.com', 'amount', 2000, 4);`);
ok((await vu(U.editor, { email: "edit@x.com", full_name: "X" })).error?.includes("forbidden"), "only the entries team can edit a volunteer");
let vr = await vu(U.entries, { email: "edit@x.com", full_name: "Edd New" });
ok(vr.name === "Edd New" && !vr.email_changed && (await q(`select full_name from public.vol_signups where email = 'edit@x.com'`))[0].full_name === "Edd New" && (await q(`select full_name from public.vol_people where email = 'edit@x.com'`))[0].full_name === "Edd New", "a new name shows on the person and their sign-ups: " + JSON.stringify(vr));
ok((await vu(U.entries, { email: "edit@x.com", full_name: "E" })).error?.includes("invalid:name") && (await vu(U.entries, { email: "edit@x.com", new_email: "nope", full_name: "Edd New" })).error?.includes("invalid:email") && (await vu(U.entries, { email: "ghost@x.com", full_name: "Ghost Person" })).error?.includes("not_found"), "names and emails are checked, and an unknown person is refused");
ok((await vu(U.entries, { email: "edit@x.com", new_email: "pat@x.com", full_name: "Edd New" })).error?.includes("exists"), "an email that already belongs to someone else is refused");
vr = await vu(U.entries, { email: "edit@x.com", new_email: " Edd.New@X.com ", full_name: "Edd New", mobile: "07111", tshirt: "L" });
ok(vr.email === "edd.new@x.com" && vr.email_changed && vr.balance === 3, "a new email keeps the points: " + JSON.stringify(vr));
ok((await q(`select count(*)::int n from public.points_ledger where email = 'edit@x.com'`))[0].n === 0 && (await q(`select count(*)::int n from public.points_ledger where email = 'edd.new@x.com'`))[0].n === 1, "the history moves with them");
ok((await q(`select mobile, tshirt from public.vol_signups where email = 'edd.new@x.com'`))[0].tshirt === "L" && (await q(`select recipient_email from public.discount_codes where code = 'EDD-20OFF-AAAAAA'`))[0].recipient_email === "edd.new@x.com", "sign-ups and an unused discount code follow the new address");
ok((await q(`select count(*)::int n from public.audit_log where table_name = 'vol_people' and row_id = 'edit@x.com' and actor_email = 'entries@example.com'`))[0].n >= 2, "each change is in the audit log with who made it");

// ---- committee points: tick the box, 3 points at each quarter end from 31 Dec 2026, once, only if in post on the last day
await db.exec(`insert into public.vol_people (email, full_name) values ('cm1@x.com', 'Cam One'), ('cm2@x.com', 'Cam Two'), ('cm3@x.com', 'Cam Three') on conflict do nothing;`);
const cp = (d) => q(`select public.committee_points_award($1::date) r`, [d]).then((r) => r[0].r);
ok((await vu(U.entries, { email: "cm1@x.com", full_name: "Cam One", committee: true })).email === "cm1@x.com" && (await q(`select committee, committee_from is not null f, committee_until from public.vol_people where email = 'cm1@x.com'`))[0].f, "ticking the box starts committee service today");
await vu(U.entries, { email: "cm2@x.com", full_name: "Cam Two", committee: true });
ok((await cp("2026-12-30")).awarded === 0, "nothing before the end of this quarter (31 December 2026)");
await db.exec(`update public.vol_people set committee_from = '2026-11-01' where email in ('cm1@x.com', 'cm2@x.com')`);
let cr1 = await cp("2026-12-31");
ok(cr1.awarded === 2 && (await bal("cm1@x.com")) === 3 && (await q(`select reason, earned_at::date d from public.points_ledger where email = 'cm1@x.com' and import_key like 'committee:%'`))[0].reason === "Committee service: Q4 2026", "on 31 December each ticked member gets 3 points: " + JSON.stringify(cr1));
ok((await cp("2027-01-15")).awarded === 0 && (await bal("cm1@x.com")) === 3, "running it again awards nothing twice");
await vu(U.entries, { email: "cm2@x.com", full_name: "Cam Two", committee: false });
await vu(U.entries, { email: "cm3@x.com", full_name: "Cam Three", committee: true });
await db.exec(`update public.vol_people set committee_from = '2027-04-02' where email = 'cm3@x.com'; update public.vol_people set committee_until = '2027-03-30' where email = 'cm2@x.com'`);
let cr2 = await cp("2027-06-30");
ok(cr2.people.map((x) => x.email + x.quarter).sort().join() === "cm1@x.comQ1 2027,cm1@x.comQ2 2027,cm3@x.comQ2 2027", "a missed quarter is caught up, someone who left before the quarter end gets nothing, a new member starts at the next quarter end: " + JSON.stringify(cr2.people));
ok((await bal("cm2@x.com")) === 3 && (await bal("cm1@x.com")) === 9, "balances add up");
const nm = await vu(U.entries, { email: "brand.new@x.com", full_name: "Brand New", committee: true, create: true });
ok(nm.email === "brand.new@x.com" && (await q(`select committee from public.vol_people where email = 'brand.new@x.com'`))[0].committee === true, "a committee member who has never volunteered can be added");
ok((await vu(U.entries, { email: "ghost2@x.com", full_name: "Ghost Two" })).error?.includes("not_found"), "without the create flag an unknown person is still refused");
await db.exec("set role anon"); ok(!(await can(`select public.committee_points_award('2027-01-01')`)), "the public cannot award points"); await db.exec("reset role");

// ---- give an unused code's points back
await db.exec(`select public.points_insert('rel@x.com', 8, 'Volunteered: test', 'earned', now(), null, null, 'r22:a'); insert into public.vol_people (email, full_name) values ('rel@x.com', 'Rel Ease') on conflict do nothing;`);
const rl_lg = async (c) => q(`select public.points_login_start('rel@x.com', $1) r`, [await hash(c)]);
await rl_lg("888888");
const rl_a = await q(`select public.points_redeem('rel@x.com', $1, '${PD}'::uuid, 1) r`, [await hash("888888")]).then((r) => r[0].r);
await rl_lg("888888b");
const rl_o = await q(`select public.points_options('rel@x.com', $1) r`, [await hash("888888b")]).then((r) => r[0].r);
ok(rl_a.ok && rl_o.available === 4 && rl_o.reserved === 4 && rl_o.codes.length === 1 && rl_o.codes[0].code === rl_a.code && rl_o.codes[0].points === 4 && rl_o.codes[0].competition === "Discount Open", "an unused code is listed with the points it holds: " + JSON.stringify(rl_o.codes));
const release = async (id, c) => q(`select public.points_release('rel@x.com', $1, $2::uuid) r`, [await hash(c), id]).then((r) => r[0].r);
ok((await release(rl_o.codes[0].id, "000000")).error === "code", "releasing needs the emailed code");
const rl_done = await release(rl_o.codes[0].id, "888888b");
ok(rl_done.ok && rl_done.points === 4 && rl_done.available === 8 && rl_done.balance === 8, "releasing frees the points, nothing is spent: " + JSON.stringify(rl_done));
ok((await release(rl_o.codes[0].id, "888888b")).error === "not_found", "and it cannot be done twice");
ok((await q(`select active from public.discount_codes where code = $1`, [rl_a.code]))[0].active === false && (await bal("rel@x.com")) === 8, "the code is off and the balance is untouched");
await rl_lg("999999");
const rl_b = await q(`select public.points_redeem('rel@x.com', $1, '${PD}'::uuid, 1) r`, [await hash("999999")]).then((r) => r[0].r);
const rl_e = await s3_sp({ competition_id: PD, email: "rel@x.com", full_name: "Rel Ease", discount_code: rl_b.code, date_of_birth: "1993-05-05" });
await rl_lg("121212");
const rl_o2 = await q(`select public.points_options('rel@x.com', $1) r`, [await hash("121212")]).then((r) => r[0].r);
ok(rl_e.entry_id && rl_o2.codes.length === 0 && (await release((await q(`select id from public.discount_codes where code = $1`, [rl_b.code]))[0].id, "121212")).error === "in_use", "a code that is on an entry cannot be released");
await q(`select public.confirm_entry_payment('${rl_e.entry_id}')`);
ok((await bal("rel@x.com")) === 4, "once the entry is confirmed the points are spent and stay spent");
// a code nobody uses gives its points back by itself when it expires
await rl_lg("343434");
const rl_c = await q(`select public.points_redeem('rel@x.com', $1, '${PC}'::uuid, 1) r`, [await hash("343434")]).then((r) => r[0].r);
await db.exec(`update public.discount_codes set expires_at = now() - interval '1 minute' where code = '${rl_c.code}'`);
await db.exec("delete from public.points_login"); await rl_lg("565656");
ok((await q(`select public.points_options('rel@x.com', $1) r`, [await hash("565656")]).then((r) => r[0].r)).available === 4, "an expired unused code holds nothing: the points are free again");
// who may do what
await db.exec("set role anon");
ok(!(await can(`select public.waitlist_join('{}'::jsonb)`)) && !(await can(`select public.waitlist_sweep('${W}')`)) && !(await can(`select public.waitlist_make_offer('${W}'::uuid, 'x')`)), "the public cannot call the waiting list functions (only our server can)");
await db.exec("reset role");
const target = await wid("d@x.com");
await db.query(`select set_config('request.uid','${U.editor}',false)`); await db.exec("set role authenticated");
ok(!(await can(`select public.waitlist_remove('${target}')`)), "an editor cannot remove someone from the list");
await db.exec("reset role"); await db.query(`select set_config('request.uid','${U.entries}',false)`); await db.exec("set role authenticated");
ok(await can(`select public.waitlist_remove('${target}')`), "the entries team can");
await db.exec("reset role");
ok((await state("d@x.com")) === "removed" && (await cands()).every((x) => x.email !== "d@x.com"), "a removed person is never offered a place");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
