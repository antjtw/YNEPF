// Tests for the pure helpers in the payment functions (signature check, error words, email text).
//   node --experimental-strip-types docs/entry-system/functions.test.mjs
import crypto from "node:crypto";
import assert from "node:assert";
const wh = await import("../../supabase/functions/stripe-webhook/index.ts");
const co = await import("../../supabase/functions/entry-checkout/index.ts");
const secret = "whsec_test", body = '{"id":"evt_1"}', t = Math.floor(Date.now() / 1000);
const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
assert(await wh.verifySignature(body, `t=${t},v1=${sig}`, secret), "good signature accepted");
assert(!(await wh.verifySignature(body + " ", `t=${t},v1=${sig}`, secret)), "tampered body refused");
assert(!(await wh.verifySignature(body, `t=${t},v1=${sig}`, "other")), "wrong secret refused");
assert(!(await wh.verifySignature(body, `t=${t},v1=${sig}`, secret, Date.now() + 600000)), "old message refused");
assert(!(await wh.verifySignature(body, "nonsense", secret)), "garbage refused");
assert.equal(co.errorCode("P0001: ERROR: invalid:guardian\nCONTEXT: x"), "invalid:guardian");
assert.equal(co.errorCode("boom"), "unknown");
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: true, entriesEmail: "x" }).includes("parent or guardian must be with you"));
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
const bpHtml = `<h1>Register of Approved Clubs</h1><p class="title title-large"><strong>Isle of Man</strong></p><div><p class="title-medium">Revolution Gym IoM</p><p><strong>Email:</strong> x@y.co</p></div><p class="title title-large"><strong>Yorkshire &amp; North East</strong></p><div><p class="title-medium">Leeds University Powerlifting Club</p></div><p class="title-medium">Leeds University Powerlifting Club</p><h2>Home Country</h2><p class="title-medium">Not in the register</p>`;
assert.deepEqual(sc.parseBpApproved(bpHtml), [{ name: "Revolution Gym IoM", region: "Isle of Man" }, { name: "Leeds University Powerlifting Club", region: "Yorkshire & North East" }], "BP names with their region, repeats and other sections ignored");
const merged = sc.mergeClubs(["IronHQ", "Implexus Gym"], [{ name: "ironhq", region: "North Midlands" }, { name: "Fusion Barbell IoM", region: "Isle of Man" }]);
assert.equal(merged.length, 3, "a club on both lists is stored once"); assert.equal(merged.find((c) => c.name === "IronHQ").region, "North Midlands");
assert(!JSON.stringify(merged).includes("@"), "no contact details");
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x", division: "South West (guest)", club: "Implexus Gym" }).includes("Federation or division: South West (guest)"), "division in the email");
console.log("function helper tests passed");
