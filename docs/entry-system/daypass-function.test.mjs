// Runs the waitlist function's day pass actions end to end with the database and the email service faked.
//   node --experimental-strip-types docs/entry-system/daypass-function.test.mjs
import assert from "node:assert";
import crypto from "node:crypto";
let handler;
globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "svc", SITE_URL: "https://www.ynepf.co.uk", RESEND_API_KEY: "re_test", NOTIFY_TO: "competitions@ynepf.co.uk" })[k] }, serve: (h) => { handler = h; } };
await import("../../supabase/functions/waitlist/index.ts");
assert(handler, "the function registers a handler");

let rpcs, mails, rpcAnswers, mailOk, failTo;
globalThis.fetch = async (url, init) => {
  const u = String(url), body = init?.body ? JSON.parse(init.body) : {};
  if (u.startsWith("https://api.resend.com/emails")) { mails.push(body); return new Response(JSON.stringify({ id: "m" }), { status: mailOk && !(failTo && body.to[0] === failTo) ? 200 : 500 }); }
  const fn = u.split("/rpc/")[1]; rpcs.push({ fn, body });
  return new Response(JSON.stringify(rpcAnswers[fn] ?? null), { status: 200 });
};
const call = async (action, extra = {}) => {
  const r = await handler(new Request("https://x/f", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9." + Math.floor(Math.random() * 250) }, body: JSON.stringify({ action, ...extra }) }));
  return r.json();
};
const reset = (a = {}, ok = true, fail = null) => { rpcs = []; mails = []; rpcAnswers = a; mailOk = ok; failTo = fail; };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const gym = { name: "Strength Vault", address: "1 Iron Street, York", details: "Open 6am to 9pm", contact_email: "vault@gym.example" };
const claimed = { ok: true, pass_id: "p1", name: "Sam Carter", expires_at: "2027-03-01T12:00:00Z", points: 2, available_after: 3, gym };

// the options carry the gyms and passes
reset({ points_options: { ok: true, name: "Sam", balance: 5, available: 5 }, pass_options: { ok: true, pass_points: 2, gyms: [{ id: "g1", name: "Strength Vault" }], passes: [] } });
let r = await call("points_options", { email: "sam@x.com", code: "123456" });
assert(r.ok && r.balance === 5 && r.pass_points === 2 && r.gyms.length === 1 && Array.isArray(r.passes), "the points options include the gyms and the person's passes");

// claiming: three emails, a QR code that opens the pass, only the hash goes to the database
reset({ pass_claim: claimed });
r = await call("pass_claim", { email: "sam@x.com", code: "123456", gym_id: "g1" });
assert(r.ok && r.gym === "Strength Vault" && /^https:\/\/www\.ynepf\.co\.uk\/pass\?t=[a-f0-9]{48}$/.test(r.pass_url), "claiming returns the pass address");
const tok = r.pass_url.split("t=")[1], claim = rpcs.find((x) => x.fn === "pass_claim").body;
assert.strictEqual(claim.p_token_hash, sha(tok), "the database gets the hash of the secret, never the secret");
assert(!JSON.stringify(rpcs).includes(tok), "the secret itself is not sent to the database");
assert.strictEqual(mails.length, 3, "the volunteer, the gym and the competitions inbox are each emailed");
const [mv, mg, mi] = mails;
assert(mv.to[0] === "sam@x.com" && mv.subject.includes("Strength Vault") && mv.html.includes('src="cid:day-pass-qr"') && mv.html.includes(`pass?t=${tok}&amp;show=1`) && mv.text.includes("Strength Vault") && mv.text.includes("1 Iron Street"), "the volunteer's email names the gym, shows the QR and links to the pass");
assert(mv.attachments?.length === 1 && mv.attachments[0].content_id === "day-pass-qr" && mv.attachments[0].content_type === "image/png" && Buffer.from(mv.attachments[0].content, "base64").subarray(1, 4).toString() === "PNG", "the QR code is a PNG sent with the email");
assert(mg.to[0] === "vault@gym.example" && mg.text.includes("Sam Carter") && mg.text.includes("Mark as used") && !mg.html.includes(tok) && !mg.text.includes(tok) && !mg.attachments, "the gym is told who is coming and how to check, but never given the secret");
assert(mi.to[0] === "competitions@ynepf.co.uk" && mi.text.includes("Sam Carter") && mi.text.includes("Yes") && !mi.html.includes(tok), "the competitions inbox gets a note");
assert(mails.every((m) => !m.html.includes("<script")), "no scripts in the emails");

// the gym's email cannot be sent: the volunteer still gets their pass, and the team is told to tell the gym
reset({ pass_claim: claimed }, true, "vault@gym.example");
r = await call("pass_claim", { email: "sam@x.com", code: "123456", gym_id: "g1" });
assert(r.ok && mails.length === 3 && mails[2].text.includes("did not send") && mails[2].text.includes("tell them yourself"), "if the gym's email fails the volunteer still has a pass and the inbox note asks the team to tell the gym");

// the volunteer's email cannot be sent: the claim is undone and nothing is taken
reset({ pass_claim: claimed }, false);
r = await call("pass_claim", { email: "sam@x.com", code: "123456", gym_id: "g1" });
assert(r.ok === false && /no points have been taken/.test(r.message) && rpcs.some((x) => x.fn === "pass_unclaim" && x.body.p_pass === "p1"), "if the pass email cannot be sent the claim is undone");

// errors come back in plain words
reset({ pass_claim: { ok: false, error: "have_one" } });
r = await call("pass_claim", { email: "sam@x.com", code: "123456", gym_id: "g1" });
assert(r.ok === false && r.message.includes("already have an unused pass") && mails.length === 0, "an error says what is wrong and sends nothing");
reset({ pass_claim: { ok: false, error: "points" } });
assert((await call("pass_claim", { email: "sam@x.com", code: "1", gym_id: "g1" })).message.includes("enough free points"), "not enough points");

// giving a pass back
reset({ pass_release: { ok: true, gym: "Strength Vault", contact_email: "vault@gym.example", name: "Sam Carter", points: 2, balance: 5 } });
r = await call("pass_release", { email: "sam@x.com", code: "123456", pass_id: "p1" });
assert(r.ok && r.points === 2 && mails.length === 2 && mails[0].to[0] === "vault@gym.example" && mails[0].text.includes("no longer works") && mails[1].to[0] === "competitions@ynepf.co.uk", "giving a pass back tells the gym and the inbox");
reset({ pass_release: { ok: false, error: "used" } });
assert((await call("pass_release", { email: "sam@x.com", code: "1", pass_id: "p1" })).message.includes("already been used"), "a used pass cannot be given back");

// the gym scans: a bad code is refused without asking the database, and the email address never comes back
reset({});
r = await call("pass_check", { token: "nonsense" });
assert(r.ok === false && r.status === "unknown" && rpcs.length === 0, "a malformed code is unknown, without touching the database");
reset({ pass_lookup: { ok: true, status: "valid", name: "Sam Carter", gym: "Strength Vault", expires_at: "2027-03-01T12:00:00Z", used_at: null } });
r = await call("pass_check", { token: tok });
assert(r.status === "valid" && r.name === "Sam Carter" && rpcs[0].body.p_token_hash === sha(tok), "a good code shows valid, looked up by hash");
reset({ pass_use: { ok: true, status: "used", name: "Sam Carter", gym: "Strength Vault", just_used: true, email: "sam@x.com" } });
r = await call("pass_use", { token: tok });
assert(r.just_used === true && !("email" in r) && !JSON.stringify(r).includes("sam@x.com"), "marking it used never returns the email address");
console.log("day pass function tests passed");
process.exit(0);
