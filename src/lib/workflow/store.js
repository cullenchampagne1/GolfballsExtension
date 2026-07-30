/* ───────────────────────────────────────────────────────────────
   workflow/store.js — load / save workflow definitions.

   Workflows persist under chrome.storage.local['workflows']. The previous
   feature called these records campaigns and stored them under `campaigns`.
   loadWorkflows performs a one-time move to the workflow key, removes the
   legacy key, and normalizes every record into the current React shape.

   New shape:
     workflow = {
       id, name, status: 'Draft'|'Active'|'Paused',
       paceDelay,  // seconds between sends (workflow-wide)
       paceJitter, // ± seconds of jitter
       steps: Step[],
       lastSaved,  // ISO string | null
     }
     step = {
       id, kind: 'email'|'call'|'task'|'branch',
       label, subject, group,        // group = mutual-exclusion label
       parentId,                      // branch child, or null (main path)
       branch,                        // stops the contact's flow after firing
       templates: [{ id, templateId, pct }],   // pct should sum to 100
       conditions: { outerJoiner, groups },     // matchEngine tree
     }

   Pure module — no React, no DOM. Safe to import from the engine,
   the editor, and a playground harness alike.
─────────────────────────────────────────────────────────────── */

import { emptyTree, isGroupedTree } from '../matchEngine.js';

export const STORAGE_KEY = 'workflows';
export const LEGACY_STORAGE_KEY = 'campaigns';

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
};

export function uid(p = 'id') { return `${p}-${Math.random().toString(36).slice(2, 9)}`; }

/* Legacy step.type → new step.kind. The legacy editor had delay /
   create_task / complete_task; we collapse the task variants to 'task'
   and drop standalone delays (pacing is workflow-wide now). */
/* Branch is a FLAG (step.branch), not a kind — a branch is just an
   email/call/task that also stops the flow + gates its children. Legacy
   'branch' steps collapse to an email with the flag set. */
function mapLegacyKind(type) {
  switch (type) {
    case 'create_task':
    case 'complete_task':
    case 'task': return 'task';
    case 'call':
    case 'call_log': return 'call';
    case 'branch':
    case 'email': return 'email';
    default: return 'email';
  }
}

/* Best-effort legacy-conditions → grouped tree. A legacy step carried a
   flat conditions[] of { field, op, val } joined by conditionLogic
   ('all' = AND, 'any' = OR). */
function legacyConditionsToTree(conds, logic) {
  if (!Array.isArray(conds) || conds.length === 0) return emptyTree();
  return {
    outerJoiner: 'AND',
    groups: [{
      joiner: logic === 'any' ? 'OR' : 'AND',
      conditions: conds.map((c) => ({
        source: 'signal',
        ref: c.field || '',
        type: 'string',
        op: c.op || 'is',
        value: c.val != null ? String(c.val) : (c.value != null ? String(c.value) : ''),
        not: !!c.not,
      })),
    }],
  };
}

export function newStep(kind = 'email') {
  const isBranch = kind === 'branch';
  const k = isBranch ? 'email' : kind;
  return {
    id: uid('s'),
    kind: k,                  // 'email' | 'call' | 'task'
    label: 'New step',
    group: '',
    parentId: null,
    branch: isBranch,         // a branch is any step that stops the flow + gates children
    templateId: '',           // the single template this step sends/runs
    variationWeights: {},     // email only: { varId|'__original': pct } over the template's variations
    taskMode: 'create',       // task only: 'create' | 'completeAll' | 'completeLatest'
    useCustom: false,         // call/task: build a one-off inline instead of a saved template
    custom: {},               // call/task custom fields (see actions.js)
    code: '',                 // custom step: the code body (ctx + h + window/document)
    kill: false,              // custom step: stop the contact's whole flow after running
    conditions: emptyTree(),
  };
}

function normalizeStep(raw) {
  if (!raw || typeof raw !== 'object') return newStep();
  const rawKind = raw.kind || mapLegacyKind(raw.type);
  // Collapse the old 'branch' KIND into a flag on an email step.
  const isBranch = raw.branch != null ? !!raw.branch : (rawKind === 'branch');
  const kind = rawKind === 'branch' ? 'email' : (['email', 'call', 'task', 'custom'].includes(rawKind) ? rawKind : 'email');

  // One template per step (was a templates[]/splits[] array in the old shape).
  const templateId = raw.templateId
    || (Array.isArray(raw.templates) && raw.templates[0]?.templateId)
    || (Array.isArray(raw.splits) && raw.splits[0]?.templateId)
    || '';
  const variationWeights = (raw.variationWeights && typeof raw.variationWeights === 'object') ? raw.variationWeights : {};

  const conditions = isGroupedTree(raw.conditions)
    ? raw.conditions
    : legacyConditionsToTree(raw.conditions, raw.conditionLogic);

  return {
    id: raw.id || uid('s'),
    kind,
    label: raw.label || 'Step',
    group: raw.group || raw.stepGroup || '',
    parentId: raw.parentId || null,
    branch: isBranch,
    templateId,
    variationWeights,
    taskMode: ['create', 'completeAll', 'completeLatest'].includes(raw.taskMode) ? raw.taskMode : 'create',
    useCustom: !!raw.useCustom,
    custom: (raw.custom && typeof raw.custom === 'object') ? raw.custom : {},
    code: raw.code || '',
    kill: !!raw.kill,
    conditions,
  };
}

export function normalizeWorkflow(raw) {
  if (!raw || typeof raw !== 'object') return newWorkflow();
  return {
    id: raw.id || uid('wf'),
    name: raw.name || 'Untitled workflow',
    status: ['Draft', 'Active', 'Paused'].includes(raw.status) ? raw.status : 'Draft',
    paceDelay: Number.isFinite(raw.paceDelay) ? raw.paceDelay
      : Number.isFinite(raw.delayBase) ? raw.delayBase : 12,
    paceJitter: Number.isFinite(raw.paceJitter) ? raw.paceJitter
      : Number.isFinite(raw.delayTolerance) ? raw.delayTolerance : 4,
    suppressBounced: raw.suppressBounced != null ? !!raw.suppressBounced : true,
    suppressMailerRemoved: raw.suppressMailerRemoved != null ? !!raw.suppressMailerRemoved : true,
    suppressDoNotContact: raw.suppressDoNotContact != null ? !!raw.suppressDoNotContact : true,
    sendCap: Number.isFinite(raw.sendCap) ? Math.max(0, raw.sendCap) : 0,
    audienceOrder: ['list', 'shuffle', 'valueDesc'].includes(raw.audienceOrder) ? raw.audienceOrder : 'list',
    steps: Array.isArray(raw.steps) ? raw.steps.map(normalizeStep) : [],
    // Code-first automation source. Persisted verbatim so it survives
    // close/reopen; legacy steps remain compatibility metadata only.
    automation: typeof raw.automation === 'string' ? raw.automation : '',
    lastSaved: raw.lastSaved || null,
  };
}

export function newWorkflow(name = 'Untitled workflow') {
  return {
    id: uid('wf'),
    name,
    status: 'Draft',
    paceDelay: 12,
    paceJitter: 4,
    // ── Delivery defaults ──
    suppressBounced: true,        // skip contacts with a CRM bounce code
    suppressMailerRemoved: true,  // skip mailer-removed contacts
    suppressDoNotContact: true,   // skip when name/email says "do not contact"
    sendCap: 0,                   // max actions per run (0 = unlimited)
    audienceOrder: 'list',        // 'list' | 'shuffle' | 'valueDesc'
    steps: [],
    automation: '',
    lastSaved: null,
  };
}

/* Load + normalize every saved workflow. Never rejects — returns [] on
   any failure or outside an extension context. */
export function loadWorkflows() {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve([]); return; }
    try {
      chrome.storage.local.get([STORAGE_KEY, LEGACY_STORAGE_KEY], (out) => {
        const hasCurrent = Array.isArray(out?.[STORAGE_KEY]);
        const legacy = Array.isArray(out?.[LEGACY_STORAGE_KEY]) ? out[LEGACY_STORAGE_KEY] : [];
        const list = (hasCurrent ? out[STORAGE_KEY] : legacy).map(normalizeWorkflow);

        if (!hasCurrent && legacy.length) {
          chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
            chrome.storage.local.remove(LEGACY_STORAGE_KEY, () => resolve(list));
          });
          return;
        }
        if (Object.hasOwn(out || {}, LEGACY_STORAGE_KEY)) {
          chrome.storage.local.remove(LEGACY_STORAGE_KEY, () => resolve(list));
          return;
        }
        resolve(list);
      });
    } catch { resolve([]); }
  });
}

function writeAll(list) {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve(list); return; }
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: list }, () => {
        chrome.storage.local.remove(LEGACY_STORAGE_KEY, () => resolve(list));
      });
    }
    catch { resolve(list); }
  });
}

/* Upsert one workflow (stamps lastSaved) and persist the whole list. */
export async function saveWorkflow(workflow) {
  const stamped = { ...normalizeWorkflow(workflow), lastSaved: new Date().toISOString() };
  const list = await loadWorkflows();
  const i = list.findIndex((c) => c.id === stamped.id);
  const next = i >= 0
    ? list.map((c) => (c.id === stamped.id ? stamped : c))
    : [stamped, ...list];
  await writeAll(next);
  return { workflow: stamped, list: next };
}

/* Create or update a workflow's CODE by name — the write hook an assistant
   uses to author workflows live. Matches an existing workflow case-
   insensitively by name (or creates one), sets its `automation`, and
   persists. Returns the saved workflow. */
export async function writeWorkflowCode({ name, automation }) {
  const list = await loadWorkflows();
  const wanted = String(name || '').trim();
  const existing = wanted ? list.find((c) => (c.name || '').trim().toLowerCase() === wanted.toLowerCase()) : null;
  const base = existing || newWorkflow(wanted || 'Untitled workflow');
  const next = normalizeWorkflow({ ...base, name: wanted || base.name, automation: String(automation || '') });
  const { workflow } = await saveWorkflow(next);
  return workflow;
}

export async function removeWorkflow(id) {
  const list = await loadWorkflows();
  const next = list.filter((c) => c.id !== id);
  await writeAll(next);
  return next;
}

/* Subscribe to cross-tab workflow changes. No-op cleanup outside an
   extension context. */
export function subscribeWorkflows(handler) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged?.addListener) return () => {};
  const onCh = (changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      const v = changes[STORAGE_KEY].newValue;
      handler(Array.isArray(v) ? v.map(normalizeWorkflow) : []);
    }
  };
  chrome.storage.onChanged.addListener(onCh);
  return () => { try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
}
