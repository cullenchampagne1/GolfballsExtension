/** Pure, browser-API-free policy for Help Companion client actions. */

export const MUTATION_ACTION_TYPES = Object.freeze(new Set([
  'set_feature',
  'set_setting',
  'set_theme_preset',
  'set_theme_palette',
  'share_settings',
  'share_email_template',
]));

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const HEX = /^#[0-9a-f]{6}$/i;

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
    const value = String(action.value || '');
    if (!themeVariants.includes(value)) fail('That theme preset is not registered in this build');
    return { type, target: 'theme', value };
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

  const template = templates.find((item) => item && String(item.id) === target);
  if (!template) fail('That email template is not available in this installation');
  return { type, target, template };
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
