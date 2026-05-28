/* ───────────────────────────────────────────────────────────────
   page-engine/transforms.js — value coercion helpers.

   Schema leaves declare a `type` (string|number|currency|date|bool|
   object|array) and an optional `transform` name. After the raw
   extractor returns a string (or null), we run it through the
   matching transform here. Each transform is total — it ALWAYS
   returns the schema-typed value or null, never throws.

   Why a registry of named transforms instead of arbitrary callbacks
   in the schema:
     1. Schemas stay JSON-serializable (we can dump/import).
     2. The UI can show a labelled picker.
     3. Code variables get the same helpers (h.fmt.*) without
        plumbing — they're the same functions.

   Add a new transform here; reference it by name from the schema.
─────────────────────────────────────────────────────────────── */

/** Empty/whitespace-only check. null/undefined → true. */
function isEmpty(v) {
  return v == null || (typeof v === 'string' && !v.trim());
}

/** Strip leading + trailing whitespace AND collapse internal runs
 *  of whitespace to a single space. Pages often render text with
 *  newlines/tabs from template engines — collapsing makes equality
 *  checks predictable. */
export function trim(v) {
  if (isEmpty(v)) return '';
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Strip currency / thousands punctuation, parse as Number. Returns
 *  null on un-parseable input rather than NaN so callers can branch
 *  cleanly. Accepts: "$1,234.56" "1234" "1,234" "(123.45)" (negative
 *  in accounting parens) "1.5K"  — only the first three are common
 *  on the contact page but the parens variant shows up in revenue
 *  tiles when a customer has refunds. */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (isEmpty(v)) return null;
  let s = String(v).trim();
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  s = s.replace(/[\$,€£¥\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
}

/** Currency → Number. Same semantics as parseNumber today, but kept
 *  as a separate name so a future change (e.g. detect a different
 *  decimal/thousands locale) can fork without re-touching every
 *  number field. */
export const parseCurrency = parseNumber;

/** Date string → ISO date string (YYYY-MM-DD) or full ISO timestamp
 *  if the input includes a time. Returns null on unparseable input.
 *  Handles:
 *    - "9/9/2025"            → "2025-09-09"
 *    - "09/09/2025"          → "2025-09-09"
 *    - "5/20/2026 11:13:00 AM" → "2026-05-20T11:13:00"
 *    - "1/1/1900"            → "1900-01-01" (kept; callers decide
 *      if 1/1/1900 means "unset" — we don't drop it here)
 *    - "Not Set"             → null
 *  Date() parsing is wobbly cross-browser; we explicitly parse the
 *  MM/DD/YYYY format first (the only one this CRM emits) before
 *  falling back to native Date so we don't get UTC drift. */
export function parseDate(v) {
  if (isEmpty(v)) return null;
  const s = String(v).trim();
  if (/^(not set|n\/a|none|--)$/i.test(s)) return null;

  // M/D/YYYY or MM/DD/YYYY [HH:MM[:SS] [AM|PM]]
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/);
  if (m) {
    const month = String(m[1]).padStart(2, '0');
    const day   = String(m[2]).padStart(2, '0');
    const year  = m[3];
    if (!m[4]) return `${year}-${month}-${day}`;
    let h = parseInt(m[4], 10);
    const min = m[5];
    const sec = m[6] || '00';
    const ap  = m[7];
    if (ap && /pm/i.test(ap) && h < 12) h += 12;
    if (ap && /am/i.test(ap) && h === 12) h = 0;
    return `${year}-${month}-${day}T${String(h).padStart(2, '0')}:${min}:${sec}`;
  }

  // Fallback: native Date parse (covers ISO inputs).
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, /T/.test(d.toISOString()) ? 19 : 10);
  return null;
}

/** Phone string → digits-only canonical form ("+1XXXXXXXXXX" if 10/
 *  11 digits, otherwise the digits as-is). Useful for equality
 *  checks and Power Automate payloads. The page often emits
 *  "(786) 431-0282" — we normalize to "+17864310282". */
export function normalizePhone(v) {
  if (isEmpty(v)) return '';
  const digits = String(v).replace(/\D+/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return digits;
}

/** "true"/"false"/"yes"/"no" → boolean, with empty/null → null
 *  (tri-state: present-and-true, present-and-false, missing). */
export function parseBool(v) {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  if (/^(true|yes|y|1|on|checked)$/.test(s)) return true;
  if (/^(false|no|n|0|off|unchecked)$/.test(s)) return false;
  return null;
}

/* ── Format helpers (used by code-runtime's `h.fmt.*` namespace and
   by the path-resolver when a schema field has a default format). ── */

/** Format a number as USD currency. Returns '' for null/NaN. */
export function fmtCurrency(n, opts = {}) {
  const num = typeof n === 'number' ? n : parseNumber(n);
  if (num == null) return '';
  const { currency = 'USD', locale = 'en-US', max = 2, min = 2 } = opts;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(num);
  } catch { return '$' + num.toFixed(max); }
}

/** Format a number with optional decimals + grouping. */
export function fmtNumber(n, opts = {}) {
  const num = typeof n === 'number' ? n : parseNumber(n);
  if (num == null) return '';
  const { locale = 'en-US', max, min } = opts;
  try {
    return new Intl.NumberFormat(locale, {
      ...(min != null ? { minimumFractionDigits: min } : {}),
      ...(max != null ? { maximumFractionDigits: max } : {}),
    }).format(num);
  } catch { return String(num); }
}

/** Format an ISO date string or Date with a pattern token set:
 *    yyyy | yy | MM | M | dd | d | hh | h | mm | m | ss | s | AM
 *  The token "AM" is replaced by "AM"/"PM" based on hour-of-day.
 *  Patterns are a deliberate subset of date-fns: enough for the
 *  templates the user writes, not enough to need a 30kb library. */
export function fmtDate(input, pattern = 'M/d/yyyy') {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const yy   = String(yyyy).slice(-2);
  const M    = d.getMonth() + 1;
  const MM   = String(M).padStart(2, '0');
  const dy   = d.getDate();
  const dd   = String(dy).padStart(2, '0');
  let h24 = d.getHours();
  let h12 = h24 % 12 || 12;
  const HH = String(h24).padStart(2, '0');
  const hh = String(h12).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ap = h24 >= 12 ? 'PM' : 'AM';
  return pattern
    .replace(/yyyy/g, yyyy)
    .replace(/yy/g,  yy)
    .replace(/MM/g,  MM)
    .replace(/M/g,   M)
    .replace(/dd/g,  dd)
    .replace(/d/g,   dy)
    .replace(/HH/g,  HH)
    .replace(/hh/g,  hh)
    .replace(/h/g,   h12)
    .replace(/mm/g,  mm)
    .replace(/m/g,   d.getMinutes())
    .replace(/ss/g,  ss)
    .replace(/s/g,   d.getSeconds())
    .replace(/AM/g,  ap)
    .replace(/A/g,   ap[0]);
}

/** First non-empty value (null/undefined/empty-string skipped).
 *  Common in code variables: `h.coalesce(ctx.contact.firstName, ctx.contact.email, 'friend')`. */
export function coalesce(...args) {
  for (const v of args) {
    if (v != null && v !== '' && (typeof v !== 'string' || v.trim())) return v;
  }
  return '';
}

/** Title-case: capitalize each word boundary, leave other letters
 *  alone (so acronyms like "USA" survive a mixed-case input). */
export function titleCase(s) {
  if (isEmpty(s)) return '';
  return String(s).replace(/\b(\w)(\w*)/g, (_, a, b) => a.toUpperCase() + b);
}

/** Lookup a transform by name — single source of truth so the
 *  schema and the helper namespace stay in lock-step. */
export const TRANSFORMS = {
  trim,
  parseNumber,
  parseCurrency,
  parseDate,
  normalizePhone,
  parseBool,
  titleCase,
};

export function applyTransform(name, value) {
  if (!name) return value;
  const fn = TRANSFORMS[name];
  return fn ? fn(value) : value;
}

/** Coerce a raw string to the schema field's declared type.
 *  Called by extract.js after the per-leaf extractor returns. */
export function coerceType(rawValue, type) {
  if (type === 'number')   return parseNumber(rawValue);
  if (type === 'currency') return parseCurrency(rawValue);
  if (type === 'date')     return parseDate(rawValue);
  if (type === 'bool')     return parseBool(rawValue);
  if (type === 'string')   return rawValue == null ? '' : trim(rawValue);
  // object / array are handled structurally by extract.js, not here.
  return rawValue;
}
