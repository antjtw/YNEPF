/* ==========================================================================
   points-import.js: reads the old points sheet (the "Master database" tab saved as a CSV) so it can be loaded into the ledger.
   Pure logic: no page, no database. Tested in docs/entry-system/points-import.test.mjs.

   The sheet: a row of event dates, then a header row (Name, Email, Points, then one column per competition or quarter), then one row
   per person. A positive number is points earned at that event, a negative number is points spent. "Points" is the person's total.
   Returns the rows to load, and a report so nothing is lost without anyone noticing: rows with no email (cannot be loaded), cells
   that are not numbers, and any person whose loaded total would not match the sheet's own total.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PointsImport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // RFC 4180: quotes, commas and newlines inside quotes.
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false; text = String(text || "").replace(/^﻿/, "");
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  // "2025-03-01", "2025-03-01 00:00:00", "01/03/2025" (day first) or "31/06/2026" (a day that does not exist: clamped to the month's last day)
  function parseDate(s) {
    s = String(s || "").trim(); var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) {
      var d = +m[1], mo = +m[2], y = +m[3], last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      if (mo < 1 || mo > 12) return ""; return y + "-" + pad(mo) + "-" + pad(Math.min(d, last));
    }
    return "";
  }
  function reasonFor(label, delta) {
    if (/^Q\d\b/i.test(label)) return (delta > 0 ? "Executive or committee service: " : "Spent: ") + label;
    return (delta > 0 ? "Volunteered: " : "Spent: ") + label;
  }

  function parse(csvText) {
    var grid = parseCsv(csvText), report = { people: 0, earned: 0, spent: 0, expected: 0, noEmail: [], badCells: [], mismatches: [], columns: [], warnings: [] };
    var h = -1;
    for (var i = 0; i < grid.length && h < 0; i++) {
      var low = grid[i].map(function (c) { return String(c).trim().toLowerCase(); });
      if (low.indexOf("name") >= 0 && low.indexOf("email") >= 0 && low.indexOf("points") >= 0) h = i;
    }
    if (h < 0) { report.warnings.push("Could not find a row with Name, Email and Points. Save the Master database tab as a CSV and try again."); return { rows: [], people: [], report: report }; }
    var head = grid[h].map(function (c) { return String(c).trim(); }), low2 = head.map(function (c) { return c.toLowerCase(); });
    var nameCol = low2.indexOf("name"), emailCol = low2.indexOf("email"), pointsCol = low2.indexOf("points"), dateRow = h > 0 ? grid[h - 1] : [];
    var cols = [];
    for (var c = pointsCol + 1; c < head.length; c++) {
      var label = head[c]; if (!label || /^notes?$/i.test(label)) continue;
      var date = parseDate(dateRow[c]);
      if (!date) { report.warnings.push("The column " + label + " has no date above it, so it was skipped."); continue; }
      cols.push({ i: c, label: label, date: date }); report.columns.push(label + " (" + date + ")");
    }
    var byEmail = {}, order = [];
    for (var r = h + 1; r < grid.length; r++) {
      var row = grid[r], name = String(row[nameCol] || "").trim(), email = String(row[emailCol] || "").trim().toLowerCase();
      if (!name && !email) continue;
      var sheetTotal = parseFloat(String(row[pointsCol] || "").trim()); if (!isFinite(sheetTotal)) sheetTotal = 0;
      if (!email) { if (sheetTotal) report.noEmail.push({ name: name, points: sheetTotal }); continue; }
      var p = byEmail[email]; if (!p) { p = byEmail[email] = { email: email, name: name, sheetTotal: 0, cells: {} }; order.push(email); }
      p.sheetTotal += sheetTotal;
      cols.forEach(function (col) {
        var raw = String(row[col.i] === undefined ? "" : row[col.i]).trim(); if (raw === "") return;
        var v = Number(raw);
        if (!isFinite(v)) { report.badCells.push({ name: name, column: col.label, value: raw }); return; }
        if (Math.round(v) !== v) { report.badCells.push({ name: name, column: col.label, value: raw }); return; }
        if (v === 0) return;
        p.cells[col.i] = (p.cells[col.i] || 0) + v;
      });
    }
    var rows = [], people = [];
    order.forEach(function (email) {
      var p = byEmail[email], total = 0;
      cols.forEach(function (col) {
        var v = p.cells[col.i]; if (!v) return;
        total += v; if (v > 0) report.earned += v; else report.spent += -v;
        rows.push({ key: email + "|" + col.label + "|" + col.date, email: email, name: p.name, date: col.date, delta: v, reason: reasonFor(col.label, v) });
      });
      report.expected += p.sheetTotal;
      if (total !== p.sheetTotal) report.mismatches.push({ name: p.name, email: email, sheet: p.sheetTotal, loaded: total });
      people.push({ email: email, name: p.name, sheetTotal: p.sheetTotal, loaded: total });
    });
    report.people = people.length;
    return { rows: rows, people: people, report: report };
  }
  return { parse: parse, parseCsv: parseCsv, parseDate: parseDate };
});
