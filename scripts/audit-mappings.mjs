#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────────────────
   Customizer mapping audit.

   Verifies the gift-catalog customizer surfaces every product type's REAL
   options. Fetches the live catalog + one product per item type, runs the same
   mapping rules the modal uses, and flags anything the data exposes that the UI
   would NOT render — so we can iterate to full coverage instead of eyeballing
   products one by one.

       node scripts/audit-mappings.mjs            # audit 1 product per item type
       node scripts/audit-mappings.mjs --all      # audit every catalog product
       node scripts/audit-mappings.mjs --type tee # only item types matching "tee"

   Exit code is non-zero when anything is flagged (usable as a check).

   NOTE: the mapping rules below MIRROR src/modals/giftCustomize.jsx. If you
   change the mapping there, update it here too (or extract a shared module).
   ─────────────────────────────────────────────────────────────────────────── */

const SOLR = 'https://master.api.icustomize.com/user/solr-refinement';
const BASE = 'https://www.golfballs.com';

/* ── mapping rules (mirror giftCustomize.jsx) ─────────────────────────────── */
const MOD_ALIAS = { 'Align XL': 'AlignXL', 'Icon': 'Icons' };
const BALL_PRINT_TYPES = new Set(['Custom Logo', 'Personalized', 'Monogram', 'Photo', 'AlignXL', 'IDAlign', 'Icons', 'Custom Player Number']);
const isMeta = (m) => /second pole|custom accessory bundle|folds of honor/i.test(m);
const isBall = (it) => /Golf_Balls/i.test(it || '');
const isSideProp = (n) => /imprint|2 ?side/i.test(n);   // a real 1-side / 2-sided base property
function decoFor(m) {
  if (m === 'Custom Logo') return 'Custom';
  if (/^Golf (Towel|Hat)/i.test(m)) return 'Personalized';
  if (m === 'Personalized') return 'Personalized';
  if (m === 'Monogram') return 'Monogram';
  if (m === 'Tee') return 'Tee';
  if (m === 'Photo') return 'Photo';
  return null;
}

/* ── live data ────────────────────────────────────────────────────────────── */
async function fetchCatalog() {
  const body = JSON.stringify({
    solrQuery: { queryType: 'select', start: 0, rows: '1000', sort: 'sort_default_i desc',
      searchTerm: 'modificationName_ss:"Custom Logo" OR itemType_ss:Corporate',
      facetRequest: [{ name: 'Item Type', field: 'itemType_ss', type: 'field' }], facetQueries: [], filterQuery: [] },
    additionalFacets: { facetFields: [], facetQueries: ['-tag_ss:ExcludeStock'] }, pageKey: 'custom-logo',
  });
  const r = await fetch(SOLR, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json', sitekey: 'golfballs' }, body });
  return ((await r.json()).response || {}).docs || [];
}
async function fetchProduct(url) {
  try {
    const html = await (await fetch(BASE + url + '.htm', { headers: { Accept: 'text/html' } })).text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]).props.pageProps.product : null;
  } catch { return null; }
}

/* ── audit one product (data → what the UI would render → flags) ──────────── */
function auditOne(d, prod) {
  let cd = {}; try { cd = JSON.parse(d.customData_s || '{}'); } catch { /* */ }
  const mods = (d.modificationName_ss || []).map((m) => MOD_ALIAS[m] || m);
  const props = prod ? (prod.PropertyProduct || []).map((p) => p.Name) : ['(no page)'];
  // A "Custom Accessory Bundle" (Kit) renders bundle sections, not the ball grid,
  // even when filed under Golf Balls — mirror CustomizeBlock's routing.
  const bundleItems = cd.bundleItems ? cd.bundleItems.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const bundle = mods.includes('Custom Accessory Bundle') || bundleItems.length > 0;
  const ball = isBall(d.itemType_s) && !bundle;
  // Balls offer a second-pole imprint by default; the ExcludeDualPolePrinting
  // tag (Triple Track lines) removes it. Authoritative second-pole signal.
  const excludeDualPole = (d.tag_ss || []).some((t) => /ExcludeDualPole/i.test(t));
  const ballSecondPole = ball && !excludeDualPole;
  const deco = bundle ? ['<bundle:' + (bundleItems.join('+') || '?') + '>']
    : (ball ? ['<print-type grid' + (ballSecondPole ? ' + 2nd pole' : ', no 2nd pole') + '>'] : [...new Set(mods.map(decoFor).filter(Boolean))]);
  const dualPole = (cd.variant === 'dualPole' || mods.some((m) => /second pole/i.test(m))) && !excludeDualPole;

  const flags = [];
  const unmapped = ball ? mods.filter((m) => !BALL_PRINT_TYPES.has(m) && !isMeta(m))
    : mods.filter((m) => !decoFor(m) && !isMeta(m));
  if (unmapped.length) flags.push('UNMAPPED MOD: ' + unmapped.join(', '));
  if (!ball && !deco.length && mods.length) flags.push('NO DECORATION (mods=' + mods.join(',') + ')');
  const sideSignal = props.some(isSideProp) || cd.variant === 'dualPole' || mods.some((m) => /second pole/i.test(m));
  const sideSurfaced = props.some(isSideProp) /* PropertyInput renders it */ || dualPole /* second-pole imprint */ || ballSecondPole;
  if (sideSignal && !sideSurfaced) flags.push('2-SIDE NOT SURFACED');
  // contradictory data: a product both opts INTO a second pole and is tagged to exclude it
  if (excludeDualPole && cd.variant === 'dualPole') flags.push('CONFLICT: dualPole variant + ExcludeDualPolePrinting tag');
  if (bundle && !bundleItems.length) flags.push('BUNDLE DECLARED BUT NO COMPONENTS (bundleItems empty)');

  // config-dependent: the page has base inputs the catalog facet doesn't carry
  // (e.g. Devant towels) — these render ONLY if the per-product config fetch runs.
  const catalogPropFields = Object.keys(d).filter((k) => /^property_.+_ss$/.test(k));
  const configOnly = !ball && prod && (prod.PropertyProduct || []).length > 0 && catalogPropFields.length === 0;

  return { type: d.itemType_s || '?', title: (d.title_s || '').replace(/<[^>]+>/g, '').slice(0, 40), props, deco, variant: cd.variant || '', flags, configOnly };
}

/* ── run ──────────────────────────────────────────────────────────────────── */
async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const typeFilter = (args[args.indexOf('--type') + 1] && !args.includes('--type') === false) ? args[args.indexOf('--type') + 1] : null;

  const docs = await fetchCatalog();
  let sample;
  if (all) sample = docs;
  else { const byType = {}; for (const d of docs) { const t = d.itemType_s || '?'; if (!byType[t]) byType[t] = d; } sample = Object.values(byType); }
  if (typeFilter) sample = sample.filter((d) => (d.itemType_s || '').toLowerCase().includes(typeFilter.toLowerCase()));

  console.log(`Auditing ${sample.length} product${sample.length === 1 ? '' : 's'} (of ${docs.length} catalog docs)…\n`);
  const rows = [];
  const CONCURRENCY = 12;
  for (let i = 0; i < sample.length; i += CONCURRENCY) {
    const batch = sample.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(async (d) => auditOne(d, await fetchProduct(d.product_url_s))));
    rows.push(...results);
    if (sample.length > 90) process.stderr.write(`  …${rows.length}/${sample.length}\r`);
  }

  const flagged = rows.filter((r) => r.flags.length);
  for (const r of rows.sort((a, b) => (b.flags.length - a.flags.length) || a.type.localeCompare(b.type))) {
    console.log(`${r.flags.length ? 'FLAG' : ' ok '}  ${r.type.padEnd(44)} inputs:[${r.props.join(', ')}] deco:[${r.deco.join('/')}]`
      + (r.flags.length ? `\n        ⚠ ${r.flags.join(' ; ')}` : ''));
  }
  const cfgDep = rows.filter((r) => r.configOnly);
  if (cfgDep.length) {
    console.log(`\nℹ  ${cfgDep.length} item type(s) have base inputs ONLY on the product page (catalog facet empty)`);
    console.log(`   — these render only when the per-product config fetch runs (e.g. Devant towel colors):`);
    console.log('   ' + [...new Set(cfgDep.map((r) => r.type))].join(', '));
  }
  console.log(`\n${rows.length} audited · ${flagged.length} flagged · ${cfgDep.length} config-dependent`);
  process.exit(flagged.length ? 1 : 0);
}
main().catch((e) => { console.error('audit failed:', e); process.exit(2); });
