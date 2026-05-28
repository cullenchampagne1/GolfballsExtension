#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   scripts/test-engine.mjs — smoke test the page engine against
   the sample contact HTML.

   Run with:  node scripts/test-engine.mjs

   What it does:
     1. Read the sample contact HTML
     2. Parse it with jsdom into a Document
     3. Run runEngine(doc) → JSON ctx
     4. Print the schema id, errors, warnings
     5. Resolve a dozen sample paths to sanity-check the schema
     6. Run a code variable that uses ctx + helpers
─────────────────────────────────────────────────────────────── */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { JSDOM } from 'jsdom';

import { runEngine, resolve, listPaths, runCode } from '../src/lib/page-engine/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = pathResolve(__dirname, '../Golfballs Administration _ .._Modules_CRM_Admin - ContactDetails.html');

const html = readFileSync(HTML_PATH, 'utf-8');
/* Wrap the doc in a JSDOM with a stable URL so the schema's
   `detect.url` regex matches (the file itself doesn't carry a URL
   the engine can read; we inject one matching the Page=240 form). */
const dom = new JSDOM(html, {
  url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=6025834',
});

const doc = dom.window.document;

console.log('────────────────────────────────────────────────────────');
console.log(' Page Engine Smoke Test');
console.log('────────────────────────────────────────────────────────');

const ctx = runEngine(doc);
if (!ctx) {
  console.log('NO SCHEMA MATCHED — abort');
  process.exit(1);
}

console.log(`Schema:   ${ctx.schemaId}`);
console.log(`Errors:   ${ctx.errors.length}`);
console.log(`Warnings: ${ctx.warnings.length}`);
if (ctx.errors.length)   console.log('   errors:', ctx.errors);
if (ctx.warnings.length) console.log('   warnings:', ctx.warnings.slice(0, 10));

console.log('\n── Sample resolved paths ──────────────────────────────');
const samples = [
  'ids.contact',
  'ids.account',
  'contact.firstName',
  'contact.lastName',
  'contact.email',
  'contact.phone',
  'contact.phoneE164',
  'contact.zipCode',
  'contact.state',
  'contact.country',
  'contact.archived',
  'account.name',
  'account.country',
  'account.territoryName',
  'stats.orderCount',
  'stats.totalRevenue',
  'stats.lastOrderDate',
  'stats.priorYearRevenue',
  'stats.ytdRevenue',
  'stats.avgOrderSize',
  'stats.mailerPoints',
  'stats.mailerTouchDate',
  'orders[0].number',
  'orders[0].summary',
  'orders[0].date',
  'orders[0].revenue',
  'orders[0].status',
  'orders[0].url',
  'orders[-1].revenue',
  'items[0].name',
  'items[0].quantity',
  'items[0].revenue',
  'tasks.open[0].id',
  'tasks.open[0].subject',
  'tasks.open[0].dueDate',
  'tasks.open[0].priority',
  'opportunities[0].id',
  'opportunities[0].subject',
  'opportunities[0].estimatedValue',
  'opportunities[0].stage',
  'activities[0].employee',
  'activities[0].category',
  'activities[0].subject',
  'emails[0].from',
  'emails[0].subject',
];

const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
for (const path of samples) {
  const v = resolve(ctx.data, path, '<missing>');
  let display;
  if (v === '<missing>')      display = '\x1b[31m<missing>\x1b[0m';
  else if (v === null)        display = '\x1b[33mnull\x1b[0m';
  else if (v === '')          display = '\x1b[33m""\x1b[0m';
  else if (typeof v === 'object') display = JSON.stringify(v);
  else                        display = String(v);
  console.log(`  ${pad(path, 38)}  ${display}`);
}

console.log('\n── Counts ──────────────────────────────────────────────');
console.log(`  orders          ${ctx.data.orders?.length ?? 0}`);
console.log(`  items           ${ctx.data.items?.length ?? 0}`);
console.log(`  tasks.open      ${ctx.data.tasks?.open?.length ?? 0}`);
console.log(`  tasks.done      ${ctx.data.tasks?.done?.length ?? 0}`);
console.log(`  opportunities   ${ctx.data.opportunities?.length ?? 0}`);
console.log(`  activities      ${ctx.data.activities?.length ?? 0}`);
console.log(`  emails          ${ctx.data.emails?.length ?? 0}`);

console.log('\n── Code variable: sum of order revenue ─────────────────');
try {
  const r = await runCode(
    'return h.fmt.currency(h.sum(ctx.orders, "revenue"));',
    ctx.data,
  );
  console.log(`  total revenue (code-var)  ${r}`);
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
}

console.log('\n── Code variable: pick top item ────────────────────────');
try {
  const r = await runCode(`
    const sorted = [...ctx.items].sort((a,b) => (b.revenue||0) - (a.revenue||0));
    const top = sorted[0];
    return top ? top.name + ' — ' + h.fmt.currency(top.revenue) : 'no items';
  `, ctx.data);
  console.log(`  top item                  ${r}`);
} catch (e) {
  console.log(`  ERROR: ${e.message}`);
}

console.log('\n── First 20 picker paths ───────────────────────────────');
const paths = listPaths(
  // re-import schema for listPaths since runEngine doesn't return it
  (await import('../src/lib/page-schemas/contact.js')).contactSchema,
  ctx.data,
);
for (const p of paths.slice(0, 20)) {
  console.log(`  ${pad(p.path, 36)}  [${p.type}]  ${pad(p.label, 28)}`);
}
console.log(`  …(${paths.length} total picker paths)`);
