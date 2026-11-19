// Tests for reading the old points sheet (assets/js/points-import.js).  node docs/entry-system/points-import.test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const PI = createRequire(import.meta.url)("../../assets/js/points-import.js");

assert.strictEqual(PI.parseDate("2025-03-01 00:00:00"), "2025-03-01"); assert.strictEqual(PI.parseDate("01/03/2025"), "2025-03-01");
assert.strictEqual(PI.parseDate("31/06/2026"), "2026-06-30", "a day that does not exist is clamped to the month's last day"); assert.strictEqual(PI.parseDate("soon"), "");
assert.deepStrictEqual(PI.parseCsv('a,"b,c","d ""q"" e"\n1,2,3\n'), [["a", "b,c", 'd "q" e'], ["1", "2", "3"]], "quotes and commas");

for (const [raw, want] of [["1 Mar 2025", "2025-03-01"], ["1-Mar-25", "2025-03-01"], ["Mar 1, 2025", "2025-03-01"], ["1/3/25", "2025-03-01"], ["30 Nov 2024", "2024-11-30"], ["31 Jun 2026", "2026-06-30"], ["1st March 2025", "2025-03-01"], ["Sept 9 2025", "2025-09-09"], ["1 Mar", ""], ["", ""]]) assert.strictEqual(PI.parseDate(raw), want, "date format " + raw);
{ // dates with no year are worked out from the columns before them, and the other ways a spreadsheet export writes things are accepted
  const o2 = PI.parse([",,,,,1 Nov 2024,1 Feb,15 Dec,", ",Name,Email,Points,,A,B,C", ",Al,al@x.com,2,,2,\u22121,1", ",Bo,not-an-email,3,,3,,"].join("\n"));
  assert.deepStrictEqual(o2.rows.map((r) => [r.date, r.delta]), [["2024-11-01", 2], ["2025-02-01", -1], ["2025-12-15", 1]], "a missing year carries on from the column before, rolling over at new year; a unicode minus is a minus");
  assert.deepStrictEqual(o2.report.noEmail, [{ name: "Bo", points: 3, email: "not-an-email" }], "an email that is not an email is reported with the others");
}

// the same shape as the real sheet: a row of dates, a header row, then people. Negative = spent. 'q' is a typo in a cell. A person with no email. A repeated email.
const csv = [
  ",Volunteer info,Last updated: 27/05,,,,,,",
  ",,,,,2025-03-01,2025-04-12,2025-12-31,",
  ",Name,Email,Points,,March Open,NESC,Q4 2025,Notes",
  ",,,,,,,,",
  ",Ann Lee,ann@x.com,4,,2,2,,Referee",
  ",Bob Ray,Bob@X.com,3,,1,-1,3,",
  ',"Cy, Jr",cy@x.com,0,,q,,,',
  ",No Mail,,2,,2,,,",
  ",Ann Lee,ann@x.com,1,,,1,,",
  ",Dee,dee@x.com,5,,2,,,",
].join("\n");
const out = PI.parse(csv);
assert.strictEqual(out.report.people, 4, "four people with an email (Ann appears twice and is merged): " + out.report.people);
assert.deepStrictEqual(out.report.noEmail, [{ name: "No Mail", points: 2, email: "" }], "a row with no email is listed, not loaded");
assert.deepStrictEqual(out.report.badCells, [{ name: "Cy, Jr", column: "March Open", value: "q" }], "a cell that is not a number is reported");
const ann = out.rows.filter((r) => r.email === "ann@x.com");
assert.deepStrictEqual(ann.map((r) => [r.date, r.delta]), [["2025-03-01", 2], ["2025-04-12", 3]], "a repeated email is merged, column by column");
assert(out.rows.some((r) => r.email === "bob@x.com" && r.delta === -1 && /^Spent: NESC$/.test(r.reason)) && out.rows.some((r) => r.email === "bob@x.com" && r.delta === 3 && /^Executive or committee service: Q4 2025$/.test(r.reason)), "negatives are spends, Q columns are service");
assert(out.rows.every((r) => r.key && r.date && r.delta !== 0), "every row has a key (so a second import is skipped), a date and a number");
assert.strictEqual(new Set(out.rows.map((r) => r.key)).size, out.rows.length, "the keys are unique");
assert.deepStrictEqual(out.report.mismatches.map((m) => [m.email, m.sheet, m.loaded]), [["dee@x.com", 5, 2]], "a person whose loaded total differs from the sheet's total is flagged (Dee: the sheet says 5, the columns add to 2)");
assert.strictEqual(out.report.earned, 5 + 4 + 2, "earned total"); assert.strictEqual(out.report.spent, 1, "spent total");
assert(PI.parse("nothing,here\n1,2").report.warnings.length === 1, "a file with the wrong layout says so");
console.log("points import tests passed");
