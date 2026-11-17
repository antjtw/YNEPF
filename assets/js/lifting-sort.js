/* ==========================================================================
   lifting-sort.js: the auto sort for a lifting order. Pure logic: no page, no database.
   It takes the lifters and the competition's settings and returns days, sessions and flights.
   The builder screen and the test lab both use it, and it is tested in docs/entry-system/lifting-sort.test.mjs.

   The rules (from the YNEPF's own descriptions, see docs/entry-system/plan.md section 7):
     * Women and men are never in the same flight.
     * Flights hold at most 14 full power lifters, or 20 counting bench only lifters.
     * Prime time (optional) is ONE session, last, with two flights: the top 14 women and the top 14 men by best GL points
       (full power only). They are taken out of the other sessions.
     * The rest go in sessions that run up through the weight classes, lightest first. A session has at most one women's flight
       and one men's flight (more only if you fix the number of sessions).
     * Inside a flight: weight class (lightest first), then best total (lowest first). Lifters with no best total yet go first.
     * Flight letters run on across the competition: A, B, C ...
   Nothing here touches who is locked or has been moved by hand: that is the builder's job (it passes `locked` placements in).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LiftingSort = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = {
    days: null,                 // null = worked out (1 day for up to 3 sessions, else 2)
    sessions: null,             // null = worked out from the number of flights needed
    maxFullPower: 14,           // full power lifters in one flight
    maxPerFlight: 20,           // all lifters in one flight (bench only included)
    primeTime: { enabled: false, women: 14, men: 14 },
    womenFirst: true            // the women's flight comes before the men's in a session
  };

  // "83" -> 83, "120+" -> 1120 (so every "+" class sorts after the numbered ones), anything odd -> 9999
  function classKey(label) {
    var m = /^(\d+(?:\.\d+)?)(\+?)$/.exec(String(label == null ? "" : label).trim());
    return m ? parseFloat(m[1]) + (m[2] ? 1000 : 0) : 9999;
  }
  function num(x) { return typeof x === "number" && isFinite(x) ? x : null; }
  function letter(i) { var s = ""; i = i + 1; while (i > 0) { var r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
  function isFP(e) { return e.event !== "bench_only"; }

  // The order inside a flight: class, then best total ascending, with "no total yet" first. Names break ties so the result is always the same.
  function flightOrder(a, b) {
    var ta = num(a.total), tb = num(b.total);
    if ((ta === null) !== (tb === null)) return ta === null ? -1 : 1;
    return classKey(a.classLabel) - classKey(b.classLabel) || (ta !== null ? ta - tb : 0) || String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id));
  }
  // Class first (so a weight class stays together), and inside a class the usual order. Used to cut a sex's lifters into sessions and flights.
  function classThenOrder(a, b) {
    return classKey(a.classLabel) - classKey(b.classLabel) || flightOrder(a, b);
  }

  function fits(chunk, o) {
    if (chunk.length > o.maxPerFlight) return false;
    var fp = 0; for (var i = 0; i < chunk.length; i++) if (isFP(chunk[i])) fp++;
    return fp <= o.maxFullPower;
  }

  // Cut an ordered list into the fewest flights that respect the limits, as even as possible (17 lifters make 9 and 8, not 14 and 3),
  // then nudge each cut a place or two so a weight class is not split when that is easy.
  function splitIntoFlights(list, o) {
    if (!list.length) return [];
    var n = Math.max(1, Math.ceil(list.length / o.maxPerFlight)), chunks;
    for (;; n++) {
      var base = Math.floor(list.length / n), extra = list.length % n, at = 0, cuts = [];
      for (var i = 0; i < n; i++) { at += base + (i < extra ? 1 : 0); cuts.push(at); }
      cuts.pop();
      chunks = cut(list, cuts);
      if (chunks.every(function (c) { return fits(c, o); })) break;
      if (n > list.length) break;
    }
    // snap cuts to class boundaries (within 2 places) when both neighbours still fit
    var cutsAt = []; var run = 0; for (var k = 0; k < chunks.length - 1; k++) { run += chunks[k].length; cutsAt.push(run); }
    for (var c = 0; c < cutsAt.length; c++) {
      var here = cutsAt[c];
      if (list[here - 1] && list[here] && classKey(list[here - 1].classLabel) !== classKey(list[here].classLabel)) continue;
      var best = null;
      for (var d = 1; d <= 2 && best === null; d++) {
        [here - d, here + d].forEach(function (p) {
          if (best !== null || p <= (cutsAt[c - 1] || 0) || p >= (cutsAt[c + 1] || list.length)) return;
          if (classKey(list[p - 1].classLabel) === classKey(list[p].classLabel)) return;
          var trial = cutsAt.slice(); trial[c] = p;
          if (cut(list, trial).every(function (ch) { return fits(ch, o); })) best = p;
        });
      }
      if (best !== null) cutsAt[c] = best;
    }
    return cut(list, cutsAt);
  }
  function cut(list, cuts) {
    var out = [], from = 0;
    cuts.concat([list.length]).forEach(function (to) { out.push(list.slice(from, to)); from = to; });
    return out;
  }

  // Put `flights` into `sessions` sessions: one each when there are enough sessions, otherwise spread as evenly as possible.
  function distribute(flights, sessions) {
    var out = []; for (var s = 0; s < sessions; s++) out.push([]);
    if (flights.length <= sessions) { flights.forEach(function (f, i) { out[i].push(f); }); return out; }
    var base = Math.floor(flights.length / sessions), extra = flights.length % sessions, at = 0;
    for (var i = 0; i < sessions; i++) { var take = base + (i < extra ? 1 : 0); out[i] = flights.slice(at, at + take); at += take; }
    return out;
  }

  function rank(n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  // entries: [{ id, name, sex: "M"|"F", classLabel: "83", event: "full_power"|"bench_only", total: number|null, glp: number|null }]
  function build(entries, settings) {
    var o = Object.assign({}, DEFAULTS, settings || {});
    o.primeTime = Object.assign({}, DEFAULTS.primeTime, (settings && settings.primeTime) || {});
    var warnings = [], sessions = [];
    var pool = entries.map(function (e) { return Object.assign({}, e); });      // work on copies: the caller's lifters are never changed
    var prime = { women: [], men: [] };

    // ---- prime time: the top lifters by GL points, full power only, out of the pool first
    if (o.primeTime.enabled) {
      [["F", "women", Math.min(o.primeTime.women, o.maxFullPower)], ["M", "men", Math.min(o.primeTime.men, o.maxFullPower)]].forEach(function (g) {
        var eligible = pool.filter(function (e) { return e.sex === g[0] && isFP(e) && num(e.glp) !== null; })
          .sort(function (a, b) { return b.glp - a.glp || (num(b.total) || 0) - (num(a.total) || 0) || String(a.name).localeCompare(String(b.name)); });
        var top = eligible.slice(0, g[2]);
        top.forEach(function (e, i) { e._reason = "Prime time: " + rank(i + 1) + " highest GL points among the " + g[1] + " (" + e.glp + ")"; });
        prime[g[1]] = top;
        var ids = {}; top.forEach(function (e) { ids[e.id] = true; });
        pool = pool.filter(function (e) { return !ids[e.id]; });
        if (top.length < g[2]) warnings.push("Prime time: only " + top.length + " of the " + g[2] + " " + g[1] + " places can be filled (the others have no GL points yet, or are bench only).");
      });
    }

    // ---- the rest: each sex ordered by class, cut into flights
    var women = pool.filter(function (e) { return e.sex === "F"; }).sort(classThenOrder);
    var men = pool.filter(function (e) { return e.sex !== "F"; }).sort(classThenOrder);
    var wFlights = splitIntoFlights(women, o), mFlights = splitIntoFlights(men, o);
    var sessionCount = o.sessions ? Math.max(1, Math.floor(o.sessions)) : Math.max(wFlights.length, mFlights.length, pool.length ? 1 : 0);
    var wBy = distribute(wFlights, sessionCount), mBy = distribute(mFlights, sessionCount);

    var main = [];
    for (var s = 0; s < sessionCount; s++) {
      var pair = o.womenFirst ? [["F", wBy[s]], ["M", mBy[s]]] : [["M", mBy[s]], ["F", wBy[s]]];
      var fl = [];
      pair.forEach(function (p) { p[1].forEach(function (lifters) { fl.push({ sex: p[0], lifters: lifters.slice().sort(flightOrder) }); }); });
      if (fl.length) main.push({ prime: false, flights: fl });
    }
    if (prime.women.length || prime.men.length) {
      var pf = [];
      var order = o.womenFirst ? [["F", prime.women], ["M", prime.men]] : [["M", prime.men], ["F", prime.women]];
      order.forEach(function (p) { if (p[1].length) pf.push({ sex: p[0], lifters: p[1].slice().sort(flightOrder) }); });
      main.push({ prime: true, flights: pf });
    }

    // ---- days: sessions in order, prime time always last
    var total = main.length;
    var days = o.days ? Math.max(1, Math.floor(o.days)) : (total <= 3 ? 1 : 2);
    days = Math.min(days, Math.max(total, 1));
    var perDay = Math.floor(total / days), extraDays = total % days, at = 0;
    main.forEach(function (sess, i) { sess.index = i; });
    for (var d = 0; d < days; d++) {
      var take = perDay + (d < extraDays ? 1 : 0);
      for (var j = 0; j < take; j++) { var sx = main[at++]; sx.day = d + 1; sx.sessionNo = j + 1; }
    }

    // ---- letters, reasons, positions, warnings
    var li = 0, noTotal = 0;
    main.forEach(function (sess) {
      sess.name = sess.prime ? "Prime time" : "";
      sess.flights.forEach(function (f) {
        f.letter = letter(li++);
        f.lifters.forEach(function (e, i) {
          e.position = i + 1;
          if (!e._reason) {
            e._reason = (e.sex === "F" ? "Women" : "Men") + ", " + e.classLabel + " kg" + (num(e.total) !== null ? ", best total " + e.total + " kg" : ". No best total yet, so first in the flight");
          }
          if (num(e.total) === null) noTotal++;
        });
        f.counts = { all: f.lifters.length, fullPower: f.lifters.filter(isFP).length };
      });
    });
    if (noTotal) warnings.push(noTotal + (noTotal === 1 ? " lifter has" : " lifters have") + " no best total yet, and " + (noTotal === 1 ? "goes" : "go") + " first in their flight.");
    return {
      days: days,
      sessions: main.map(function (s) {
        return { index: s.index, day: s.day, sessionNo: s.sessionNo, prime: s.prime, name: s.name,
          flights: s.flights.map(function (f) { return { letter: f.letter, sex: f.sex, counts: f.counts, lifters: f.lifters.map(function (e) { return { id: e.id, name: e.name, sex: e.sex, classLabel: e.classLabel, event: e.event, total: num(e.total), glp: num(e.glp), position: e.position, reason: e._reason }; }) }; }) };
      }),
      warnings: warnings,
      stats: { lifters: entries.length, sessions: main.length, flights: li }
    };
  }

  return { build: build, classKey: classKey, letter: letter, flightOrder: flightOrder, DEFAULTS: DEFAULTS };
});
