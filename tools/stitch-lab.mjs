/* Stitch-path embroidery lab (PEmbroider-style). Instead of faking texture
   with a filter, GENERATE real thread geometry: fill each traced color region
   with parallel satin/tatami stitch lines (clipped to the region, segmented
   into individual stitches, two-tone for sheen), then add a subtle raised
   bevel + fabric for the Photoshop-mockup look. Output → /tmp/stitch_out.png */
import ImageTracer from 'imagetracerjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ---- bg removal (border-sample) + trace ----
function removeBackground(idata, tol) {
  const d = idata.data, w = idata.width, h = idata.height;
  let sr = 0, sg = 0, sb = 0, sn = 0;
  const s = (p) => { const o = p * 4; if (d[o + 3] > 128) { sr += d[o]; sg += d[o + 1]; sb += d[o + 2]; sn++; } };
  for (let x = 0; x < w; x++) { s(x); s((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { s(y * w); s(y * w + (w - 1)); }
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; continue; }
    if (sn && Math.abs(d[i] - sr / sn) + Math.abs(d[i + 1] - sg / sn) + Math.abs(d[i + 2] - sb / sn) <= tol) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; }
  }
}
function medianCutPalette(idata, maxColors) {
  const d = idata.data, n = idata.width * idata.height, step = Math.max(1, Math.floor(n / 24000));
  const px = []; let tr = false;
  for (let i = 0; i < n; i += step) { const o = i * 4; if (d[o + 3] < 128) { tr = true; continue; } px.push([d[o], d[o + 1], d[o + 2]]); }
  if (!px.length) return [{ r: 0, g: 0, b: 0, a: 0 }];
  const want = Math.max(1, maxColors - (tr ? 1 : 0));
  const boxOf = (a) => { let r0 = 255, g0 = 255, b0 = 255, r1 = 0, g1 = 0, b1 = 0; for (const [r, g, b] of a) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (b < b0) b0 = b; if (b > b1) b1 = b; } const rr = r1 - r0, gr = g1 - g0, brr = b1 - b0; return { arr: a, range: Math.max(rr, gr, brr), channel: rr >= gr && rr >= brr ? 0 : (gr >= brr ? 1 : 2) }; };
  let boxes = [boxOf(px)];
  while (boxes.length < want) { boxes.sort((a, b) => b.range - a.range); const box = boxes[0]; if (!box || box.range === 0 || box.arr.length < 2) break; boxes.shift(); const ch = box.channel; box.arr.sort((a, b) => a[ch] - b[ch]); const m = box.arr.length >> 1; boxes.push(boxOf(box.arr.slice(0, m)), boxOf(box.arr.slice(m))); }
  const pal = boxes.map(({ arr }) => { let r = 0, g = 0, b = 0; for (const p of arr) { r += p[0]; g += p[1]; b += p[2]; } const k = arr.length || 1; return { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(b / k), a: 255 }; });
  const merged = []; for (const c of pal) { if (merged.some((m) => Math.abs(m.r - c.r) + Math.abs(m.g - c.g) + Math.abs(m.b - c.b) < 24)) continue; merged.push(c); }
  if (tr) merged.unshift({ r: 0, g: 0, b: 0, a: 0 });
  return merged;
}

// ---- stitch generation ----
function shade(rgb, f) { // f>1 lighten, f<1 darken
  const m = rgb.match(/\d+/g).map(Number);
  return `rgb(${m.map((v) => Math.max(0, Math.min(255, Math.round(v * f)))).join(',')})`;
}
function bbox(d) {
  const nums = d.match(/-?[\d.]+/g).map(Number);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i + 1 < nums.length; i += 2) { const x = nums[i], y = nums[i + 1]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
const STITCH = { angleDeg: -52, spacing: 3.0, width: 2.0, dash: '7 1.6' };
function satinFill(d, fill, idx) {
  const b = bbox(d);
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const ext = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2 + 4;
  // slight per-region angle variation so adjacent shapes don't look printed
  const ang = (STITCH.angleDeg + (idx % 2 ? 8 : -6)) * Math.PI / 180;
  const dx = Math.cos(ang), dy = Math.sin(ang);     // thread direction
  const nx = -Math.sin(ang), ny = Math.cos(ang);    // step direction
  const light = shade(fill, 1.18), dark = shade(fill, 0.82);
  let lines = '';
  let k = 0;
  for (let s = -ext; s <= ext; s += STITCH.spacing) {
    const mx = cx + nx * s, my = cy + ny * s;
    const x1 = (mx - dx * ext).toFixed(1), y1 = (my - dy * ext).toFixed(1);
    const x2 = (mx + dx * ext).toFixed(1), y2 = (my + dy * ext).toFixed(1);
    lines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${k % 2 ? light : dark}"/>`;
    k++;
  }
  return `<clipPath id="cp${idx}"><path d="${d}"/></clipPath>
    <g clip-path="url(#cp${idx})" stroke-width="${STITCH.width}" stroke-linecap="round" stroke-dasharray="${STITCH.dash}">${lines}</g>
    <path d="${d}" fill="none" stroke="${dark}" stroke-width="1.4" stroke-linejoin="round" opacity="0.85"/>`;
}
function stitchify(tracedSvg) {
  const m = tracedSvg.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
  const W = m ? m[1] : 600, H = m ? m[2] : 600;
  const paths = [...tracedSvg.matchAll(/<path fill="(rgb\([^)]+\))"[^>]*opacity="([\d.]+)"[^>]*d="([^"]+)"/g)]
    .map((mm) => ({ fill: mm[1], opacity: +mm[2], d: mm[3] }))
    .filter((p) => p.opacity > 0.05);
  let defs = '', body = '';
  paths.forEach((p, i) => { const seg = satinFill(p.d, p.fill, i); const ci = seg.indexOf('</clipPath>') + 11; defs += seg.slice(0, ci); body += seg.slice(ci); });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="max-width:100%;max-height:100%;width:auto;height:auto" filter="url(#raise)">
    <defs>${defs}</defs>${body}</svg>`;
}

// ---- build ----
const png = PNG.sync.read(readFileSync('/tmp/woven_source.png'));
const idata = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
removeBackground(idata, 40);
const pal = medianCutPalette(idata, 8);
const traced = ImageTracer.imagedataToSVG(idata, { pal, colorsampling: 0, colorquantcycles: 3, mincolorratio: 0, ltres: 1, qtres: 1, pathomit: 8, strokewidth: 0, scale: 1 });
const stitched = stitchify(traced);

// subtle raised bevel for the puffed-thread look (applied to the whole patch)
const RAISE = `<filter id="raise" x="-8%" y="-8%" width="116%" height="116%">
  <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b"/>
  <feSpecularLighting in="b" surfaceScale="1.6" specularConstant="0.5" specularExponent="18" lighting-color="#fff" result="s"><feDistantLight azimuth="235" elevation="60"/></feSpecularLighting>
  <feComposite in="s" in2="SourceAlpha" operator="in" result="sc"/>
  <feComposite in="SourceGraphic" in2="sc" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0"/>
</filter>`;
const FABRIC = `background-color:#272a30;background-image:repeating-linear-gradient(48deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 5px),repeating-linear-gradient(48deg, rgba(0,0,0,0.30) 0 2px, transparent 2px 6px),repeating-linear-gradient(-42deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 7px)`;
const html = `<!doctype html><html><body style="margin:0"><div style="width:560px;height:380px;${FABRIC};display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box"><svg width="0" height="0">${RAISE}</svg>${stitched}</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 560, height: 380, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 250));
await page.screenshot({ path: '/tmp/stitch_out.png' });
await browser.close();
console.log('palette:', JSON.stringify(pal), '\nwrote /tmp/stitch_out.png');
