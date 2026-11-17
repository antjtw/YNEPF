/* ==========================================================================
   lifting-export.js: what leaves the lifting order builder. Pure logic: no page, no database.
     * openLifterCsv  the file OpenLifter imports (columns, order and rules from the federation's spec, section 5a)
     * validateOpenLifter  a port of OpenLifter's import checks, used by the tests and shown to the team before they download
     * weighInSheet / scoreSheet  printable pages (HTML) for the day, in lot order
   Tested in docs/entry-system/lifting-export.test.mjs.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LiftingExport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The reference file's header, in its order. The column list is a setting (settings.columns), so it can change without code.
  var COLUMNS = ["Day", "Session", "Platform", "Flight", "Name", "Sex", "Equipment", "Division1", "Event1", "BirthDate", "Age", "SquatRack", "BenchRack", "MemberID", "Country", "State", "Lot", "Guest", "Novice", "CanBreakRecords", "Team", "Instagram", "Notes"];
  var KNOWN = COLUMNS.concat(["Division2", "Division3", "Event2", "Event3", "Weight", "Squat1", "Bench1", "Deadlift1"]);
  var EQUIPMENT = ["Bare", "Sleeves", "Wraps", "Single-ply", "Multi-ply", "Unlimited"];
  var EVENTS = ["SBD", "SB", "SD", "BD", "S", "B", "D"];
  var YESNO = ["Guest", "Novice", "CanBreakRecords"];

  // Age class codes. The code table must mirror the divisions set up in the OpenLifter meet; these are the likely names (M or F, R for raw,
  // then the age class), and the team can change every one of them on the screen.
  var AGE_CODES = { "": "O", SJ: "SJ", J: "J", M1: "M1", M2: "M2", M3: "M3", M4: "M4" };
  function defaultDivisionCode(sex, equipment, cat) { return (sex === "F" ? "F" : "M") + (equipment === "equipped" ? "E" : "R") + "-" + (AGE_CODES[cat] || "O"); }
  var DEFAULTS = {
    columns: COLUMNS,
    platforms: 1,
    equipment: { classic: "Sleeves", equipped: "Single-ply" },
    divisions: {},                // "F:classic:J" -> "FR-J"; anything not listed uses defaultDivisionCode
    novice: false                 // the whole competition is a novice one (Implexus Novice)
  };

  // As OpenLifter's own csvString does: no commas, no double quotes, double spaces collapsed, trimmed.
  function clean(v) { return v === null || v === undefined ? "" : String(v).replace(/[,"“”\r\n\t]+/g, " ").replace(/\s+/g, " ").trim(); }
  function ageOn(dob, on) {
    if (!dob || !on) return "";
    var b = String(dob).slice(0, 10).split("-").map(Number), d = String(on).slice(0, 10).split("-").map(Number);
    var a = d[0] - b[0]; if (d[1] < b[1] || (d[1] === b[1] && d[2] < b[2])) a--; return a > 0 ? a : "";
  }
  function divisionFor(e, settings) {
    var key = (e.sex === "F" ? "F" : "M") + ":" + (e.equipment === "equipped" ? "equipped" : "classic") + ":" + (e.ageCat || "");
    return (settings.divisions && settings.divisions[key]) || defaultDivisionCode(e.sex, e.equipment, e.ageCat || "");
  }

  // sessions: the builder's arrangement [{ day, sessionNo, flights: [{ letter, lifters: [{ id, lot }] }] }]
  // people: { id: { name, sex, event, equipment, dob, ageCat, bp, club, instagram, guest, canBreakRecords } }
  // Rows come out ordered by day, session, flight, then lot.
  function openLifterRows(sessions, people, comp, settings) {
    var o = Object.assign({}, DEFAULTS, settings || {}), rows = [];
    sessions.forEach(function (s) {
      s.flights.forEach(function (f) {
        f.lifters.slice().sort(function (a, b) { return (a.lot || 1e9) - (b.lot || 1e9); }).forEach(function (l) {
          var e = people[l.id]; if (!e) return;
          var eq = e.equipment === "equipped" ? "equipped" : "classic";
          rows.push({
            Day: s.day, Session: s.sessionNo, Platform: 1, Flight: f.letter, Name: e.name, Sex: e.sex === "F" ? "F" : "M",
            Equipment: o.equipment[eq] || "", Division1: divisionFor(e, o), Event1: e.event === "bench_only" ? "B" : "SBD",
            BirthDate: e.dob ? "'" + String(e.dob).slice(0, 10) : "", Age: ageOn(e.dob, comp.start_date), SquatRack: "", BenchRack: "",
            MemberID: e.bp || "", Country: "", State: "", Lot: l.lot || "", Guest: e.guest ? "Yes" : "No", Novice: o.novice ? "Yes" : "No",
            CanBreakRecords: e.canBreakRecords === false ? "No" : "Yes", Team: e.club || "", Instagram: e.instagram || "", Notes: ""
          });
        });
      });
    });
    return rows;
  }
  function openLifterCsv(rows, settings) {
    var cols = (settings && settings.columns) || COLUMNS;
    return [cols.join(",")].concat(rows.map(function (r) { return cols.map(function (c) { var v = r[c]; return v === 0 ? "" : clean(v); }).join(","); })).join("\r\n") + "\r\n";
  }

  // A port of what OpenLifter's importer rejects. Returns a list of plain sentences; an empty list means it should import.
  function validateOpenLifter(csv, opts) {
    var o = Object.assign({ days: 1, platforms: 1 }, opts || {}), errs = [];
    var lines = String(csv).split(/\r?\n/).filter(function (l) { return l.length; });
    if (!lines.length) return ["The file is empty."];
    var head = lines[0].split(","), seen = {};
    head.forEach(function (h) { if (KNOWN.indexOf(h) < 0) errs.push("Unknown column: " + h + "."); if (seen[h]) errs.push("The column " + h + " appears twice."); seen[h] = 1; });
    if (head.indexOf("Platform") >= 0 && head.indexOf("Day") < 0) errs.push("Platform needs a Day column before it.");
    if (head.indexOf("Platform") >= 0 && head.indexOf("Day") > head.indexOf("Platform")) errs.push("The Day column must come before Platform.");
    ["Name", "Sex", "Division1", "Event1"].forEach(function (m) { if (head.indexOf(m) < 0) errs.push("The " + m + " column is missing."); });
    var at = function (cells, name) { var i = head.indexOf(name); return i < 0 ? "" : cells[i] === undefined ? "" : cells[i]; };
    lines.slice(1).forEach(function (line, n) {
      var cells = line.split(","), who = "Row " + (n + 2) + (cells[head.indexOf("Name")] ? " (" + cells[head.indexOf("Name")] + ")" : "") + ": ";
      if (line.indexOf('"') >= 0) errs.push(who + "has a double quote.");
      if (cells.length !== head.length) { errs.push(who + "has " + cells.length + " cells but the header has " + head.length + "."); return; }
      if (!at(cells, "Name")) errs.push(who + "has no name.");
      if (["M", "F", "Mx"].indexOf(at(cells, "Sex")) < 0) errs.push(who + "Sex must be M, F or Mx.");
      if (!at(cells, "Division1")) errs.push(who + "has no division.");
      if (EVENTS.indexOf(at(cells, "Event1")) < 0) errs.push(who + "Event1 must be one of " + EVENTS.join(", ") + ".");
      var eq = at(cells, "Equipment"); if (eq && EQUIPMENT.indexOf(eq) < 0) errs.push(who + "Equipment must be one of " + EQUIPMENT.join(", ") + ".");
      var d = at(cells, "Day"); if (d !== "" && (!/^\d+$/.test(d) || +d < 1 || +d > o.days)) errs.push(who + "Day " + d + " is outside the " + o.days + " day(s) of the meet.");
      var p = at(cells, "Platform"); if (p !== "" && (!/^\d+$/.test(p) || +p < 1 || +p > o.platforms)) errs.push(who + "Platform " + p + " is outside the " + o.platforms + " platform(s).");
      var b = at(cells, "BirthDate"); if (b !== "") { var m = /^'?(\d{4})-(\d{2})-(\d{2})$/.exec(b); if (!m || +m[1] < 1920 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) errs.push(who + "BirthDate must be YYYY-MM-DD, from 1920."); }
      var lot = at(cells, "Lot"); if (lot !== "" && !/^[1-9]\d*$/.test(lot)) errs.push(who + "Lot must be a positive whole number or blank.");
      var age = at(cells, "Age"); if (age !== "" && !/^\d+$/.test(age)) errs.push(who + "Age must be a whole number.");
      YESNO.forEach(function (c) { var v = at(cells, c); if (head.indexOf(c) >= 0 && v !== "" && v !== "Yes" && v !== "No") errs.push(who + c + " must be Yes or No."); });
    });
    return errs;
  }

  // ---- printable sheets -----------------------------------------------------------------------------------------------
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var PAGE_CSS = "body{font:12px/1.35 Arial,Helvetica,sans-serif;color:#000;margin:14mm}h1{font-size:18px;margin:0 0 2px}h2{font-size:14px;margin:0 0 6px}p.sub{margin:0 0 10px;color:#333}" +
    "table{border-collapse:collapse;width:100%;margin-bottom:6mm}th,td{border:1px solid #000;padding:5px 6px;text-align:left;vertical-align:middle}th{background:#eee;font-size:11px}" +
    "td.blank{min-width:44px}td.n{width:34px;text-align:center;font-weight:bold}.page{page-break-after:always}.page:last-child{page-break-after:auto}" +
    "@page{size:A4 landscape;margin:10mm}@media print{.noprint{display:none}body{margin:0}}.noprint{margin-bottom:12px;padding:8px;background:#ffd;border:1px solid #aa0}";
  function pageShell(title, body) { return "<!doctype html><html lang=\"en-GB\"><head><meta charset=\"utf-8\"><title>" + esc(title) + "</title><style>" + PAGE_CSS + "</style></head><body><p class=\"noprint\">Use your browser's Print (Ctrl or Cmd + P) to print this or save it as a PDF.</p>" + body + "</body></html>"; }
  function byLot(a, b) { return (a.lot || 1e9) - (b.lot || 1e9); }
  function sexName(s) { return s === "F" ? "Women" : "Men"; }

  // Weigh-in: one page per session, lifters in lot order, women then men. The empty boxes are filled in at the scales.
  function weighInSheet(sessions, people, comp) {
    var pages = sessions.map(function (s) {
      var rows = [];
      s.flights.forEach(function (f) { f.lifters.slice().sort(byLot).forEach(function (l) { if (people[l.id]) rows.push({ f: f, l: l, e: people[l.id] }); }); });
      var body = rows.map(function (r) {
        var e = r.e, fp = e.event !== "bench_only";
        return "<tr><td class=\"n\">" + esc(r.l.lot || "") + "</td><td>" + esc(r.f.letter) + "</td><td>" + esc(e.name) + "</td><td>" + esc((e.sex === "F" ? "F " : "M ") + e.classLabel) + "</td><td>" + esc(e.ageClass || "") + "</td><td>" + (fp ? "Full power" : "Bench only") + "</td><td>" + esc(e.club || "") + "</td><td>" + esc(e.bp || "") + "</td><td class=\"blank\"></td><td class=\"blank\"></td><td class=\"blank\"></td><td class=\"blank\"></td><td class=\"blank\"></td><td class=\"blank\"></td></tr>";
      }).join("");
      return "<section class=\"page\"><h1>" + esc(comp.name) + ": weigh-in</h1><p class=\"sub\">Day " + esc(s.day) + ", session " + esc(s.sessionNo) + (s.prime ? " (prime time)" : "") + " &middot; lifters in lot order</p>" +
        "<table><thead><tr><th>Lot</th><th>Flight</th><th>Name</th><th>Class</th><th>Age class</th><th>Event</th><th>Club</th><th>BP no.</th><th>Body weight</th><th>Squat rack</th><th>Bench rack</th><th>Squat opener</th><th>Bench opener</th><th>Deadlift opener</th></tr></thead><tbody>" + body + "</tbody></table><p>Weighed in by: ______________________ &nbsp; Checked by: ______________________</p></section>";
    });
    return pageShell(comp.name + ": weigh-in", pages.join(""));
  }

  // Score sheet: one page per flight, lifters in lot order, three attempts a lift, with a place for the result.
  function scoreSheet(sessions, people, comp) {
    var pages = [];
    sessions.forEach(function (s) {
      s.flights.forEach(function (f) {
        var rows = f.lifters.slice().sort(byLot).filter(function (l) { return people[l.id]; });
        var cell = function (n) { var h = ""; for (var i = 0; i < n; i++) h += "<td class=\"blank\"></td>"; return h; };
        var body = rows.map(function (l) {
          var e = people[l.id], fp = e.event !== "bench_only";
          return "<tr><td class=\"n\">" + esc(l.lot || "") + "</td><td>" + esc(e.name) + "</td><td>" + esc((e.sex === "F" ? "F " : "M ") + e.classLabel) + "</td><td class=\"blank\"></td>" + (fp ? cell(3) : "<td colspan=\"3\"></td>") + cell(3) + (fp ? cell(3) : "<td colspan=\"3\"></td>") + "<td class=\"blank\"></td><td class=\"blank\"></td></tr>";
        }).join("");
        pages.push("<section class=\"page\"><h1>" + esc(comp.name) + ": score sheet</h1><h2>Flight " + esc(f.letter) + " &middot; " + sexName(f.lifters[0] && people[f.lifters[0].id] ? people[f.lifters[0].id].sex : "") + "</h2><p class=\"sub\">Day " + esc(s.day) + ", session " + esc(s.sessionNo) + (s.prime ? " (prime time)" : "") + "</p>" +
          "<table><thead><tr><th>Lot</th><th>Name</th><th>Class</th><th>Body weight</th><th colspan=\"3\">Squat</th><th colspan=\"3\">Bench</th><th colspan=\"3\">Deadlift</th><th>Total</th><th>Place</th></tr></thead><tbody>" + body + "</tbody></table></section>");
      });
    });
    return pageShell(comp.name + ": score sheet", pages.join(""));
  }

  return { COLUMNS: COLUMNS, DEFAULTS: DEFAULTS, defaultDivisionCode: defaultDivisionCode, divisionFor: divisionFor, ageOn: ageOn, clean: clean,
    openLifterRows: openLifterRows, openLifterCsv: openLifterCsv, validateOpenLifter: validateOpenLifter, weighInSheet: weighInSheet, scoreSheet: scoreSheet };
});
