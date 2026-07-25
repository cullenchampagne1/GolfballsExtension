/* ───────────────────────────────────────────────────────────────
   openParamRules — the per-target parameter schema for `open_modal`.

   The action envelope stays flat: open parameters ride in the existing
   `options` array as `key=value` tokens (the same carrier
   request_data_access already uses for its `type:`/`fields:` flags), so
   nothing about the wire format or the anti-spoof check changes.

   planOpenParams() validates those tokens against a target's schema and
   returns a small normalized params object — never an arbitrary key.
   A target absent from OPEN_PARAM_RULES takes no parameters (the caller
   keeps the historical "open with no args" behaviour and rejects options).

   This is pure policy: no DOM, no storage, no network — so it is unit
   tested against the exact rules the executor uses.
─────────────────────────────────────────────────────────────── */

const IMAGE_SUFFIX = new Set(['png', 'jpg', 'jpeg', 'webp']);
const ID_RE = /^[0-9]{1,12}$/;

/**
 * Per-target open parameters. Each field declares a type the planner
 * validates. Keys are snake_case on the wire; the executor's adapters map
 * them onto each opener's native signature.
 */
export const OPEN_PARAM_RULES = Object.freeze({
  crm_search: {
    query: { type: 'string', max: 200 },
    type: { type: 'enum', options: ['all', 'contact', 'account'] },
    filter: { type: 'string', max: 300 }, // a saved-query label OR a compiled solr fq
  },
  task_list: {
    query: { type: 'string', max: 200 },
    filter: { type: 'enum', options: ['all', 'urgent'] },
    status: { type: 'enum', options: ['new', 'completed', 'all'] },
    priority: { type: 'enum', options: ['', 'high', 'med', 'low'] },
  },
  image_preview: {
    url: { type: 'https_image' },
    order_id: { type: 'id' },
    customer_id: { type: 'id' },
  },
  mockup_studio: {
    batch_id: { type: 'pattern', re: /^batch_[a-f0-9]{32}$/ },
  },
  gift_catalog: {
    query: { type: 'string', max: 200 },
    special: { type: 'enum', options: ['sale', 'logo'] },
    sort: { type: 'enum', options: ['popular', 'priceLow', 'priceHigh', 'name'] },
    view: { type: 'enum', options: ['catalog', 'proposals', 'custom', 'current'] },
  },
  watch_list: {
    filter: { type: 'enum', options: ['all', 'active', 'high', 'done'] },
    query: { type: 'string', max: 200 },
  },
  margin_calc: {}, // openable, no parameters
});

function coerce(rule, raw, key) {
  const text = String(raw ?? '');
  if (rule.type === 'string') {
    const value = text.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, rule.max || 200);
    if (!value) throw new Error(`Open parameter "${key}" is empty`);
    return value;
  }
  if (rule.type === 'enum') {
    if (!rule.options.includes(text)) throw new Error(`Open parameter "${key}" is not an allowed value`);
    return text;
  }
  if (rule.type === 'id') {
    if (!ID_RE.test(text)) throw new Error(`Open parameter "${key}" must be a numeric id`);
    return text;
  }
  if (rule.type === 'pattern') {
    if (!rule.re.test(text)) throw new Error(`Open parameter "${key}" is malformed`);
    return text;
  }
  if (rule.type === 'https_image') {
    let url;
    try { url = new URL(text); } catch { throw new Error(`Open parameter "${key}" is not a URL`); }
    const suffix = url.pathname.split('.').pop()?.toLowerCase() || '';
    if (url.protocol !== 'https:' || url.username || url.password || url.hash
        || !IMAGE_SUFFIX.has(suffix)) {
      throw new Error(`Open parameter "${key}" must be a direct https image URL`);
    }
    return url.href;
  }
  throw new Error(`Open parameter "${key}" has an unknown type`);
}

/**
 * Parse and validate `key=value` option tokens for one open target.
 *
 * @param {object|undefined} rules  the target's schema from OPEN_PARAM_RULES
 * @param {string[]}         options the envelope's options array
 * @returns {object} a normalized params object (empty when no tokens)
 *
 * Throws on an unknown key, a duplicate key, or a value that fails its rule —
 * so a malformed open payload is rejected exactly like a bad setting, never
 * silently opening the surface with a bogus argument.
 */
export function planOpenParams(rules, options) {
  if (!rules) return {};
  const params = {};
  for (const raw of Array.isArray(options) ? options : []) {
    const token = String(raw ?? '');
    const eq = token.indexOf('=');
    if (eq < 1) throw new Error('Open parameters must be key=value pairs');
    const key = token.slice(0, eq).trim().toLowerCase();
    const rawValue = token.slice(eq + 1);
    if (!Object.hasOwn(rules, key)) throw new Error(`Unknown open parameter "${key}"`);
    if (Object.hasOwn(params, key)) throw new Error(`Duplicate open parameter "${key}"`);
    params[key] = coerce(rules[key], rawValue, key);
  }
  return params;
}

/** Whether a modal target accepts open parameters at all. */
export function targetAcceptsOpenParams(target) {
  return Object.hasOwn(OPEN_PARAM_RULES, String(target || ''));
}
