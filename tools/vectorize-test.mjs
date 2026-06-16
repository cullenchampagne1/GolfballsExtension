/* Headless repro of the ImageVectorizer trace pipeline so we can see why a
   white-dominated logo (HBKS) traces blank. Builds a synthetic 700x534
   white image with a teal blob + dark text bars, runs removeBackground +
   medianCutPalette + ImageTracer, and reports the palette + path/fill stats. */
import ImageTracer from 'imagetracerjs';

function makeImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const o = i * 4; data[o] = data[o + 1] = data[o + 2] = 255; data[o + 3] = 255; }
  const set = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; };
  // teal lotus blob (circle) centered top
  const cx = w / 2, cy = h * 0.32, rad = h * 0.16;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy < rad * rad) set(x, y, 90, 150, 170); }
  // dark grey "HBKS" bars bottom
  for (let y = Math.round(h * 0.6); y < Math.round(h * 0.85); y++)
    for (let x = Math.round(w * 0.2); x < Math.round(w * 0.8); x++)
      if ((x % 80) < 50) set(x, y, 70, 75, 80);
  return { width: w, height: h, data };
}

function removeBackground(idata, tol) {
  const w = idata.width, h = idata.height, d = idata.data;
  const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + (w - 1)];
  let br = 0, bg = 0, bb = 0;
  for (const p of corners) { const o = p * 4; br += d[o]; bg += d[o + 1]; bb += d[o + 2]; }
  br = Math.round(br / 4); bg = Math.round(bg / 4); bb = Math.round(bb / 4);
  const visited = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + (w - 1)); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop();
    if (visited[p]) continue;
    visited[p] = 1;
    const o = p * 4;
    const dist = Math.abs(d[o] - br) + Math.abs(d[o + 1] - bg) + Math.abs(d[o + 2] - bb);
    if (dist > tol) continue;
    d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 0; removed++;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  return removed;
}

function medianCutPalette(idata, maxColors) {
  const d = idata.data;
  const n = idata.width * idata.height;
  const step = Math.max(1, Math.floor(n / 24000));
  const px = [];
  let transparent = false;
  for (let i = 0; i < n; i += step) { const o = i * 4; if (d[o + 3] < 128) { transparent = true; continue; } px.push([d[o], d[o + 1], d[o + 2]]); }
  if (!px.length) return [{ r: 0, g: 0, b: 0, a: 0 }];
  const want = Math.max(1, maxColors - (transparent ? 1 : 0));
  const boxOf = (arr) => {
    let rmin = 255, gmin = 255, bmin = 255, rmax = 0, gmax = 0, bmax = 0;
    for (const [r, g, b] of arr) { if (r < rmin) rmin = r; if (r > rmax) rmax = r; if (g < gmin) gmin = g; if (g > gmax) gmax = g; if (b < bmin) bmin = b; if (b > bmax) bmax = b; }
    const rr = rmax - rmin, gr = gmax - gmin, brange = bmax - bmin;
    const range = Math.max(rr, gr, brange);
    const channel = rr >= gr && rr >= brange ? 0 : (gr >= brange ? 1 : 2);
    return { arr, range, channel };
  };
  let boxes = [boxOf(px)];
  while (boxes.length < want) {
    boxes.sort((a, b) => b.range - a.range);
    const box = boxes[0];
    if (!box || box.range === 0 || box.arr.length < 2) break;
    boxes.shift();
    const ch = box.channel;
    box.arr.sort((a, b) => a[ch] - b[ch]);
    const mid = box.arr.length >> 1;
    boxes.push(boxOf(box.arr.slice(0, mid)), boxOf(box.arr.slice(mid)));
  }
  const pal = boxes.map(({ arr }) => { let r = 0, g = 0, b = 0; for (const p of arr) { r += p[0]; g += p[1]; b += p[2]; } const k = arr.length || 1; return { r: Math.round(r / k), g: Math.round(g / k), b: Math.round(b / k), a: 255 }; });
  const merged = [];
  for (const c of pal) { if (merged.some((m) => Math.abs(m.r - c.r) + Math.abs(m.g - c.g) + Math.abs(m.b - c.b) < 24)) continue; merged.push(c); }
  if (transparent) merged.unshift({ r: 0, g: 0, b: 0, a: 0 });
  return merged;
}

const W = 700, H = 534;
const img = makeImage(W, H);
const removed = removeBackground(img, 40);
console.log('bg pixels removed:', removed, '/', W * H, `(${(100 * removed / (W * H)).toFixed(1)}%)`);
const pal = medianCutPalette(img, 8);
console.log('palette:', JSON.stringify(pal));
const opts = { pal, colorsampling: 0, colorquantcycles: 3, mincolorratio: 0, ltres: 1, qtres: 1, pathomit: 8, blurradius: 0, blurdelta: 20, strokewidth: 0, linefilter: true, scale: 1716 / 700 };
const svg = ImageTracer.imagedataToSVG(img, opts);
const paths = (svg.match(/<path/g) || []).length;
const fills = [...svg.matchAll(/fill="(rgb\([^)]+\))"/g)].map((m) => m[1]);
const opacities = [...svg.matchAll(/opacity="([^"]+)"/g)].map((m) => m[1]);
console.log('svg length:', svg.length, 'paths:', paths);
console.log('distinct fills:', [...new Set(fills)]);
console.log('distinct opacities:', [...new Set(opacities)]);
console.log('svg head:', svg.slice(0, 400));

// ---- mono/silhouette test ----
console.log('\n=== MONO ===');
const img2 = makeImage(W, H);
removeBackground(img2, 40);
const d2 = img2.data;
for (let i = 0; i < d2.length; i += 4) {
  const a = d2[i + 3];
  const lum = 0.299 * d2[i] + 0.587 * d2[i + 1] + 0.114 * d2[i + 2];
  if (a > 10 && lum < 128) { d2[i] = d2[i+1] = d2[i+2] = 0; d2[i+3] = 255; }
  else { d2[i+3] = 0; }
}
const monoOldPal = [{ r:0, g:0, b:0, a:255 }];
const svgOld = ImageTracer.imagedataToSVG(img2, { colorsampling:0, pal: monoOldPal, colorquantcycles:1, ltres:1, qtres:1, pathomit:8, strokewidth:0, scale: 1716/700 });
console.log('OLD mono pal fills:', [...new Set([...svgOld.matchAll(/fill="(rgb\([^)]+\))"/g)].map(m=>m[1]))], 'opacities:', [...new Set([...svgOld.matchAll(/opacity="([^"]+)"/g)].map(m=>m[1]))]);

const img3 = makeImage(W, H);
removeBackground(img3, 40);
const d3 = img3.data;
for (let i = 0; i < d3.length; i += 4) {
  const a = d3[i + 3];
  const lum = 0.299 * d3[i] + 0.587 * d3[i + 1] + 0.114 * d3[i + 2];
  if (a > 10 && lum < 128) { d3[i] = d3[i+1] = d3[i+2] = 0; d3[i+3] = 255; }
  else { d3[i] = d3[i+1] = d3[i+2] = 0; d3[i+3] = 0; }
}
const monoNewPal = [{ r:0, g:0, b:0, a:0 }, { r:0, g:0, b:0, a:255 }];
const svgNew = ImageTracer.imagedataToSVG(img3, { colorsampling:0, pal: monoNewPal, colorquantcycles:1, ltres:1, qtres:1, pathomit:8, strokewidth:0, scale: 1716/700 });
console.log('NEW mono pal fills:', [...new Set([...svgNew.matchAll(/fill="(rgb\([^)]+\))"/g)].map(m=>m[1]))], 'opacities:', [...new Set([...svgNew.matchAll(/opacity="([^"]+)"/g)].map(m=>m[1]))]);
