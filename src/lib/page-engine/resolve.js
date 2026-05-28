/* ───────────────────────────────────────────────────────────────
   page-engine/resolve.js — path → value lookup on extracted JSON.

   Path grammar (intentionally narrow — complex traversal goes to
   code variables):

     identifier          dot-walk through object keys
     [N]                 array index (0-based)
     [-N]                array index from end (-1 = last)
     .prop / ['prop']    equivalent forms; bracketed allowed for
                         keys with hyphens or that start with digits

     Examples:
       contact.firstName
       orders[0].total
       orders[-1].number
       stats['lastOrderDate']

   Out-of-bounds, missing keys, or null pivot → returns `defaultV`
   (default ''). Type-preserving: returns whatever value is in the
   JSON — number stays number, array stays array. Callers that need
   a string call toDisplayString() on the result.
─────────────────────────────────────────────────────────────── */

/** Tokenize a path into a flat array of steps. Each step is either
 *  a string (object key) or a number (array index, possibly
 *  negative). Throws is for impossibly malformed inputs; returns []
 *  for the (very common) empty-path case so callers can branch. */
export function tokenizePath(path) {
  if (path == null) return [];
  const s = String(path).trim();
  if (!s) return [];
  const out = [];
  let i = 0;
  const n = s.length;
  /* Tracker so we can give useful error messages when we abort. */
  const here = () => `at "${s.slice(0, i)}|${s.slice(i)}"`;

  while (i < n) {
    const ch = s[i];

    if (ch === '.') { i++; continue; }

    if (ch === '[') {
      i++;
      // Bracketed string key: ['name'] or ["name"]
      if (s[i] === '"' || s[i] === "'") {
        const q = s[i];
        i++;
        let key = '';
        while (i < n && s[i] !== q) { key += s[i++]; }
        if (s[i] !== q) throw new Error(`unterminated string ${here()}`);
        i++;
        if (s[i] !== ']') throw new Error(`expected ] ${here()}`);
        i++;
        out.push(key);
        continue;
      }
      // Numeric index (with optional leading minus for "from end")
      let num = '';
      if (s[i] === '-') { num = '-'; i++; }
      while (i < n && /\d/.test(s[i])) { num += s[i++]; }
      if (s[i] !== ']' || !num || num === '-') throw new Error(`bad index ${here()}`);
      i++;
      out.push(Number(num));
      continue;
    }

    // Bare identifier (letters, digits, underscore — including
    // digit-leading for tolerance, even though JS keys can be
    // anything; we'll fall back to bracket form for those).
    let id = '';
    while (i < n && /[A-Za-z0-9_$]/.test(s[i])) { id += s[i++]; }
    if (!id) throw new Error(`unexpected character ${here()}`);
    out.push(id);
  }
  return out;
}

/**
 * resolve(ctx, path, defaultV?) — walk the path against ctx.
 *
 *   ctx        the extracted JSON (data from extract()) OR any
 *              plain object/array.
 *   path       string path. Empty/invalid → returns defaultV.
 *   defaultV   what to return if any step lands on null/undefined
 *              or out-of-bounds. Defaults to '' so it composes with
 *              string concatenation in templates.
 *
 * Never throws on missing data — only throws when the PATH itself
 * is malformed (caller bug, not data bug).
 */
export function resolve(ctx, path, defaultV = '') {
  let steps;
  try { steps = tokenizePath(path); }
  catch { return defaultV; }
  if (steps.length === 0) return defaultV;

  let node = ctx;
  for (const step of steps) {
    if (node == null) return defaultV;
    if (typeof step === 'number') {
      if (!Array.isArray(node)) return defaultV;
      const idx = step < 0 ? node.length + step : step;
      if (idx < 0 || idx >= node.length) return defaultV;
      node = node[idx];
    } else {
      if (typeof node !== 'object') return defaultV;
      if (!(step in node)) return defaultV;
      node = node[step];
    }
  }
  return node == null ? defaultV : node;
}

/**
 * existsAt(ctx, path) — true if the path resolves to a defined
 * value (not null, not undefined, not empty string, and for arrays
 * not empty). Used by validators + conditional-drop logic to
 * decide if a field "is present" without conflating 0 / false /
 * empty array with truly missing data. */
export function existsAt(ctx, path) {
  const v = resolve(ctx, path, undefined);
  if (v === undefined) return false;
  if (v === null) return false;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Flatten the JSON into a list of { path, value, type } entries
 * for the editor's variable picker UI. Walks the data + schema in
 * lockstep so labels and types come along. Arrays are surfaced as
 * a single entry with type 'array' (the picker decides whether to
 * drill into the first item for previews).
 *
 *   listPaths(schema, data) → Array<{ path, label, type, value }>
 */
export function listPaths(schema, data, basePath = '', baseLabel = '') {
  const out = [];
  if (!schema || !schema.fields) return out;
  for (const [name, def] of Object.entries(schema.fields)) {
    const path  = basePath ? `${basePath}.${name}` : name;
    const label = def.label
      ? (baseLabel ? `${baseLabel} › ${def.label}` : def.label)
      : path;
    const value = resolve(data || {}, path, undefined);

    if (def.type === 'object' && def.fields) {
      out.push({ path, label, type: 'object', value, children: true });
      out.push(...listPaths({ fields: def.fields }, data, path, label));
    } else if (def.type === 'array') {
      out.push({ path, label, type: 'array', value, children: false });
      // Surface the item shape so users can write `path[0].field`.
      if (def.itemFields) {
        const sample = Array.isArray(value) && value.length ? value[0] : {};
        out.push(...listPaths(
          { fields: def.itemFields },
          { __row: sample },
          `${path}[0]`,
          `${label}[0]`,
        ).map((entry) => ({
          ...entry,
          // Re-anchor — listPaths returned paths prefixed __row.
          path: entry.path.replace(/^__row\./, `${path}[0].`).replace(/^__row/, `${path}[0]`),
        })));
      }
    } else {
      out.push({ path, label, type: def.type || 'string', value });
    }
  }
  return out;
}

/**
 * Stringify a value for substitution into a template. Mirrors
 * what {{path}} would produce in a rendered email. Nulls → empty
 * string, arrays → comma-joined, objects → JSON (mostly for
 * debugging — the picker discourages selecting an object). */
export function toDisplayString(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(toDisplayString).join(', ');
  try { return JSON.stringify(v); }
  catch { return String(v); }
}
