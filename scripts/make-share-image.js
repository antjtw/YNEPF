#!/usr/bin/env node
/* ==========================================================================
   make-share-image.js: renders scripts/share-image.html (1200 x 630) into
   assets/img/share.jpg, the picture shown when a link to the site is shared.

   Needs Playwright (with a browser) and sharp:
     npm install --no-save playwright sharp
     node scripts/make-share-image.js
   Edit scripts/share-image.html to change the wording or the photo.
   ========================================================================== */
const path = require("path");
const { chromium } = require("playwright");
const sharp = require("sharp");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "share-image.html"));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  const out = path.join(__dirname, "..", "assets", "img", "share.jpg");
  await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(out);
  const m = await sharp(out).metadata();
  console.log("Wrote assets/img/share.jpg " + m.width + "x" + m.height);
})().catch((e) => { console.error(e.message); process.exit(1); });
