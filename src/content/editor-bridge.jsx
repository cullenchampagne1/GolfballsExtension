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
  emailTemplateIsEditable,
  filterLocalEmailTemplates,
  isManagedEmailTemplate,
  readEmailTemplateCapabilities,
  resolveEmailTemplateCapabilities,
} from '../lib/emailTemplateCapabilities.js';
import { sendBackgroundMessage } from '../lib/backgroundMessage.js';
import {
  emailTemplateSubmission,
  submissionEditorTemplate,
  submissionTemplateDocument,
} from '../lib/emailTemplateSubmission.js';
import {
  applyImportedEmailTemplateOverrides,
  importedEmailShare,
  isImportedEmailTemplate,
  removeRetainedEmailTemplate,
} from '../lib/templateImport.js';
import {
  acknowledgeOwnedTemplateShare,
  ownedTemplateShares,
  pendingOwnedTemplateShareUpdates,
  reconcileOwnedTemplateShares,
  registerOwnedTemplateShare,
  removeOwnedTemplateShare,
} from '../lib/templateShareSync.js';

// ── State ──────────────────────────────────────────────────────
let templates     = [];
let noteTemplates = [];
let customActions = [];
let currentId     = null;
let currentNoteId = null;
let currentActionId = null;
let currentActionDraft = null;
let emailTemplateSubmissions = null;
let currentSubmissionId = null;
let currentSubmissionDraft = null;
let orderTabId    = null;
let emailTemplateCapabilities = resolveEmailTemplateCapabilities();
let currentShareSessionId = null;
const shareFlushes = new Map();

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
function setCurrentSubmissionId(id) {
  currentSubmissionId = id;
  if (typeof window !== 'undefined') window.currentSubmissionId = id;
}
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
    'gbEmailTemplateSubmissions',
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

function newShareSessionId() {
  return `share-edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureShareSession() {
  if (!currentShareSessionId) currentShareSessionId = newShareSessionId();
  return currentShareSessionId;
}

async function trackTemplateShare(templateId, share, sharedTemplate) {
  const idx = templates.findIndex((item) => item.id === templateId);
  if (idx < 0 || isImportedEmailTemplate(templates[idx])) return false;
  templates[idx] = registerOwnedTemplateShare(templates[idx], share, sharedTemplate);
  await saveTemplates();
  return true;
}

async function revokeOwnedTemplateShares(templateId) {
  const idx = templates.findIndex((item) => item.id === templateId);
  if (idx < 0 || isImportedEmailTemplate(templates[idx])) return false;
  const owned = ownedTemplateShares(templates[idx]);
  if (!owned.length) return false;
  const ok = await gbConfirm(
    `Revoke the share for “${templates[idx].name || 'Untitled template'}”? Anyone who imported it will lose the shared source.`,
    { tone: 'danger', confirmLabel: 'Revoke share' },
  );
  if (!ok) return false;
  try {
    for (const row of owned) {
      await sendBackgroundMessage('emailShareRevoke', { shareId: row.shareId });
      const current = templates.findIndex((item) => item.id === templateId);
      if (current >= 0) {
        templates[current] = removeOwnedTemplateShare(templates[current], row.shareId);
        await saveTemplates();
      }
    }
  } catch (error) {
    toast(error?.message || 'Unable to revoke the template share.', true);
    return false;
  }
  toast('Template share revoked.');
  return true;
}

function flushShareUpdate(templateId, initialUpdate) {
  const key = `${templateId}:${initialUpdate.shareId}`;
  if (shareFlushes.has(key)) return shareFlushes.get(key);
  const pending = (async () => {
    let update = initialUpdate;
    while (update) {
      const response = await sendBackgroundMessage('emailTemplateShareUpdate', {
        shareId: update.shareId,
        sessionId: update.sessionId,
        patch: update.patch,
      });
      const idx = templates.findIndex((item) => item.id === templateId);
      if (idx < 0) return;
      templates[idx] = acknowledgeOwnedTemplateShare(
        templates[idx], update.shareId, update.snapshot, response.share,
      );
      await saveTemplates();
      update = pendingOwnedTemplateShareUpdates(
        templates[idx], update.sessionId,
      ).find((item) => item.shareId === update.shareId) || null;
    }
  })().catch((error) => {
    toast(error?.message || 'Unable to update shared email template.', true);
  }).finally(() => {
    shareFlushes.delete(key);
  });
  shareFlushes.set(key, pending);
  return pending;
}

function flushOwnedTemplateShares(templateId = currentId, sessionId = currentShareSessionId) {
  const template = templates.find((item) => item.id === templateId);
  if (!template || isImportedEmailTemplate(template) || !sessionId) return [];
  return pendingOwnedTemplateShareUpdates(template, sessionId)
    .map((update) => flushShareUpdate(templateId, update));
}

function leaveCurrentTemplate() {
  const templateId = currentId;
  const sessionId = currentShareSessionId;
  currentShareSessionId = null;
  if (templateId && sessionId) flushOwnedTemplateShares(templateId, sessionId);
}

async function removeTemplateRecord(tpl) {
  if (isManagedEmailTemplate(tpl) && !emailTemplateCapabilities.allowParentAccount) {
    throw new Error('Managed email templates can only be removed by a parent account');
  }
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
  leaveCurrentTemplate();
  emailTemplateCapabilities = await readEmailTemplateCapabilities();
  if (!emailTemplateCapabilities.allowCreation
      || (!emailTemplateCapabilities.allowLocalTemplateUsage
        && !emailTemplateCapabilities.allowParentAccount)) {
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

async function newEmailTemplateSubmission() {
  emailTemplateCapabilities = await readEmailTemplateCapabilities();
  if (emailTemplateCapabilities.allowParentAccount
      || emailTemplateCapabilities.allowCreation) {
    toast('Template submissions are available when template creation is disabled.', true);
    return;
  }
  const clientSubmissionId = `submission_${uid()}`;
  const blank = {
    type: 'order', name: 'New Template Submission', enabled: true,
    subject: '', body: '', rules: [], vars: {}, varOrder: [],
  };
  try {
    const response = await sendBackgroundMessage('emailTemplateSubmissionCreate', {
      clientSubmissionId, template: blank,
    });
    if (!response.submission) throw new Error('Submission was not returned');
    await openEmailTemplateSubmission(response.submission.id, response.submission);
    toast('Template submitted for approval.');
  } catch (error) {
    toast(error?.message || 'Unable to submit this template.', true);
  }
}

async function openEmailTemplateSubmission(id, supplied = null) {
  const row = supplied || (emailTemplateSubmissions?.submissions || [])
    .find((item) => String(item?.id) === String(id));
  if (!row) return;
  const editorTemplate = submissionEditorTemplate(
    row, emailTemplateSubmissions?.isParent === true,
  );
  if (!editorTemplate) return;
  leaveCurrentTemplate();
  setCurrentId(null);
  setCurrentSubmissionId(String(row.id));
  currentSubmissionDraft = editorTemplate;
  hide('ed-empty');
  hide('ed-note-form');
  hide('ed-settings');
  hide('ed-action-form');
  show('ed-form');
  animateView('ed-form');
  if (window.__gbOpenTemplate) window.__gbOpenTemplate(editorTemplate);
  else toast('Template editor failed to load — reload the editor.', true);
}

async function openTemplate(id) {
  emailTemplateCapabilities = await readEmailTemplateCapabilities();
  if (currentId === id && !$('ed-form').classList.contains('hidden')) return;
  const tpl = templates.find((t) => t.id === id);
  if (!tpl) return;
  if (!filterLocalEmailTemplates(templates, {
    'emailTemplates.allowLocalTemplateUsage': emailTemplateCapabilities.allowLocalTemplateUsage,
    'emailTemplates.allowParentAccount': emailTemplateCapabilities.allowParentAccount,
  }).some((item) => item.id === id)) return;
  leaveCurrentTemplate();
  setCurrentSubmissionId(null);
  currentSubmissionDraft = null;
  setCurrentId(id);
  currentShareSessionId = (isImportedEmailTemplate(tpl)
    || (isManagedEmailTemplate(tpl) && !tpl.managedTemplate?.editable))
    ? null : newShareSessionId();
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
  leaveCurrentTemplate();
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
  if (currentId === id) leaveCurrentTemplate();
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
  leaveCurrentTemplate();
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
  leaveCurrentTemplate();
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
  const submission = emailTemplateSubmission(tpl);
  if (submission) {
    currentSubmissionDraft = tpl;
    setCurrentSubmissionId(submission.submissionId);
    try {
      await sendBackgroundMessage('emailTemplateSubmissionUpdate', {
        submissionId: submission.submissionId,
        template: submissionTemplateDocument(tpl),
      });
    } catch (error) {
      toast(error?.message || 'Unable to update this template submission.', true);
    }
    return;
  }
  setCurrentId(tpl.id);
  const idx = templates.findIndex((t) => t.id === tpl.id);
  const storedTemplate = idx >= 0 ? templates[idx] : null;
  const lockedImport = isImportedEmailTemplate(storedTemplate)
    || (isManagedEmailTemplate(storedTemplate)
      && !emailTemplateCapabilities.allowParentAccount);
  if (lockedImport) {
    if (!storedTemplate) {
      toast('Imported email template overrides could not be saved.', true);
      return;
    }
    templates[idx] = applyImportedEmailTemplateOverrides(storedTemplate, tpl);
    await saveTemplates();
    return;
  }
  if (!emailTemplateIsEditable(storedTemplate || tpl, {
    'emailTemplates.allowLocalTemplateUsage': emailTemplateCapabilities.allowLocalTemplateUsage,
    'emailTemplates.allowParentAccount': emailTemplateCapabilities.allowParentAccount,
  })) return;
  ensureShareSession();
  if (idx >= 0) templates[idx] = tpl; else templates.push(tpl);
  await saveTemplates();
  const titleEl = $('ed-title');
  if (titleEl) titleEl.textContent = tpl.name || 'Untitled';
}

async function approveEmailTemplateSubmission(tpl = currentSubmissionDraft) {
  const submission = emailTemplateSubmission(tpl);
  if (!submission?.submissionId || !emailTemplateSubmissions?.isParent) return false;
  try {
    const response = await sendBackgroundMessage('emailTemplateSubmissionApprove', {
      submissionId: submission.submissionId,
      template: submissionTemplateDocument(tpl),
    });
    if (response.submission) {
      currentSubmissionDraft = submissionEditorTemplate(response.submission, true);
      window.__gbOpenTemplate?.(currentSubmissionDraft);
    }
    toast('Template approved and published to the managed bucket.');
    return true;
  } catch (error) {
    toast(error?.message || 'Unable to approve this template submission.', true);
    return false;
  }
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
  leaveCurrentTemplate();
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
  leaveCurrentTemplate();
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
window.newEmailTemplateSubmission = newEmailTemplateSubmission;
window.openEmailTemplateSubmission = openEmailTemplateSubmission;
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
window.__gbApproveTemplateSubmission = approveEmailTemplateSubmission;
window.__gbSaveNote     = applyNotePatch;
window.__gbSaveAction   = applyActionPatch;
window.__gbTrackTemplateShare = trackTemplateShare;
window.__gbRevokeTemplateShares = revokeOwnedTemplateShares;
window.__gbFlushTemplateShares = flushOwnedTemplateShares;
window.__gbResolveVars  = resolveVarsLive;
window.__gbCurrentTemplate = () => currentSubmissionDraft
  || templates.find((t) => t.id === currentId) || null;
window.__gbCurrentNote     = () => noteTemplates.find((t) => t.id === currentNoteId) || null;
window.__gbCurrentAction   = () => currentActionDraft
  || customActions.find((a) => a.id === currentActionId)
  || null;

// Storage onChanged — keep local arrays in sync if another tab/popup edits.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.templates) {
    templates = changes.templates.newValue || [];
    const currentTemplate = currentId
      ? templates.find((template) => template.id === currentId)
      : null;
    if (currentId && !currentTemplate) {
      setCurrentId(null);
      hide('ed-form');
      _settingsPreviousView = _settingsPreviousView === 'ed-form'
        ? 'ed-empty'
        : _settingsPreviousView;
      if ($('ed-settings')?.classList.contains('hidden')) {
        show('ed-empty');
        animateView('ed-empty');
      }
    } else if (currentTemplate && window.__gbOpenTemplate) {
      window.__gbOpenTemplate(currentTemplate);
    }
  }
  if (changes.gbEmailTemplateSubmissions) {
    emailTemplateSubmissions = changes.gbEmailTemplateSubmissions.newValue || null;
    if (currentSubmissionId) {
      const row = (emailTemplateSubmissions?.submissions || [])
        .find((item) => String(item?.id) === currentSubmissionId);
      if (!row) {
        setCurrentSubmissionId(null);
        currentSubmissionDraft = null;
        hide('ed-form');
        show('ed-empty');
        animateView('ed-empty');
      } else {
        currentSubmissionDraft = submissionEditorTemplate(
          row, emailTemplateSubmissions?.isParent === true,
        );
        window.__gbOpenTemplate?.(currentSubmissionDraft);
      }
    }
  }
  if (changes.noteTemplates) noteTemplates = changes.noteTemplates.newValue || [];
  if (changes.gbCustomActions) customActions = changes.gbCustomActions.newValue || [];
  if (changes.orderTabId)    orderTabId    = changes.orderTabId.newValue    || null;
  if (changes.devSettings) {
    emailTemplateCapabilities = resolveEmailTemplateCapabilities(changes.devSettings.newValue);
    const currentVisible = filterLocalEmailTemplates(templates, changes.devSettings.newValue)
      .some((template) => template.id === currentId);
    if (currentId && !currentVisible) {
      setCurrentId(null);
      hide('ed-form');
      show('ed-empty');
      animateView('ed-empty');
    }
  }
  if (changes.gbEditorLaunchIntent?.newValue) consumeLaunchIntent(changes.gbEditorLaunchIntent.newValue);
});

window.addEventListener('pagehide', leaveCurrentTemplate);

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
  emailTemplateSubmissions = data.gbEmailTemplateSubmissions || null;
  /* One-version backwards-compat pass: lift legacy contact/account/order
     variables onto the page engine, and scratch legacy order auto-match
     rules so they're re-authored against the order schema. Persists +
     stamps each template (varsMigratedVersion) so it runs ONCE. */
  try {
    const mig = migrateTemplates(templates, { dryRun: false });
    if (mig.changed) { templates = mig.migrated; await saveTemplates(); }
  } catch (e) { toast('A stored template could not be upgraded automatically.', true); }
  // Older share links predate local source→share bookkeeping. The owner-only
  // list includes their server snapshots so we can recover an unambiguous
  // association before the user edits, without guessing between duplicates.
  try {
    const response = await sendBackgroundMessage('emailShareList');
    const reconciled = reconcileOwnedTemplateShares(templates, response.shares);
    if (reconciled.changed) {
      templates = reconciled.templates;
      await saveTemplates();
    }
  } catch { /* offline startup: Settings refresh / the next editor load retries */ }
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
