/** Pure, browser-API-free policy for Help Companion client actions. */

import {
  actionLanguageCommands, normalizeActionPayload, serializeActionPayload,
} from './actionLanguage.js';

export const MUTATION_ACTION_TYPES = Object.freeze(new Set([
  'open_modal',
  'set_feature',
  'set_setting',
  'set_theme_preset',
  'set_theme_palette',
  'share_settings',
  'share_email_template',
  'submit_ticket',
]));

/** Commands that must never execute just because a receipt card mounted.
 * The client advertises these capabilities to the backend, then presents a
 * visible preview and waits for a click before calling the write endpoint.
 *
 * Both SHARE actions mint an externally reachable link — the most outward-
 * facing, least reversible thing the assistant can do — so they are gated
 * exactly like a ticket. A toggle or theme change stays auto-applied because
 * it is local and trivially undone; publishing a link is neither. */
export const CONFIRMATION_ACTION_TYPES = Object.freeze(new Set([
  'submit_ticket',
  'share_settings',
  'share_email_template',
]));

export function helpActionCommand(action) {
  try { return normalizeActionPayload(action).command; }
  catch {
    // Ordering and confirmation copy may run while a model response is still
    // being assembled and before every command argument has been normalized.
    // Execution always goes through planHelpAction's strict payload parser.
    const candidate = String(action?.command || action?.type || '').trim().toLowerCase();
    return actionLanguageCommands().includes(candidate) ? candidate : '';
  }
}

export function helpActionRequiresConfirmation(action) {
  return CONFIRMATION_ACTION_TYPES.has(helpActionCommand(action));
}

export function helpActionConfirmationTypes() {
  return [...CONFIRMATION_ACTION_TYPES];
}

/**
 * Copy for a confirmation card, per action type. The card is no longer
 * ticket-only, so its prompt and button label cannot assume a bug/feature
 * target — a share action would otherwise read "Submit report".
 */
export function helpActionConfirmationCopy(action) {
  const type = helpActionCommand(action);
  if (type === 'share_settings') {
    return {
      pending: 'Review this settings link before it is created and shared.',
      confirm: 'Create link',
    };
  }
  if (type === 'share_email_template') {
    return {
      pending: 'Review this email-template link before it is created and shared.',
      confirm: 'Create link',
    };
  }
  const feature = String(action?.target || '') === 'feature';
  return {
    pending: feature
      ? 'Review this feature request before sending it.'
      : 'Review this bug report before sending it.',
    confirm: feature ? 'Submit request' : 'Submit report',
  };
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const SOURCE_PATH = /^[A-Za-z0-9_./-]{1,300}$/;

const choiceKey = (value) => String(value || '')
  .trim()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function fail(message) {
  throw new Error(message);
}
function boolValue(value) {
  if (value === true || String(value).toLowerCase() === 'true') return true;
  if (value === false || String(value).toLowerCase() === 'false') return false;
  fail('The requested value is not a boolean');
}

function settingValue(rule, value) {
  if (rule.type === 'bool') return boolValue(value);
  if (rule.type === 'number') {
    const number = Number(value);
    if (!Number.isFinite(number)) fail('The requested value is not a number');
    if (rule.min !== undefined && number < rule.min) fail(`The value must be at least ${rule.min}`);
    if (rule.max !== undefined && number > rule.max) fail(`The value must be at most ${rule.max}`);
    return number;
  }
  if (rule.type === 'select') {
    const selected = String(value || '');
    if (!Array.isArray(rule.options) || !rule.options.includes(selected)) fail('The requested option is not registered');
    return selected;
  }
  if (rule.type === 'string') {
    const text = String(value || '').trim();
    if (!text || text.length > 500) fail('The requested text value is invalid');
    return text;
  }
  fail('This setting type cannot be changed by Help Companion');
}

function isHidden(target, policy, kind) {
  if (policy?.adminBypass) return false;
  if (kind === 'feature') return policy?.hiddenFeatures?.[target] === true;
  return policy?.developerSectionHidden === true || policy?.hiddenDeveloperSettings?.[target] === true;
}

/**
 * Validate a model action against the exact registries available in this build.
 * Returns a small normalized operation; never returns arbitrary storage keys.
 */
export function planHelpAction(action, registry = {}) {
  let payload;
  try { payload = normalizeActionPayload(action); }
  catch (error) { fail(error?.message || 'The assistant action is invalid'); }
  const type = payload.command;
  const target = payload.target;
  const options = payload.options.map(String);
  const normalizedAction = {
    ...action,
    type,
    target,
    value: payload.value,
    options,
    label: payload.label || action?.label,
    references: payload.references,
  };
  const {
    featureRules = {}, settingRules = {}, themeVariants = [], shareScopes = [],
    templates = [], modalTargets = [], policy = {},
  } = registry;

  if (!MUTATION_ACTION_TYPES.has(type)) fail('The assistant action is not executable');
  if (!SAFE_ID.test(target)) fail('The assistant action target is invalid');

  if (type === 'open_modal') {
    if (!modalTargets.includes(target)) {
      fail('That modal is not registered in this build');
    }
    if (payload.value !== '' || options.length) {
      fail('The modal action contains unsupported arguments');
    }
    return { type, target };
  }

  if (type === 'set_feature') {
    if (!Object.hasOwn(featureRules, target)) fail('That feature is not registered in this build');
    if (isHidden(target, policy, 'feature')) fail('That feature is hidden by administrator policy');
    return { type, target, value: boolValue(normalizedAction.value) };
  }

  if (type === 'set_setting') {
    const rule = settingRules[target];
    if (!rule) fail('That setting is not registered in this build');
    if (isHidden(target, policy, 'setting')) fail('That setting is hidden by administrator policy');
    return { type, target, value: settingValue(rule, normalizedAction.value) };
  }

  if (type === 'set_theme_preset') {
    const requested = choiceKey(normalizedAction.value);
    const value = Array.isArray(themeVariants)
      ? themeVariants.find((variant) => choiceKey(variant) === requested)
      : themeVariants?.[requested];
    if (!value) fail('That theme preset is not registered in this build');
    return { type, target: 'theme', value: String(value) };
  }

  if (type === 'set_theme_palette') {
    if (target !== 'brand' || options.length !== 4 || options.some((color) => !HEX.test(color))) {
      fail('The assistant palette must contain four valid colors');
    }
    return { type, target, value: String(normalizedAction.value || '').slice(0, 80), colors: options.map((color) => color.toLowerCase()) };
  }

  if (type === 'share_settings') {
    const unique = [...new Set(options)];
    if (target !== 'settings' || unique.length < 1 || unique.some((id) => !shareScopes.includes(id))) {
      fail('The settings share contains an unregistered scope');
    }
    const name = String(normalizedAction.value || 'Help Companion settings').trim().slice(0, 120);
    if (!name) fail('The settings share needs a name');
    return { type, target, name, scopes: unique };
  }

  if (type === 'submit_ticket') {
    if (!['bug', 'feature'].includes(target) || options.length) {
      fail('The assistant ticket type is invalid');
    }
    const title = String(normalizedAction.label || '').trim().slice(0, 120);
    const description = String(normalizedAction.value || '').trim().slice(0, 500);
    if (!title || !description) fail('The assistant ticket is missing its summary');
    const references = [];
    for (const raw of normalizedAction.references.slice(0, 6)) {
      const path = String(raw?.path || '').trim();
      const lineStart = Math.max(1, Math.floor(Number(raw?.lineStart ?? raw?.line_start) || 0));
      const lineEnd = Math.max(lineStart, Math.floor(Number(raw?.lineEnd ?? raw?.line_end) || 0));
      if (!SOURCE_PATH.test(path) || path.startsWith('/') || path.split('/').includes('..')
          || lineEnd > 10_000_000) continue;
      references.push({ path, line_start: lineStart, line_end: lineEnd });
    }
    return {
      type, target, kind: target, title, description,
      ...(references.length ? { references } : {}),
    };
  }

  const template = templates.find((item) => item && String(item.id) === target);
  if (!template) fail('That email template is not available in this installation');
  return { type, target, template };
}

/** Theme shell must commit before its optional palette override. All other
 * actions retain their relative order and are independent of that pair. */
export function orderHelpActions(actions) {
  const priority = (action) => {
    const command = helpActionCommand(action);
    if (command === 'set_theme_preset') return 0;
    if (command === 'set_theme_palette') return 2;
    return 1;
  };
  return Array.isArray(actions)
    ? actions.map((action, index) => ({ action, index }))
      .sort((left, right) => priority(left.action) - priority(right.action) || left.index - right.index)
      .map(({ action }) => action)
    : [];
}

/** Keep auto-executing receipt cards from racing over shared storage. */
export function createSerialHelpActionRunner(run) {
  let queue = Promise.resolve();
  return (...args) => {
    const result = queue.then(() => run(...args));
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function seedHistoricalHelpActionReceipts(receipts, receiptIds, now = Date.now()) {
  const next = receipts && typeof receipts === 'object' ? { ...receipts } : {};
  for (const rawId of Array.isArray(receiptIds) ? receiptIds : []) {
    const id = String(rawId || '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(id) || next[id]) continue;
    next[id] = {
      status: 'succeeded',
      message: 'Historical action was not replayed.',
      url: '',
      at: Number(now) || Date.now(),
    };
  }
  return Object.fromEntries(
    Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 400),
  );
}

const RECEIPT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

function receiptHash(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Prefer the backend-issued, per-action receipt. Older persisted messages do
 * not have one, so derive a stable local identity from visible message/action
 * content and creation time. It deliberately excludes runId: reopening or
 * importing history must never make an old command executable again.
 */
export function helpActionReceiptId(message, action, index = 0) {
  const issued = String(action?.receiptId ?? action?.receipt_id ?? '').trim();
  if (RECEIPT_ID.test(issued)) return issued;
  const position = Math.max(0, Math.floor(Number(index) || 0));
  const createdAt = Math.max(0, Math.floor(Number(message?.createdAt) || 0));
  let canonical = null;
  try { canonical = normalizeActionPayload(action); } catch { /* legacy fallback below */ }
  const material = JSON.stringify([
    createdAt,
    String(message?.text || '').slice(0, 2_000),
    canonical?.command || String(action?.type || ''),
    canonical?.target || String(action?.target || ''),
    canonical ? String(canonical.value) : String(action?.value || ''),
    canonical ? [...canonical.options] : (
      Array.isArray(action?.options) ? action.options.map(String).slice(0, 16) : []
    ),
    position,
  ]);
  return `legacy:${createdAt.toString(36)}:${receiptHash(material)}:${position}`;
}

export function helpActionPayload(action) {
  return serializeActionPayload(action);
}

export function hasIssuedHelpActionReceipt(action) {
  return RECEIPT_ID.test(String(action?.receiptId ?? action?.receipt_id ?? '').trim());
}

export function helpActionReceiptDecision(receipts, receiptId, { retry = false } = {}) {
  const existing = receipts && typeof receipts === 'object' ? receipts[receiptId] : null;
  return {
    existing: existing && typeof existing === 'object' ? existing : null,
    execute: !existing || (retry === true && existing.status !== 'succeeded'),
  };
}

export function shouldNotifyHelpActionReceipt(receipt) {
  return !!receipt
    && receipt.replayed !== true
    && (receipt.status === 'succeeded' || receipt.status === 'failed');
}

/** Keep route shape useful to retrieval without sending record identifiers. */
export function sanitizePageRoute(value) {
  try {
    const input = new URL(String(value || ''));
    if (!['https:', 'http:'].includes(input.protocol)) return '';
    const routeKeys = new Set(['page', 'folder', 'tab', 'view', 'section', 'mode']);
    const output = new URL(`${input.origin}${input.pathname}`);
    for (const [key, raw] of input.searchParams) {
      const valueText = routeKeys.has(key.toLowerCase()) && /^[A-Za-z0-9._/-]{1,80}$/.test(raw)
        ? raw
        : '*';
      output.searchParams.append(key.slice(0, 80), valueText);
    }
    return output.toString().slice(0, 500);
  } catch {
    return '';
  }
}
