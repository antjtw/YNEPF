// A small QR code maker: text in, black and white squares out. Byte mode, error correction level M, versions 1 to 10 (enough for a web address
// of up to 213 characters). No libraries. THIS FILE IS THE SOURCE: scripts/sync-email-template.mjs copies it into the waitlist function (which
// cannot import it) and builds assets/js/qr.js from it for the pass page. Tested by decoding the result (docs/entry-system/qr.test.mjs).
// Based on the published QR Code specification (ISO/IEC 18004).

const QR_ECC_PER_BLOCK: number[] = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // level M, versions 1 to 10
const QR_BLOCKS: number[] = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function qrRawModules(ver: number): number {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const a = Math.floor(ver / 7) + 2;
    r -= (25 * a - 10) * a - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const qrDataWords = (ver: number): number => Math.floor(qrRawModules(ver) / 8) - QR_ECC_PER_BLOCK[ver] * QR_BLOCKS[ver];

function qrAlign(ver: number): number[] {
  if (ver === 1) return [];
  const a = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.floor((ver * 8 + a * 3 + 5) / (a * 4 - 4)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < a; pos -= step) out.splice(1, 0, pos);
  return out;
}

function qrMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function qrDivisor(n: number): number[] {
  const out: number[] = new Array(n).fill(0); out[n - 1] = 1;
  let root = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { out[j] = qrMul(out[j], root); if (j + 1 < n) out[j] ^= out[j + 1]; }
    root = qrMul(root, 2);
  }
  return out;
}
function qrRemainder(data: number[], div: number[]): number[] {
  const out: number[] = new Array(div.length).fill(0);
  for (const b of data) {
    const f = b ^ (out.shift() as number); out.push(0);
    for (let i = 0; i < div.length; i++) out[i] ^= qrMul(div[i], f);
  }
  return out;
}

function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  for (; ver <= 10; ver++) { if (4 + (ver < 10 ? 8 : 16) + 8 * bytes.length <= qrDataWords(ver) * 8) break; }
  if (ver > 10) throw new Error("qr: text too long");
  const size = ver * 4 + 17;

  // the data bits: mode (byte), length, the bytes, a terminator, padding
  const bits: number[] = [];
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  const cap = qrDataWords(ver) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

  // error correction, split into blocks and interleaved
  const nb = QR_BLOCKS[ver], eccLen = QR_ECC_PER_BLOCK[ver], raw = Math.floor(qrRawModules(ver) / 8);
  const shortBlocks = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = qrDivisor(eccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1)); k += dat.length;
    const ecc = qrRemainder(dat, div);
    if (i < shortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const words: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < nb; j++) { if (i !== shortLen - eccLen || j >= shortBlocks) words.push(blocks[j][i]); }

  // the grid
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = qrAlign(ver);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const formatBits = (mask: number) => {           // level M is 0b00
    const d = mask; let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412, bit = (i: number) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  formatBits(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) !== 0, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // the codewords, in the zigzag the standard describes
  for (let i = 0, right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < words.length * 8) { mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }

  // try all eight masks, keep the one with the lowest penalty
  const masked = (m: number): boolean[][] => mod.map((row, y) => row.map((v, x) => {
    if (fn[y][x]) return v;
    const inv = m === 0 ? (x + y) % 2 === 0 : m === 1 ? y % 2 === 0 : m === 2 ? x % 3 === 0 : m === 3 ? (x + y) % 3 === 0 : m === 4 ? (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
      : m === 5 ? ((x * y) % 2) + ((x * y) % 3) === 0 : m === 6 ? (((x * y) % 2) + ((x * y) % 3)) % 2 === 0 : (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    return inv ? !v : v;
  }));
  const penalty = (g: boolean[][]): number => {
    let p = 0;
    const lines = (get: (a: number, b: number) => boolean) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        for (let b = 0; b + 10 < size; b++) {          // 1011101 with four light squares before or after it
          const pat = (at: number) => [1, 0, 1, 1, 1, 0, 1].every((v, k) => get(a, at + k) === (v === 1));
          const light = (at: number) => [0, 1, 2, 3].every((k) => !get(a, at + k));
          if (pat(b) && light(b + 7)) p += 40;
          if (pat(b + 4) && light(b)) p += 40;
        }
      }
    };
    lines((a, b) => g[a][b]); lines((a, b) => g[b][a]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) p += 3;
    let dark = 0; for (const row of g) for (const v of row) if (v) dark++;
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestScore = Infinity, bestGrid: boolean[][] = [];
  for (let m = 0; m < 8; m++) {
    const g = masked(m); const s = penalty(g);
    if (s < bestScore) { bestScore = s; best = m; bestGrid = g; }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = bestGrid[y][x];
  formatBits(best);
  return mod;
}

// The grid as an SVG picture (for the pass page), with the blank margin the standard asks for.
function qrSvg(m: boolean[][], border = 4): string {
  const n = m.length + border * 2;
  let d = "";
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) d += `M${x + border},${y + border}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// The grid as a PNG file (for the email), black and white, one bit per pixel.
async function qrPng(text: string, scale = 8, border = 4): Promise<Uint8Array> {
  const m = qrMatrix(text), n = m.length, w = (n + border * 2) * scale, rowBytes = Math.ceil(w / 8);
  const raw = new Uint8Array((rowBytes + 1) * w);
  for (let py = 0; py < w; py++) {
    const my = Math.floor(py / scale) - border;
    for (let px = 0; px < w; px++) {
      const mx = Math.floor(px / scale) - border;
      const dark = my >= 0 && my < n && mx >= 0 && mx < n && m[my][mx];
      if (!dark) raw[py * (rowBytes + 1) + 1 + (px >>> 3)] |= 0x80 >>> (px & 7);          // 1 is white, 0 is black
    }
  }
  const cs = new CompressionStream("deflate"), wr = cs.writable.getWriter();
  wr.write(raw); wr.close();
  const idat = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  const table: number[] = []; for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table.push(c >>> 0); }
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const chunk = (type: string, body: Uint8Array) => {
    const tb = new Uint8Array([...type].map((c) => c.charCodeAt(0)).concat(Array.from(body)));
    return [...u32(body.length), ...tb, ...u32(crc(tb))];
  };
  const ihdr = new Uint8Array([...u32(w), ...u32(w), 1, 0, 0, 0, 0]);          // 1 bit, greyscale
  return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", ihdr), ...chunk("IDAT", idat), ...chunk("IEND", new Uint8Array(0))]);
}
