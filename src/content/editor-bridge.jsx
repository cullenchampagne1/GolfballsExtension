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
import { blankCustomAction, normalizeCustomAction } from '../lib/customActions.js';
import {
  readEmailTemplateCapabilities,
  resolveEmailTemplateCapabilities,
} from '../lib/emailTemplateCapabilities.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
import {
  importedEmailShare,
  isImportedEmailTemplate,
  removeRetainedEmailTemplate,
} from '../lib/templateImport.js';

// ── State ──────────────────────────────────────────────────────
let templates     = [];
let noteTemplates = [];
let customActions = [];
let currentId     = null;
let currentNoteId = null;
let currentActionId = null;
let currentActionDraft = null;
let orderTabId    = null;
let emailTemplateCapabilities = resolveEmailTemplateCapabilities();

/* Mirror the active-template ids to window so the React sidebar's
   polling effect (editor-sidebar.jsx) can read them. The sidebar
   syncs its `active` row from window.currentId / window.currentNoteId
   every 300ms — without this mirror it always reads undefined and
   clobbers its own click-time optimistic state, which is why the
   row's brand-tint background was vanishing the moment the mouse
   came off. Route every write to these locals through the setters. */
function setCurrentId(id)     { currentId     = id; if (typeof window !== 'undefined') window.currentId     = id; }
function setCurrentNoteId(id) { currentNoteId = id; if (typeof window !== 'undefined') window.currentNoteId = id; }
function setCurrentActionId(id) { currentActionId = id; if (typeof window !== 'undefined') window.currentActionId = id; }
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
  return new Promise((res) => chrome.storage.local.get([
    'templates', 'noteTemplates', 'gbCustomActions', 'orderTabId',
    'gbEditorLaunchIntent', 'devSettings',
  ], res));
}
async function saveTemplates() {
  return new Promise((resolve, reject) => chrome.storage.local.set({ templates }, () => {
    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
    else resolve();
  }));
}
async function saveNoteTemplates() {
  return new Promise((res) => chrome.storage.local.set({ noteTemplates }, res));
}
async function saveCustomActions() {
  return new Promise((res) => chrome.storage.local.set({ gbCustomActions: customActions }, res));
}

async function removeTemplateRecord(tpl) {
  const source = importedEmailShare(tpl);
  if (source) {
    await removeRetainedEmailTemplate(tpl, {
      release: (shareId) => sendBackgroundMessage(
        'emailTemplateShareImportRemove', { shareId },
      ),
      retain: (shareId) => sendBackgroundMessage(
        'emailTemplateShareImport', { shareId },
      ),
    });
    templates = templates.filter(
      (item) => importedEmailShare(item)?.shareId !== source.shareId,
    );
    return;
  }
  const previous = templates;
  templates = templates.filter((item) => item.id !== tpl.id);
  try {
    await saveTemplates();
  } catch (error) {
    templates = previous;
    throw error;
  }
}

// ── Templates: open / new / delete ─────────────────────────────
async function newTemplate() {
  emailTemplateCapabilities = await readEmailTemplateCapabilities();
  if (!emailTemplateCapabilities.allowCreation
      || !emailTemplateCapabilities.allowLocalTemplateUsage) {
    toast('Email template creation is disabled for this installation.', true);
    return;
  }
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
  hide('ed-action-form');
  show('ed-form');
  animateView('ed-form');
  await openTemplate(id);
}

async function openTemplate(id) {
  emailTemplateCapabilities = await readEmailTemplateCapabilities();
  if (!emailTemplateCapabilities.allowLocalTemplateUsage) {
    toast('Local email template usage is disabled for this installation.', true);
    return;
  }
  if (currentId === id && !$('ed-form').classList.contains('hidden')) return;
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  setCurrentId(id);
  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  hide('ed-action-form');
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
  const tpl = templates.find((item) => item.id === currentId);
  if (!tpl) return;
  const imported = isImportedEmailTemplate(tpl);
  if (!(await gbConfirm(
    imported ? 'Remove this imported email template?' : 'Delete this email template?',
    { tone: 'danger', confirmLabel: imported ? 'Remove' : 'Delete' },
  ))) return;
  try {
    await removeTemplateRecord(tpl);
  } catch (error) {
    toast(error?.message || 'Unable to remove email template.', true);
    return;
  }
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
  const imported = isImportedEmailTemplate(tpl);
  if (!(await gbConfirm(
    `${imported ? 'Remove imported' : 'Delete'} "${tpl.name || 'Untitled template'}"?`,
    { tone: 'danger', confirmLabel: imported ? 'Remove' : 'Delete' },
  ))) return;
  try {
    await removeTemplateRecord(tpl);
  } catch (error) {
    toast(error?.message || 'Unable to remove email template.', true);
    return;
  }
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
    audienceVal: '', daysOut: null, followUpActionId: '',
    updatedAt: Date.now(),
  };
  noteTemplates.push(blank);
  await saveNoteTemplates();
  hide('ed-empty');
  hide('ed-form');
  hide('ed-settings');
  hide('ed-action-form');
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
  hide('ed-action-form');
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
  if (!emailTemplateCapabilities.allowLocalTemplateUsage) {
    toast('Local email template usage is disabled for this installation.', true);
    return;
  }
  setCurrentId(tpl.id);
  const idx = templates.findIndex((t) => t.id === tpl.id);
  if (isImportedEmailTemplate(tpl) || (idx >= 0 && isImportedEmailTemplate(templates[idx]))) {
    toast('Imported email templates are read-only.', true);
    return;
  }
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

// ── Custom actions: open / new / delete / explicit save ────────
// Actions are managed only from the Settings table, so the editor always
// returns there. A new action remains an in-memory draft until Save Action.
function showActionForm() {
  const views = ['ed-empty', 'ed-form', 'ed-note-form', 'ed-settings'];
  views.forEach((v) => hide(v));
  show('ed-action-form');
  animateView('ed-action-form');
}
function closeActionEditor() {
  hide('ed-action-form');
  show('ed-settings');
  animateView('ed-settings');
  setCurrentActionId(null);
  currentActionDraft = null;
  if (window.__gbOpenAction) window.__gbOpenAction(null);
}

function newAction(pageType = 'contact') {
  if (!window.__gbOpenAction) { toast('Action editor failed to load — reload the editor.', true); return; }
  const rec = { ...blankCustomAction(pageType), __isNew: true };
  currentActionDraft = rec;
  setCurrentActionId(rec.id);
  showActionForm();
  window.__gbOpenAction(rec);
}

function openAction(id) {
  const rec = customActions.find((a) => a.id === id);
  if (!rec) return;
  currentActionDraft = { ...rec, __isNew: false };
  setCurrentActionId(id);
  showActionForm();
  if (window.__gbOpenAction) { window.__gbOpenAction(currentActionDraft); return; }
  toast('Action editor failed to load — reload the editor.', true);
}

async function deleteActionById(id) {
  const rec = customActions.find((a) => a.id === id);
  if (!rec) return;
  if (!(await gbConfirm(`Delete "${rec.name || 'Untitled action'}"?`, { tone: 'danger', confirmLabel: 'Delete' }))) return;
  customActions = customActions.filter((a) => a.id !== id);
  await saveCustomActions();
  if (currentActionId === id) {
    setCurrentActionId(null);
    currentActionDraft = null;
    hide('ed-action-form');
    show('ed-settings');
    animateView('ed-settings');
    if (window.__gbOpenAction) window.__gbOpenAction(null);
  }
}

/** Explicit-save bridge for the React action editor. Upsert by id (normalized). */
async function applyActionPatch(rec) {
  if (!rec || !rec.id) return;
  setCurrentActionId(rec.id);
  const norm = normalizeCustomAction(rec);
  const idx = customActions.findIndex((a) => a.id === norm.id);
  if (idx >= 0) customActions[idx] = norm; else customActions.push(norm);
  await saveCustomActions();
  currentActionDraft = { ...norm, __isNew: false };
  return norm;
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
        'src/vanilla/usage-report.js', 'src/vanilla/modals/modal-chrome.js',
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
  const views = ['ed-empty', 'ed-form', 'ed-note-form', 'ed-action-form'];
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

function consumeLaunchIntent(intent) {
  if (!intent || intent.view !== 'settings') return;
  const createdAt = Number(intent.createdAt || 0);
  if (createdAt && Date.now() - createdAt > 60_000) {
    chrome.storage.local.remove('gbEditorLaunchIntent');
    return;
  }
  const run = () => {
    openSettings();
    chrome.storage.local.remove('gbEditorLaunchIntent');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
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
window.openAction       = openAction;
window.newAction        = newAction;
window.deleteActionById = deleteActionById;
window.closeActionEditor = closeActionEditor;
window.__gbSaveTemplate = applyTemplatePatch;
window.__gbSaveNote     = applyNotePatch;
window.__gbSaveAction   = applyActionPatch;
window.__gbResolveVars  = resolveVarsLive;
window.__gbCurrentTemplate = () => emailTemplateCapabilities.allowLocalTemplateUsage
  ? templates.find((t) => t.id === currentId) || null
  : null;
window.__gbCurrentNote     = () => noteTemplates.find((t) => t.id === currentNoteId) || null;
window.__gbCurrentAction   = () => currentActionDraft
  || customActions.find((a) => a.id === currentActionId)
  || null;

// Storage onChanged — keep local arrays in sync if another tab/popup edits.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.templates) {
    templates = changes.templates.newValue || [];
    if (currentId && !templates.some((template) => template.id === currentId)) {
      setCurrentId(null);
      hide('ed-form');
      _settingsPreviousView = _settingsPreviousView === 'ed-form'
        ? 'ed-empty'
        : _settingsPreviousView;
      if ($('ed-settings')?.classList.contains('hidden')) {
        show('ed-empty');
        animateView('ed-empty');
      }
    }
  }
  if (changes.noteTemplates) noteTemplates = changes.noteTemplates.newValue || [];
  if (changes.gbCustomActions) customActions = changes.gbCustomActions.newValue || [];
  if (changes.orderTabId)    orderTabId    = changes.orderTabId.newValue    || null;
  if (changes.devSettings) {
    const prior = emailTemplateCapabilities;
    emailTemplateCapabilities = resolveEmailTemplateCapabilities(changes.devSettings.newValue);
    if (prior.allowLocalTemplateUsage && !emailTemplateCapabilities.allowLocalTemplateUsage) {
      setCurrentId(null);
      hide('ed-form');
      show('ed-empty');
      animateView('ed-empty');
    }
  }
  if (changes.gbEditorLaunchIntent?.newValue) consumeLaunchIntent(changes.gbEditorLaunchIntent.newValue);
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
  customActions = data.gbCustomActions || [];
  orderTabId    = data.orderTabId    || null;
  emailTemplateCapabilities = resolveEmailTemplateCapabilities(data.devSettings);
  /* One-version backwards-compat pass: lift legacy contact/account/order
     variables onto the page engine, and scratch legacy order auto-match
     rules so they're re-authored against the order schema. Persists +
     stamps each template (varsMigratedVersion) so it runs ONCE. */
  try {
    const mig = migrateTemplates(templates, { dryRun: false });
    if (mig.changed) { templates = mig.migrated; await saveTemplates(); }
  } catch (e) { toast('A stored template could not be upgraded automatically.', true); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      wireGearButton();
      consumeLaunchIntent(data.gbEditorLaunchIntent);
    });
  } else {
    wireGearButton();
    consumeLaunchIntent(data.gbEditorLaunchIntent);
  }
}
init();
