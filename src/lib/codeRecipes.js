/* ───────────────────────────────────────────────────────────────
   codeRecipes.js — ready-made `code` variable bodies.

   These are the ports of the legacy smart-detection builtins
   (oos_item / recommended_replacement) into code-variable form. They
   read the page through the DOM helpers (h.dom / h.domAll) and, for
   the replacement, call the catalog through h.send — the same path
   the old builtins used, just expressed as user-editable code.

   Shared by the editor's "Recipes" inserter (author one now) and the
   migration sweep (convert existing builtin vars to these bodies).

   String.raw keeps the regex/`\n` backslashes literal so the body the
   user sees is exactly what runs.
─────────────────────────────────────────────────────────────── */

/* Out-of-stock item names on the current order page. Sync — DOM only.
   Scans text nodes for an "OOS" flag, then walks the row (and up to
   two following rows) for the item link. */
const OOS_ITEMS_BODY = String.raw`// Out-of-stock items flagged on this order.
const names = new Set();
for (const el of h.domAll('span, td, div, p')) {
  const raw = el.innerText || el.textContent || '';
  if (!/\boos\b/i.test(raw)) continue;
  const row = el.closest('tr');
  if (!row) continue;
  let cur = row;
  for (let i = 0; i < 3 && cur; i++) {
    const a = cur.querySelector('a.nodes') || cur.querySelector('a[href*=".htm"]');
    if (a) {
      const n = (a.innerText || a.textContent || '').trim();
      if (n) names.add(n);
      break;
    }
    cur = cur.nextElementSibling;
  }
}
return [...names].join('\n');`;

/* Best in-stock replacement for each OOS item. Async — pulls the
   brand catalog through the background worker (h.send →
   fetchBrandProducts) and scores candidates by name / price /
   decoration similarity. */
const RECOMMENDED_REPLACEMENT_BODY = String.raw`// Recommended in-stock replacement for each OOS item.
const BRANDS = [
  { kw: ['titleist'], slug: 'Titleist' },
  { kw: ['callaway'], slug: 'Callaway-Golf' },
  { kw: ['taylormade', 'taylor made', 'taylor-made'], slug: 'Taylor-Made' },
  { kw: ['bridgestone'], slug: 'Bridgestone' },
  { kw: ['srixon'], slug: 'Srixon' },
  { kw: ['mizuno'], slug: 'Mizuno' },
  { kw: ['pxg'], slug: 'PXG' },
  { kw: ['pinnacle'], slug: 'Pinnacle' },
  { kw: ['venture'], slug: 'Venture-Golf' },
  { kw: ['wilson'], slug: 'Wilson' },
];
const slugFor = (name) => {
  const l = name.toLowerCase();
  for (const b of BRANDS) if (b.kw.some((k) => l.includes(k))) return b.slug;
  return null;
};
const sim = (a, b) => {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = b.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  const g1 = new Set(), g2 = new Set();
  for (let i = 0; i < s1.length - 1; i++) g1.add(s1.substr(i, 2));
  for (let i = 0; i < s2.length - 1; i++) g2.add(s2.substr(i, 2));
  let x = 0;
  for (const g of g1) if (g2.has(g)) x++;
  return (2 * x) / (g1.size + g2.size);
};
// OOS item names (same scan as the Out-of-stock items recipe).
const oos = new Set();
for (const el of h.domAll('span, td, div, p')) {
  if (!/\boos\b/i.test(el.innerText || el.textContent || '')) continue;
  const row = el.closest('tr');
  if (!row) continue;
  let cur = row;
  for (let i = 0; i < 3 && cur; i++) {
    const a = cur.querySelector('a.nodes') || cur.querySelector('a[href*=".htm"]');
    if (a) { const n = (a.innerText || a.textContent || '').trim(); if (n) oos.add(n); break; }
    cur = cur.nextElementSibling;
  }
}
const out = [];
const cache = {};
for (const name of oos) {
  const slug = slugFor(name);
  if (!slug) continue;
  if (!cache[slug]) {
    const r = await h.send('fetchBrandProducts', { slug });
    cache[slug] = (r && r.ok && r.products) || [];
  }
  const products = cache[slug];
  if (!products.length) continue;
  const exact = products.find((p) => p.title_s && p.title_s.toLowerCase() === name.toLowerCase());
  const target = { price: exact ? exact.price_d : null, decs: exact ? (exact.modificationName_ss || []) : [] };
  if (!exact) {
    const l = name.toLowerCase();
    if (l.includes('personalized')) target.decs.push('Personalized');
    if (l.includes('monogram')) target.decs.push('Monogram');
    if (l.includes('photo')) target.decs.push('Photo');
    if (l.includes('custom logo') || l.includes('logo overrun')) target.decs.push('Custom Logo');
  }
  let best = null, bestScore = -1;
  for (const c of products) {
    const ct = (c.title_s || '').toLowerCase().trim();
    if (ct === name.toLowerCase().trim() || sim(ct, name) >= 0.95) continue;
    let score = sim(name, c.title_s || '') * 50;
    if (target.price && c.price_d) score += Math.max(0, 1 - Math.abs(target.price - c.price_d) / 15) * 30;
    if (target.decs.length && c.modificationName_ss) {
      const cd = new Set(c.modificationName_ss);
      score += (target.decs.filter((d) => cd.has(d)).length / target.decs.length) * 20;
    } else if (!target.decs.length && (!c.modificationName_ss || c.modificationName_ss.includes('None'))) {
      score += 10;
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best) out.push(slug + ' ' + best.title_s + ' — ' + 'https://www.golfballs.com' + best.product_url_s + '.htm');
}
return out.join('\n');`;

export const CODE_RECIPES = [
  {
    id: 'oos_items',
    label: 'Out-of-stock items',
    description: 'Item names flagged OOS on this order page.',
    body: OOS_ITEMS_BODY,
  },
  {
    id: 'recommended_replacement',
    label: 'Recommended replacement',
    description: 'Best in-stock match per OOS item (queries the catalog).',
    body: RECOMMENDED_REPLACEMENT_BODY,
  },
];

/* Lookup by id — used by the migration to swap a legacy builtin var
   (oos_item / recommended_replacement) for its code recipe. */
export function recipeById(id) {
  return CODE_RECIPES.find((r) => r.id === id) || null;
}
