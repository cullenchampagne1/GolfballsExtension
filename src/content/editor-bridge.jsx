/* eslint-disable no-console */
/* ───────────────────────────────────────────────────────────────
   editor-bridge — the non-React glue that the React editor
   bundles depend on. Replaces the legacy `editor.js` file.

   Owns:
     • Templates / note-templates state (in-memory + chrome.storage)
     • The window.__gb* API the React bundles read on mount
     • openTemplate / openNoteTemplate / newTemplate / newNoteTemplate
       — thin shells that swap view classes and hand off to React
     • deleteTemplate / deleteNoteTemplate (themed gbConfirm + persist)
     • Variable resolution proxy to the order tab
     • Settings open/close stubs
     • One-shot migrations (window.gbMigrateVariations / Unmigrate)

   IMPORTANT: this script is loaded BEFORE the React content bundles
   in editor.html, so the React mounts can read window.__gbCurrent*
   and find window.__gbSave* synchronously at mount time.

   No React imports are used; the .jsx extension is only because the
   Vite build script (build.js) picks up *.jsx in src/content/.
─────────────────────────────────────────────────────────────── */

// ── State ──────────────────────────────────────────────────────
let templates     = [];
let noteTemplates = [];
let currentId     = null;
let currentNoteId = null;
let orderTabId    = null;
// Tracks the view that was visible before openSettings() so
// closeSettings() can restore it.
let _settingsPreviousView = 'ed-empty';

// ── Tiny DOM helpers ───────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove('hidden');
const hide = (id) => $(id)?.classList.add('hidden');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/**
 * Re-trigger the view's fade-in animation by toggling its class.
 * Same behavior the legacy editor.js had.
 */
function animateView(viewId) {
  const view = $(viewId);
  if (!view) return;
  view.classList.remove('view-animate');
  void view.offsetWidth;
  view.classList.add('view-animate');
}

/**
 * Themed confirm/prompt — go through the React SettingNotification
 * overlay (editor-notifications.jsx mounts window.__gbNotify); fall
 * back to native confirm if the bridge isn't installed yet.
 */
function gbConfirm(message, options = {}) {
  if (window.__gbNotify?.confirm) return window.__gbNotify.confirm(message, options);
  return Promise.resolve(window.confirm(message));
}

/**
 * Surfaces a bottom-right toast via the React PillToast manager when
 * available; falls back to console.log if not.
 */
function toast(msg, isError = false) {
  if (window.__gbToast) {
    return isError ? window.__gbToast.error(msg) : window.__gbToast.success(msg);
  }
  console.log('[gb-toast]', msg);
}

// ── Storage ────────────────────────────────────────────────────
function loadStorage() {
  return new Promise((res) => chrome.storage.local.get(['templates', 'noteTemplates', 'orderTabId'], res));
}
async function saveTemplates() {
  return new Promise((res) => chrome.storage.local.set({ templates }, res));
}
async function saveNoteTemplates() {
  return new Promise((res) => chrome.storage.local.set({ noteTemplates }, res));
}

// ── Templates: open / new / delete ─────────────────────────────
async function newTemplate() {
  if (!window.__gbOpenTemplate) {
    console.warn('[gb-editor] React template bridge missing; reload editor.');
    return;
  }
  const id = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = {
    id, type: 'order', name: 'New Template',
    enabled: true, subject: '', body: '',
    rules: [], vars: {}, varOrder: [],
    updatedAt: Date.now(),
  };
  templates.push(blank);
  await saveTemplates();
  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  show('ed-form');
  animateView('ed-form');
  openTemplate(id);
}

function openTemplate(id) {
  if (currentId === id && !$('ed-form').classList.contains('hidden')) return;
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  currentId = id;
  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  show('ed-form');
  animateView('ed-form');
  if (window.__gbOpenTemplate) {
    window.__gbOpenTemplate(tpl);
    return;
  }
  console.warn('[gb-editor] React template bridge missing; reload editor.');
}

async function deleteTemplate() {
  if (!currentId) return;
  if (!(await gbConfirm('Delete this email template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  templates = templates.filter((t) => t.id !== currentId);
  await saveTemplates();
  currentId = null;
  hide('ed-form');
  show('ed-empty');
  animateView('ed-empty');
}

// ── Note templates: open / new / delete ────────────────────────
async function newNoteTemplate() {
  if (!window.__gbOpenNote) {
    console.warn('[gb-editor] React note-template bridge missing; reload editor.');
    return;
  }
  const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const blank = {
    id, name: 'New Note Template', subType: 'note',
    enabled: true, subject: '', body: '',
    audienceVal: '', daysOut: null,
    updatedAt: Date.now(),
  };
  noteTemplates.push(blank);
  await saveNoteTemplates();
  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  show('ed-note-form');
  animateView('ed-note-form');
  openNoteTemplate(id);
}

function openNoteTemplate(id) {
  if (currentNoteId === id && !$('ed-note-form').classList.contains('hidden')) return;
  const tpl = noteTemplates.find((t) => t.id === id);
  if (!tpl) return;
  currentNoteId = id;
  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  show('ed-note-form');
  animateView('ed-note-form');
  if (window.__gbOpenNote) {
    window.__gbOpenNote(tpl);
    return;
  }
  console.warn('[gb-editor] React note-template bridge missing; reload editor.');
}

async function deleteNoteTemplate() {
  if (!currentNoteId) return;
  if (!(await gbConfirm('Delete this note template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  noteTemplates = noteTemplates.filter((t) => t.id !== currentNoteId);
  await saveNoteTemplates();
  currentNoteId = null;
  hide('ed-note-form');
  show('ed-empty');
  animateView('ed-empty');
}

// ── React-side save bridges ────────────────────────────────────
/**
 * Auto-save bridge for the React template editor. Upsert by id.
 */
async function applyTemplatePatch(tpl) {
  if (!tpl || !tpl.id) return;
  currentId = tpl.id;
  const idx = templates.findIndex((t) => t.id === tpl.id);
  if (idx >= 0) templates[idx] = tpl; else templates.push(tpl);
  await saveTemplates();
  const titleEl = $('ed-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
}
async function applyNotePatch(tpl) {
  if (!tpl || !tpl.id) return;
  currentNoteId = tpl.id;
  const idx = noteTemplates.findIndex((t) => t.id === tpl.id);
  if (idx >= 0) noteTemplates[idx] = tpl; else noteTemplates.push(tpl);
  await saveNoteTemplates();
  const titleEl = $('ed-note-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
}

// ── Variable resolution proxy ──────────────────────────────────
/**
 * Variables (DOM/regex/builtin) resolve against a live order/account tab.
 * The React editor calls window.__gbResolveVars({...}) and we ask the
 * order tab to do the actual DOM work.
 */
function resolveVarsLive(varsObj) {
  return new Promise((resolve) => {
    if (!orderTabId || !varsObj || Object.keys(varsObj).length === 0) {
      resolve({ resolved: {} });
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: orderTabId },
      files: [
        'theme.js', 'libs/flatpickr.js', 'src/vanilla/notifications.js', 'src/vanilla/calendar.js',
        'src/vanilla/smart-detection.js', 'src/vanilla/variable-resolution.js', 'src/vanilla/modals/logo-extractor.js',
        'src/vanilla/modals/charge-modal.js', 'src/vanilla/modals/order-edit-modal.js', 'src/vanilla/page-utils.js', 'src/vanilla/main.js',
      ],
    }, () => {
      void chrome.runtime.lastError;
      chrome.tabs.sendMessage(
        orderTabId,
        { action: 'resolveVars', vars: varsObj, toField: { type: 'auto' } },
        (result) => { void chrome.runtime.lastError; resolve(result || { resolved: {} }); },
      );
    });
  });
}

// ── Settings open/close (React owns the panel body) ────────────
function openSettings() {
  const views = ['ed-empty', 'ed-form', 'ed-note-form'];
  _settingsPreviousView = views.find((v) => !$(v)?.classList.contains('hidden')) || 'ed-empty';
  views.forEach((v) => $(v)?.classList.add('hidden'));
  show('ed-settings');
  animateView('ed-settings');
}
function closeSettings() {
  $('ed-settings')?.classList.add('hidden');
  $(_settingsPreviousView)?.classList.remove('hidden');
  $(_settingsPreviousView)?.classList.add('view-animate');
}

/**
 * The standalone Case Templates panel was retired when case templates
 * were unified into the main editor's type-switcher. Anything that
 * still messages us to open it gets a toast instead.
 */
function openCaseTplEditor() {
  if (window.__gbToast?.info) {
    window.__gbToast.info('Case templates now live in the main editor — switch the template type to "Case".');
  } else {
    console.info('[gb] Case template editor is unified with the main editor.');
  }
}

// ── One-shot migrations (console helpers) ──────────────────────
/**
 * Convert legacy "X Variation N" sibling templates into the new
 * explicit `tpl.variations: [{id,label,subject,body}]` shape.
 * Run from devtools: `await window.gbMigrateVariations()`
 */
async function gbMigrateVariations({ dryRun = false } = {}) {
  const data = await loadStorage();
  const all = data.templates || [];
  const byBase = new Map();
  const VARIATION_RE = /^(.*?)\s*Variation\s*[#]?(\d+)\s*$/i;
  for (const t of all) {
    const m = (t.name || '').match(VARIATION_RE);
    if (!m) continue;
    const base = m[1].trim();
    const n = parseInt(m[2], 10);
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push({ tpl: t, n });
  }
  let migrated = 0;
  /* Accumulate removals across ALL groups before filtering once at the
     end. The previous code reassigned `templates = all.filter(…)` per
     iteration, which silently wiped out earlier groups' deletions —
     only the last group's siblings actually got removed. */
  const removeIds = new Set();
  for (const [base, group] of byBase.entries()) {
    if (group.length < 2) continue;
    const parent = all.find((t) => t.name === base);
    if (!parent) continue;
    group.sort((a, b) => a.n - b.n);
    // Dedupe by id against any variations already on the parent. Lets
    // the migration be re-run safely to clean up leftover standalones
    // from earlier buggy runs without doubling entries on the parent.
    const existingIds = new Set((parent.variations || []).map((v) => v.id));
    const variations = group
      .filter((g) => !existingIds.has(g.tpl.id))
      .map((g) => ({
        id: g.tpl.id, label: `Variation ${g.n}`,
        subject: g.tpl.subject || '', body: g.tpl.body || '',
      }));
    parent.variations = [...(parent.variations || []), ...variations];
    migrated += variations.length;
    // Every group sibling — even ones already in parent.variations —
    // belongs in the removal set so the standalone templates from the
    // first-run leftover state get pruned now.
    for (const g of group) removeIds.add(g.tpl.id);
  }
  if (!dryRun && migrated > 0) {
    templates = all.filter((t) => !removeIds.has(t.id));
    await saveTemplates();
    console.log('[gbMigrateVariations] migrated', migrated, 'siblings into parents (', removeIds.size, 'standalone templates removed)');
  } else {
    console.log('[gbMigrateVariations]', dryRun ? 'dry-run:' : 'no-op:', 'would migrate', migrated, 'siblings');
  }
  return { migrated, removed: removeIds.size };
}

/**
 * Reverse the migration: expand `tpl.variations` back into sibling
 * "X Variation N" templates so the legacy editor's sibling layout
 * still has data to render.
 */
async function gbUnmigrateVariations({ dryRun = false } = {}) {
  const data = await loadStorage();
  const all = data.templates || [];
  const additions = [];
  for (const parent of all) {
    if (!Array.isArray(parent.variations) || parent.variations.length === 0) continue;
    parent.variations.forEach((v, i) => {
      additions.push({
        ...parent,
        id: v.id || `${parent.id}_var_${i + 1}`,
        name: `${parent.name} Variation ${i + 1}`,
        subject: v.subject || parent.subject || '',
        body: v.body || parent.body || '',
        variations: undefined,
      });
    });
  }
  console.log('[gbUnmigrateVariations]', dryRun ? 'dry-run:' : 'unmigrating:', 'would add', additions.length, 'sibling templates');
  if (!dryRun && additions.length > 0) {
    templates = [...all.map((t) => ({ ...t, variations: undefined })), ...additions];
    await saveTemplates();
  }
  return { added: additions.length };
}

// ── Install bridges + start ────────────────────────────────────
// Expose to the React content bundles + legacy callers.
window.openTemplate     = openTemplate;
window.openNoteTemplate = openNoteTemplate;
window.newTemplate      = newTemplate;
window.newNoteTemplate  = newNoteTemplate;
window.deleteTemplate   = deleteTemplate;
window.deleteNoteTemplate = deleteNoteTemplate;
window.openSettings     = openSettings;
window.closeSettings    = closeSettings;
window.openCaseTplEditor = openCaseTplEditor;

window.__gbSaveNote     = applyNotePatch;
window.__gbResolveVars  = resolveVarsLive;
window.__gbCurrentTemplate = () => templates.find((t) => t.id === currentId) || null;
window.__gbCurrentNote     = () => noteTemplates.find((t) => t.id === currentNoteId) || null;

window.gbMigrateVariations   = gbMigrateVariations;
window.gbUnmigrateVariations = gbUnmigrateVariations;

// Storage onChanged — keep local arrays in sync if another tab/popup edits.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.templates)     templates     = changes.templates.newValue     || [];
  if (changes.noteTemplates) noteTemplates = changes.noteTemplates.newValue || [];
  if (changes.orderTabId)    orderTabId    = changes.orderTabId.newValue    || null;
});

// Settings gear in the legacy editor.html chrome (React's sidebar also
// calls window.openSettings directly via its own gear button).
function wireGearButton() {
  $('btn-settings')?.addEventListener('click', openSettings);
}

// Cross-tab signal to deep-link into case templates. Now a toast.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === 'GB_OPEN_CASE_TPL_EDITOR') openCaseTplEditor();
});

// Pull pending-nav written by background.js when the editor is opened
// specifically for case templates.
(async () => {
  const getNav = async () => {
    try {
      const s = await new Promise((res) => chrome.storage.session?.get('pendingNav', res).catch(() => res({})));
      if (s?.pendingNav) return s.pendingNav;
    } catch (_) { /* noop */ }
    try {
      const s = await new Promise((res) => chrome.storage.local.get('pendingNav', res));
      if (s?.pendingNav) return s.pendingNav;
    } catch (_) { /* noop */ }
    return null;
  };
  const nav = await getNav();
  if (nav === 'case-tpl') {
    chrome.storage.session?.remove('pendingNav').catch(() => chrome.storage.local.remove('pendingNav'));
    openCaseTplEditor();
  }
})();

async function init() {
  const data = await loadStorage();
  templates     = data.templates     || [];
  noteTemplates = data.noteTemplates || [];
  orderTabId    = data.orderTabId    || null;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGearButton);
  } else {
    wireGearButton();
  }
}
init();
