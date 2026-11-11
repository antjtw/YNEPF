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
assert(wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x", accessNeeds: true }).includes("we will be in touch by email to see how we can best support you"), "access needs follow-up in the email");
assert(!wh.confirmationEmail({ name: "A", competition: "C", date: "d", event: "e", equipment: "q", pence: 6000, under18: false, entriesEmail: "x" }).includes("access needs"), "no access needs line when not ticked");
assert(co.formEncode(co.sessionParams({ entryId: "e", email: "a@b.co", name: "A", pence: 100, competition: "C", siteUrl: "https://x.y", expiresAt: 1, slug: "2027-test" })).includes(encodeURIComponent("https://x.y/entry-thanks?c=2027-test&session_id={CHECKOUT_SESSION_ID}")), "thanks page link carries the competition");
console.log("function helper tests passed");
