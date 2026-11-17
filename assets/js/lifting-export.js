/* ==========================================================================
   lifting-export.js: what leaves the lifting order builder. Pure logic: no page, no database.
     * openLifterCsv  the file OpenLifter imports (columns, order and rules from the federation's spec, section 5a)
     * validateOpenLifter  a port of OpenLifter's import checks, used by the tests and shown to the team before they download
     * weighInSheet / scoreSheet / rackSheet / kitSheet  printable pages (HTML) for the day, in the federation's own layouts
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

  // ---- printable sheets: the federation's own layouts (weigh-in, score sheet, rack heights, kit check) -------------------
  // Weigh-in is in lot order; the others follow the lifting order. They open in a new tab to print or save as PDF.
  function esc(s) { return String(s === null || s === undefined ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var PAGE_CSS = "*{box-sizing:border-box}body{font:11px/1.3 Arial,Helvetica,sans-serif;color:#000;margin:0}section.page{padding:10mm 8mm;page-break-after:always}section.page:last-child{page-break-after:auto}" +
    "section.port{page:port}section.land{page:land}@page port{size:A4 portrait;margin:0}@page land{size:A4 landscape;margin:0}" +
    ".head{display:flex;justify-content:space-between;font-weight:bold;margin-bottom:6px}.head span+span{margin-left:16px}" +
    "table{border-collapse:collapse;width:100%}th,td{border:1.5px solid #000;padding:0 5px;text-align:left;vertical-align:middle;height:7.2mm}th{background:#f2f2f2;font-size:10px;height:auto;padding:4px 5px}" +
    "tbody tr:nth-child(even) td{background:#f6f6f6}td.c,th.c{text-align:center;padding:0 2px}th.v{writing-mode:vertical-rl;transform:rotate(180deg);text-align:left;height:20mm;padding:4px 2px}" +
    ".sign{display:flex;gap:30mm;margin-top:8mm;font-weight:bold;page-break-inside:avoid}.sign div{min-width:62mm}.sign p{margin:0 0 5px;display:flex;align-items:flex-end;gap:6px}.sign p i{flex:1;border-bottom:1px solid #000;height:12px}" +
    ".tick{width:9mm}.land th.c,.land td.c{min-width:9mm}.noprint{margin:8px;padding:8px;background:#ffd;border:1px solid #aa0}@media print{.noprint{display:none}}";
  function shell(title, body) { return "<!doctype html><html lang=\"en-GB\"><head><meta charset=\"utf-8\"><title>" + esc(title) + "</title><style>" + PAGE_CSS + "</style></head><body><p class=\"noprint\">Use your browser's Print (Ctrl or Cmd + P) to print this or save it as a PDF. Turn off headers and footers, and set margins to none.</p>" + body + "</body></html>"; }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function dayDate(start, day) { var d = new Date(String(start).slice(0, 10) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + (day || 1) - 1); return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear(); }
  function head(left, comp, day) { return "<div class=\"head\"><div>" + left + "</div><div><span>" + esc(dayDate(comp.start_date, day)) + "</span><span>" + esc(comp.venue_name || "") + "</span></div></div>"; }
  function sign(titles) { return "<div class=\"sign\">" + titles.map(function (t) { return "<div><p>" + esc(t) + "</p><p>Name (Print) <i></i></p><p>Signature <i></i></p><p>Category <i></i></p></div>"; }).join("") + "</div>"; }
  function byLot(a, b) { return (a.lot || 1e9) - (b.lot || 1e9); }
  function cls(e) { return (e.sex === "F" ? "F" : "M") + e.classLabel; }
  function who(e) { return e.name + (e.guest ? " (Guest)" : ""); }
  function sessionTitle(s) { return "Session " + s.sessionNo + (s.prime ? " (prime time)" : ""); }
  // lifters of a session in lifting order (flight by flight, as arranged), each with its flight
  function inOrder(s, people) { var out = []; s.flights.forEach(function (f) { f.lifters.forEach(function (l) { if (people[l.id]) out.push({ f: f, l: l, e: people[l.id] }); }); }); return out; }
  function blank(n, c) { var h = ""; for (var i = 0; i < n; i++) h += "<td" + (c ? " class=\"c\"" : "") + "></td>"; return h; }

  function weighInSheet(sessions, people, comp) {
    return shell(comp.name + ": weigh-in", sessions.map(function (s) {
      var rows = inOrder(s, people).sort(function (a, b) { return byLot(a.l, b.l); });
      return "<section class=\"page port\">" + head("<span>" + esc(comp.name) + "</span><span>" + esc(sessionTitle(s)) + "</span>", comp, s.day) +
        "<table><thead><tr><th class=\"tick c\">&#10003;</th><th class=\"c\">Lot</th><th>Lifter name</th><th>Class</th><th>Age</th><th>Club / Team</th><th style=\"width:42%\">Comments</th></tr></thead><tbody>" +
        rows.map(function (r) { return "<tr><td class=\"c\"></td><td class=\"c\">" + esc(r.l.lot || "") + "</td><td>" + esc(who(r.e)) + "</td><td>" + esc(cls(r.e)) + "</td><td class=\"c\">" + esc(r.e.ageCat || "") + "</td><td>" + esc(r.e.club || "") + "</td><td></td></tr>"; }).join("") +
        "</tbody></table>" + sign(["Weigh in Official 1", "Weigh in Official 2"]) + "</section>";
    }).join(""));
  }

  // One landscape page per flight, in lifting order, with the referees' signature blocks.
  function scoreSheet(sessions, people, comp) {
    var pages = [];
    sessions.forEach(function (s) {
      s.flights.forEach(function (f) {
        var rows = f.lifters.filter(function (l) { return people[l.id]; });
        var att = function (t) { return "<th class=\"c\">" + t + "</th><th class=\"c\">2</th><th class=\"c\">3</th>"; };
        pages.push("<section class=\"page land\">" + head("<span>Flight " + esc(f.letter) + "</span><span>" + esc(comp.name) + "</span><span>" + esc(sessionTitle(s)) + "</span>", comp, s.day) +
          "<table><thead><tr><th>Lifter name</th><th>Club</th><th class=\"c\">Lot</th><th class=\"c\">Weight class</th><th class=\"c\">Age</th><th class=\"c\">Body weight</th>" + att("Squat<br>1") + att("Bench<br>1") + "<th class=\"c\">Sub total</th>" + att("Deadlift<br>1") + "<th class=\"c\">Total</th><th class=\"c\">GLP</th><th class=\"c\">BWT cl. placing</th></tr></thead><tbody>" +
          rows.map(function (l) { var e = people[l.id]; return "<tr><td>" + esc(who(e)) + "</td><td>" + esc(e.club || "") + "</td><td class=\"c\">" + esc(l.lot || "") + "</td><td class=\"c\">" + esc(cls(e)) + "</td><td class=\"c\">" + esc(e.ageCat || "") + "</td>" + blank(1) + blank(3) + blank(3) + blank(1) + blank(3) + blank(3) + "</tr>"; }).join("") +
          "</tbody></table>" + sign(["Centre Referee", "Side Referee", "Side Referee"]) + "</section>");
      });
    });
    return shell(comp.name + ": score sheets", pages.join(""));
  }

  // Rack heights: one page per session.
  function rackSheet(sessions, people, comp) {
    return shell(comp.name + ": rack heights", sessions.map(function (s) {
      return "<section class=\"page port\">" + head("<span>" + esc(comp.name) + "</span><span>" + esc(sessionTitle(s)) + "</span>", comp, s.day) +
        "<table><thead><tr><th>Name</th><th>Class</th><th>Squat rack</th><th>Squat stands</th><th>Bench rack</th><th>Safeties</th><th>Handout</th><th>Blocks</th><th>Signed</th></tr></thead><tbody>" +
        inOrder(s, people).map(function (r) { return "<tr><td>" + esc(who(r.e)) + "</td><td class=\"c\">" + esc(cls(r.e)) + "</td>" + blank(7) + "</tr>"; }).join("") + "</tbody></table></section>";
    }).join(""));
  }

  // Kit check: one page per session, with the technical controller's block.
  function kitSheet(sessions, people, comp) {
    var items = ["Singlet", "T-shirt", "Socks", "Shoes", "Belt(s)", "Wrist wraps", "Knee sleeves"];
    return shell(comp.name + ": kit check", sessions.map(function (s) {
      return "<section class=\"page port\">" + head("<span>" + esc(comp.name) + "</span><span>" + esc(sessionTitle(s)) + "</span>", comp, s.day) +
        "<table><thead><tr><th>Name</th><th>Class</th>" + items.map(function (t) { return "<th class=\"v c\">" + esc(t) + "</th>"; }).join("") + "<th style=\"width:30%\">Comments</th><th>Signed</th></tr></thead><tbody>" +
        inOrder(s, people).map(function (r) { return "<tr><td>" + esc(who(r.e)) + "</td><td class=\"c\">" + esc(cls(r.e)) + "</td>" + blank(items.length, true) + "<td></td><td></td></tr>"; }).join("") +
        "</tbody></table>" + sign(["Technical Controller"]) + "</section>";
    }).join(""));
  }

  return { COLUMNS: COLUMNS, DEFAULTS: DEFAULTS, defaultDivisionCode: defaultDivisionCode, divisionFor: divisionFor, ageOn: ageOn, clean: clean,
    openLifterRows: openLifterRows, openLifterCsv: openLifterCsv, validateOpenLifter: validateOpenLifter, weighInSheet: weighInSheet, scoreSheet: scoreSheet, rackSheet: rackSheet, kitSheet: kitSheet };
});
