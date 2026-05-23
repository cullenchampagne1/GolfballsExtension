/* ───────────────────────────────────────────────────────────────
   presetScopes.js — what a user preset can carry.

   A preset is a bundle of one or more scopes the user explicitly
   picks at save time. Each scope is a self-contained slice of the
   extension's `chrome.storage.local` so that:
     • Save = read those keys verbatim, snapshot them in the preset.
     • Load = write each scope back. Arrays merge by id (existing id
       wins, new id appended) so sharing emails ADDS to the recipient
       instead of overwriting their library. Plain objects just
       merge-overwrite key by key.

   To add a new scope: append an entry below. No other code changes
   needed — the save dialog, load handler, and storage layer all
   iterate this array. Pick a stable id (used as the storage shape's
   key) and a `merge` strategy.
─────────────────────────────────────────────────────────────── */

/**
 * @typedef {'mergeById' | 'overwrite'} MergeStrategy
 * - `mergeById`   for array scopes: per item, by `id` field — replace
 *                 same-id, append new. Preserves existing items the
 *                 preset doesn't know about.
 * - `overwrite`   for object scopes (settings bag): take the preset's
 *                 object wholesale, merged over the user's existing
 *                 object at the top level. Keys absent from the
 *                 preset are left alone.
 */

export const PRESET_SCOPES = [
  {
    id:    'settings',
    label: 'Settings',
    desc:  'Theme · feature flags · keyboard shortcuts · custom pages · signature',
    /* Each storage key in this scope is captured + restored. */
    keys: [
      'themeColors',
      'gbTheme',
      'featureFlags',
      'keyboardShortcuts',
      'customPages',
      'emailSignature',
    ],
    merge: 'overwrite',
  },
  {
    id:    'templates',
    label: 'Email Templates',
    desc:  'All email templates (order, case, account) + folders',
    keys:  ['templates', 'templateFolders'],
    merge: 'mergeById',
  },
  {
    id:    'notes',
    label: 'Note Templates',
    desc:  'Quick notes, tasks, call logs + folders',
    keys:  ['noteTemplates', 'noteFolders'],
    merge: 'mergeById',
  },
];

const ALL_KEYS = [...new Set(PRESET_SCOPES.flatMap((s) => s.keys))];

/** Read a chunk of storage; returns an object keyed by storage key. */
function readKeys(keys) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) { resolve({}); return; }
    chrome.storage.local.get(keys, (d) => resolve(d || {}));
  });
}

/** Write a chunk of storage. */
function writeKeys(obj) {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) { resolve(); return; }
    chrome.storage.local.set(obj, () => resolve());
  });
}

/**
 * Build a preset object from the user's current extension state. Only
 * the scopes listed in `scopeIds` are included.
 */
export async function gatherScopes(scopeIds) {
  const wanted = PRESET_SCOPES.filter((s) => scopeIds.includes(s.id));
  const keysToRead = [...new Set(wanted.flatMap((s) => s.keys))];
  const data = await readKeys(keysToRead);
  const scopes = {};
  for (const s of wanted) {
    const bag = {};
    for (const k of s.keys) {
      // Only include keys that actually exist — skips empty defaults so
      // the saved JSON stays compact.
      if (data[k] !== undefined) bag[k] = data[k];
    }
    if (Object.keys(bag).length > 0) scopes[s.id] = bag;
  }
  return scopes;
}

/**
 * Apply a preset's `scopes` blob back onto storage. Arrays merge by id;
 * objects overwrite per-key. Scopes the preset doesn't carry are left
 * completely untouched.
 *
 * Returns `{ applied: [scopeIds], merged: { templates: { added, replaced }, … } }`
 * so the UI can surface what actually happened.
 */
export async function applyScopes(scopes) {
  if (!scopes || typeof scopes !== 'object') return { applied: [], merged: {} };

  const writes = {};
  const summary = {};
  const applied = [];

  for (const def of PRESET_SCOPES) {
    const incoming = scopes[def.id];
    if (!incoming || typeof incoming !== 'object') continue;

    applied.push(def.id);
    summary[def.id] = {};

    if (def.merge === 'overwrite') {
      // Object scope — each storage key in this scope is replaced wholesale
      // (i.e. the preset's settings bag wins over the current one). We
      // do per-key writes so unrelated keys in storage stay intact.
      for (const k of def.keys) {
        if (incoming[k] !== undefined) writes[k] = incoming[k];
      }
      continue;
    }

    // mergeById — array scope. Read current, merge, queue write.
    const current = await readKeys(def.keys);
    for (const k of def.keys) {
      const inc = incoming[k];
      if (!Array.isArray(inc)) continue;
      const have = Array.isArray(current[k]) ? current[k] : [];
      const byId = new Map(have.map((it) => [it?.id, it]));
      let added = 0; let replaced = 0;
      for (const it of inc) {
        if (!it || !it.id) { byId.set(`__noid_${added}`, it); added++; continue; }
        if (byId.has(it.id)) replaced++; else added++;
        byId.set(it.id, it);
      }
      writes[k] = [...byId.values()];
      summary[def.id][k] = { added, replaced };
    }
  }

  if (Object.keys(writes).length > 0) await writeKeys(writes);
  return { applied, merged: summary };
}

/**
 * Old preset format had bare `colors` / `variant` / `featureFlags`
 * at the root. Adapt them into the new `scopes` shape on read so the
 * apply path stays one branch.
 */
export function normalizePreset(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.scopes) return p;

  // Legacy shape — fold into the settings scope.
  const settings = {};
  if (p.colors || p.variant) {
    settings.gbTheme = { variant: p.variant || 'dark', colors: p.colors || {} };
    settings.themeColors = p.colors || {};
  }
  if (p.featureFlags)       settings.featureFlags     = p.featureFlags;
  if (p.keyboardShortcuts)  settings.keyboardShortcuts = p.keyboardShortcuts;

  const scopes = {};
  if (Object.keys(settings).length > 0) scopes.settings = settings;
  if (Array.isArray(p.templates))     scopes.templates = { templates: p.templates, templateFolders: p.templateFolders || [] };
  if (Array.isArray(p.noteTemplates)) scopes.notes     = { noteTemplates: p.noteTemplates, noteFolders: p.noteFolders || [] };
  return { ...p, scopes };
}

/** What scope ids does this preset carry? Useful for "contains: …" badges. */
export function presetScopeIds(p) {
  const n = normalizePreset(p);
  if (!n || !n.scopes) return [];
  return PRESET_SCOPES.filter((s) => n.scopes[s.id]).map((s) => s.id);
}
