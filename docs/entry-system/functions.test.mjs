// Tests for the pure helpers in the payment functions (signature check, error words, email text).
//   node --experimental-strip-types docs/entry-system/functions.test.mjs
import crypto from "node:crypto";
import assert from "node:assert";
// The email builders now return a description of the email. These tests read the plain text version that would be sent.
const asText = (mod) => new Proxy(mod, { get: (m, k) => (typeof m[k] === "function" && /(Email|Notification)$/.test(String(k)) ? (...a) => m.renderEmail(m[k](...a)).text : m[k]) });
const wh = asText(await import("../../supabase/functions/stripe-webhook/index.ts"));
const co = asText(await import("../../supabase/functions/entry-checkout/index.ts"));
const secret = "whsec_test", body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
assert(await wh.verifySignature(body, `t=${t},v1=${sig}`, secret), "good signature accepted");
assert(!(await wh.verifySignature(body + " ", `t=${t},v1=${sig}`, secret)), "tampered body refused");
assert(!(await wh.verifySignature(body, `t=${t},v1=${sig}`, "other")), "wrong secret refused");
assert(!(await wh.verifySignature(body, `t=${t},v1=${sig}`, secret, Date.now() + 600000)), "old message refused");
assert(!(await wh.verifySignature(body, "nonsense", secret)), "garbage refused");
assert.equal(co.errorCode("P0001: ERROR: invalid:guardian\nCONTEXT: x"), "invalid:guardian");
assert.equal(co.errorCode("boom"), "unknown");
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: true, entriesEmail: "x" }).includes("A parent or guardian needs to be with you"));
assert(!wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x" }).includes("parent or guardian"));
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x", refundsUntil: "Saturday 20 February 2027 at 12:00" }).includes("Refunds are available until entries close on Saturday 20 February 2027"), "refund rule is in the email");
assert(co.MESSAGES.duplicate_bp && co.MESSAGES["invalid:openipf"], "new error words exist");
assert.equal(wh.ageCategory(2010, 2027), "Sub-junior"); assert.equal(wh.ageCategory(2008, 2027), "Junior"); assert.equal(wh.ageCategory(1990, 2027), "Open");
assert.equal(wh.ageCategory(1987, 2027), "Masters 1 (M1)"); assert.equal(wh.ageCategory(1977, 2027), "Masters 2 (M2)"); assert.equal(wh.ageCategory(1950, 2027), "Masters 4 (M4)");
assert.equal(wh.exactAge("2009-12-31", "2027-03-13"), 17, "17 on the day, although a sub-junior by year (turns 18 in 2027)");
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x", category: "Masters 2 (M2)" }).includes("Category: Masters 2 (M2)"), "category in the email");
// ---- the club list importer, on small samples shaped like the two websites
const sc = await import("../../supabase/functions/sync-clubs/index.ts");
const cell = (c) => `<td class="x wixui-table__cell"><div class="a"><div class="g0">${c}</div></div></td>`;
const epaHtml = `<table><tr>${cell("IronHQ ")}${cell("Club Contact: Luke Club Email: a@b.co Club Phone: 07")}</tr><tr>${cell("Roundy Strength &amp; Fitness")}${cell("Message Details: Club Contact: Dane")}</tr><tr>${cell("Not a club")}${cell("Something else")}</tr></table>`;
assert.deepEqual(sc.parseEpaAffiliated(epaHtml), ["IronHQ", "Roundy Strength & Fitness"], "EPA names only, entities decoded, other rows ignored");
assert(co.formEncode(co.sessionParams({ entryId: "e", email: "a@b.co", name: "A", pence: 100, competition: "C", siteUrl: "https://x.y", expiresAt: 1, slug: "2027-test" })).includes(encodeURIComponent("https://x.y/entry-thanks?c=2027-test&session_id={CHECKOUT_SESSION_ID}")), "thanks page link carries the competition");
const es = await import("../../supabase/functions/entry-status/index.ts");
assert.equal(es.statusFrom([]), "unknown", "no such payment"); assert.equal(es.statusFrom([{ status: "pending", entries: { status: "held" } }]), "pending", "not confirmed yet");
assert.equal(es.statusFrom([{ status: "succeeded", entries: { status: "paid" } }]), "paid"); assert.equal(es.statusFrom([{ status: "succeeded", entries: [{ status: "comped" }] }]), "paid", "joined rows can come as a list");
assert.equal(es.statusFrom([{ status: "succeeded", entries: { status: "refunded" } }]), "refunded");
assert(es.validSession("cs_test_a1B2c3D4e5") && !es.validSession("../etc") && !es.validSession("cs_"), "only real-looking session ids are looked up");
const rf = asText(await import("../../supabase/functions/entry-refund/index.ts"));
const P = (o) => rf.refundPlan({ entryStatus: "paid", paidPence: 4000, refundedPence: 0, refundPence: 0, cancel: true, ...o });
assert.deepEqual([P({ refundPence: 4000 }).finalStatus, P({ refundPence: 4000 }).refundPence], ["refunded", 4000], "a full refund ends the entry as refunded");
assert.equal(P({ refundPence: 1000, cancel: true }).finalStatus, "cancelled", "a part refund and cancel: cancelled");
assert.equal(P({ refundPence: 1000, cancel: false }).finalStatus, "paid", "a goodwill part refund keeps the entry");
assert.equal(P({ refundPence: 0, cancel: true }).finalStatus, "cancelled", "cancel with no refund");
assert.equal(P({ refundPence: 4000, cancel: false }).finalStatus, "refunded", "refunding everything always ends the entry, even if cancel was not asked for");
assert.equal(P({ refundPence: 3500, refundedPence: 1000 }).error, "That is more than is left to refund (30.00 pounds).", "cannot refund more than is left");
assert.equal(P({ refundPence: 3000, refundedPence: 1000 }).finalStatus, "refunded", "the last of the money ends it");
assert(P({ refundPence: 0, cancel: false }).error, "nothing to do is refused");
assert(P({ entryStatus: "cancelled", refundPence: 100 }).error && P({ entryStatus: "refunded" }).error, "an already cancelled or refunded entry cannot be changed again");
assert(P({ entryStatus: "comped", refundPence: 100 }).error, "a free entry has no payment to refund"); assert.equal(P({ entryStatus: "comped", paidPence: 0 }).finalStatus, "cancelled", "a free entry can be cancelled");
assert(P({ refundPence: -5 }).error && P({ refundPence: 12.5 }).error, "only whole positive pence");
assert(rf.refundEmail({ name: "A", competition: "C", refundedPence: 4000, cancelled: true, reason: "Injury", entriesEmail: "x" }).includes("Refunded: £40.00") && rf.refundEmail({ name: "A", competition: "C", refundedPence: 4000, cancelled: true, entriesEmail: "x" }).includes("5 to 10 working days"), "refund email");
// the confirmation email is the same whichever function sends it (a paid entry or a free one)
const sample = { name: "A", competition: "C", date: "2027-05-15", event: "Full power", equipment: "Classic", pence: 4000, under18: false, entriesEmail: "x@y.co", category: "Open", division: "South West (guest)", club: "Implexus Gym", discountPence: 2000, refundsUntil: "Saturday" };
assert.equal(co.confirmationEmail(sample), wh.confirmationEmail(sample), "both functions write the same email");
assert(co.confirmationEmail(sample).includes("Discount: £20.00 off") && co.confirmationEmail({ ...sample, discountPence: 0 }).indexOf("Discount") < 0, "the discount shows only when there is one");
assert(co.MESSAGES.discount_used && co.MESSAGES.discount_expired && co.MESSAGES.discount_not_yours && co.MESSAGES.discount_invalid, "plain words for each discount problem");
const t0 = 1_000_000; let allowed = 0; for (let i = 0; i < 12; i++) if (co.allowTry("1.2.3.4|a@b.co", t0 + i)) allowed++;
assert.equal(allowed, 8, "only 8 discount code checks in 10 minutes per address, so codes cannot be guessed"); assert(co.allowTry("1.2.3.4|a@b.co", t0 + 11 * 60 * 1000), "...and it frees up again after the window"); assert(co.allowTry("9.9.9.9|z@b.co", t0), "other addresses are not affected");
assert(es.validEntry("123e4567-e89b-12d3-a456-426614174000") && !es.validEntry("1; drop table"), "entry ids are checked");

{ // extras: separate lines on the payment page, and in both confirmation emails
  const sp = co.sessionParams({ entryId: "e", email: "a@b.co", name: "A", pence: 10049, competition: "C", siteUrl: "https://x.y", expiresAt: 1, extras: [{ name: "Photo package", pence: 4049 }] });
  assert.strictEqual(sp["line_items[0][price_data][unit_amount]"], 6000, "the entry line is the total less the extras");
  assert.strictEqual(sp["line_items[1][price_data][unit_amount]"], 4049); assert.strictEqual(sp["line_items[1][price_data][product_data][name]"], "Photo package");
  assert.strictEqual(sp["line_items[0][price_data][unit_amount]"] + sp["line_items[1][price_data][unit_amount]"], 10049, "the lines add up to the total charged");
  assert.strictEqual(co.sessionParams({ entryId: "e", email: "a@b.co", name: "A", pence: 6000, competition: "C", siteUrl: "https://x.y", expiresAt: 1 })["line_items[0][price_data][unit_amount]"], 6000, "no extras: unchanged");
  const m = { name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 10049, under18: false, entriesEmail: "x", extras: [{ name: "T-shirt", option: "Medium", pence: 2000 }, { name: "Photo package", pence: 4049 }] };
  for (const mod of [co, wh]) { const t = mod.confirmationEmail(m); assert(t.includes("Extra: T-shirt (Medium): £20.00") && t.includes("Extra: Photo package: £40.49") && t.includes("Paid: £100.49"), "extras are listed in the email"); }
  assert(!co.confirmationEmail({ ...m, extras: undefined }).includes("Extra:"), "no extras, no extra lines");
}

{ // waiting list function helpers
  const wl = asText(await import("../../supabase/functions/waitlist/index.ts"));
  const tok = wl.newToken();
  assert(/^[0-9a-f]{48}$/.test(tok) && tok !== wl.newToken(), "offer tokens are long and random");
  assert.strictEqual(await wl.sha256Hex("abc"), crypto.createHash("sha256").update("abc").digest("hex"), "the hash matches what the database computes (sha256 hex)");
  assert.strictEqual(wl.offerLink("https://www.ynepf.co.uk/", "2027-test open", "tok"), "https://www.ynepf.co.uk/enter?c=2027-test%20open&offer=tok", "the personal link");
  const who = { name: "Ann", competition: "Spring Open", date: "13 March 2027", entriesEmail: "e@x.co" };
  assert(wl.joinedEmail({ ...who, position: 3, hours: 48 }).includes("Your place in the queue: 3") && wl.joinedEmail({ ...who, position: 3, hours: 48 }).includes("48 hours"), "joined email");
  const o = wl.offerEmail({ ...who, link: "https://x/enter?c=a&offer=b", expiresAt: "2027-01-02T12:00:00Z" });
  assert(o.includes("https://x/enter?c=a&offer=b") && /Saturday,? 2 January 2027 at 12:00/.test(o), "offer email has the link and the deadline in UK time: " + o);
  assert(wl.reminderEmail({ ...who, expiresAt: "2027-07-02T12:00:00Z", slug: "a", siteUrl: "https://x" }).includes("2 July 2027 at 13:00"), "summer deadlines are shown in British Summer Time");
  assert(wl.expiredEmail({ ...who, slug: "a", siteUrl: "https://x/" }).includes("https://x/enter?c=a"), "expired email says how to rejoin");
  const pn = wl.prioritySentNotification({ competition: "March Open", sent: [{ name: "Ann Lee", email: "ann@x.com" }, { name: "", email: "bob@x.com" }], failed: [{ name: "Cy", email: "cy@x.com" }], deskUrl: "https://x/admin" });
  assert(pn.includes("emailed to 2 people") && pn.includes("- Ann Lee <ann@x.com>") && pn.includes("- <bob@x.com>") && pn.includes("Could not be sent to 1") && pn.includes("https://x/admin"), "priority sent note lists who got a link and who failed");
  assert(wl.prioritySentNotification({ competition: "X", sent: [], failed: [] }).includes("- nobody"), "an empty list says nobody");
  const ve = wl.volunteerSignupEmail({ ...who, lines: ["Session 1: MC, Table", "Set up: Set up crew"], link: wl.volunteerLink("https://x/", "open-comp", "tok123"), edited: false });
  assert(ve.includes("Session 1: MC, Table") && ve.includes("https://x/volunteer?c=open-comp&edit=tok123") && ve.includes("lose your volunteer points"), "volunteer confirmation lists their roles, has their link and the no-show rule");
  assert(wl.volunteerSignupEmail({ ...who, lines: [], link: "l", edited: true }).includes("have been updated"), "an edit says updated");
  assert(wl.volunteerLinkEmail({ ...who, link: "https://x/l" }).includes("https://x/l") && wl.volunteerNotification({ name: "Vic", email: "v@x.com", competition: "C", lines: ["S1: MC"], edited: true }).includes("changed their answers"), "link email and inbox note");
  assert(wl.pointsCodeEmail({ name: "Pat", code: "123456" }).includes("123 456") && wl.pointsDiscountEmail({ name: "Pat", code: "PAT-20OFF-X", competition: "C", pounds: 20, points: 4, link: "https://x/e" }).includes("PAT-20OFF-X") && wl.pointsRedeemedNotification({ name: "Pat", email: "p@x.com", competition: "C", pounds: 20, points: 4, code: "PAT-20OFF-X" }).includes("p@x.com"), "points emails carry the code");
  assert(wl.committeePointsNotification({ people: [{ name: "Cam", email: "c@x.com", quarter: "Q4 2026" }] }).includes("Q4 2026: 1 PERSON"), "the committee points note groups by quarter");
  assert(wl.pointsReleasedNotification({ name: "Pat", email: "p@x.com", competition: "C", points: 4, code: "PAT-20OFF-X" }).includes("free to spend again"), "the release note says the points are free");
  assert(wl.priorityEmail({ name: "Pat", competition: "C", link: "https://x/l", windowStart: "2027-01-01T09:00:00Z", points: true }).includes("costs 1 volunteer point") && !wl.priorityEmail({ name: "Pat", competition: "C", link: "https://x/l", windowStart: "2027-01-01T09:00:00Z" }).includes("volunteer point"), "the priority email mentions the point only for links made from points");
  assert(wl.volunteerCode("ERROR: exists") === "exists" && wl.volunteerCode('{"message":"bad_token"}') === "bad_token" && wl.volunteerCode("boom") === "unknown", "errors are mapped to messages");
  const lo1 = wl.liftingOrderEmail({ ...who, link: "https://x/lifting/?c=a", kind: "provisional" }), lo2 = wl.liftingOrderEmail({ ...who, name: "", link: "https://x/lifting/?c=a", kind: "final" });
  assert(lo1.includes("provisional lifting order") && lo1.includes("may change") && lo1.includes("https://x/lifting/?c=a"), "provisional email says it may change and has the link");
  assert(lo2.includes("Hi there,") && lo2.includes("final lifting order") && !lo2.includes("may change"), "final email says it is final");
  const pe = wl.priorityEmail({ ...who, link: "https://x/enter?c=a&invite=tok", windowStart: "2027-03-19T09:00:00Z", opens: "2027-03-20T09:00:00Z" });
  assert(pe.includes("https://x/enter?c=a&invite=tok") && /19 March 2027 at 09:00/.test(pe) && /20 March 2027 at 09:00/.test(pe) && pe.includes("Hi Ann,") && pe.includes("only works once"), "priority email: link, when it starts, when general entry opens: " + pe);
  assert(wl.priorityEmail({ ...who, name: "", link: "l", windowStart: "2027-03-19T09:00:00Z" }).includes("Hi there,"), "no name: Hi there");
  assert.strictEqual(wl.errorCode("ERROR: not_full\nCONTEXT"), "not_full"); assert.strictEqual(wl.errorCode("boom"), "unknown");
  let n = 0; for (let i = 0; i < 10; i++) if (wl.allowTry("k", 1000)) n++; assert.strictEqual(n, 6, "joining is rate limited");
}

{ // OpenIPF lookup, tested on a real results file (docs/entry-system/fixtures/openipf-agatasitko.csv, public OpenIPF data)
  const fs = await import("node:fs");
  const wl = asText(await import("../../supabase/functions/waitlist/index.ts"));
  const csv = fs.readFileSync(new URL("./fixtures/openipf-agatasitko.csv", import.meta.url), "utf8");
  assert.strictEqual(wl.openipfSlug("https://www.openipf.org/u/AgataSitko"), "agatasitko", "profile address -> name");
  assert.strictEqual(wl.openipfSlug(" http://openipf.org/u/agata.sitko-1/?x=1 "), "agata.sitko-1");
  assert.strictEqual(wl.openipfSlug("https://www.openpowerlifting.org/u/agatasitko"), null, "a different site is not accepted");
  assert.strictEqual(wl.openipfSlug("https://www.openipf.org/meet/ipf/2503"), null, "a meet page is not a lifter");
  const rows = wl.parseCsv(csv);
  assert(rows.length === 44 && rows[0].Name === "Agata Sitko" && rows[0].TotalKg === "612.5" && rows[0].Goodlift === "133.37", "the CSV is read: " + rows.length);
  assert.deepStrictEqual(wl.parseCsv('a,b\n"x, y","say ""hi"""\n'), [{ a: "x, y", b: 'say "hi"' }], "quoted fields, commas and doubled quotes");
  const full = wl.summariseResults(rows, { event: "full_power", equipment: "classic", compStart: "2025-09-01" });
  assert(full.bestTotal === 635 && full.bestGlp === 133.37 && full.count === 6, "best of the last 12 months before 1 Sept 2025: " + JSON.stringify(full));
  const before = wl.summariseResults(rows, { event: "full_power", equipment: "classic", compStart: "2025-02-21" });
  assert.strictEqual(before.bestTotal, 628, "a result after the competition date (635 on 22 Feb) does not count: " + JSON.stringify(before));
  assert.strictEqual(wl.summariseResults(rows, { event: "bench_only", equipment: "classic", compStart: "2025-01-01" }).bestTotal, 135, "bench only looks at bench results");
  assert.strictEqual(wl.summariseResults(rows, { event: "full_power", equipment: "equipped", compStart: "2025-09-01" }).count, 0, "equipped looks at equipped results only");
  assert.strictEqual(wl.summariseResults(rows, { event: "full_power", equipment: "classic", compStart: "2030-01-01" }).count, 0, "results more than 12 months old do not count");
  assert(wl.namesMatch("Agata Sitko", "Agata Sitko") && wl.namesMatch("Agata Sitko", "Agata Sitko #1") && wl.namesMatch("Agata Maria Sitko", "Agata Sitko") && wl.namesMatch("Agáta Sitko", "agata sitko"), "same person, allowing middle names, accents and #1");
  assert(!wl.namesMatch("A Sitko", "Agata Sitko") && !wl.namesMatch("Jane Smith", "Agata Sitko") && !wl.namesMatch("", "Agata Sitko"), "different people do not match");
  const ok200 = async () => new Response(csv, { status: 200 });
  const opt = { event: "full_power", equipment: "classic", compStart: "2025-09-01", entryName: "Agata Sitko" };
  let r = await wl.lookupLifter("agatasitko", opt, ok200);
  assert(r.status === "found" && r.best_total_kg === 635 && r.best_glp === 133.37 && r.name === "Agata Sitko" && r.note === "", "found: " + JSON.stringify(r));
  r = await wl.lookupLifter("agatasitko", { ...opt, entryName: "Someone Else" }, ok200); assert(r.status === "found" && /does not look like the entry name/.test(r.note), "a different name is flagged: " + r.note);
  r = await wl.lookupLifter("agatasitko", { ...opt, equipment: "equipped" }, ok200); assert(r.status === "found" && r.best_total_kg === null && /No full power equipped results/.test(r.note), "no recent results of that kind is said plainly: " + r.note);
  r = await wl.lookupLifter("nobody", opt, async () => new Response("404", { status: 404 })); assert.strictEqual(r.status, "not_found", "404 = no such profile");
  r = await wl.lookupLifter("x", opt, async () => new Response("oops", { status: 503 })); assert.strictEqual(r.status, "error", "a server error is retried later");
  r = await wl.lookupLifter("x", opt, async () => { throw new Error("offline"); }); assert.strictEqual(r.status, "error", "no connection is retried later");
}

{ // the note to the competitions inbox when someone is confirmed (same wording in both functions)
  const base = { name: "Sam Smith", email: "sam@x.co", competition: "Spring Open", date: "2027-05-15", event: "Full power", equipment: "Classic", weightClass: "83", sex: "M", category: "Open", division: "South West (guest)", isGuest: true, club: "Iron Gym", pence: 4000, discountPence: 2000, extras: [{ name: "Photo package", pence: 4049 }], under18: false, openipfUrl: "https://www.openipf.org/u/sam", taken: 7, capacity: 40, deskUrl: "https://site/admin/#competitions/abc/entries" };
  for (const mod of [wh, co]) {
    const t = mod.entryNotification(base);
    assert(t.includes("Sam Smith has entered Spring Open (15 May 2027).") && t.includes("Weight class: Men's 83 kg") && t.includes("A guest: the membership number needs checking") && t.includes("Paid: £40.00 (after a discount of £20.00)") && t.includes("Extra: Photo package: £40.49") && t.includes("That is 7 of 40 places taken.") && t.includes("Open the entries desk: https://site/admin/#competitions/abc/entries") && t.includes("OpenIPF: https://www.openipf.org/u/sam"), "entry note: " + t);
    assert(!/date of birth|guardian/i.test(t.replace("parent or guardian details were taken", "")), "the note does not carry a date of birth or guardian details");
    assert(mod.entryNotification({ ...base, pence: 0, discountPence: 4000, extras: [], isGuest: false, division: undefined, under18: true }).includes("Free: nothing to pay") && mod.entryNotification({ ...base, under18: true }).includes("Under 18 on the day"), "free and under-18 entries are described");
  }
}

{ // the note to the competitions inbox when an entry is refunded or cancelled
  const rf = asText(await import("../../supabase/functions/entry-refund/index.ts"));
  for (const mod of [wh, rf]) {
    const full = mod.refundNotification({ by: "ed@ynepf.co.uk", name: "Sam Smith", email: "sam@x.co", competition: "Spring Open", refundedPence: 4000, cancelled: true, reason: "Injured", taken: 6, capacity: 40, deskUrl: "https://site/admin/#competitions/abc/entries" });
    assert(full.includes("ed@ynepf.co.uk refunded £40.00 to Sam Smith for their entry in Spring Open.") && full.includes("Reason: Injured") && /cancelled, and the place is free/i.test(full) && full.includes("Stripe keeps its processing fee") && full.includes("Places taken: 6 of 40") && full.includes("Open the entries desk: https://site/admin"), "full refund note: " + full);
    const part = mod.refundNotification({ by: "Someone in the Stripe dashboard", name: "Sam Smith", email: "sam@x.co", competition: "Spring Open", refundedPence: 500, cancelled: false });
    assert(part.includes("refunded £5.00") && /still entered \(a partial refund\)/i.test(part) && !part.includes("places taken"), "partial: " + part);
    const none = mod.refundNotification({ by: "ed@ynepf.co.uk", name: "Sam Smith", email: "sam@x.co", competition: "Spring Open", refundedPence: 0, cancelled: true, reason: "Withdrew" });
    assert(none.includes("cancelled Sam Smith's entry in Spring Open. No money was refunded.") && !none.includes("processing fee"), "cancel with no refund: " + none);
  }
}
{
  const dn = wh.discountNotification({ code: "SAM-20OFF-ABC", name: "Sam Lifter", email: "sam@x.com", competition: "March Open", discountPence: 2000, paidPence: 3000, recipientName: "Sam", recipientEmail: "sam@x.com", reason: "Volunteer points: £20 off", deskUrl: "https://x/d" });
  assert(dn.includes("SAM-20OFF-ABC") && dn.includes("Sam Lifter (sam@x.com)") && dn.includes("£20.00 off, so they paid £30.00") && dn.includes("Volunteer points: £20 off") && dn.includes("https://x/d"), "discount note names the code, who used it and the amounts");
  assert(wh.discountNotification({ code: "C", name: "N", email: "e@x.com", competition: "X", discountPence: 4500, paidPence: 0 }).includes("so the entry is free"), "a full discount says the entry is free");
  assert(typeof co.discountNotification === "function", "the checkout function has the note too (free entries)");
}
console.log("function helper tests passed");

{ // the new emails: entries closed, final lifting order, rota, automatic refund; and safety of anything a person typed
  const wl = await import("../../supabase/functions/waitlist/index.ts");
  const stw = await import("../../supabase/functions/stripe-webhook/index.ts");
  const sc = await import("../../supabase/functions/send-contact/index.ts");
  const who = { name: "Sam", competition: "NESC Open", date: "27 February 2027", entriesEmail: "competitions@ynepf.co.uk" };
  const both = (mod, spec) => mod.renderEmail(spec);
  const c1 = both(wl, wl.entriesClosedEmail({ ...who, link: "https://x/lifting/?c=a" })), c2 = both(wl, wl.entriesClosedEmail(who));
  assert(c1.text.includes("no more changes to entries") || /no more changes to entries/i.test(c1.text), "the closing email says there can be no more changes");
  assert(/cannot offer refunds for dropouts/.test(c1.text) && /final lifting order will be published in the next few days/.test(c1.text), "...and no refunds, and that the final order follows");
  assert(c1.text.includes("provisional lifting order: https://x/lifting/?c=a") && c1.html.includes("See the provisional lifting order"), "with a provisional order published it links to it");
  assert(!c2.text.includes("provisional lifting order") && /putting the lifting order together/.test(c2.text) && !c2.html.includes("See the provisional lifting order"), "with none published there is no link, and it says so");
  assert(c1.text.includes("IPF Technical Rules") && c1.text.includes("info@ynepf.co.uk") && c1.html.includes("powerlifting.sport/rules/codes/info/approved-list"), "the closing email carries the rules and kit reminder");
  const lf = both(wl, wl.liftingOrderEmail({ ...who, link: "https://x/l", kind: "final" })), lp = both(wl, wl.liftingOrderEmail({ ...who, link: "https://x/l", kind: "provisional" }));
  assert(/final lifting order is here/i.test(lf.text) && /Entries have closed/.test(lf.text) && /provisional order/.test(lp.text) && /may change/.test(lp.text), "final and provisional lifting order emails differ");
  const ro = both(wl, wl.rotaEmail({ ...who, roles: [{ session: "Saturday, session 1", role: "Table" }, { session: "Saturday, session 2", when: "afternoon", role: "MC" }], link: wl.rotaLink("https://x/", "a") }));
  assert(ro.text.includes("Saturday, session 1: Table") && ro.text.includes("Saturday, session 2 (afternoon): MC") && ro.text.includes("https://x/rota?c=a") && /lose your volunteer points/.test(ro.text), "the rota email lists each person's roles and links to the rota");
  const ar = both(stw, stw.autoRefundEmail({ name: "Sam Taylor", competition: "NESC Open", refundedPence: 4000, entriesEmail: "x", joinUrl: "https://x/enter?c=a" }));
  assert(ar.text.includes("Refunded: £40.00") && ar.text.includes("https://x/enter?c=a") && ar.text.startsWith("We have refunded your payment"), "the automatic refund email");
  // every email is HTML and plain text, branded, and escapes what people type
  const evil = '<script>alert(1)</script> & "quotes"';
  const en = both(stw, stw.entryNotification({ name: evil, email: "a@b.co", competition: evil, date: "2027-02-27", event: "Full power", equipment: "Classic", club: evil, pence: 100, taken: 1 }));
  assert(!en.html.includes("<script>") && en.html.includes("&lt;script&gt;") && en.text.includes("<script>"), "names and clubs typed by lifters are escaped in the HTML");
  const ce = sc.buildEmail({ name: evil, email: "pat@example.com", subject: "Hello <b>", message: "Line one\n<img src=x onerror=alert(1)>" }, { from: "f", to: "t" });
  assert(!ce.html.includes("<img src=x") && ce.html.includes("&lt;img") && ce.html.includes("white-space:pre-wrap") && ce.text.includes("> Line one") && ce.subject === "[Website] Hello <b>" && ce.reply_to === "pat@example.com", "a contact form message is shown safely, quoted, and replying goes to the sender");
  assert(ce.html.includes('<html lang="en-GB"') && ce.html.includes("Internal") && ce.html.includes("email-logo.png") && /^[\x00-\x7F]*$/.test(ce.subject), "branded, marked internal, with a plain subject line");
  assert(wl.renderEmail({ blocks: [["h1", "Hi"]] }).html.includes("prefers-color-scheme: dark"), "dark mode styles are included");
}
