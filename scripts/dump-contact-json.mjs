#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   scripts/dump-contact-json.mjs — extract the sample contact HTML
   through the page engine and write the full result (data +
   errors + warnings) to contact-extracted.json at the project
   root. Open that file to review what the engine is pulling and
   flag any gaps.
─────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { JSDOM } from 'jsdom';

import { runEngine, listPaths } from '../src/lib/page-engine/index.js';
import { contactSchema } from '../src/lib/page-schemas/contact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = pathResolve(__dirname, '../Golfballs Administration _ .._Modules_CRM_Admin - ContactDetails.html');
const OUT_PATH  = pathResolve(__dirname, '../contact-extracted.json');

const html = readFileSync(HTML_PATH, 'utf-8');
const dom = new JSDOM(html, {
  url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=6025834',
});
const doc = dom.window.document;

const ctx = runEngine(doc);
if (!ctx) {
  console.error('No schema matched. Aborting.');
  process.exit(1);
}

/* Build a flat path-map alongside the nested tree so the user can
   eyeball both: "what does the tree look like?" and "what's the
   value at every leaf?". The flat map is easier to scan for empty/
   missing values; the tree shows structure. */
const flat = {};
for (const entry of listPaths(contactSchema, ctx.data)) {
  /* Skip object/array container rows in the flat dump — only
     leaves carry values worth eyeballing. */
  if (entry.type === 'object' || entry.type === 'array') continue;
  flat[entry.path] = entry.value;
}

const output = {
  schemaId:  ctx.schemaId,
  errors:    ctx.errors,
  warnings:  ctx.warnings,
  counts: {
    orders:        ctx.data.orders?.length ?? 0,
    items:         ctx.data.items?.length ?? 0,
    'tasks.open':  ctx.data.tasks?.open?.length ?? 0,
    'tasks.done':  ctx.data.tasks?.done?.length ?? 0,
    opportunities: ctx.data.opportunities?.length ?? 0,
    activities:    ctx.data.activities?.length ?? 0,
    emails:        ctx.data.emails?.length ?? 0,
  },
  data: ctx.data,
  flat,
};

writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
console.log(`Wrote ${OUT_PATH}`);
console.log(`  schema:   ${output.schemaId}`);
console.log(`  errors:   ${output.errors.length}`);
console.log(`  warnings: ${output.warnings.length}`);
console.log(`  counts:`, output.counts);
