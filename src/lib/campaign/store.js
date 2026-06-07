/* ───────────────────────────────────────────────────────────────
   campaign/store.js — load / save campaign definitions.

   Campaigns persist under chrome.storage.local['campaigns']. This is
   the SAME key the legacy vanilla editor (src/vanilla/modals/campaign-
   editor.js) used, so on load we normalize each record into the new
   React shape — which doubles as a migration off the legacy form
   (step.type → step.kind, step.splits → step.templates, flat
   conditions[] + conditionLogic → a matchEngine grouped tree).

   New shape:
     campaign = {
       id, name, status: 'Draft'|'Active'|'Paused',
       paceDelay,  // seconds between sends (campaign-wide)
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

export const STORAGE_KEY = 'campaigns';

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
};

export function uid(p = 'id') { return `${p}-${Math.random().toString(36).slice(2, 9)}`; }

/* Legacy step.type → new step.kind. The legacy editor had delay /
   create_task / complete_task; we collapse the task variants to 'task'
   and drop standalone delays (pacing is campaign-wide now). */
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
    conditions: emptyTree(),
  };
}

function normalizeStep(raw) {
  if (!raw || typeof raw !== 'object') return newStep();
  const rawKind = raw.kind || mapLegacyKind(raw.type);
  // Collapse the old 'branch' KIND into a flag on an email step.
  const isBranch = raw.branch != null ? !!raw.branch : (rawKind === 'branch');
  const kind = rawKind === 'branch' ? 'email' : rawKind;

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
    conditions,
  };
}

export function normalizeCampaign(raw) {
  if (!raw || typeof raw !== 'object') return newCampaign();
  return {
    id: raw.id || uid('cmp'),
    name: raw.name || 'Untitled campaign',
    status: ['Draft', 'Active', 'Paused'].includes(raw.status) ? raw.status : 'Draft',
    paceDelay: Number.isFinite(raw.paceDelay) ? raw.paceDelay
      : Number.isFinite(raw.delayBase) ? raw.delayBase : 12,
    paceJitter: Number.isFinite(raw.paceJitter) ? raw.paceJitter
      : Number.isFinite(raw.delayTolerance) ? raw.delayTolerance : 4,
    steps: Array.isArray(raw.steps) ? raw.steps.map(normalizeStep) : [],
    lastSaved: raw.lastSaved || null,
  };
}

export function newCampaign(name = 'Untitled campaign') {
  return {
    id: uid('cmp'),
    name,
    status: 'Draft',
    paceDelay: 12,
    paceJitter: 4,
    steps: [],
    lastSaved: null,
  };
}

/* Load + normalize every saved campaign. Never rejects — returns [] on
   any failure or outside an extension context. */
export function loadCampaigns() {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve([]); return; }
    try {
      chrome.storage.local.get(STORAGE_KEY, (out) => {
        const raw = out && Array.isArray(out[STORAGE_KEY]) ? out[STORAGE_KEY] : [];
        resolve(raw.map(normalizeCampaign));
      });
    } catch { resolve([]); }
  });
}

function writeAll(list) {
  return new Promise((resolve) => {
    if (!hasChromeStorage()) { resolve(list); return; }
    try { chrome.storage.local.set({ [STORAGE_KEY]: list }, () => resolve(list)); }
    catch { resolve(list); }
  });
}

/* Upsert one campaign (stamps lastSaved) and persist the whole list. */
export async function saveCampaign(campaign) {
  const stamped = { ...normalizeCampaign(campaign), lastSaved: new Date().toISOString() };
  const list = await loadCampaigns();
  const i = list.findIndex((c) => c.id === stamped.id);
  const next = i >= 0
    ? list.map((c) => (c.id === stamped.id ? stamped : c))
    : [stamped, ...list];
  await writeAll(next);
  return { campaign: stamped, list: next };
}

export async function removeCampaign(id) {
  const list = await loadCampaigns();
  const next = list.filter((c) => c.id !== id);
  await writeAll(next);
  return next;
}

/* Subscribe to cross-tab campaign changes. No-op cleanup outside an
   extension context. */
export function subscribeCampaigns(handler) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged?.addListener) return () => {};
  const onCh = (changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) {
      const v = changes[STORAGE_KEY].newValue;
      handler(Array.isArray(v) ? v.map(normalizeCampaign) : []);
    }
  };
  chrome.storage.onChanged.addListener(onCh);
  return () => { try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
}
