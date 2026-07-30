/* ───────────────────────────────────────────────────────────────
   presetScopes.js — what a shared settings template can carry.

   A shared template is a bundle of scopes the user explicitly picks
   at creation time. Each scope is a self-contained slice of the
   extension's `chrome.storage.local` so that:
     • Create = read those keys and send schema-validated JSON to RevStack.
     • Import = write selected scopes back. Arrays merge by id (existing id
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
    id: 'settings-preferences', category: 'Configuration',
    label: 'Preferences',
    desc: 'Feature flags · developer settings · keyboard shortcuts · custom pages',
    keys: ['featureFlags', 'devSettings', 'keyboardShortcuts', 'customPages'],
    merge: 'overwrite',
  },
  {
    id: 'settings-appearance', category: 'Configuration',
    label: 'Appearance',
    desc: 'Theme · custom colors · per-surface UI scale',
    keys: ['themeColors', 'gbTheme', 'uiScales'],
    merge: 'overwrite',
  },
  {
    id: 'settings-email', category: 'Configuration',
    label: 'Email Identity',
    desc: 'Email signature only; Power Automate credentials are never exported',
    keys: ['emailSignature'],
    merge: 'overwrite',
  },
  // Email templates, split by `type` so a shared preset can carry just the
  // kinds the recipient wants. `filter` captures only matching items on save;
  // mergeById on load merges them into the recipient's array, leaving other
  // types untouched. Folders ride along (whole) so categories survive.
  {
    id: 'tpl-order', category: 'Email Templates', label: 'Order Templates', desc: 'Email templates for order pages',
    keys: ['templates', 'templateFolders'], merge: 'mergeById',
    filter: { templates: (t) => (t.type || 'order') === 'order' },
  },
  {
    id: 'tpl-case', category: 'Email Templates', label: 'Case Templates', desc: 'Email templates for case pages',
    keys: ['templates', 'templateFolders'], merge: 'mergeById',
    filter: { templates: (t) => t.type === 'case' },
  },
  {
    id: 'tpl-account', category: 'Email Templates', label: 'Account Templates', desc: 'Email templates for account pages',
    keys: ['templates', 'templateFolders'], merge: 'mergeById',
    filter: { templates: (t) => t.type === 'account' },
  },
  {
    id: 'tpl-contact', category: 'Email Templates', label: 'Contact Templates', desc: 'Email templates for contact pages',
    keys: ['templates', 'templateFolders'], merge: 'mergeById',
    filter: { templates: (t) => t.type === 'contact' },
  },
  // Note templates, split by `subType`.
  {
    id: 'note-quick', category: 'Activity Templates', label: 'Quick Notes', desc: 'Quick note templates',
    keys: ['noteTemplates', 'noteFolders'], merge: 'mergeById',
    filter: { noteTemplates: (n) => (n.subType || 'note') === 'note' },
  },
  {
    id: 'note-task', category: 'Activity Templates', label: 'Task Templates', desc: 'Task templates',
    keys: ['noteTemplates', 'noteFolders'], merge: 'mergeById',
    filter: { noteTemplates: (n) => n.subType === 'task' },
  },
  {
    id: 'note-call', category: 'Activity Templates', label: 'Call Log Templates', desc: 'Call-log templates',
    keys: ['noteTemplates', 'noteFolders'], merge: 'mergeById',
    filter: { noteTemplates: (n) => n.subType === 'call_log' },
  },
  // User-authored shelf actions (code-block scripts). Merge by id so a shared
  // preset adds actions without clobbering the recipient's own.
  {
    id: 'custom-actions', category: 'Automation', label: 'Custom Actions', desc: 'User-authored code-block shelf actions',
    keys: ['gbCustomActions'], merge: 'mergeById',
  },
];

/** Stable, versioned envelope used when the RevStack sharing API is not
 * reachable or this installation's server credential has been revoked. */
export const SETTINGS_TEMPLATE_FILE_KIND = 'golfballs-settings-template';
export const SETTINGS_TEMPLATE_FILE_VERSION = 1;
const EXTENSION_STATE_FILE_KIND = 'golfballs-extension-state';

const ALL_KEYS = [...new Set(PRESET_SCOPES.flatMap((s) => s.keys))];
const INSTALLATION_LOCAL_DEV_SETTING_KEYS = Object.freeze([
  'email.localPart',
  'pageEngine.indexingEnabled',
  'pageEngine.accountId',
]);

function withoutCredentials(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const safe = { ...value };
  delete safe.powerAutomateUrl;
  delete safe.directSendUrl;
  delete safe.addressAutocompleteKey;
  return safe;
}

function withoutInstallationLocalDevSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const safe = { ...value };
  for (const key of INSTALLATION_LOCAL_DEV_SETTING_KEYS) delete safe[key];
  return safe;
}

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
 * Build a scoped object from the user's current extension state. Only
 * the scopes listed in `scopeIds` are included.
 */
function scopesFromStorageData(data, wanted = PRESET_SCOPES) {
  const scopes = {};
  for (const s of wanted) {
    const bag = {};
    let filteredCount = null; // null = no filter on this scope
    for (const k of s.keys) {
      if (data[k] === undefined) continue;
      const pred = s.filter && s.filter[k];
      if (pred && Array.isArray(data[k])) {
        const subset = data[k].filter(pred);
        filteredCount = subset.length;
        bag[k] = subset;
      } else {
        bag[k] = k === 'featureFlags'
          ? withoutCredentials(data[k])
          : (k === 'devSettings' ? withoutInstallationLocalDevSettings(data[k]) : data[k]);
      }
    }
    // For a filtered scope, only include it when its primary array has items
    // (don't ship an empty "Account Templates" scope). Unfiltered scopes
    // include if anything was captured.
    const include = filteredCount === null ? Object.keys(bag).length > 0 : filteredCount > 0;
    if (include) scopes[s.id] = bag;
  }
  return scopes;
}

export async function gatherScopes(scopeIds) {
  const wanted = PRESET_SCOPES.filter((s) => scopeIds.includes(s.id));
  const keysToRead = [...new Set(wanted.flatMap((s) => s.keys))];
  return scopesFromStorageData(await readKeys(keysToRead), wanted);
}

/**
 * Apply a shared template's `scopes` blob back onto storage. Arrays merge by id;
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
        if (incoming[k] !== undefined) {
          if (k === 'featureFlags') {
            writes[k] = withoutCredentials(incoming[k]);
          } else if (k === 'devSettings') {
            const current = (await readKeys('devSettings')).devSettings || {};
            const next = withoutInstallationLocalDevSettings(incoming[k]) || {};
            writes[k] = { ...next };
            for (const localKey of INSTALLATION_LOCAL_DEV_SETTING_KEYS) {
              if (Object.hasOwn(current, localKey)) writes[k][localKey] = current[localKey];
            }
          } else {
            writes[k] = incoming[k];
          }
        }
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

  let scopes;
  if (p.scopes) {
    scopes = { ...p.scopes };
  } else {
    // Legacy ROOT shape — bare colors/variant/featureFlags/templates at top level.
    scopes = {};
    const settings = {};
    if (p.colors || p.variant) {
      settings.gbTheme = { variant: p.variant || 'dark', colors: p.colors || {} };
      settings.themeColors = p.colors || {};
    }
    if (p.featureFlags)      settings.featureFlags      = p.featureFlags;
    if (p.keyboardShortcuts) settings.keyboardShortcuts = p.keyboardShortcuts;
    if (Object.keys(settings).length > 0) scopes.settings = settings;
    if (Array.isArray(p.templates))     scopes.templates = { templates: p.templates, templateFolders: p.templateFolders || [] };
    if (Array.isArray(p.noteTemplates)) scopes.notes     = { noteTemplates: p.noteTemplates, noteFolders: p.noteFolders || [] };
  }

  // Settings links created before the categorized scope split used one broad
  // `settings` bag. Partition it on read so old files and URLs remain usable.
  if (scopes.settings && typeof scopes.settings === 'object') {
    const legacy = scopes.settings;
    for (const def of PRESET_SCOPES.filter((scope) => scope.id.startsWith('settings-'))) {
      const bag = {};
      for (const key of def.keys) if (legacy[key] !== undefined) bag[key] = legacy[key];
      if (Object.keys(bag).length) scopes[def.id] = { ...(scopes[def.id] || {}), ...bag };
    }
    delete scopes.settings;
  }

  // Migrate the old coarse `templates` / `notes` scopes into the per-type
  // scopes so presets saved before the split still load.
  if (scopes.templates) {
    const { templates = [], templateFolders = [] } = scopes.templates;
    for (const [id, type] of [['tpl-order', 'order'], ['tpl-case', 'case'], ['tpl-account', 'account'], ['tpl-contact', 'contact']]) {
      const items = templates.filter((t) => (t.type || 'order') === type);
      if (items.length) scopes[id] = { templates: items, templateFolders };
    }
    delete scopes.templates;
  }
  if (scopes.notes) {
    const { noteTemplates = [], noteFolders = [] } = scopes.notes;
    for (const [id, sub] of [['note-quick', 'note'], ['note-task', 'task'], ['note-call', 'call_log']]) {
      const items = noteTemplates.filter((n) => (n.subType || 'note') === sub);
      if (items.length) scopes[id] = { noteTemplates: items, noteFolders };
    }
    delete scopes.notes;
  }

  if (scopes['settings-preferences']?.featureFlags) {
    scopes['settings-preferences'] = {
      ...scopes['settings-preferences'],
      featureFlags: withoutCredentials(scopes['settings-preferences'].featureFlags),
    };
  }
  if (scopes['settings-preferences']?.devSettings) {
    scopes['settings-preferences'] = {
      ...scopes['settings-preferences'],
      devSettings: withoutInstallationLocalDevSettings(
        scopes['settings-preferences'].devSettings,
      ),
    };
  }

  return { ...p, scopes };
}

/** What scope ids does this preset carry? Useful for "contains: …" badges. */
export function presetScopeIds(p) {
  const n = normalizePreset(p);
  if (!n || !n.scopes) return [];
  return PRESET_SCOPES.filter((s) => n.scopes[s.id]).map((s) => s.id);
}

/** Create the JSON-serializable offline equivalent of a server share. */
export function buildSettingsTemplateFile(name, scopes) {
  const safeName = String(name || '').trim().slice(0, 120);
  if (!safeName) throw new Error('A settings template name is required');
  const normalized = normalizePreset({ scopes });
  const allowed = {};
  for (const def of PRESET_SCOPES) {
    const bag = normalized?.scopes?.[def.id];
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) allowed[def.id] = bag;
  }
  if (!Object.keys(allowed).length) throw new Error('The settings template has no supported scopes');
  return {
    schemaVersion: SETTINGS_TEMPLATE_FILE_VERSION,
    kind: SETTINGS_TEMPLATE_FILE_KIND,
    name: safeName,
    createdAt: new Date().toISOString(),
    scopes: allowed,
  };
}

/** Parse an offline settings or migration file before it reaches applyScopes(). */
export function parseSettingsTemplateFile(text) {
  const source = String(text || '');
  let raw;
  try { raw = JSON.parse(source); }
  catch (error) { throw new Error(`Not valid JSON — ${error.message}`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The settings template must be a JSON object');
  }
  if (raw.kind === EXTENSION_STATE_FILE_KIND && raw.version === 1) {
    if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) {
      throw new Error('The extension state backup is missing its data');
    }
    const scopes = scopesFromStorageData(raw.data);
    if (!Object.keys(scopes).length) throw new Error('The extension state backup has no supported settings');
    return {
      schemaVersion: SETTINGS_TEMPLATE_FILE_VERSION,
      kind: SETTINGS_TEMPLATE_FILE_KIND,
      name: 'Extension state backup',
      createdAt: raw.exportedAt || new Date().toISOString(),
      scopes,
      transport: 'json',
    };
  }
  if (raw.kind !== SETTINGS_TEMPLATE_FILE_KIND || raw.schemaVersion !== SETTINGS_TEMPLATE_FILE_VERSION) {
    throw new Error('This is not a supported Golfballs settings template file');
  }
  const name = String(raw.name || '').trim().slice(0, 120);
  if (!name) throw new Error('The settings template is missing its name');
  const normalized = normalizePreset(raw);
  const scopes = {};
  for (const def of PRESET_SCOPES) {
    const bag = normalized?.scopes?.[def.id];
    if (bag && typeof bag === 'object' && !Array.isArray(bag)) scopes[def.id] = bag;
  }
  if (!Object.keys(scopes).length) throw new Error('The settings template has no supported scopes');
  return { ...raw, name, scopes, transport: 'json' };
}
