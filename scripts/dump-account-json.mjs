#!/usr/bin/env node
/* ───────────────────────────────────────────────────────────────
   scripts/dump-account-json.mjs — extract the sample Account
   Details HTML through the page engine and dump the resolved
   tree + a flat path map to account-extracted.json so the user
   can verify the per-page overrides land correctly (firstName
   coming from the first row of the Account Contacts table, tasks
   tables scoped via portlet caption, etc.).
─────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { JSDOM } from 'jsdom';

import { runEngine, listPaths } from '../src/lib/page-engine/index.js';
import { accountSchema } from '../src/lib/page-schemas/contact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/* The user attaches an updated AccountDetails HTML through Claude;
   the project also keeps a local copy at the repo root. Prefer the
   local file so the script doesn't depend on user-uploaded paths.
   Falls back to the uploads dir when not present locally. */
const LOCAL_PATH    = pathResolve(__dirname, '../Golfballs Administration _ .._Modules_CRM_Admin - AccountDetails.html');
const UPLOADED_PATH = pathResolve(process.env.HOME || '', '.claude/uploads/cd32fa4e-bc36-45e7-8889-72191440d4a9/08e49607-Golfballs_Administration___.._Modules_CRM_Admin__AccountDetails.html');
const OUT_PATH      = pathResolve(__dirname, '../account-extracted.json');

let htmlPath = LOCAL_PATH;
try { readFileSync(LOCAL_PATH); } catch { htmlPath = UPLOADED_PATH; }

const html = readFileSync(htmlPath, 'utf-8');
const dom = new JSDOM(html, {
  url: 'https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=271&accountID=131718',
});
const doc = dom.window.document;

const ctx = runEngine(doc);
if (!ctx) {
  console.error('No schema matched. Aborting.');
  process.exit(1);
}

const flat = {};
for (const entry of listPaths(accountSchema, ctx.data)) {
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
    contacts:      ctx.data.contacts?.length ?? 0,
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
console.log(`  contact: firstName=${ctx.data.contact?.firstName ?? '(null)'} lastName=${ctx.data.contact?.lastName ?? '(null)'} email=${ctx.data.contact?.email ?? '(null)'}`);
console.log(`  account: name=${ctx.data.account?.name ?? '(null)'} modifiedDate=${ctx.data.account?.modifiedDate ?? '(null)'}`);
