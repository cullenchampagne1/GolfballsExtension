/* ───────────────────────────────────────────────────────────────────────────
   snugzImport.js — import the snugzusa.com catalog as custom items.

   SnugZ pricing is behind login, so all fetches run inside a hidden snugzusa.com
   iframe (same-origin → carries the rep's SnugZ session). The background owns the
   iframe + the in-frame fetch/parse (see background.js `snugzInit` / `snugzFetch`);
   this module orchestrates + does the pricing math.

   Flow: scrape nav categories → list product slugs per category → fetch each
   product detail (tier ladder + setup + zipit + options) → price it → save.

   Pricing (constants below):
     netCost(tier) = listedPrice × 0.60            (the "(c)" EQP = 40% off list)
     OUR PRICE(q)  = (netCost + setup/q + SHIP)/(1−MARGIN) + (zipit ? ZIPIT/q : 0)

   Deduped by SKU on save. The optional `signal` ({aborted}) cancels mid-run.
   ─────────────────────────────────────────────────────────────────────────── */

import { addCustomItems } from './customItems.js';
import { sendBackgroundMessage } from './backgroundMessage.js';

const ORIGIN = 'https://snugzusa.com';
const NET_RATIO = 0.60;       // our cost as a fraction of the listed price
const MARGIN = 0.40;          // gross margin on (cost + setup + ship)
const SHIP_PER_UNIT = 0.10;   // margin-marked-up shipping
const ZIPIT_AMOUNT = 40;      // ZIP-IT freight (pass-through, post-margin) when data-zipit=1

const round2 = (n) => Math.round(n * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stopped = (signal) => !!(signal && signal.aborted);

/* Build price + cost ladders from parsed tiers ([[qty, listedPrice], …]). */
function laddersFrom(tiers, setup, zipit) {
  const breaks = [], costBreaks = [];
  for (const [q, listed] of tiers) {
    if (!q || !listed) continue;
    const net = round2(listed * NET_RATIO);
    let price = round2((net + setup / q + SHIP_PER_UNIT) / (1 - MARGIN));
    if (zipit) price = round2(price + ZIPIT_AMOUNT / q);
    breaks.push({ q, p: price });
    costBreaks.push({ q, c: net });
  }
  return { breaks, costBreaks };
}

/* Full import. `onProgress({phase,...})` fires through both phases. */
export async function importSnugzCatalog({ onProgress, signal } = {}) {
  const init = await sendBackgroundMessage('snugzInit');
  if (stopped(signal)) throw new Error('cancelled');
  const cats = (init && init.categories) || [];
  if (!cats.length) throw new Error('No SnugZ categories found (sign in to snugzusa.com first)');

  // Phase 1 — collect product slugs across every category.
  const slugs = new Set();
  for (let i = 0; i < cats.length; i++) {
    if (stopped(signal)) break;
    try {
      const r = await sendBackgroundMessage('snugzFetch', { urls: [ORIGIN + cats[i]], kind: 'list' });
      (r.results || []).forEach((x) => (x.slugs || []).forEach((s) => slugs.add(s)));
    } catch { /* skip a bad category */ }
    if (onProgress) onProgress({ phase: 'list', cat: i + 1, cats: cats.length, found: slugs.size });
    await sleep(120);
  }
  const list = [...slugs];
  if (!list.length) throw new Error('No SnugZ products found in categories');

  // Phase 2 — fetch + parse each product's detail (batched).
  const records = [];
  const BATCH = 8;
  let done = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    if (stopped(signal)) break;
    const urls = list.slice(i, i + BATCH).map((s) => `${ORIGIN}/product/${s}`);
    let results = [];
    try { const r = await sendBackgroundMessage('snugzFetch', { urls, kind: 'detail' }); results = r.results || []; }
    catch { /* skip a bad batch */ }
    for (const x of results) {
      const d = x.detail;
      if (!d || !d.tiers || !d.tiers.length) continue;
      const { breaks, costBreaks } = laddersFrom(d.tiers, d.setup || 0, d.zipit);
      if (!breaks.length) continue;
      records.push({
        name: d.name || d.sku || 'SnugZ product',
        sku: d.sku || '',
        itemID: d.sku || '',
        thumbnail: d.image || '',
        link: x.url,
        source: 'snugz',
        extraDetails: 'SnugZ',
        styleOptions: d.options || [],
        breaks,
        costBreaks,
        cost: costBreaks[0].c,
        setup: d.setup || 0,
      });
    }
    done = Math.min(done + urls.length, list.length);
    if (onProgress) onProgress({ phase: 'detail', count: done, total: list.length });
    await sleep(150);
  }
  if (stopped(signal)) throw new Error('cancelled');
  if (!records.length) throw new Error('No SnugZ products parsed (pricing may need a SnugZ login)');
  const res = await addCustomItems(records);
  return { fetched: records.length, added: res.added, updated: res.updated };
}
