/** Pure, browser-API-free policy for Help Companion client actions. */

export const MUTATION_ACTION_TYPES = Object.freeze(new Set([
  'set_feature',
  'set_setting',
  'set_theme_preset',
  'set_theme_palette',
  'share_settings',
  'share_email_template',
  'submit_ticket',
]));

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HEX = /^#[0-9a-f]{6}$/i;

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
  if (!action || typeof action !== 'object') fail('The assistant action is invalid');
  const type = String(action.type || '');
  const target = String(action.target || '');
  const options = Array.isArray(action.options) ? action.options.map(String) : [];
  const {
    featureRules = {}, settingRules = {}, themeVariants = [], shareScopes = [],
    templates = [], policy = {},
  } = registry;

  if (!MUTATION_ACTION_TYPES.has(type)) fail('The assistant action is not executable');
  if (!SAFE_ID.test(target)) fail('The assistant action target is invalid');

  if (type === 'set_feature') {
    if (!Object.hasOwn(featureRules, target)) fail('That feature is not registered in this build');
    if (isHidden(target, policy, 'feature')) fail('That feature is hidden by administrator policy');
    return { type, target, value: boolValue(action.value) };
  }

  if (type === 'set_setting') {
    const rule = settingRules[target];
    if (!rule) fail('That setting is not registered in this build');
    if (isHidden(target, policy, 'setting')) fail('That setting is hidden by administrator policy');
    return { type, target, value: settingValue(rule, action.value) };
  }

  if (type === 'set_theme_preset') {
    const requested = choiceKey(action.value);
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
    return { type, target, value: String(action.value || '').slice(0, 80), colors: options.map((color) => color.toLowerCase()) };
  }

  if (type === 'share_settings') {
    const unique = [...new Set(options)];
    if (target !== 'settings' || unique.length < 1 || unique.some((id) => !shareScopes.includes(id))) {
      fail('The settings share contains an unregistered scope');
    }
    const name = String(action.value || 'Help Companion settings').trim().slice(0, 120);
    if (!name) fail('The settings share needs a name');
    return { type, target, name, scopes: unique };
  }

  if (type === 'submit_ticket') {
    if (!['bug', 'feature'].includes(target) || options.length) {
      fail('The assistant ticket type is invalid');
    }
    const title = String(action.label || '').trim().slice(0, 120);
    const description = String(action.value || '').trim().slice(0, 500);
    if (!title || !description) fail('The assistant ticket is missing its summary');
    return { type, target, kind: target, title, description };
  }

  const template = templates.find((item) => item && String(item.id) === target);
  if (!template) fail('That email template is not available in this installation');
  return { type, target, template };
}

/** Theme shell must commit before its optional palette override. All other
 * actions retain their relative order and are independent of that pair. */
export function orderHelpActions(actions) {
  const priority = (action) => {
    if (action?.type === 'set_theme_preset') return 0;
    if (action?.type === 'set_theme_palette') return 2;
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
