#!/usr/bin/env node
/* proposal-diff.mjs — compare OUR saveProposal request against the WEBSITE's.
 *
 *   node tools/proposal-diff.mjs <ours.txt> <website.txt>
 *
 * Each input is a "Copy" dump from the Proposal Debug panel (the fmtEntry format
 * with `----- REQUEST BODY -----` sections) OR a raw saveProposal JSON body.
 * The script extracts the request body, JSON.parses it, parses the inner
 * `cartData` string, and prints ONLY the structural differences:
 *   - wrapper keys present in one body but not the other
 *   - wrapper scalar values that differ
 *   - cartData top-level key diffs
 *   - itemsInCart[i] key diffs + childList[0] key diffs
 *   - scalar value diffs on the first item / first child (the multipack line)
 * The full 205KB bodies are NEVER printed — only the deltas. */

import { readFileSync } from 'node:fs';

function extractRequestBody(text) {
  // Debug-panel dump: pull the block between the REQUEST BODY marker and the
  // next marker (RESPONSE BODY) or EOF.
  const m = text.match(/----- REQUEST BODY -----\n([\s\S]*?)(?:\n----- RESPONSE BODY -----|\s*$)/);
  const raw = m ? m[1] : text;
  return raw.trim();
}

function parseBody(file) {
  const text = readFileSync(file, 'utf8');
  const body = extractRequestBody(text);
  let outer;
  try { outer = JSON.parse(body); }
  catch (e) { throw new Error(`${file}: request body is not valid JSON (${e.message})`); }
  let cart = null;
  if (typeof outer.cartData === 'string') {
    try { cart = JSON.parse(outer.cartData); }
    catch (e) { throw new Error(`${file}: cartData string is not valid JSON (${e.message})`); }
  } else if (outer.cartData && typeof outer.cartData === 'object') {
    cart = outer.cartData; // already an object (a divergence worth noting)
  }
  return { outer, cart };
}

const short = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[array ${v.length}]`;
  if (typeof v === 'object') return `{object ${Object.keys(v).length} keys}`;
  const s = String(v);
  return s.length > 80 ? s.slice(0, 80) + '…' : s;
};

function keyDiff(label, a, b, aName, bName) {
  const ak = new Set(Object.keys(a || {}));
  const bk = new Set(Object.keys(b || {}));
  const onlyA = [...ak].filter((k) => !bk.has(k));
  const onlyB = [...bk].filter((k) => !ak.has(k));
  console.log(`\n## ${label} — key differences`);
  if (!onlyA.length && !onlyB.length) { console.log('  (same key set)'); }
  if (onlyA.length) console.log(`  only in ${aName}: ${onlyA.join(', ')}`);
  if (onlyB.length) console.log(`  only in ${bName} (MISSING from ${aName}): ${onlyB.join(', ')}`);
}

function scalarDiff(label, a, b, aName, bName) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const diffs = [];
  for (const k of keys) {
    const av = a ? a[k] : undefined, bv = b ? b[k] : undefined;
    const aScalar = av === null || typeof av !== 'object';
    const bScalar = bv === null || typeof bv !== 'object';
    if (aScalar && bScalar && av !== bv) diffs.push([k, av, bv]);
  }
  if (diffs.length) {
    console.log(`\n## ${label} — scalar value differences (${aName} → ${bName})`);
    for (const [k, av, bv] of diffs) console.log(`  ${k}: ${short(av)}  →  ${short(bv)}`);
  }
}

const [, , oursFile, webFile] = process.argv;
if (!oursFile || !webFile) {
  console.error('usage: node tools/proposal-diff.mjs <ours.txt> <website.txt>');
  process.exit(2);
}

const ours = parseBody(oursFile);
const web = parseBody(webFile);

console.log('# saveProposal diff — OURS vs WEBSITE');
console.log(`ours:    ${oursFile}`);
console.log(`website: ${webFile}`);

// 1) Wrapper (the part flagged as reverse-engineered).
keyDiff('WRAPPER (top-level body)', ours.outer, web.outer, 'OURS', 'WEBSITE');
scalarDiff('WRAPPER', ours.outer, web.outer, 'OURS', 'WEBSITE');

// 2) cartData top-level.
keyDiff('cartData', ours.cart, web.cart, 'OURS', 'WEBSITE');
scalarDiff('cartData', { ...ours.cart, itemsInCart: undefined }, { ...web.cart, itemsInCart: undefined }, 'OURS', 'WEBSITE');

// 3) First item (the multipack line) + its first child.
const oi = (ours.cart?.itemsInCart || [])[0] || {};
const wi = (web.cart?.itemsInCart || [])[0] || {};
console.log(`\nitemsInCart count — OURS: ${(ours.cart?.itemsInCart || []).length}, WEBSITE: ${(web.cart?.itemsInCart || []).length}`);
keyDiff('itemsInCart[0]', oi, wi, 'OURS', 'WEBSITE');
scalarDiff('itemsInCart[0]', oi, wi, 'OURS', 'WEBSITE');

const oc = (oi.childList || [])[0] || {};
const wc = (wi.childList || [])[0] || {};
keyDiff('itemsInCart[0].childList[0]', oc, wc, 'OURS', 'WEBSITE');
scalarDiff('itemsInCart[0].childList[0]', oc, wc, 'OURS', 'WEBSITE');

// 4) ProductParentItemFee presence (the multipack pricing header).
const ppifO = oi.ProductParentItemFee, ppifW = wi.ProductParentItemFee;
console.log(`\n## ProductParentItemFee`);
console.log(`  OURS:    ${short(ppifO)}${ppifO && typeof ppifO === 'object' ? ' priceBreakHeaderID=' + ppifO.priceBreakHeaderID + ' HashValue=' + ppifO.HashValue : ''}`);
console.log(`  WEBSITE: ${short(ppifW)}${ppifW && typeof ppifW === 'object' ? ' priceBreakHeaderID=' + ppifW.priceBreakHeaderID + ' HashValue=' + ppifW.HashValue : ''}`);

console.log('\n(done — raw bodies were not printed)');
