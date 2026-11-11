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
console.log("function helper tests passed");
