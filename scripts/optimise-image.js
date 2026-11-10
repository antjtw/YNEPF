#!/usr/bin/env node
/* ==========================================================================
   optimise-image.js: shrink a photo to the size the site actually shows it
   at, and compress it, so it does not cost visitors bandwidth.

   Usage:
     npm install --no-save sharp          (once)
     node scripts/optimise-image.js <photo> <name> [width] [--responsive]

   Example (the homepage hero):
     node scripts/optimise-image.js ~/Downloads/bench.jpg hero 1000

   Writes assets/img/<name>.webp and assets/img/<name>.jpg at the given width
   (default 1000px; the hero shows at about 520px, so 1000px is sharp on retina
   screens), keeping the photo's own proportions. The page fills its frame with
   the image from the centre (CSS object-fit: cover), so nothing is cropped here.
   Photos straight from a phone are rotated and stripped of location data.

   With --responsive it also writes a 640px copy named <name>-640.webp/.jpg for
   phones (the homepage hero uses both). Example for a rotating hero photo:
     node scripts/optimise-image.js design/source-photos/squat.jpg hero-squat 1000 --responsive
   ========================================================================== */
const fs = require("fs");
const path = require("path");

let sharp;
try { sharp = require("sharp"); } catch (e) {
  console.error("This needs the 'sharp' package. Run:  npm install --no-save sharp");
  process.exit(1);
}
const args = process.argv.slice(2);
const responsive = args.includes("--responsive");
const [input, name, widthArg] = args.filter((a) => !a.startsWith("--"));
if (!input || !name) {
  console.error("Usage: node scripts/optimise-image.js <photo> <name> [width]");
  process.exit(1);
}
const width = parseInt(widthArg || "1000", 10);
const outDir = path.join(__dirname, "..", "assets", "img");
const kb = (f) => (fs.statSync(f).size / 1024).toFixed(0) + " KB";

async function write(base, meta, name, width) {
  const w = Math.min(width, meta.width);                     // never scale up
  const resized = () => base.clone().resize({ width: w, withoutEnlargement: true });
  const webp = path.join(outDir, name + ".webp"), jpg = path.join(outDir, name + ".jpg");
  await resized().webp({ quality: 74, effort: 5 }).toFile(webp);
  await resized().jpeg({ quality: 76, mozjpeg: true, progressive: true }).toFile(jpg);
  const out = await sharp(jpg).metadata();
  console.log(`Wrote ${out.width}x${out.height}:  ${path.relative(process.cwd(), webp)} (${kb(webp)})  ${path.relative(process.cwd(), jpg)} (${kb(jpg)})`);
}

(async () => {
  const base = sharp(input).rotate();                       // honour the camera's orientation; metadata is dropped on write
  const meta = await base.metadata();
  console.log(`Original ${meta.width}x${meta.height} (${kb(input)})`);
  await write(base, meta, name, width);
  if (responsive) await write(base, meta, name + "-640", 640);
})().catch((e) => { console.error(e.message); process.exit(1); });
