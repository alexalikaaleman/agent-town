"use strict";
/**
 * PNG privacy pass (Wonkavator W1): keep only IHDR, PLTE, tRNS, sRGB, gAMA, pHYs, IDAT and IEND.
 * Text, time and EXIF chunks (which can hold prompts, paths or names) are dropped.
 * Usage: node lib/png-strip.js <in.png> <out.png>
 */
const fs = require("fs");
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const KEEP = new Set(["IHDR", "PLTE", "tRNS", "sRGB", "gAMA", "pHYs", "IDAT", "IEND"]);

/** List of {type, start, end} chunks; throws on a non-PNG or a truncated file. */
function chunks(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  const out = [];
  for (let i = 8; i < buf.length; ) {
    if (i + 12 > buf.length) throw new Error("truncated PNG");
    const n = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    out.push({ type, start: i, end: i + 12 + n });
    i += 12 + n;
    if (type === "IEND") break;
  }
  return out;
}
function strip(buf) {
  const parts = [SIG];
  for (const c of chunks(buf)) if (KEEP.has(c.type)) parts.push(buf.subarray(c.start, c.end));
  return Buffer.concat(parts);
}
/** Width and height from IHDR. */
function size(buf) {
  const c = chunks(buf)[0];
  if (!c || c.type !== "IHDR") throw new Error("no IHDR");
  return [buf.readUInt32BE(c.start + 8), buf.readUInt32BE(c.start + 12)];
}
function stripFile(from, to) {
  const out = strip(fs.readFileSync(from));
  fs.mkdirSync(require("path").dirname(to), { recursive: true });
  fs.writeFileSync(to, out);
  return out;
}
module.exports = { chunks, strip, size, stripFile, KEEP };
if (require.main === module) {
  const [from, to] = process.argv.slice(2);
  if (!from || !to) { console.error("usage: node lib/png-strip.js <in.png> <out.png>"); process.exit(1); }
  stripFile(from, to);
}
