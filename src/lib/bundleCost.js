/* ───────────────────────────────────────────────────────────────────────────
   bundleCost.js — derive a multipack's real cost from its single sibling.

   The catalog sells "Double Dozen" (and the odd "Triple Dozen") balls as their
   OWN parentSku — a marketing bundle that carries no synced inventory cost, so
   the margin model fell back to a flat 40% estimate. But the true cost is just
   the single dozen's cost × the pack count (a double dozen = 2 × the dozen).

   There's no machine link in the Solr feed from a bundle to its single (the
   `bundleItems` field is free-text component NAMES — "tee, poker chip" — not
   SKUs), so we join on the product TITLE: strip the pack phrase + model-year /
   "Logo Overrun" markers to a model key, then within (brand, key) pick the
   single with the highest parentSku number — i.e. the current season's release,
   not last year's. Validated against the live feed: every premium ball line
   (Bridgestone Tour B, Callaway Chrome, TaylorMade TP5, …) resolves to its
   current single; oddly-named packs ("Fan Pack", "Variety", "Box") with no
   clean sibling resolve to null and keep the existing estimate (never worse).
   ─────────────────────────────────────────────────────────────────────────── */

/* The dozen-count a multipack is PRICED as (and therefore cost as): the single
   dozen's cost × this. "Double/Two Dozen" → 2, "Triple Dozen" → 3, and a
   "Buy N DZ Get M DZ Free" → N (it's priced as the N paid dozens — e.g.
   $61.98 = 2 × the $30.99 dozen — with the giveaway baked into the deal).
   1 = not a multipack. Matches the phrase anywhere in the title. */
export function packMultiple(title) {
  const t = String(title || '').toLowerCase();
  const buy = /\bbuy\s*(\d+)\s*(?:dz|dozen)\b/.exec(t);
  if (buy) return parseInt(buy[1], 10) || 1;
  if (/\btriple\s+dozen\b/.test(t)) return 3;
  if (/\b(?:double|two)\s+dozen\b/.test(t)) return 2;
  return 1;
}

/* True when a product is a golf ball (itemType wins; title is the seed/older
   fallback). Only balls are bundle-decomposed — apparel/gift-set "sets" have
   their own pricing. */
export function isBall(p) {
  if (!p) return false;
  const it = String(p.itemType || '').toLowerCase();
  if (it.includes('golf_ball')) return true;
  return /golf ball/i.test(p.title || '');
}

/* Normalize a ball title to a model key so a bundle lands on the same key as
   its single-dozen sibling. Strips the pack phrase, "{Decoration}" qualifier,
   model-year markers ("- 2026 Model", leading "2024 "), and "Logo Overrun"
   (the overrun + regular share a parentSku, so they collapse to one key). */
export function ballModelKey(title) {
  let t = String(title || '').toLowerCase();
  t = t.replace(/[({[][^)}\]]*[)}\]]/g, ' ');             // drop {Decoration} / (Custom Logo)
  t = t.replace(/[-–—]?\s*buy\s*\d+\s*(?:dz|dozen)\s*get\s*\d+\s*(?:dz|dozen)\s*free\b/g, ' '); // "- Buy 2 DZ Get 1 DZ Free"
  t = t.replace(/\b(?:double|triple|two|three)\s+dozen\b/g, ' ');
  t = t.replace(/\b(?:fan\s+pack|box)\b/g, ' ');
  t = t.replace(/[-–—]\s*\d{4}\s*model\b/g, ' ');         // "- 2026 Model"
  t = t.replace(/^\s*\d{4}\s+/, ' ');                     // leading "2024 …"
  t = t.replace(/\blogo\s+overrun\b/g, ' ');
  t = t.replace(/\boverrun\b/g, ' ');
  t = t.replace(/[-–—]/g, ' ');
  t = t.replace(/[^a-z0-9+ ]/g, ' ');                     // keep the "+" in "Distance+"
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

/* Trailing numeric part of a parentSku ("B5871" → 5871) — higher = newer
   release, which is how we pick the current single among model-year siblings. */
function skuNum(sku) {
  const m = /(\d+)\s*$/.exec(String(sku || ''));
  return m ? parseInt(m[1], 10) : -1;
}

/* The (brand, modelKey) join key. A catalog product carries the brand in a
   SEPARATE field (title_s = "Soft Feel 14 Golf Balls"), but a saved-proposal /
   cart line bakes it into the title ("Srixon Soft Feel 14 Golf Balls …"); strip
   a leading brand so both sides key the same. */
function bundleKey(brand, title) {
  const b = String(brand || '').trim();
  let t = String(title || '');
  if (b && t.toLowerCase().startsWith(b.toLowerCase())) t = t.slice(b.length);
  return b.toLowerCase() + '|' + ballModelKey(t);
}

/* (brand|modelKey) → best single SKU, rebuilt whenever the catalog loads. */
let _index = new Map();

/* Index the loaded catalog: for every NON-bundle ball, keep the highest-numbered
   parentSku under its (brand, modelKey) — the current season's single. */
export function setBundleCatalog(catalog) {
  const idx = new Map();
  for (const p of (catalog || [])) {
    if (!p || packMultiple(p.title) > 1 || !isBall(p)) continue;
    const sku = p.sku || p.parentCode;
    if (!sku) continue;
    const k = bundleKey(p.brand, p.title);
    const cur = idx.get(k);
    if (cur == null || skuNum(sku) > skuNum(cur)) idx.set(k, sku);
  }
  _index = idx;
}

/* Resolve a bundle product to its single component: { sku, multiple }, or null
   when it isn't a recognizable ball multipack or has no sibling in the catalog
   (caller then keeps its existing cost handling). */
export function bundleSingle(product) {
  const p = product || {};
  if (p.isCustom) return null;
  const multiple = packMultiple(p.title);
  if (multiple <= 1 || !isBall(p)) return null;
  const sku = _index.get(bundleKey(p.brand, p.title));
  return sku ? { sku, multiple } : null;
}
