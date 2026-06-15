/* ───────────────────────────────────────────────────────────────────────────
   templateImport — validate + normalize LLM-generated email-template JSON and
   merge it into chrome.storage.local.templates.

   The paste-import dialog (editor sidebar) accepts:
     • a single template object,
     • an array of templates,
     • or a wrapper { templates: [...] }.
   Shape contract documented in docs/llm-template-toolset.md — the toolset file
   given to a model so it can author these blobs. Every import gets a FRESH id
   (no collisions / no accidental overwrite); unknown fields are dropped so a
   sloppy blob can't poison storage.
   ─────────────────────────────────────────────────────────────────────────── */

const VALID_TYPES = ['order', 'account', 'case'];
const VAR_TYPES   = ['schema', 'path', 'code', 'literal', 'regex', 'builtin', 'selector', 'attachment'];

const _rid = (p) => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* One variable definition — keep only the fields the resolver understands. */
function normalizeVarDef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = VAR_TYPES.includes(raw.type) ? raw.type : null;
  if (!type) return null;
  const out = { type };
  if (type === 'schema' || type === 'path') { out.type = 'schema'; out.path = String(raw.path || ''); }
  else if (type === 'code')      { out.body = String(raw.body || ''); if (raw.async) out.async = true; }
  else if (type === 'literal')   { out.value = String(raw.value != null ? raw.value : (raw.config != null ? raw.config : '')); }
  else if (type === 'builtin')   { out.builtin = String(raw.builtin || ''); }
  else if (type === 'selector')  { out.selector = String(raw.selector || ''); }
  else if (type === 'regex') {
    out.pattern = String(raw.pattern || '');
    out.source  = ['body', 'subject', 'from', 'html'].includes(raw.source) ? raw.source : 'body';
    if (raw.group != null) out.group = Number(raw.group) || 1;
    if (raw.scope) out.scope = String(raw.scope);
  } else if (type === 'attachment') {
    out.mode   = raw.mode === 'attach' ? 'attach' : 'inline';
    out.source = ['url', 'schema', 'code'].includes(raw.source) ? raw.source : 'url';
    if (out.source === 'schema')    out.path = String(raw.path || '');
    else if (out.source === 'code') { out.body = String(raw.body || ''); if (raw.async) out.async = true; }
    else                            out.url  = String(raw.url || '');
    out.filename = String(raw.filename || 'attachment');
    if (out.mode === 'inline') {
      out.width = Math.max(24, Math.min(600, Number(raw.width) || 220));
      out.align = ['left', 'center', 'right'].includes(raw.align) ? raw.align : 'left';
    }
  }
  // Smart options pass through whitelisted.
  if (raw.smart && typeof raw.smart === 'object') {
    const s = {};
    if (typeof raw.smart.fallback === 'string') s.fallback = raw.smart.fallback;
    if (raw.smart.transform) s.transform = String(raw.smart.transform);
    if (raw.smart.conditional) { s.conditional = true; if (raw.smart.conditionalScope) s.conditionalScope = String(raw.smart.conditionalScope); }
    if (raw.smart.format && typeof raw.smart.format === 'object') s.format = raw.smart.format;
    if (raw.smart.extract && typeof raw.smart.extract === 'object') s.extract = raw.smart.extract;
    if (Object.keys(s).length) out.smart = s;
  }
  /* Attachment vars default to conditional (line scope) so an empty file
     source drops the line instead of leaking a literal {{name}}. Mirrors
     the editor's save-time default; explicit conditional:false opts out. */
  if (type === 'attachment' && (raw.smart || {}).conditional === undefined) {
    out.smart = { conditionalScope: 'line', ...(out.smart || {}), conditional: true };
  }
  return out;
}

/* One template → normalized storage shape, or throws with a useful message. */
export function normalizeTemplate(raw, index = 0) {
  if (!raw || typeof raw !== 'object') throw new Error(`Template #${index + 1} is not an object`);
  const type = VALID_TYPES.includes(raw.type) ? raw.type : 'order';
  const name = String(raw.name || '').trim();
  if (!name) throw new Error(`Template #${index + 1} is missing "name"`);
  if (typeof raw.body !== 'string' || !raw.body.trim()) throw new Error(`Template "${name}" is missing "body"`);

  const out = {
    id: _rid('tpl'),
    type,
    name,
    enabled: raw.enabled !== false,
    subject: String(raw.subject || ''),
    body: String(raw.body),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // Recipient
  const tf = raw.toField;
  if (tf && typeof tf === 'object' && ['auto', 'literal', 'selector'].includes(tf.type)) {
    out.toField = tf.type === 'literal' ? { type: 'literal', value: String(tf.value || '') }
      : tf.type === 'selector' ? { type: 'selector', selector: String(tf.selector || '') }
      : { type: 'auto' };
  } else out.toField = { type: 'auto' };

  // Variables — case templates use the caseVars array; others the vars map.
  if (type === 'case') {
    const list = Array.isArray(raw.caseVars) ? raw.caseVars : [];
    out.caseVars = list.map((v) => {
      if (!v || !v.name) return null;
      const kind = ['code', 'regex', 'literal'].includes(v.kind) ? v.kind : 'literal';
      return {
        name: String(v.name), kind,
        config: String(v.config != null ? v.config : (v.pattern || v.body || v.value || '')),
        ...(kind === 'regex' ? { source: ['body', 'subject', 'from'].includes(v.source) ? v.source : 'body', ...(v.group != null ? { group: Number(v.group) || 1 } : {}) } : {}),
        ...(kind === 'code' && v.async ? { async: true } : {}),
        smart: (v.smart && typeof v.smart === 'object') ? v.smart : {},
      };
    }).filter(Boolean);
    if (Array.isArray(raw.caseRules)) {
      out.caseRules = raw.caseRules
        .filter((r) => r && r.field && r.op)
        .map((r) => ({ field: String(r.field), op: String(r.op), value: r.value != null ? String(r.value) : '' }));
    }
    if (Array.isArray(raw.caseTags)) out.caseTags = raw.caseTags.map(String);
  } else {
    const vars = {};
    const order = [];
    const src = raw.vars && typeof raw.vars === 'object' ? raw.vars : {};
    const keys = Array.isArray(raw.varOrder) && raw.varOrder.length
      ? raw.varOrder.filter((k) => src[k]).concat(Object.keys(src).filter((k) => !raw.varOrder.includes(k)))
      : Object.keys(src);
    for (const k of keys) {
      if (!/^\w+$/.test(k)) throw new Error(`Template "${name}": variable name "${k}" must be letters/numbers/underscores`);
      const def = normalizeVarDef(src[k]);
      if (!def) throw new Error(`Template "${name}": variable "${k}" has an unknown type (allowed: ${VAR_TYPES.join(', ')})`);
      vars[k] = def;
      order.push(k);
    }
    out.vars = vars;
    out.varOrder = order;
    if (type === 'account' && raw.accountConditions) {
      // Two accepted shapes: a grouped tree ({ outerJoiner, groups }) — which
      // the matcher evaluates via evalTree and which supports schema paths +
      // array quantifiers like items[any].name — or the legacy flat array.
      const ac = raw.accountConditions;
      if (ac && typeof ac === 'object' && Array.isArray(ac.groups)) {
        out.accountConditions = ac;
      } else if (Array.isArray(ac)) {
        out.accountConditions = ac
          .filter((r) => r && r.field && r.op)
          .map((r) => ({ field: String(r.field), op: String(r.op), value: r.value != null ? String(r.value) : '' }));
      }
    }
    if (type === 'order' && raw.rules && typeof raw.rules === 'object') out.rules = raw.rules;
  }

  // Variations
  if (Array.isArray(raw.variations) && raw.variations.length) {
    out.variations = raw.variations
      .filter((v) => v && (v.body || v.subject))
      .map((v, i) => ({
        id: _rid('var'),
        label: String(v.label || `Variation ${i + 1}`),
        subject: String(v.subject || out.subject),
        body: String(v.body || out.body),
      }));
    if (!out.variations.length) delete out.variations;
  }

  // When a template has variations, the initial email is also a named block —
  // carry an optional label for it so the picker shows it like the others
  // instead of a forced "Variation 1" (display-only; the base still resolves
  // from tpl.subject/body).
  if (out.variations && (raw.baseLabel || raw.originalLabel)) {
    out.baseLabel = String(raw.baseLabel || raw.originalLabel);
  }

  // PA fields
  if (type !== 'case') out.replyMode = raw.replyMode === 'reply' ? 'reply' : 'standalone';
  if (raw.senderAccount) out.senderAccount = String(raw.senderAccount);
  if (raw.senderRandomize) out.senderRandomize = true;

  return out;
}

/* Parse a pasted blob (single template / array / {templates:[…]}) → array of
   normalized templates. Throws with a readable message on any problem. */
export function parseTemplateBlob(text) {
  let obj;
  try { obj = JSON.parse(text); }
  catch (e) { throw new Error('Not valid JSON — ' + e.message); }
  const list = Array.isArray(obj) ? obj
    : Array.isArray(obj && obj.templates) ? obj.templates
    : [obj];
  if (!list.length) throw new Error('No templates found in the JSON');
  return list.map((t, i) => normalizeTemplate(t, i));
}

/* Merge normalized templates into storage. Always appends (fresh ids). */
export function importTemplates(templates) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get('templates', (d) => {
        const existing = Array.isArray(d.templates) ? d.templates : [];
        chrome.storage.local.set({ templates: [...existing, ...templates] }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(templates.length);
        });
      });
    } catch (e) { reject(e); }
  });
}
