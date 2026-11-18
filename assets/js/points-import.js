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
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function iso(y, mo, d) { var last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return y + "-" + pad(mo) + "-" + pad(Math.min(d, last)); }
  // Reads the date formats a spreadsheet export is likely to use: "2025-03-01", "2025-03-01 00:00:00", "01/03/2025" and "1/3/25" (day first),
  // "1 Mar 2025", "1-Mar-25", "Mar 1, 2025". A day that does not exist ("31/06/2026") is clamped to the month's last day. A date with no
  // year ("1 Mar", "01/03") comes back as { d, m } so the caller can work the year out from the columns either side.
  function parseDateParts(s) {
    s = String(s || "").trim(); var m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s))) { var y = +m[3]; if (y < 100) y += 2000; return { y: y, m: +m[2], d: +m[1] }; }
    if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) return { y: null, m: +m[2], d: +m[1] };
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([A-Za-z]{3,9})\.?(?:[\s\-,]+(\d{2,4}))?$/.exec(s)) && MONTHS[m[2].slice(0, 4).toLowerCase()] || (m && MONTHS[m[2].slice(0, 3).toLowerCase()])) { var mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]; var yy = m[3] ? +m[3] : null; if (yy !== null && yy < 100) yy += 2000; return { y: yy, m: mo, d: +m[1] }; }
    if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})?$/.exec(s)) && (MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()])) { var mo2 = MONTHS[m[1].slice(0, 4).toLowerCase()] || MONTHS[m[1].slice(0, 3).toLowerCase()]; var y2 = m[3] ? +m[3] : null; if (y2 !== null && y2 < 100) y2 += 2000; return { y: y2, m: mo2, d: +m[2] }; }
    return null;
  }
  function parseDate(s) { var p = parseDateParts(s); return p && p.y && p.m >= 1 && p.m <= 12 ? iso(p.y, p.m, p.d) : ""; }
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
    var cols = [], prev = null;
    for (var c = pointsCol + 1; c < head.length; c++) {
      var label = head[c]; if (!label || /^notes?$/i.test(label)) continue;
      var dp = parseDateParts(dateRow[c]);
      if (dp && !dp.y && prev) { dp.y = prev.y; if (dp.m < prev.m || (dp.m === prev.m && dp.d < prev.d)) dp.y++; }       // no year: carry on from the column before
      if (!dp || !dp.y || dp.m < 1 || dp.m > 12) { report.warnings.push("The column " + label + " has no usable date above it (" + (String(dateRow[c] || "").trim() || "empty") + "), so it was skipped."); continue; }
      prev = dp; var date = iso(dp.y, dp.m, dp.d);
      cols.push({ i: c, label: label, date: date }); report.columns.push(label + " (" + date + ")");
    }
    var byEmail = {}, order = [];
    for (var r = h + 1; r < grid.length; r++) {
      var row = grid[r], name = String(row[nameCol] || "").trim(), email = String(row[emailCol] || "").trim().toLowerCase();
      if (!name && !email) continue;
      var sheetTotal = parseFloat(String(row[pointsCol] || "").trim()); if (!isFinite(sheetTotal)) sheetTotal = 0;
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { if (sheetTotal) report.noEmail.push({ name: name, points: sheetTotal, email: email }); continue; }
      var p = byEmail[email]; if (!p) { p = byEmail[email] = { email: email, name: name, sheetTotal: 0, cells: {} }; order.push(email); }
      p.sheetTotal += sheetTotal;
      cols.forEach(function (col) {
        var raw = String(row[col.i] === undefined ? "" : row[col.i]).trim().replace(/[\u2212\u2013\u2014]/g, "-").replace(/^\+/, ""); if (raw === "") return;
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
