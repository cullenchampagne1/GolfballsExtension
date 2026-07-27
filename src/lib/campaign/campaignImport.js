/* ───────────────────────────────────────────────────────────────────────────
   campaignImport — validate + normalize code-first campaign JSON and merge it
   into chrome.storage.local.campaigns.

   The paste-import dialog (Campaign Manager sidebar) accepts:
     • a single campaign object,
     • an array of campaigns,
     • or a wrapper { campaigns: [...] }.
   Shape contract documented in docs/llm-campaign-toolset.md — the toolset file
   handed to a model so it can author these blobs. Every import gets a FRESH
   campaign id (no collisions / no accidental overwrite); unknown fields are
   dropped so a sloppy blob can't poison storage.

   `automation` is the executable source of truth. Legacy `steps[]` are still
   normalized when they ride alongside code so old metadata survives, but a
   steps-only blob is rejected instead of importing an empty, un-runnable
   campaign into the code-first editor.
   ─────────────────────────────────────────────────────────────────────────── */

import { uid, saveCampaign } from './store.js';
import { isGroupedTree, emptyTree } from '../matchEngine.js';
import { loadCallTemplates } from '../callLog.js';
import { loadTaskTemplates } from '../quickTask.js';
import { translateProgram } from '../codeEngine/translate.js';

const VALID_KINDS = ['email', 'call', 'task', 'custom'];
const VALID_STATUS = ['Draft', 'Active', 'Paused'];
const VALID_ORDER = ['list', 'shuffle', 'valueDesc'];
const TASK_MODES = ['create', 'completeAll', 'completeLatest'];

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clampInt = (v, lo, hi, d) => Math.max(lo, Math.min(hi, Math.round(num(v, d))));

/* One step → canonical editor shape (mirrors store.newStep), or throws.
   A saved-template step keeps a transient `_templateName` for later
   resolution; a step that already carries a real `templateId` keeps it. */
function normalizeStep(raw, index, warn) {
  if (!raw || typeof raw !== 'object') throw new Error(`Step #${index + 1} is not an object`);
  const rawKind = raw.kind || 'email';
  const isBranch = !!raw.branch || rawKind === 'branch';
  const kind = rawKind === 'branch' ? 'email' : rawKind;
  if (!VALID_KINDS.includes(kind)) {
    throw new Error(`Step #${index + 1} ("${raw.label || ''}") has unknown kind "${rawKind}" (allowed: ${VALID_KINDS.join(', ')}, or branch)`);
  }

  const conditions = isGroupedTree(raw.conditions) ? raw.conditions : emptyTree();

  const out = {
    id: String(raw.id || uid('s')),
    kind,
    label: String(raw.label || 'Step').slice(0, 120),
    group: raw.group ? String(raw.group) : '',
    parentId: raw.parentId != null ? String(raw.parentId) : null,
    branch: isBranch,
    templateId: raw.templateId ? String(raw.templateId) : '',
    variationWeights: (raw.variationWeights && typeof raw.variationWeights === 'object') ? raw.variationWeights : {},
    taskMode: TASK_MODES.includes(raw.taskMode) ? raw.taskMode : 'create',
    useCustom: !!raw.useCustom,
    custom: (raw.custom && typeof raw.custom === 'object') ? raw.custom : {},
    code: typeof raw.code === 'string' ? raw.code : '',
    kill: !!raw.kill,
    conditions,
  };

  // Saved-template reference by name (resolved at import time).
  if (!out.templateId && (raw.templateName || raw.template)) {
    out._templateName = String(raw.templateName || raw.template);
  }

  // A custom step needs code; a non-custom create step needs either a saved
  // template (id/name) or inline custom content. Warn (don't throw) so a
  // mostly-good blob still imports and the user finishes it in the editor.
  if (kind === 'custom' && !out.code.trim()) {
    warn(`Step "${out.label}" is a custom step with no code — add it in the editor.`);
  } else if (kind === 'email' && !out.templateId && !out._templateName) {
    warn(`Email step "${out.label}" has no template — pick one in the editor.`);
  } else if ((kind === 'call' || kind === 'task') && out.taskMode === 'create' && !out.useCustom && !out.templateId && !out._templateName) {
    warn(`${kind} step "${out.label}" has no template and no inline content.`);
  }
  return out;
}

/* One campaign → canonical shape with a FRESH id, or throws with a useful
   message. Collects non-fatal issues into `warnings`. */
export function normalizeImportedCampaign(raw, index = 0) {
  if (!raw || typeof raw !== 'object') throw new Error(`Campaign #${index + 1} is not an object`);
  const name = String(raw.name || '').trim();
  if (!name) throw new Error(`Campaign #${index + 1} is missing "name"`);
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];

  const warnings = [];
  const warn = (m) => warnings.push(m);
  const steps = rawSteps.map((s, i) => normalizeStep(s, i, warn));
  const automation = typeof raw.automation === 'string'
    ? raw.automation
    : (typeof raw.code === 'string' ? raw.code : '');
  if (!automation.trim()) {
    throw new Error(
      `Campaign #${index + 1} (“${name}”) is missing executable "automation" JavaScript. Legacy steps-only campaigns cannot run in the code-first Campaign Manager.`,
    );
  }
  const parsedAutomation = translateProgram(automation);
  if (parsedAutomation.errors.length) {
    throw new Error(`Campaign #${index + 1} (“${name}”) has invalid automation JavaScript.`);
  }

  // parentId integrity — a child must point at a real step in this campaign.
  const ids = new Set(steps.map((s) => s.id));
  for (const s of steps) {
    if (s.parentId && !ids.has(s.parentId)) {
      warn(`Step "${s.label}" references a missing parent step — moved to the main path.`);
      s.parentId = null;
    }
  }

  const campaign = {
    id: uid('cmp'),               // always fresh — never overwrite an existing one
    name,
    status: VALID_STATUS.includes(raw.status) ? raw.status : 'Draft',
    paceDelay: clampInt(raw.paceDelay, 0, 600, 12),
    paceJitter: clampInt(raw.paceJitter, 0, 120, 4),
    suppressBounced: raw.suppressBounced !== false,
    suppressMailerRemoved: raw.suppressMailerRemoved !== false,
    suppressDoNotContact: raw.suppressDoNotContact !== false,
    sendCap: clampInt(raw.sendCap, 0, 100000, 0),
    audienceOrder: VALID_ORDER.includes(raw.audienceOrder) ? raw.audienceOrder : 'list',
    steps,
    automation,
    lastSaved: null,
  };
  return { campaign, warnings };
}

/* Parse a pasted blob (single campaign / array / {campaigns:[…]}) → array of
   { campaign, warnings }. Throws with a readable message on any problem. */
export function parseCampaignBlob(text) {
  let obj;
  try { obj = JSON.parse(text); }
  catch (e) { throw new Error('Not valid JSON — ' + e.message); }
  const list = Array.isArray(obj) ? obj
    : Array.isArray(obj && obj.campaigns) ? obj.campaigns
    : [obj];
  if (!list.length) throw new Error('No campaigns found in the JSON');
  return list.map((c, i) => normalizeImportedCampaign(c, i));
}

/* Resolve a step's `_templateName` against the live template stores, in place.
   Returns the names that couldn't be matched. */
function resolveTemplateNames(steps, stores) {
  const byName = (list) => {
    const m = new Map();
    for (const t of (list || [])) if (t && t.name) m.set(String(t.name).trim().toLowerCase(), t.id);
    return m;
  };
  const maps = { email: byName(stores.email), call: byName(stores.call), task: byName(stores.task) };
  const unresolved = [];
  for (const s of steps) {
    if (!s._templateName) { delete s._templateName; continue; }
    const store = s.kind === 'call' ? 'call' : s.kind === 'task' ? 'task' : 'email';
    const id = maps[store].get(s._templateName.trim().toLowerCase());
    if (id) s.templateId = id;
    else unresolved.push(`${s.kind} template “${s._templateName}” (step “${s.label}”)`);
    delete s._templateName;
  }
  return unresolved;
}

function loadEmailTemplates() {
  return new Promise((res) => {
    try { chrome.storage.local.get('templates', (o) => res((o?.templates || []).filter((t) => t && t.enabled !== false))); }
    catch { res([]); }
  });
}

/* Merge normalized campaigns into storage (fresh ids, never overwrites).
   Resolves saved-template references by name first. Returns
   { count, list, unresolved } where `unresolved` lists template names that
   didn't match any saved template. */
export async function importCampaigns(parsed) {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const [email, call, task] = await Promise.all([loadEmailTemplates(), loadCallTemplates(), loadTaskTemplates()]);
  const unresolved = [];
  for (const { campaign } of items) {
    unresolved.push(...resolveTemplateNames(campaign.steps, { email, call, task }));
  }
  let list = [];
  for (const { campaign } of items) {
    ({ list } = await saveCampaign(campaign));
  }
  return { count: items.length, list, unresolved };
}
