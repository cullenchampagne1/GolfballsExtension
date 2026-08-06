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
const RELAY_REF_RE = /^[a-f0-9]{32}$/;
const CRM_MESSAGE_ID_RE = /^[A-Za-z0-9._~-]{1,100}$/;

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
  // The email composer, opened on one specific message. `relay_id` is the
  // 32-hex reference an email-relay notification carries; the opener resolves
  // it against the relay and renders the cached message — the notification
  // itself never ships the email body. `message_id` is the CRM's own Page=268
  // id, fetched as EML the way an inbox row does it. One or the other, never
  // both: they name messages in different stores.
  email_preview: {
    relay_id: { type: 'pattern', re: RELAY_REF_RE },
    message_id: { type: 'pattern', re: CRM_MESSAGE_ID_RE },
    message_guid: { type: 'pattern', re: CRM_MESSAGE_ID_RE },
  },
  margin_calc: {}, // openable, no parameters
  // Ambient composer verbs (Phase 2): a `subject` prefills the composer for the
  // CURRENT contact (resolved by the modal, not the payload); the rep reviews
  // and submits in the native UI — that submit is the confirmation. Only the
  // subject text is seeded; category/priority/due stay with the rep.
  quick_task: {
    subject: { type: 'string', max: 120 },
  },
  call_log: {
    subject: { type: 'string', max: 120 },
  },
  quick_order_note: {
    // order-scoped: the order id is resolved from the page URL by the opener.
    subject: { type: 'string', max: 120 },
  },
});

/**
 * Cross-parameter invariants a single field rule cannot express. A target
 * absent from this map has none. These run after every field has coerced, so
 * they see the normalized params — never raw wire text.
 */
const OPEN_PARAM_INVARIANTS = Object.freeze({
  email_preview: (params) => {
    if (params.relay_id && params.message_id) {
      throw new Error('An email open names one message, not two');
    }
    if (params.message_guid && !params.message_id) {
      throw new Error('A CRM message guid needs its message id');
    }
    if (!params.relay_id && !params.message_id) {
      throw new Error('An email open needs a message to open');
    }
  },
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
 * @param {string}           [target] the open target, for its cross-field rules
 * @returns {object} a normalized params object (empty when no tokens)
 *
 * Throws on an unknown key, a duplicate key, a value that fails its rule, or a
 * combination the target forbids — so a malformed open payload is rejected
 * exactly like a bad setting, never silently opening the surface with a bogus
 * argument.
 */
export function planOpenParams(rules, options, target) {
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
  const invariant = OPEN_PARAM_INVARIANTS[String(target || '')];
  if (invariant) invariant(params);
  return params;
}

/** Whether a modal target accepts open parameters at all. */
export function targetAcceptsOpenParams(target) {
  return Object.hasOwn(OPEN_PARAM_RULES, String(target || ''));
}
