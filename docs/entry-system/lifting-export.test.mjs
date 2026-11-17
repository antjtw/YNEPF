// Tests for the lifting order exports (assets/js/lifting-export.js).  node docs/entry-system/lifting-export.test.mjs
import { createRequire } from "node:module";
import assert from "node:assert";
const X = createRequire(import.meta.url)("../../assets/js/lifting-export.js");
const LS = createRequire(import.meta.url)("../../assets/js/lifting-sort.js");

const SPEC_HEADER = "Day,Session,Platform,Flight,Name,Sex,Equipment,Division1,Event1,BirthDate,Age,SquatRack,BenchRack,MemberID,Country,State,Lot,Guest,Novice,CanBreakRecords,Team,Instagram,Notes";
assert.strictEqual(X.COLUMNS.join(","), SPEC_HEADER, "the extended header is the YNE Worlds header, in order");
const STD_HEADER = "Day,Platform,Flight,Name,Sex,Equipment,Division1,Event1,BirthDate,Age,SquatRack,BenchRack,MemberID,Country,State,Lot,Guest,Team,Instagram,Notes";
assert.strictEqual(X.STANDARD.join(","), STD_HEADER, "the standard header has no Session, Novice or CanBreakRecords");

const people = {
  a: { name: "Smith, Jo", sex: "F", event: "full_power", equipment: "classic", dob: "1998-02-16", ageCat: "J", bp: "BP1", club: 'Iron "Works", Leeds', instagram: "@jo", classLabel: "63" },
  b: { name: "Ann  Lee", sex: "F", event: "bench_only", equipment: "equipped", dob: "1975-12-01", ageCat: "M1", bp: "", club: "", classLabel: "57" },
  c: { name: "Bob Ray", sex: "M", event: "full_power", equipment: "classic", dob: "1990-06-30", ageCat: "", guest: true, divisionName: "North West", canBreakRecords: false, classLabel: "83" }
};
const sessions = [{ day: 1, sessionNo: 1, flights: [{ letter: "A", lifters: [{ id: "b", lot: 2 }, { id: "a", lot: 1 }] }, { letter: "B", lifters: [{ id: "c", lot: 3 }] }] }];
const comp = { name: "TEST Open", start_date: "2026-06-13" };
const rows = X.openLifterRows(sessions, people, comp, {});
const EXT = { extended: true };
const csv = X.openLifterCsv(rows, EXT);
const lines = csv.trim().split("\r\n");
assert.strictEqual(lines[0], SPEC_HEADER, "the file starts with the reference header, byte for byte");
assert.strictEqual(lines.length, 4, "a header and three lifters");
assert(lines[1].startsWith("1,1,1,A,Smith Jo,F,Sleeves,FR-O,SBD,'1998-02-16,28,"), "ordered by flight then lot, commas stripped, apostrophe date, age on the day: " + lines[1]);
assert(lines[1].includes(",Iron Works Leeds,"), "commas and double quotes removed from values, spaces collapsed");
assert(lines[2].includes("Ann Lee,F,Single-ply,FE-O,B,'1975-12-01,50,"), "equipped bench only maps to Single-ply and B; double spaces collapsed");
assert.strictEqual(lines[3].split(",")[17], "Yes", "guest is Yes");
assert.strictEqual(lines[3].split(",")[19], "No", "can't break records is No"); assert.strictEqual(lines[3].split(",")[22], "North West Guest", "a guest who cannot break records is noted by their own division");
assert.strictEqual(X.openLifterRows(sessions, { ...people, c: { ...people.c, canBreakRecords: true } }, comp, {})[2].Notes, "Divisional Guest", "a guest who can break records is a Divisional Guest"); assert.strictEqual(lines[1].split(",")[21], "jo", "the @ is dropped from Instagram");
assert.deepStrictEqual(X.validateOpenLifter(csv, { days: 1, platforms: 1, extended: true }), [], "a generated extended file passes OpenLifter's checks");
// the standard file (the default) has no Session, Novice or CanBreakRecords, and is what the public OpenLifter accepts
const stdCsv = X.openLifterCsv(rows), stdLines = stdCsv.trim().split("\r\n");
assert.strictEqual(stdLines[0], STD_HEADER, "the default file has the standard header"); assert(!/Session|Novice|CanBreakRecords/.test(stdLines[0]), "no unknown headers");
assert.deepStrictEqual(X.validateOpenLifter(stdCsv, { days: 1, platforms: 1 }), [], "the standard file passes");
assert(/Unknown header Session in column/.test(X.validateOpenLifter(csv, { days: 1 }).join("|")), "an extended file is refused by the standard rules, as the real OpenLifter did");
assert.strictEqual(stdLines[1].split(",").length, 20, "20 columns in the standard file");

// the validator catches what OpenLifter would reject
const bad = (c, o) => X.validateOpenLifter(c, { extended: true, ...o }).join(" | ");
assert(/Unknown header Insta in column/.test(bad(csv.replace("Instagram", "Insta"))), "unknown header");
assert(/appears twice/.test(bad(csv.replace("Country", "State"))), "repeated header");
assert(/Day column must come before Platform/.test(bad(csv.replace("Day,Session,Platform", "Platform,Session,Day"))), "Platform before Day");
assert(/outside the 1 day/.test(bad(csv.replace(/\r\n2,/, "\r\n2,"), { days: 1 }) + bad(csv.replace("1,1,1,A,Smith", "3,1,1,A,Smith"), { days: 1 })), "day beyond the meet");
assert(/Platform 1 is outside/.test(bad(csv, { days: 1, platforms: 0 })), "platform beyond the day's platforms");
assert(/BirthDate/.test(bad(csv.replace("'1998-02-16", "16/02/1998"))) && /BirthDate/.test(bad(csv.replace("'1998-02-16", "'1919-02-16"))), "date format and years before 1920");
assert(/Lot must/.test(bad(csv.replace(/^1,1,1,A,Smith Jo(.*?),1,No,/m, "1,1,1,A,Smith Jo$1,0,No,"))), "lot must be positive");
assert(/Yes or No/.test(bad(csv.replace(",Yes,No,No,Yes,", ",Maybe,No,No,Yes,")) + bad(csv.replace("No,No,Yes,Iron", "No,No,Sure,Iron"))), "Yes/No columns");
assert(/double quote/.test(bad(csv.replace("Bob Ray", 'Bob "Ray"'))), "double quotes");
assert(/Event1/.test(bad(csv.replace(",SBD,", ",XYZ,"))) && /no division/.test(bad(csv.replace("FR-O", ""))), "mandatory fields");
assert(/Sex must/.test(bad(csv.replace(",F,Sleeves", ",X,Sleeves"))) && /Equipment must/.test(bad(csv.replace("Sleeves", "Leotard"))), "sex and equipment values");

// settings: the division table, equipment mapping and column list are editable
const custom = X.openLifterRows(sessions, people, comp, { divisions: { "F:classic": "WJ-Raw" }, equipment: { classic: "Bare", equipped: "Multi-ply" }, novice: true });
assert.strictEqual(custom[0].Division1, "WJ-Raw"); assert.strictEqual(custom[0].Equipment, "Bare"); assert.strictEqual(custom[0].Novice, "Yes");
assert.strictEqual(X.openLifterCsv(rows, { columns: ["Day", "Name"] }).split("\r\n")[1], "1,Smith Jo", "the column list is a setting");
assert.strictEqual(X.ageOn("2000-06-14", "2026-06-13"), 25, "age is whole years on the day"); assert.strictEqual(X.ageOn("2000-06-13", "2026-06-13"), 26);

// a real sort and draw, 96 lifters, exports cleanly
const many = Array.from({ length: 96 }, (_, i) => ({ id: "L" + i, name: "Lifter, " + i, sex: i % 3 ? "M" : "F", classLabel: ["74", "83", "93"][i % 3], event: i % 10 ? "full_power" : "bench_only", total: 300 + i, glp: 70 }));
const built = LS.build(many, { days: 2 });
const flights = built.sessions.flatMap((s) => s.flights), lots = LS.assignLots(flights);
const ppl = {}; many.forEach((m) => { ppl[m.id] = { ...m, equipment: "classic", dob: "1995-05-05", ageCat: "", bp: "B" + m.id }; });
const arr = built.sessions.map((s) => ({ day: s.day, sessionNo: s.sessionNo, prime: s.prime, flights: s.flights.map((f) => ({ letter: f.letter, lifters: f.lifters.map((l) => ({ id: l.id, lot: lots[l.id] })) })) }));
const big = X.openLifterCsv(X.openLifterRows(arr, ppl, comp, {}), EXT);
assert.deepStrictEqual(X.validateOpenLifter(big, { days: 2, platforms: 1, extended: true }), [], "96 lifters pass the validation");
assert.strictEqual(big.trim().split("\r\n").length, 97);

// the real file from YNE Worlds 2026: same header byte for byte, and it passes our port of the importer's checks
import fs from "node:fs";
const real = fs.readFileSync(new URL("./fixtures/yne-worlds-2026-openlifter.csv", import.meta.url), "utf8");
assert.strictEqual(real.split(/\r?\n/)[0], X.COLUMNS.join(","), "our header matches the real file's header");
assert.deepStrictEqual(X.validateOpenLifter(real, { days: 2, platforms: 1, extended: true }), [], "the real file passes our validation");

// printable sheets, in the federation's layouts
const cmp = { name: "TEST <Open>", start_date: "2026-11-07", venue_name: "Riccall Regen Centre" };
const weigh = X.weighInSheet(arr, ppl, cmp), score = X.scoreSheet(arr, ppl, cmp), rack = X.rackSheet(arr, ppl, cmp), kit = X.kitSheet(arr, ppl, cmp);
assert(weigh.includes("TEST &lt;Open&gt;") && !weigh.includes("<Open>"), "names are escaped");
assert.strictEqual((weigh.match(/<section/g) || []).length, arr.length, "one weigh-in page per session");
assert.strictEqual((rack.match(/<section/g) || []).length, arr.length, "one rack heights page per session");
assert.strictEqual((kit.match(/<section/g) || []).length, arr.length, "one kit check page per session");
assert.strictEqual((score.match(/<section/g) || []).length, flights.length, "one score sheet per flight");
assert(weigh.includes("7 November 2026") && weigh.includes("Riccall Regen Centre") && weigh.includes("Weigh in Official 2") && weigh.includes("Club / Team"), "weigh-in has the date, venue and two officials");
assert(score.includes("Centre Referee") && score.includes("BWT cl. placing") && (score.match(/Side Referee/g) || []).length >= 2 * flights.length, "score sheet has the referees' blocks");
assert(kit.includes("Technical Controller") && kit.includes("Knee sleeves") && rack.includes("Squat stands") && rack.includes("Blocks"), "kit check and rack heights columns");
const firstLots = [...weigh.split("</section>")[0].matchAll(/<td class="c">(\d+)<\/td><td>/g)].map((m) => +m[1]);
assert.deepStrictEqual(firstLots, [...firstLots].sort((a, b) => a - b), "weigh-in is in lot order");
const guestPage = X.weighInSheet(arr, { L0: { ...ppl.L0, guest: true } }, cmp);
assert(X.weighInSheet([{ day: 1, sessionNo: 1, flights: [{ letter: "A", lifters: [{ id: "g", lot: 1 }] }] }], { g: { name: "Guest Gus", sex: "M", classLabel: "74", ageCat: "J", guest: true } }, cmp).includes("Guest Gus (Guest)") && guestPage, "guests are marked");
console.log("lifting export tests passed");
