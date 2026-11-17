/* The lifting order lab: pretend lifters, fixed scenarios, and the real auto sort (assets/js/lifting-sort.js). Nothing is saved. */
(function () {
  "use strict";
  var LS = window.LiftingSort;
  var MEN = ["53", "59", "66", "74", "83", "93", "105", "120", "120+"], WOMEN = ["43", "47", "52", "57", "63", "69", "76", "84", "84+"];
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  var FIRST = ["Alex", "Sam", "Jo", "Chris", "Pat", "Robin", "Kim", "Jamie", "Taylor", "Morgan", "Charlie", "Drew", "Lee", "Max", "Ash", "Dani", "Frankie", "Ellis", "Rory", "Skye"];
  var LAST = ["Smith", "Jones", "Taylor", "Brown", "Wilson", "Evans", "Thomas", "Roberts", "Walker", "Wright", "Hall", "Green", "Wood", "Harris", "Clarke", "Turner", "Hill", "Moore", "Ward", "Cook"];

  // n lifters; womenShare 0..1; benchShare: bench only; newShare: no best total yet; oneClass: everyone in the same class
  function make(n, seed, o) {
    o = o || {}; var r = rng(seed * 7919 + n), out = [];
    for (var i = 0; i < n; i++) {
      var f = r() < (o.womenShare === undefined ? 0.35 : o.womenShare), classes = f ? WOMEN : MEN;
      var cls = o.oneClass ? o.oneClass : classes[Math.floor(Math.pow(r(), 1.25) * classes.length)];
      var bench = r() < (o.benchShare || 0), fresh = r() < (o.newShare === undefined ? 0.08 : o.newShare);
      var glp = Math.round((58 + r() * 42) * 100) / 100;
      out.push({ id: "L" + i, name: FIRST[Math.floor(r() * FIRST.length)] + " " + LAST[Math.floor(r() * LAST.length)] + " " + (i + 1), sex: f ? "F" : "M", classLabel: cls,
        event: bench ? "bench_only" : "full_power", total: fresh ? null : Math.round((f ? 230 : 380) + r() * (f ? 220 : 300)), glp: fresh || bench ? null : glp });
    }
    return out;
  }
  // The classes and GL points of the real YNE Worlds 2026 lifting order, with made-up names. Totals are estimated from GL points.
  function worlds() {
    var d = (window.LIFTING_ORDER_DATA || {}).lifters || [];
    return d.map(function (l, i) {
      var f = /^F/.test(l.class), glp = l.glp ? l.glp : null;
      return { id: "W" + i, name: "Lifter " + (i + 1), sex: f ? "F" : "M", classLabel: String(l.class).replace(/^[MF]/, ""), event: "full_power", total: glp ? Math.round(glp * (f ? 3.4 : 4.4)) : null, glp: glp };
    });
  }

  var SCENARIOS = [
    { id: "worlds", name: "YNE Worlds 2026 (the real mix)", help: "The 64 lifters of the real lifting order: the same weight classes and GL points, with new names. Compare it with what you actually did.", settings: { days: 2, primeTime: { enabled: true } }, build: worlds },
    { id: "small", name: "Small local competition (24 lifters)", help: "A typical small day.", settings: { days: 1 }, build: function (s) { return make(24, s); } },
    { id: "medium", name: "Medium open (48 lifters)", help: "A normal YNE open, no prime time.", settings: {}, build: function (s) { return make(48, s); } },
    { id: "big", name: "Big open (100 lifters, prime time)", help: "A full house over two days.", settings: { days: 2, primeTime: { enabled: true } }, build: function (s) { return make(100, s); } },
    { id: "womenheavy", name: "Mostly women (30 women, 10 men)", help: "Do the women still get sensible flights?", settings: {}, build: function (s) { return make(40, s, { womenShare: 0.75 }); } },
    { id: "newbies", name: "Lots of new lifters (half have no total)", help: "Lifters with no best total go first in their flight.", settings: {}, build: function (s) { return make(40, s, { newShare: 0.5 }); } },
    { id: "bench", name: "Mixed with bench only (a third are bench only)", help: "Bench only lifters count towards the 20, not the 14.", settings: {}, build: function (s) { return make(50, s, { benchShare: 0.33 }); } },
    { id: "oneclass", name: "One crowded class (32 men, all 83 kg)", help: "A weight class too big for one flight.", settings: {}, build: function (s) { return make(32, s, { womenShare: 0, oneClass: "83" }); } },
    { id: "tiny", name: "Tiny (6 lifters)", help: "Everything still works with almost nobody.", settings: {}, build: function (s) { return make(6, s); } }
  ];

  var $ = function (id) { return document.getElementById(id); };
  function el(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "class") n.className = attrs[k]; else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]); });
    (function add(list) { list.forEach(function (c) { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) return add(c); n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); }); })(Array.prototype.slice.call(arguments, 2));
    return n;
  }

  SCENARIOS.forEach(function (s) { $("scenario").appendChild(el("option", { value: s.id }, s.name)); });
  function applyScenario() {
    var s = SCENARIOS.filter(function (x) { return x.id === $("scenario").value; })[0], st = s.settings;
    $("scenario-help").textContent = s.help;
    $("days").value = st.days || ""; $("sessions").value = st.sessions || ""; $("prime").checked = !!(st.primeTime && st.primeTime.enabled);
  }
  $("scenario").addEventListener("change", function () { applyScenario(); run(); });

  function run() {
    var s = SCENARIOS.filter(function (x) { return x.id === $("scenario").value; })[0];
    var lifters = s.build(Math.max(1, parseInt($("seed").value, 10) || 1));
    var settings = {
      days: parseInt($("days").value, 10) || null, sessions: parseInt($("sessions").value, 10) || null,
      maxFullPower: 14, maxPerFlight: 20, womenFirst: $("womenfirst").checked,
      primeTime: { enabled: $("prime").checked, women: parseInt($("primew").value, 10) || 14, men: parseInt($("primem").value, 10) || 14 }
    };
    var res = LS.build(lifters, settings), out = $("result"), kids = [];
    var women = lifters.filter(function (l) { return l.sex === "F"; }).length;
    kids.push(el("div", { class: "lab-stats" },
      el("div", null, el("strong", null, String(res.stats.lifters)), "lifters (" + women + " women, " + (res.stats.lifters - women) + " men)"),
      el("div", null, el("strong", null, String(res.days)), res.days === 1 ? "day" : "days"),
      el("div", null, el("strong", null, String(res.stats.sessions)), res.stats.sessions === 1 ? "session" : "sessions"),
      el("div", null, el("strong", null, String(res.stats.flights)), res.stats.flights === 1 ? "flight" : "flights")));
    if (res.warnings.length) kids.push(el("div", { class: "lab-warn" }, el("strong", null, "Worth knowing"), el("ul", null, res.warnings.map(function (w) { return el("li", null, w); }))));
    res.sessions.forEach(function (sess) {
      var box = el("section", { class: "lab-session", "aria-label": "Day " + sess.day + ", session " + sess.sessionNo }, el("h3", null, "Day " + sess.day + ", session " + sess.sessionNo + (sess.prime ? ": prime time" : "")));
      sess.flights.forEach(function (f) {
        var f2 = el("section", { class: "lab-flight" },
          el("h4", null, "Flight " + f.letter, el("span", { class: "sex-tag" + (f.sex === "F" ? " f" : "") }, f.sex === "F" ? "Women" : "Men"), " · " + f.counts.all + " lifters" + (f.counts.all !== f.counts.fullPower ? " (" + f.counts.fullPower + " full power)" : "")),
          el("div", { class: "table-scroll" }, el("table", { class: "admin-table lab-table" },
            el("caption", { class: "visually-hidden" }, "Flight " + f.letter),
            el("thead", null, el("tr", null, ["#", "Lifter", "Class", "Event", "Best total", "GL", "Why here"].map(function (h) { return el("th", { scope: "col" }, h); }))),
            el("tbody", null, f.lifters.map(function (l) {
              return el("tr", null, el("td", null, String(l.position)), el("th", { scope: "row" }, l.name), el("td", null, l.classLabel), el("td", null, l.event === "bench_only" ? "Bench only" : "Full power"),
                el("td", null, l.total === null ? "none yet" : l.total + " kg"), el("td", null, l.glp === null ? "–" : String(l.glp)), el("td", { class: "reason" }, l.reason));
            })))));
        box.appendChild(f2);
      });
      kids.push(box);
    });
    out.replaceChildren.apply(out, kids);
  }
  $("lab-form").addEventListener("submit", function (e) { e.preventDefault(); run(); });
  applyScenario(); run();
})();
