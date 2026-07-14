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

   IMPORTANT: this script is loaded BEFORE the React content bundles
   in editor.html, so the React mounts can read window.__gbCurrent*
   and find window.__gbSave* synchronously at mount time.

   No React imports are used; the .jsx extension is only because the
   Vite build script (build.js) picks up *.jsx in src/content/.
─────────────────────────────────────────────────────────────── */

import { migrateTemplates } from '../lib/templateMigration.js';

// ── State ──────────────────────────────────────────────────────
let templates     = [];
let noteTemplates = [];
let currentId     = null;
let currentNoteId = null;
let orderTabId    = null;

/* Mirror the active-template ids to window so the React sidebar's
   polling effect (editor-sidebar.jsx) can read them. The sidebar
   syncs its `active` row from window.currentId / window.currentNoteId
   every 300ms — without this mirror it always reads undefined and
   clobbers its own click-time optimistic state, which is why the
   row's brand-tint background was vanishing the moment the mouse
   came off. Route every write to these locals through the setters. */
function setCurrentId(id)     { currentId     = id; if (typeof window !== 'undefined') window.currentId     = id; }
function setCurrentNoteId(id) { currentNoteId = id; if (typeof window !== 'undefined') window.currentNoteId = id; }
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
 * available. If the host has not mounted yet, the notification is dropped.
 */
function toast(msg, isError = false) {
  if (window.__gbToast) {
    return isError ? window.__gbToast.error(msg) : window.__gbToast.success(msg);
  }
  return undefined;
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
    toast('Template editor failed to load — reload the editor.', true);
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
  setCurrentId(id);
  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  show('ed-form');
  animateView('ed-form');
  if (window.__gbOpenTemplate) {
    window.__gbOpenTemplate(tpl);
    return;
  }
    toast('Template editor failed to load — reload the editor.', true);
}

async function deleteTemplate() {
  if (!currentId) return;
  if (!(await gbConfirm('Delete this email template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  templates = templates.filter((t) => t.id !== currentId);
  await saveTemplates();
  setCurrentId(null);
  hide('ed-form');
  show('ed-empty');
  animateView('ed-empty');
}

/* Sidebar row delete — same flow as deleteTemplate but driven by
   a specific id so the user can delete from the row's 3-dot menu
   without opening the template first. If the row IS the open
   one, also tear down the form back to the empty state. */
async function deleteTemplateById(id) {
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  if (!(await gbConfirm(`Delete "${tpl.name || 'Untitled template'}"?`, { tone: 'danger', confirmLabel: 'Delete' }))) return;
  templates = templates.filter((t) => t.id !== id);
  await saveTemplates();
  if (currentId === id) {
    setCurrentId(null);
    hide('ed-form');
    show('ed-empty');
    animateView('ed-empty');
  }
}

// ── Note templates: open / new / delete ────────────────────────
async function newNoteTemplate() {
  if (!window.__gbOpenNote) {
    toast('Note-template editor failed to load — reload the editor.', true);
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
  setCurrentNoteId(id);
  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  show('ed-note-form');
  animateView('ed-note-form');
  if (window.__gbOpenNote) {
    window.__gbOpenNote(tpl);
    return;
  }
    toast('Note-template editor failed to load — reload the editor.', true);
}

async function deleteNoteTemplate() {
  if (!currentNoteId) return;
  if (!(await gbConfirm('Delete this note template?', { tone: 'danger', confirmLabel: 'Delete' }))) return;
  noteTemplates = noteTemplates.filter((t) => t.id !== currentNoteId);
  await saveNoteTemplates();
  setCurrentNoteId(null);
  hide('ed-note-form');
  show('ed-empty');
  animateView('ed-empty');
}

async function deleteNoteTemplateById(id) {
  const tpl = noteTemplates.find((t) => t.id === id);
  if (!tpl) return;
  if (!(await gbConfirm(`Delete "${tpl.name || 'Untitled note'}"?`, { tone: 'danger', confirmLabel: 'Delete' }))) return;
  noteTemplates = noteTemplates.filter((t) => t.id !== id);
  await saveNoteTemplates();
  if (currentNoteId === id) {
    setCurrentNoteId(null);
    hide('ed-note-form');
    show('ed-empty');
    animateView('ed-empty');
  }
}

// ── React-side save bridges ────────────────────────────────────
/**
 * Auto-save bridge for the React template editor. Upsert by id.
 */
async function applyTemplatePatch(tpl) {
  if (!tpl || !tpl.id) return;
  setCurrentId(tpl.id);
  const idx = templates.findIndex((t) => t.id === tpl.id);
  if (idx >= 0) templates[idx] = tpl; else templates.push(tpl);
  await saveTemplates();
  const titleEl = $('ed-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
}
async function applyNotePatch(tpl) {
  if (!tpl || !tpl.id) return;
  setCurrentNoteId(tpl.id);
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
        'theme.js',
        'src/vanilla/smart-detection.js', 'react-dist/vanilla/page-engine.js', 'src/vanilla/variable-resolution.js',
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

// ── Install bridges + start ────────────────────────────────────
// Expose to the React content bundles + legacy callers.
window.openTemplate     = openTemplate;
window.openNoteTemplate = openNoteTemplate;
window.newTemplate      = newTemplate;
window.newNoteTemplate  = newNoteTemplate;
window.deleteTemplate   = deleteTemplate;
window.deleteNoteTemplate = deleteNoteTemplate;
window.deleteTemplateById     = deleteTemplateById;
window.deleteNoteTemplateById = deleteNoteTemplateById;
window.openSettings     = openSettings;
window.closeSettings    = closeSettings;
window.__gbSaveTemplate = applyTemplatePatch;
window.__gbSaveNote     = applyNotePatch;
window.__gbResolveVars  = resolveVarsLive;
window.__gbCurrentTemplate = () => templates.find((t) => t.id === currentId) || null;
window.__gbCurrentNote     = () => noteTemplates.find((t) => t.id === currentNoteId) || null;

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

async function init() {
  const data = await loadStorage();
  templates     = data.templates     || [];
  noteTemplates = data.noteTemplates || [];
  orderTabId    = data.orderTabId    || null;
  /* One-version backwards-compat pass: lift legacy contact/account/order
     variables onto the page engine, and scratch legacy order auto-match
     rules so they're re-authored against the order schema. Persists +
     stamps each template (varsMigratedVersion) so it runs ONCE. */
  try {
    const mig = migrateTemplates(templates, { dryRun: false });
    if (mig.changed) { templates = mig.migrated; await saveTemplates(); }
  } catch (e) { toast('A stored template could not be upgraded automatically.', true); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireGearButton);
  } else {
    wireGearButton();
  }
}
init();
