/* ───────────────────────────────────────────────────────────────
   build-help-content.mjs — compiles the in-app Help & Training
   content module.

   Inputs:
     docs/content/*.json        authored articles, tutorials, nav tree
     docs/inventory.json        machine-readable extension inventory
     src/lib/flags.js           FEATURE_FLAGS / FEATURE_DEFAULTS /
                                KEYBOARD_SHORTCUTS_DEFAULTS (live registry)
     src/lib/devSettings.js     DEV_SETTINGS (live registry)
     manifest.json              version stamp

   Output:
     src/lib/helpContent.js     static module: tree, articles,
                                tutorials, search index

   "generated" blocks inside article bodies are expanded here from
   the live registries, so the Settings Reference can never drift
   from the code. The script also runs a coverage check and FAILS
   if any feature flag or inventory modal has no covering article,
   or if any cross-reference (related/tree/tutorial) is dangling.

   Run:  node scripts/build-help-content.mjs
─────────────────────────────────────────────────────────────── */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = path.join(ROOT, 'docs', 'content');
const OUT_FILE = process.env.GB_HELP_OUT
  ? path.resolve(process.env.GB_HELP_OUT)
  : path.join(ROOT, 'src', 'lib', 'helpContent.js');

/* Consumer builds strip the small set of explicitly administrator-only
   catalog-management docs named by admin-only.json. */
const IS_CONSUMER = process.env.GB_ADMIN === '0';
const readJson0 = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ADMIN_ONLY = readJson0(path.join(ROOT, 'admin-only.json'));
const ADMIN_HELP_DOCS = new Set(IS_CONSUMER ? (ADMIN_ONLY.helpDocs || []) : []);
const ADMIN_MODAL_IDS = new Set(IS_CONSUMER ? (ADMIN_ONLY.adminModals || []) : []);
const ADMIN_TUTORIAL_IDS = new Set(IS_CONSUMER ? (ADMIN_ONLY.adminTutorials || []) : []);

const { FEATURE_FLAG_META, FEATURE_DEFAULTS, KEYBOARD_SHORTCUTS_DEFAULTS } =
  await import(path.join(ROOT, 'src/lib/flags.js'));
const { DEV_SETTINGS } = await import(path.join(ROOT, 'src/lib/devSettings.js'));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const inventory = readJson(path.join(ROOT, 'docs', 'inventory.json'));
const manifest = readJson(path.join(ROOT, 'manifest.json'));

/* ── 1. Load authored content ────────────────────────────────── */

const articles = [];
let tutorials = [];
let tree = null;

for (const file of readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.json')).sort()) {
  if (ADMIN_HELP_DOCS.has(file)) continue; // consumer build: drop admin-only articles
  const data = readJson(path.join(CONTENT_DIR, file));
  if (data.tree) tree = data.tree;
  if (data.tutorials) tutorials = data.tutorials;
  if (data.articles) {
    for (const a of data.articles) articles.push({ ...a, sectionLabel: data.section });
  }
}

if (!tree) fail('docs/content/tree.json missing or has no "tree"');
if (!tutorials.length) fail('docs/content/tutorials.json missing or empty');

// Consumer build: drop admin-only tutorials (they live in the shared
// tutorials.json but document admin features).
if (IS_CONSUMER) tutorials = tutorials.filter((t) => !ADMIN_TUTORIAL_IDS.has(t.id));

/* Consumer build: prune nav-tree entries that point at the stripped articles so
   the reachability/dangling-reference checks below still pass. */
if (IS_CONSUMER) {
  const liveSlugs = new Set(articles.map((a) => a.slug));
  const liveTutorials = new Set(tutorials.map((t) => t.id));
  const pruneNodes = (nodes) => nodes
    .map((n) => ({
      ...n,
      ...(n.items ? { items: n.items.filter((it) => (!it.article || liveSlugs.has(it.article)) && (!it.tutorial || liveTutorials.has(it.tutorial))) } : {}),
      ...(n.groups ? { groups: pruneNodes(n.groups) } : {}),
    }));
  tree = pruneNodes(tree);
}

/* ── 2. Expand "generated" blocks from the live registries ───── */

const SHORTCUT_LABELS = {
  taskList: 'Task List',
  marginCalc: 'Margin Calculator',
  crmSearch: 'CRM Search',
  crmNewContact: 'New Contact',
};

function generatedFeatureFlagBlocks() {
  const all = FEATURE_FLAG_META;
  const sections = [...new Set(all.map((f) => f.section))];
  const blocks = [];
  for (const section of sections) {
    blocks.push({ type: 'heading', text: section });
    blocks.push({
      type: 'table',
      headers: ['Feature', 'Default', 'What it controls'],
      rows: all
        .filter((f) => f.section === section)
        .map((f) => [f.name, FEATURE_DEFAULTS[f.key] ? 'On' : 'Off', f.desc]),
      meta: { flagKeys: all.filter((f) => f.section === section).map((f) => f.key) },
    });
  }
  return blocks;
}

const DEV_GROUP_LABELS = {
  numberDisplay: 'Number displays',
  popup: 'Popup',
  golfballViewer: '3D viewer',
  'golfballViewer.snap': '3D viewer — snapshot export poses',
  marginCalc: 'Margin Calculator',
  imageViewer: 'Image Viewer',
  watchList: 'Watch List',
  crmCreateContact: 'New Contact',
  crmSearch: 'CRM Search',
  taskList: 'Task List',
  submitProof: 'Submit Proof',
  calendar: 'Order Dates',
  callLog: 'Call Log',
  emailPreview: 'Email Preview',
  quickTask: 'Quick Task',
  textPreview: 'Text Preview',
  giftCatalog: 'Gift Catalog',
  workflowManager: 'Workflow Manager',
  pageEngine: 'Page Engine',
  email: 'Email',
};

function devGroupOf(key) {
  if (key.startsWith('golfballViewer.snap.')) return 'golfballViewer.snap';
  return key.split('.')[0];
}

function formatDefault(s) {
  // Read-only rows (a button, a readout) hold no value to default to.
  if (s.type === 'action' || s.type === 'stat') return '—';
  if (typeof s.default === 'boolean') return s.default ? 'On' : 'Off';
  if (s.default === '' || s.default == null) return '(empty)';
  return `${s.default}${s.unit || ''}`;
}

function formatRange(s) {
  if (s.type === 'select' && Array.isArray(s.options)) {
    return s.options.map((o) => (typeof o === 'object' ? o.value ?? o.label : o)).join(' / ');
  }
  if (s.min != null && s.max != null) return `${s.min}–${s.max}${s.unit || ''}`;
  return '';
}

function generatedDevSettingBlocks() {
  const groups = new Map();
  for (const s of DEV_SETTINGS) {
    const g = devGroupOf(s.key);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const blocks = [];
  for (const [g, settings] of groups) {
    blocks.push({ type: 'heading', text: DEV_GROUP_LABELS[g] || g });
    blocks.push({
      type: 'table',
      headers: ['Setting', 'Type', 'Default', 'Range', 'What it does'],
      rows: settings.map((s) => [s.label, s.type, formatDefault(s), formatRange(s), s.desc || '']),
      meta: { settingKeys: settings.map((s) => s.key) },
    });
  }
  return blocks;
}

function generatedShortcutBlocks() {
  return [{
    type: 'table',
    headers: ['Shortcut', 'Action', 'Default key'],
    rows: Object.entries(KEYBOARD_SHORTCUTS_DEFAULTS).map(([k, v]) => [
      `Ctrl/Cmd + ${v.toUpperCase()}`,
      SHORTCUT_LABELS[k] || k,
      v.toUpperCase(),
    ]),
  }];
}

function generatedScopeBlocks() {
  return [{
    type: 'table',
    headers: ['Scope', 'Carries', 'On import'],
    rows: (inventory.importExportScopes || []).map((s) => [
      s.label,
      s.keys.join(', '),
      s.merge === 'mergeById' ? 'merges by id' : 'overwrites',
    ]),
  }];
}

const GENERATORS = {
  featureFlags: generatedFeatureFlagBlocks,
  devSettings: generatedDevSettingBlocks,
  keyboardShortcuts: generatedShortcutBlocks,
  importExportScopes: generatedScopeBlocks,
};

for (const article of articles) {
  for (const tier of Object.keys(article.body || {})) {
    article.body[tier] = article.body[tier].flatMap((block) => {
      if (block.type !== 'generated') return [block];
      const gen = GENERATORS[block.source];
      if (!gen) fail(`article "${article.slug}": unknown generated source "${block.source}"`);
      return gen();
    });
  }
}

/* ── 3. Validate cross-references ────────────────────────────── */

const errors = [];
const slugSet = new Set(articles.map((a) => a.slug));
const tutorialSet = new Set(tutorials.map((t) => t.id));

if (slugSet.size !== articles.length) errors.push('duplicate article slugs');

for (const a of articles) {
  for (const r of a.related || []) {
    if (!slugSet.has(r)) errors.push(`article "${a.slug}": related "${r}" does not exist`);
  }
  if (a.tutorial && !tutorialSet.has(a.tutorial)) {
    errors.push(`article "${a.slug}": tutorial "${a.tutorial}" does not exist`);
  }
}
for (const t of tutorials) {
  for (const r of t.related || []) {
    if (!slugSet.has(r) && !tutorialSet.has(r)) {
      errors.push(`tutorial "${t.id}": related "${r}" does not exist`);
    }
  }
}

const walkTree = (nodes, cb) => nodes.forEach((n) => {
  (n.items || []).forEach(cb);
  if (n.groups) walkTree(n.groups, cb);
});
walkTree(tree, (item) => {
  if (item.article && !slugSet.has(item.article)) errors.push(`tree: article "${item.article}" does not exist`);
  if (item.tutorial && !tutorialSet.has(item.tutorial)) errors.push(`tree: tutorial "${item.tutorial}" does not exist`);
});

// Every article must be reachable from the tree.
const inTree = new Set();
walkTree(tree, (item) => item.article && inTree.add(item.article));
for (const a of articles) {
  if (!inTree.has(a.slug)) errors.push(`article "${a.slug}" is not in the nav tree`);
}
const tutorialsInTree = new Set();
walkTree(tree, (item) => item.tutorial && tutorialsInTree.add(item.tutorial));
for (const t of tutorials) {
  if (!tutorialsInTree.has(t.id)) errors.push(`tutorial "${t.id}" is not in the nav tree`);
}

/* ── 4. Coverage check (build-breaking) ──────────────────────── */

// 4a. Every boolean feature flag needs a covering article.
const coveredFlags = new Set();
for (const a of articles) {
  if (a.flag) coveredFlags.add(a.flag);
  for (const f of a.coversFlags || []) coveredFlags.add(f);
}
for (const key of Object.keys(FEATURE_DEFAULTS)) {
  if (typeof FEATURE_DEFAULTS[key] !== 'boolean') continue; // urls etc.
  if (!coveredFlags.has(key)) errors.push(`coverage: feature flag "${key}" has no covering article`);
}

// 4b. Inventory must exactly enumerate the React modal source directory, then
// every inventory modal needs to appear in some article's covers[]. This keeps
// a newly added modal from becoming invisible simply because inventory drifted.
const modalDir = path.join(ROOT, 'src', 'modals');
// Consumer build: the admin-only modals' source files stay on disk but their
// only entry is stripped, so exclude them from the coverage check alongside
// their (removed) covering article.
const adminModalFiles = new Set(
  (inventory.modals || [])
    .filter((m) => ADMIN_MODAL_IDS.has(m.id))
    .map((m) => path.basename(m.file || '')),
);
const activeInventoryModals = (inventory.modals || []).filter((m) => !ADMIN_MODAL_IDS.has(m.id));
const sourceModalFiles = new Set(
  readdirSync(modalDir).filter((file) => file.endsWith('.jsx') && !adminModalFiles.has(file)),
);
const inventoryModalFiles = new Set(
  activeInventoryModals.map((modal) => path.basename(modal.file || '')),
);
for (const file of sourceModalFiles) {
  if (!inventoryModalFiles.has(file)) errors.push(`inventory: src/modals/${file} is not registered`);
}
for (const file of inventoryModalFiles) {
  if (!sourceModalFiles.has(file)) errors.push(`inventory: registered modal src/modals/${file} does not exist`);
}

const coveredIds = new Set();
for (const a of articles) for (const c of a.covers || []) coveredIds.add(c);
for (const m of activeInventoryModals) {
  if (!coveredIds.has(m.id)) errors.push(`coverage: modal "${m.id}" (${m.displayName}) has no covering article`);
}

// 4c. Dev settings are covered by the generated reference; verify it exists.
if (!articles.some((a) => a.coversAllDevSettings)) {
  errors.push('coverage: no article carries the generated Developer Settings reference');
}
if (!articles.some((a) => a.coversAllFlags)) {
  errors.push('coverage: no article carries the generated Feature Toggles reference');
}

if (errors.length) {
  console.error(`\n✗ help content build failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

/* ── 5. Search index ─────────────────────────────────────────── */

const searchIndex = [];

for (const a of articles) {
  searchIndex.push({
    id: `article:${a.slug}`,
    category: a.sectionLabel.startsWith('Troubleshooting') ? 'Troubleshooting' : 'Articles',
    title: a.title,
    keywords: a.keywords || [],
    description: a.summary,
    article: a.slug,
    shortcut: a.shortcut || null,
    flag: a.flag || null,
  });
  for (const f of a.faq || []) {
    searchIndex.push({
      id: `faq:${a.slug}:${(a.faq || []).indexOf(f)}`,
      category: 'FAQ',
      title: f.q,
      keywords: [],
      description: f.a,
      article: a.slug,
    });
  }
}

for (const t of tutorials) {
  searchIndex.push({
    id: `tutorial:${t.id}`,
    category: 'Tutorials',
    title: t.title,
    keywords: [t.tier],
    description: `${t.steps.length} steps · ~${t.estMinutes} min`,
    tutorial: t.id,
  });
}

const searchableFlags = FEATURE_FLAG_META;
for (const f of searchableFlags) {
  searchIndex.push({
    id: `flag:${f.key}`,
    category: 'Settings',
    title: f.name,
    keywords: [f.key, f.section],
    description: f.desc,
    article: 'feature-toggles',
    flag: f.key,
  });
}

for (const s of DEV_SETTINGS) {
  if (s.key.startsWith('golfballViewer.snap.')) continue; // 70 pose knobs would drown results
  searchIndex.push({
    id: `devSetting:${s.key}`,
    category: 'Settings',
    title: s.label,
    keywords: [s.key],
    description: s.desc || '',
    article: 'developer-settings',
  });
}

for (const [k, v] of Object.entries(KEYBOARD_SHORTCUTS_DEFAULTS)) {
  searchIndex.push({
    id: `shortcut:${k}`,
    category: 'Shortcuts',
    title: `Ctrl/Cmd + ${v.toUpperCase()} — ${SHORTCUT_LABELS[k] || k}`,
    keywords: ['shortcut', 'keyboard', v],
    description: 'Rebindable under Settings → Keyboard Shortcuts.',
    article: 'keyboard-shortcuts',
  });
}

/* ── 6. Emit module ──────────────────────────────────────────── */

const payload = {
  version: manifest.version,
  generatedAt: new Date().toISOString().slice(0, 10),
  tree,
  articles,
  tutorials,
  searchIndex,
};

const js = `/* AUTO-GENERATED by scripts/build-help-content.mjs — DO NOT EDIT.
   Authored sources: docs/content/*.json
   Registry sources: src/lib/flags.js, src/lib/devSettings.js, docs/inventory.json
   Regenerate: node scripts/build-help-content.mjs */

export const HELP_CONTENT = ${JSON.stringify(payload, null, 2)};

export const HELP_TREE = HELP_CONTENT.tree;
export const HELP_ARTICLES = HELP_CONTENT.articles;
export const HELP_TUTORIALS = HELP_CONTENT.tutorials;
export const HELP_SEARCH_INDEX = HELP_CONTENT.searchIndex;

const byArticleSlug = new Map(HELP_ARTICLES.map((a) => [a.slug, a]));
const byTutorialId = new Map(HELP_TUTORIALS.map((t) => [t.id, t]));

/** Look up an article by slug (null if unknown). */
export const getArticle = (slug) => byArticleSlug.get(slug) || null;

/** Look up a tutorial by id (null if unknown). */
export const getTutorial = (id) => byTutorialId.get(id) || null;
`;

writeFileSync(OUT_FILE, js);

const kb = (Buffer.byteLength(js) / 1024).toFixed(1);
console.log(`✓ helpContent.js written (${kb} KB)`);
console.log(`  articles: ${articles.length} · tutorials: ${tutorials.length} · search records: ${searchIndex.length}`);
console.log(`  coverage: ${Object.keys(FEATURE_DEFAULTS).filter((k) => typeof FEATURE_DEFAULTS[k] === 'boolean').length} flags, ${(inventory.modals || []).length} modals, ${DEV_SETTINGS.length} dev settings — all covered`);

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}
