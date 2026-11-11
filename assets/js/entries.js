/* ==========================================================================
   entries.js: the public list of who has entered a competition (/entries?c=<address>).
   Reads the entries_public view: names, clubs, classes and events only.
   ========================================================================== */
(function () {
  "use strict";
  var Y = window.YNEPF, el = Y.el;
  var list = document.getElementById("entries-list"), status = document.getElementById("entries-status");
  var title = document.getElementById("entries-title"), lede = document.getElementById("entries-lede");
  var CAT = { SJ: "Sub-junior", J: "Junior", "": "Open", M1: "M1", M2: "M2", M3: "M3", M4: "M4" };
  var EVENT = { full_power: "Full power", bench_only: "Bench only" }, EQUIP = { classic: "Classic", equipped: "Equipped" };

  function stop(h, html) { title.textContent = h; lede.textContent = ""; status.hidden = false; status.innerHTML = html; }
  function classKey(e) { return parseFloat(e.weight_class) || 999; }

  var slug = new URLSearchParams(location.search).get("c") || "", db = Y.db();
  if (!db || !slug) return stop("Entries", "<p>Choose a competition from the <a href='calendar.html'>calendar</a>.</p>");
  db.from("competitions_public").select("id,name,start_date,end_date,capacity").eq("slug", slug).maybeSingle().then(function (r) {
    var c = r.data;
    if (!c) return stop("Competition not found", "<p>We could not find that competition. Try the <a href='calendar.html'>calendar</a>.</p>");
    return db.from("entries_public").select("*").eq("competition_id", c.id).then(function (res) {
      var rows = res.data || [];
      title.textContent = c.name + ": entries";
      lede.textContent = Y.dateRange(c.start_date, c.end_date) + ". " + rows.length + (c.capacity ? " of " + c.capacity : "") + (rows.length === 1 ? " lifter has" : " lifters have") + " entered.";
      if (!rows.length) { status.hidden = false; status.innerHTML = "<p>Nobody has entered yet.</p>"; return; }
      document.getElementById("entries-note").hidden = false;
      [["F", "Women"], ["M", "Men"]].forEach(function (g) {
        var inGroup = rows.filter(function (e) { return e.sex === g[0]; });
        if (!inGroup.length) return;
        list.appendChild(el("h2", null, g[1] + " (" + inGroup.length + ")"));
        inGroup.sort(function (a, b) { return classKey(a) - classKey(b) || a.name.localeCompare(b.name); });
        list.appendChild(el("div", { class: "table-wrap" }, el("table", { class: "data" },
          el("thead", null, el("tr", null, ["Name", "Club", "Class", "Category", "Event"].map(function (h) { return el("th", { scope: "col" }, h); }))),
          el("tbody", null, inGroup.map(function (e) {
            return el("tr", null, el("th", { scope: "row" }, e.name), el("td", null, e.club || ""), el("td", null, (e.weight_class || "") + " kg"), el("td", null, CAT[e.age_category || ""] || ""),
              el("td", null, (EVENT[e.event] || "") + (e.equipment ? ", " + (EQUIP[e.equipment] || e.equipment).toLowerCase() : "")));
          })))));
      });
    });
  }).catch(function (e) { if (window.console) console.error(e); stop("Something went wrong", "<p>We could not load this page. Please try again later.</p>"); });
})();
