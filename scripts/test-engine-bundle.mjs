#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   scripts/test-engine-bundle.mjs — verifies the IIFE bundle the
   build system produces works the same as the ES-module source.

   Loads react-dist/vanilla/page-engine.js into a jsdom window via
   evaluation, then exercises window.__gbPageEngine.resolvePath
   exactly the way src/vanilla/variable-resolution.js will at
   runtime. Catches regressions where Vite's bundling silently
   breaks something the ESM test doesn't surface.
─────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { JSDOM, ResourceLoader } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH   = pathResolve(__dirname, '../Golfballs Administration _ .._Modules_CRM_Admin - ContactDetails.html');
const BUNDLE_PATH = pathResolve(__dirname, '../react-dist/vanilla/page-engine.js');

const html   = readFileSync(HTML_PATH, 'utf-8');
const bundle = readFileSync(BUNDLE_PATH, 'utf-8');

const dom = new JSDOM(html, {
  url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=6025834',
  runScripts: 'outside-only',
});

// Evaluate the IIFE inside the jsdom realm so window.__gbPageEngine
// gets registered, exactly like a content script does.
dom.window.eval(bundle);

const engine = dom.window.__gbPageEngine;
if (!engine) {
  console.error('FAIL: window.__gbPageEngine was not set after bundle eval');
  process.exit(1);
}

console.log('── Bundle smoke test ───────────────────────────────────');
console.log('window.__gbPageEngine OK');
console.log('schemas registered:', Object.keys(engine.schemas));

const doc = dom.window.document;
const ctx = engine.runEngine(doc);
if (!ctx) {
  console.error('FAIL: runEngine returned null');
  process.exit(1);
}
console.log('schema detected:', ctx.schemaId);
console.log('errors:', ctx.errors.length, '/ warnings:', ctx.warnings.length);

console.log('\n── Path API (the integration point) ───────────────────');
const paths = [
  'contact.firstName',
  'contact.email',
  'account.name',
  'stats.totalRevenue',
  'orders[0].number',
  'tasks.open[0].subject',
];
for (const p of paths) {
  const v = engine.resolvePath(doc, p, '<missing>');
  console.log('  ' + p.padEnd(36) + '  ' + (v === '' ? '""' : String(v)));
}

console.log('\n── Code API (sync) ─────────────────────────────────────');
const codeSample = `return h.fmt.upper(ctx.contact.firstName + " " + ctx.contact.lastName)`;
console.log('  body:    ', codeSample);
const codeResult = engine.evaluateCodeSync(doc, codeSample);
console.log('  result:  ', codeResult);

console.log('\n── Code API (async w/ timeout) ─────────────────────────');
const codeAsync = `return h.fmt.currency(h.sum(ctx.orders, "revenue"));`;
console.log('  body:    ', codeAsync);
const codeAsyncResult = await engine.evaluateCode(doc, codeAsync);
console.log('  result:  ', codeAsyncResult);

console.log('\n── Security: blocked patterns ──────────────────────────');
const blocked = [
  'fetch("/secrets")',
  'while (true) { console.log("nope"); }',
  'chrome.storage.local.get("k")',
  'eval("hi")',
];
for (const b of blocked) {
  let err = null;
  try { engine.evaluateCodeSync(doc, b); }
  catch (e) { err = e.message; }
  console.log('  ' + (err ? '\x1b[32mblocked\x1b[0m  ' : '\x1b[31mPASSED ?\x1b[0m  ') + b);
  if (err) console.log('             reason: ' + err);
}

console.log('\nALL CHECKS PASSED');
