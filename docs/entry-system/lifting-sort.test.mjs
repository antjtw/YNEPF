// Tests for the lifting order auto sort (assets/js/lifting-sort.js).  node docs/entry-system/lifting-sort.test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const LS = createRequire(import.meta.url)("../../assets/js/lifting-sort.js");

// a small seeded random generator, so every run sees the same "random" lifters
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MEN = ["53", "59", "66", "74", "83", "93", "105", "120", "120+"], WOMEN = ["43", "47", "52", "57", "63", "69", "76", "84", "84+"];
function lifters(n, seed, o = {}) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const f = r() < (o.womenShare ?? 0.35), cls = (f ? WOMEN : MEN)[Math.floor(Math.pow(r(), 1.3) * 9)];
    const bench = r() < (o.benchShare ?? 0.1), fresh = r() < (o.newShare ?? 0.1);
    out.push({ id: "L" + i, name: "Lifter " + String(i).padStart(3, "0"), sex: f ? "F" : "M", classLabel: cls, event: bench ? "bench_only" : "full_power",
      total: fresh ? null : Math.round((f ? 250 : 400) + r() * 250), glp: fresh || bench ? null : Math.round((60 + r() * 45) * 100) / 100 });
  }
  return out;
}
const all = (res) => res.sessions.flatMap((s) => s.flights.flatMap((f) => f.lifters.map((l) => ({ ...l, flight: f, session: s }))));
const O = { maxFullPower: 14, maxPerFlight: 20 };

function checkInvariants(input, res, opt, label) {
  const placed = all(res), ids = placed.map((l) => l.id).sort();
  assert.deepStrictEqual(ids, input.map((l) => l.id).sort(), label + ": every lifter is placed exactly once");
  let expectLetter = 0;
  res.sessions.forEach((s) => s.flights.forEach((f) => {
    assert.strictEqual(f.letter, LS.letter(expectLetter++), label + ": flight letters run on A, B, C");
    assert(new Set(f.lifters.map((l) => l.sex)).size === 1, label + ": women and men are never in the same flight");
    assert(f.lifters.length <= (opt.maxPerFlight ?? 20) && f.lifters.filter((l) => l.event !== "bench_only").length <= (opt.maxFullPower ?? 14), label + ": flight within limits (" + f.lifters.length + ")");
    const keys = f.lifters.map((l) => [l.total === null ? -1 : 0, LS.classKey(l.classLabel), l.total ?? 0]);
    for (let i = 1; i < keys.length; i++) assert(keys[i - 1][0] < keys[i][0] || (keys[i - 1][0] === keys[i][0] && (keys[i - 1][1] < keys[i][1] || (keys[i - 1][1] === keys[i][1] && keys[i - 1][2] <= keys[i][2]))), label + ": flight order is no-total first, then class, then total");
    f.lifters.forEach((l, i) => assert.strictEqual(l.position, i + 1, label + ": positions run 1, 2, 3"));
  }));
  const primes = res.sessions.filter((s) => s.prime); assert(primes.length <= 1, label + ": at most one prime time session");
  if (primes.length) assert.strictEqual(res.sessions[res.sessions.length - 1], primes[0], label + ": prime time is last");
  const days = res.sessions.map((s) => s.day); for (let i = 1; i < days.length; i++) assert(days[i] >= days[i - 1], label + ": days run forward");
  if (!opt.sessions) res.sessions.forEach((s) => ['F', 'M'].forEach((sx) => assert(s.flights.filter((f) => f.sex === sx).length <= 1, label + ': a session has at most one women\'s and one men\'s flight')));
}

// ---- 1. the same input always gives the same result, and the input is not changed
const sample = lifters(64, 7), copy = JSON.stringify(sample);
const r1 = LS.build(sample, { ...O, primeTime: { enabled: true } }), r2 = LS.build(sample, { ...O, primeTime: { enabled: true } });
assert.deepStrictEqual(r1, r2, "deterministic"); assert.strictEqual(JSON.stringify(sample), copy, "the lifters passed in are left alone");

// ---- 2. hundreds of different competitions all obey the rules
let runs = 0;
for (let seed = 1; seed <= 300; seed++) {
  const n = [1, 2, 5, 12, 24, 40, 64, 90, 140][seed % 9], r = rng(seed * 31);
  const input = lifters(n, seed, { womenShare: r(), benchShare: r() * 0.5, newShare: r() * 0.6 });
  const opt = { ...O, primeTime: { enabled: seed % 2 === 0, women: 14, men: 14 }, womenFirst: seed % 3 !== 0, days: seed % 4 === 0 ? 3 : null, sessions: seed % 5 === 0 ? 2 : null };
  checkInvariants(input, LS.build(input, opt), opt, "seed " + seed + " (" + n + " lifters)"); runs++;
}
console.log("PASS " + runs + " different competitions all obey the rules");

// ---- 3. prime time: the top 14 women and top 14 men by GL points, full power only, two flights, last
{
  const input = lifters(80, 11, { benchShare: 0.15, newShare: 0.05 });
  const res = LS.build(input, { ...O, primeTime: { enabled: true, women: 14, men: 14 } });
  const prime = res.sessions[res.sessions.length - 1]; assert(prime.prime && prime.flights.length === 2, "prime time is one session with two flights");
  for (const [sex, fl] of [["F", prime.flights[0]], ["M", prime.flights[1]]]) {
    assert.strictEqual(fl.sex, sex, "women's flight first, then men's");
    const want = input.filter((l) => l.sex === sex && l.event !== "bench_only" && l.glp !== null).sort((a, b) => b.glp - a.glp).slice(0, 14).map((l) => l.id).sort();
    assert.deepStrictEqual(fl.lifters.map((l) => l.id).sort(), want, sex + ": exactly the top GL points, full power only");
  }
  assert(res.sessions.slice(0, -1).every((s) => s.flights.every((f) => f.lifters.every((l) => !prime.flights.some((p) => p.lifters.some((x) => x.id === l.id))))), "prime time lifters are not also in another session");
  console.log("PASS prime time: top 14 and 14 by GL, full power only, two flights, last");
}
{ // fewer eligible than the settings ask for: says so
  const res = LS.build(lifters(30, 5, { newShare: 0.9 }), { ...O, primeTime: { enabled: true } });
  assert(res.warnings.some((w) => /Prime time: only/.test(w)), "a warning when prime time cannot be filled");
  console.log("PASS prime time warns when it cannot be filled");
}

// ---- 4. flights are even, and limits hold: 17 full power lifters make 9 and 8, not 14 and 3
{
  const men17 = Array.from({ length: 17 }, (_, i) => ({ id: "m" + i, name: "M" + i, sex: "M", classLabel: "83", event: "full_power", total: 300 + i, glp: 70 }));
  const res = LS.build(men17, O); const sizes = res.sessions.flatMap((s) => s.flights.map((f) => f.lifters.length));
  assert.deepStrictEqual(sizes.sort(), [8, 9], "17 men: 9 and 8");
  const bench = Array.from({ length: 20 }, (_, i) => ({ id: "b" + i, name: "B" + i, sex: "M", classLabel: "83", event: "bench_only", total: 100 + i, glp: null }));
  assert.strictEqual(LS.build(bench, O).sessions[0].flights.length, 1, "20 bench only lifters fit in one flight");
  assert.strictEqual(LS.build(bench.concat([{ id: "b99", name: "B99", sex: "M", classLabel: "83", event: "bench_only", total: 99, glp: null }]), O).sessions.flatMap((s) => s.flights).length, 2, "21 need two flights");
  const mixed = Array.from({ length: 20 }, (_, i) => ({ id: "x" + i, name: "X" + i, sex: "M", classLabel: "83", event: i < 15 ? "full_power" : "bench_only", total: 300 + i, glp: 70 }));
  assert.strictEqual(LS.build(mixed, O).sessions.flatMap((s) => s.flights).length, 2, "15 full power + 5 bench only: over 14 full power, so two flights");
  console.log("PASS flights are even and limits hold (14 full power, 20 in all)");
}

// ---- 5. weight classes stay together where they can; everyone with no total is first
{
  const input = lifters(60, 21, { benchShare: 0, newShare: 0.2 });
  const res = LS.build(input, O);
  const split = {};  // class -> number of flights it appears in
  res.sessions.forEach((s) => s.flights.forEach((f) => new Set(f.lifters.map((l) => l.sex + l.classLabel)).forEach((c) => { split[c] = (split[c] || 0) + 1; })));
  const total = Object.values(split).length, together = Object.values(split).filter((n) => n === 1).length;
  assert(together / total >= 0.5, "most weight classes sit in one flight (" + together + " of " + total + ")");
  res.sessions.forEach((s) => s.flights.forEach((f) => { const i = f.lifters.findIndex((l) => l.total !== null); if (i > 0) assert(f.lifters.slice(0, i).every((l) => l.total === null), "no-total lifters first"); }));
  console.log("PASS weight classes mostly stay together; no-total lifters go first");
}

// ---- 6. layout: sessions run up through the classes; days; women first or men first
{
  const input = lifters(64, 3, { benchShare: 0, newShare: 0 });
  const res = LS.build(input, { ...O, womenFirst: false });
  assert(res.sessions.every((s) => s.flights.length < 2 || s.flights[0].sex === "M"), "men first when the setting says so");
  const men = res.sessions.flatMap((s) => s.flights.filter((f) => f.sex === "M")).map((f) => LS.classKey(f.lifters[0].classLabel));
  for (let i = 1; i < men.length; i++) assert(men[i] >= men[i - 1], "men's flights run up through the weight classes");
  const three = LS.build(lifters(100, 4), { ...O, days: 3, primeTime: { enabled: true } });
  assert.strictEqual(Math.max(...three.sessions.map((s) => s.day)), Math.min(3, three.sessions.length), "the days setting is used");
  assert(LS.build(lifters(6, 2), O).sessions.length >= 1 && LS.build([], O).sessions.length === 0, "tiny and empty competitions work");
  console.log("PASS layout: classes run up, days and women-first settings are used, tiny and empty cases work");
}
// ---- 7. lot numbers: blocks per flight in flight order, women then men, random inside a flight, never across flights
{
  const res = LS.build(lifters(90, 11), { ...O, primeTime: { enabled: true } });
  const flights = res.sessions.flatMap((s) => s.flights);
  const lots = LS.assignLots(flights, (n) => Math.floor(rng(5)() * n));
  const lifters90 = flights.flatMap((f) => f.lifters);
  assert.deepStrictEqual(Object.values(lots).sort((a, b) => a - b), lifters90.map((_, i) => i + 1), "every lifter gets one lot number, 1 to N, no gaps or repeats");
  let next = 1;
  flights.forEach((f) => {
    const mine = f.lifters.map((l) => lots[l.id]);
    assert(Math.min(...mine) === next && Math.max(...mine) === next + f.lifters.length - 1, "flight " + f.letter + " has one block of consecutive numbers, in flight order");
    next += f.lifters.length;
  });
  // women before men inside a flight (flights are single sex, but a hand-made mixed flight is still handled)
  const mixed = LS.assignLots([{ lifters: [{ id: "a", sex: "M" }, { id: "b", sex: "F" }, { id: "c", sex: "M" }, { id: "d", sex: "F" }] }]);
  assert(Math.max(mixed.b, mixed.d) < Math.min(mixed.a, mixed.c), "women's lot numbers come before the men's inside a flight");
  // real randomness: different draws give different orders; every position is reachable (a loose check, 200 draws of 4 lifters)
  const seen = new Set(), firsts = new Set();
  for (let i = 0; i < 200; i++) { const l = LS.assignLots([{ lifters: ["a", "b", "c", "d"].map((id) => ({ id, sex: "M" })) }]); seen.add(JSON.stringify(l)); firsts.add(Object.keys(l).find((k) => l[k] === 1)); }
  assert(seen.size > 12 && firsts.size === 4, "the draw is random (" + seen.size + " of 24 orders in 200 draws)");
  assert.deepStrictEqual(LS.assignLots([]), {}, "no flights, no lots");
  console.log("PASS lot numbers: consecutive block per flight, women then men, random inside the flight");
}
console.log("\nlifting sort tests passed");
