// Tests for the QR code maker used in the day pass email and on the pass page.
//   node --experimental-strip-types docs/entry-system/qr.test.mjs
// The encoder was checked by decoding its output with an independent QR reader (jsQR) for text of 1 to 213 characters, in versions 1 to 10,
// and as a PNG. The reader is not a dependency of this project, so this test pins that verified output instead: if the encoder changes,
// the picture for a fixed address changes and this fails. Re-verify with a QR reader, then update the fingerprint below.
import assert from "node:assert";
import crypto from "node:crypto";
import fs from "node:fs";
const wl = await import("../../supabase/functions/waitlist/index.ts");
const url = "https://www.ynepf.co.uk/pass?t=0123456789abcdef0123456789abcdef";
const m = wl.qrMatrix(url);
const print = crypto.createHash("sha256").update(m.map((r) => r.map((v) => (v ? 1 : 0)).join("")).join("\n")).digest("hex");
assert.strictEqual(m.length, 37, "a 63 character address is a version 5 code, 37 squares across");
assert.strictEqual(print, "6898f6b04f18875ee6d906e98859ff7f2c9f863c3755f88ae0dd467e161e0949", "the picture for a fixed address is the one a QR reader decoded");
assert([[0, 0], [30, 0], [0, 30]].every(([x, y]) => m[y][x] && m[y + 6][x + 6] && !m[y + 1][x + 1] && m[y + 3][x + 3]), "three finder squares in the corners");
assert.strictEqual(wl.qrMatrix("A").length, 21, "the smallest is version 1");
assert.throws(() => wl.qrMatrix("x".repeat(300)), /too long/, "too much text is refused, not mangled");
const png = await wl.qrPng(url, 8, 4);
assert.deepStrictEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10], "a PNG signature");
const w = (37 + 8) * 8;
assert.strictEqual(new DataView(png.buffer, png.byteOffset).getUint32(16), w, "width");
assert.strictEqual(new TextDecoder().decode(png.slice(-8, -4)), "IEND", "ends properly");
// the page copy is built from the same source
assert(fs.readFileSync(new URL("../../assets/js/qr.js", import.meta.url), "utf8").includes("function qrMatrix"), "assets/js/qr.js exists");
console.log("qr tests passed");
