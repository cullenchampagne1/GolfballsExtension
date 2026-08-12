/* Deterministic subject clusters for saved email templates.
 *
 * The template definition tells us which text is fixed and which text is
 * dynamic, so it is a stronger training signal than trying to rediscover the
 * shape from sent subjects. Each template owns one stable cluster ID; its
 * subject variations become structural patterns inside that cluster.
 *
 * Structural regexes remain in the catalog for diagnostics and backwards
 * compatibility. They are deliberately not the attribution key. The tracking
 * store records the fully rendered outbound subject and matches a reply to
 * that exact normalized value, which naturally includes the result of code
 * variables without executing arbitrary code while compiling the catalog.
 */

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;
const REPLY_PREFIX = '^(?:(?:re|fw|fwd)\\s*:\\s*|\\[external(?:\\s+email)?\\]\\s*)*';
const MAX_ALTERNATIVES = 32;
const CLUSTER_PREFIX = 'email-template:';

const object = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

function decodeEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  };
  return String(value || '').replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (whole, decimal, hex, name) => {
      if (decimal) {
        const point = Number(decimal);
        return Number.isSafeInteger(point) && point <= 0x10ffff
          ? String.fromCodePoint(point) : whole;
      }
      if (hex) {
        const point = Number.parseInt(hex, 16);
        return Number.isSafeInteger(point) && point <= 0x10ffff
          ? String.fromCodePoint(point) : whole;
      }
      return named[String(name || '').toLowerCase()] ?? whole;
    },
  );
}

function canonicalFragment(value) {
  return decodeEntities(value)
    .normalize('NFKC')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\t\v\f\r\n ]+/g, ' ')
    .toLocaleLowerCase('en-US');
}

/** Normalize an outbound or reply subject to its conversation identity. */
export function normalizeEmailSubject(value) {
  let out = canonicalFragment(value).trim();
  // Replies can accumulate these in any order (for example
  // "RE: [External] Re: …"), so peel until no recognized prefix remains.
  let previous = '';
  while (out && out !== previous) {
    previous = out;
    out = out
      .replace(/^\s*(?:re|fw|fwd)\s*:\s*/i, '')
      .replace(/^\s*\[external(?:\s+email)?\]\s*/i, '')
      .trim();
  }
  return out;
}

/**
 * Cluster identity is owned by the saved template, not its mutable subject.
 * Including the complete template ID makes the mapping deterministic and
 * collision-free without persistence, training order, or a hash registry.
 */
export function emailTemplateClusterId(templateId) {
  const id = String(templateId || '').trim();
  return id ? `${CLUSTER_PREFIX}${id}` : null;
}

const exact = (char) => ({ kind: 'exact', char });
const repeat = (className = 'any', minimum = 1) => ({ kind: 'repeat', className, minimum });

function literalAtoms(value, { trim = false } = {}) {
  const text = trim ? normalizeEmailSubject(value) : canonicalFragment(value);
  return Array.from(text, exact);
}

function compactAtoms(atoms, { trim = true } = {}) {
  const out = [];
  for (const atom of atoms || []) {
    if (!atom) continue;
    const prior = out[out.length - 1];
    if (atom.kind === 'exact' && atom.char === ' '
        && prior?.kind === 'exact' && prior.char === ' ') continue;
    out.push(atom);
  }
  if (trim) {
    while (out[0]?.kind === 'exact' && out[0].char === ' ') out.shift();
    while (out.at(-1)?.kind === 'exact' && out.at(-1).char === ' ') out.pop();
  }
  return out;
}

function variableClass(name, definition) {
  const def = object(definition);
  const hint = [name, def.builtin, def.path, def.config]
    .filter(Boolean).join(' ').toLowerCase();
  const format = String(def.smart?.format?.type || def.smart?.format || '').toLowerCase();
  if (/currency|percent|number|integer/.test(format)) return 'digit';
  if (/(?:^|[^a-z])(order|invoice|customer|contact|account)[ _.-]*(?:number|no|num|id)(?:$|[^a-z])/.test(hint)
      || /(?:^|[^a-z])(?:order_number|ordernumber)(?:$|[^a-z])/.test(hint)) return 'digit';
  return 'any';
}

function quotedString(expression) {
  const text = String(expression || '').trim();
  const quote = text[0];
  if (!['"', "'"].includes(quote) || text.at(-1) !== quote) return null;
  try {
    if (quote === '"') return JSON.parse(text);
    // Accept ordinary string escapes without executing the code body.
    return text.slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  } catch { return null; }
}

function splitTopLevelPlus(expression) {
  const parts = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let depth = 0;
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (char === '+' && depth === 0) {
      parts.push(expression.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expression.slice(start).trim());
  return parts.filter(Boolean);
}

function templateLiteralAtoms(expression) {
  const text = String(expression || '').trim();
  if (!text.startsWith('`') || !text.endsWith('`')) return null;
  const inner = text.slice(1, -1);
  const atoms = [];
  let cursor = 0;
  const interpolation = /\$\{[^}]*\}/g;
  for (const match of inner.matchAll(interpolation)) {
    atoms.push(...literalAtoms(inner.slice(cursor, match.index)));
    atoms.push(repeat('any', 0));
    cursor = match.index + match[0].length;
  }
  atoms.push(...literalAtoms(inner.slice(cursor)));
  return compactAtoms(atoms, { trim: false });
}

/** Infer useful fixed fragments from simple code without executing it. */
function inferCodeAtoms(definition) {
  const body = String(definition?.body ?? definition?.config ?? '').trim();
  const match = body.match(/^return\s+([\s\S]*?)\s*;?\s*$/);
  if (!match) return null;
  const expression = match[1].replace(/;\s*$/, '').trim();
  const literal = quotedString(expression);
  if (literal != null) return compactAtoms(literalAtoms(literal), { trim: false });
  const templated = templateLiteralAtoms(expression);
  if (templated) return templated;
  const parts = splitTopLevelPlus(expression);
  if (parts.length <= 1) return null;
  const atoms = [];
  let sawLiteral = false;
  for (const part of parts) {
    const value = quotedString(part);
    const template = templateLiteralAtoms(part);
    if (value != null) {
      atoms.push(...literalAtoms(value));
      sawLiteral = sawLiteral || !!value;
    } else if (template) {
      atoms.push(...template);
      sawLiteral = true;
    } else {
      atoms.push(repeat('any', 0));
    }
  }
  return sawLiteral ? compactAtoms(atoms, { trim: false }) : null;
}

function variableAlternatives(name, definition) {
  const def = object(definition);
  const smart = object(def.smart);

  if (def.type === 'literal' && def.value != null && String(def.value).length
      && !smart.transform && !smart.extract && !smart.format) {
    return [literalAtoms(def.value)];
  }
  if (def.type === 'code') {
    const inferred = inferCodeAtoms(def);
    if (inferred?.length) return [inferred];
  }
  return [[repeat(variableClass(name, def), smart.conditional ? 0 : 1)]];
}

function appendAlternatives(prefixes, additions) {
  const next = [];
  for (const prefix of prefixes) {
    for (const addition of additions) {
      next.push([...prefix, ...addition]);
      if (next.length >= MAX_ALTERNATIVES) return next;
    }
  }
  return next;
}

function compileSubject(subject, definitions) {
  const raw = String(subject || '');
  const defs = object(definitions);
  let alternatives = [[]];
  let cursor = 0;
  for (const match of raw.matchAll(PLACEHOLDER)) {
    alternatives = appendAlternatives(
      alternatives,
      [literalAtoms(raw.slice(cursor, match.index))],
    );
    const names = String(match[1]).split('|').map((name) => name.trim()).filter(Boolean);
    const choices = names.flatMap((name) => variableAlternatives(name, defs[name]));
    alternatives = appendAlternatives(
      alternatives,
      choices.length ? choices : [[repeat('any')]],
    );
    cursor = match.index + match[0].length;
  }
  alternatives = appendAlternatives(alternatives, [literalAtoms(raw.slice(cursor))])
    .map(compactAtoms)
    .filter((atoms) => atoms.length > 0);
  return { alternatives };
}

function escapeRegexChar(char, raw = false) {
  if (char === ' ') return raw ? '\\s+' : ' ';
  if (char === '-' && raw) return '[-\\u2010-\\u2015\\u2212]';
  return char.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
}

function atomsRegex(atoms, raw = false) {
  return atoms.map((atom) => {
    if (atom.kind === 'exact') return escapeRegexChar(atom.char, raw);
    const quantifier = atom.minimum === 0 ? '*' : '+';
    if (atom.className === 'digit') return `[0-9]${quantifier}`;
    return `[^\\r\\n]${quantifier}`;
  }).join('');
}

function unionRegex(sequences, raw = false) {
  const sources = [...new Set(sequences.map((atoms) => atomsRegex(atoms, raw)))];
  const body = sources.length === 1 ? sources[0] : `(?:${sources.join('|')})`;
  return `${raw ? REPLY_PREFIX : '^'}${body}$`;
}

function atomsPattern(atoms) {
  const parts = [];
  for (const atom of atoms) {
    if (atom.kind === 'exact') {
      parts.push(atom.char);
      continue;
    }
    const marker = atom.className === 'digit' ? '<#>' : '<*>';
    // Adjacent dynamic fragments represent one unknown rendered span in the
    // human-readable shape, even if the compatibility regex keeps them apart.
    if (parts.at(-1) !== marker && !['<*>', '<#>'].includes(parts.at(-1))) parts.push(marker);
  }
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function shortHash(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function templateSubjects(template) {
  const base = String(template?.subject || '');
  return [
    { variationId: '__original', label: template?.baseLabel || 'Original', subject: base },
    ...(Array.isArray(template?.variations) ? template.variations : []).map((variation, index) => ({
      variationId: variation?.id || `variation-${index + 1}`,
      label: variation?.label || `Variation ${index + 2}`,
      subject: String(variation?.subject || base),
    })),
  ];
}

function unavailableTracker(templateId, templateName, status, reason) {
  return {
    templateId,
    templateName,
    status,
    clusterId: null,
    trackerId: null,
    clusterRevision: null,
    matchMode: 'recorded_subject',
    patterns: [],
    regex: null,
    canonicalRegex: null,
    flags: 'iu',
    variants: [],
    conflictsWith: [],
    reason,
  };
}

function initialTracker(template, index) {
  const templateId = String(template?.id || '').trim();
  const templateName = String(template?.name || `Template ${index + 1}`).trim();
  const type = template?.type === 'email' ? 'order' : (template?.type || 'order');
  if (template?.enabled === false) {
    return unavailableTracker(templateId, templateName, 'disabled', 'Template is disabled.');
  }
  if (type === 'case') {
    return unavailableTracker(templateId, templateName, 'not_applicable', 'Case replies use the existing conversation subject.');
  }
  if (template?.replyMode === 'reply') {
    return unavailableTracker(templateId, templateName, 'not_applicable', 'Reply-in-thread templates inherit tracking from the original email in the conversation.');
  }
  if (!templateId) {
    return unavailableTracker(templateId, templateName, 'incomplete', 'Save the template before assigning its subject cluster.');
  }

  const variants = templateSubjects(template).map((entry) => {
    const compiled = compileSubject(entry.subject, template?.vars);
    const patterns = [...new Set(compiled.alternatives.map(atomsPattern).filter(Boolean))];
    return {
      ...entry,
      pattern: patterns.length === 1 ? patterns[0] : patterns.join(' | '),
      patterns,
      canonicalRegex: compiled.alternatives.length ? unionRegex(compiled.alternatives) : null,
      regex: compiled.alternatives.length ? unionRegex(compiled.alternatives, true) : null,
      _alternatives: compiled.alternatives,
    };
  });
  const alternatives = variants.flatMap((variant) => variant._alternatives);
  const patterns = [...new Set(variants.flatMap((variant) => variant.patterns))];
  const incomplete = variants.some((variant) => !variant._alternatives.length);
  const clusterId = incomplete ? null : emailTemplateClusterId(templateId);
  const canonicalRegex = alternatives.length ? unionRegex(alternatives) : null;
  const regex = alternatives.length ? unionRegex(alternatives, true) : null;
  const revisionSeed = variants
    .flatMap((variant) => variant.patterns.map((pattern) => `${variant.variationId}:${pattern}`))
    .sort()
    .join('\u001f');

  return {
    templateId,
    templateName,
    status: incomplete ? 'incomplete' : 'ready',
    clusterId,
    // Keep the original property during the schema migration. New records and
    // UI use clusterId; older delivery contracts still understand trackerId.
    trackerId: clusterId,
    clusterRevision: incomplete ? null : `subject-shape:${shortHash(revisionSeed)}`,
    matchMode: 'recorded_subject',
    patterns,
    regex: incomplete ? null : regex,
    canonicalRegex: incomplete ? null : canonicalRegex,
    flags: 'iu',
    variants,
    conflictsWith: [],
    reason: incomplete ? 'Every subject variation needs a subject line.' : '',
    _alternatives: alternatives,
  };
}

function publicTracker(tracker) {
  const { _alternatives, ...rest } = tracker;
  return {
    ...rest,
    variants: (rest.variants || []).map((variant) => {
      const { _alternatives: ignored, ...visible } = variant;
      return visible;
    }),
  };
}

/** Build the same subject-cluster catalog for the same saved templates. */
export function buildEmailTemplateTrackerCatalog(templates) {
  return {
    version: 2,
    identityStrategy: 'template-id-v1',
    matchMode: 'recorded-subject-v1',
    trackers: (Array.isArray(templates) ? templates : [])
      .map(initialTracker)
      .map(publicTracker),
  };
}

/**
 * Best-effort structural lookup retained for diagnostics and older callers.
 * Attribution uses exact recorded send subjects instead; overlapping shapes
 * therefore never disable either cluster.
 */
export function matchEmailTemplateSubject(subject, catalogOrTemplates) {
  const catalog = Array.isArray(catalogOrTemplates)
    ? buildEmailTemplateTrackerCatalog(catalogOrTemplates)
    : (catalogOrTemplates || { trackers: [] });
  const normalized = normalizeEmailSubject(subject);
  if (!normalized) return null;
  const matches = (catalog.trackers || []).filter((tracker) => {
    if (tracker?.status !== 'ready' || !tracker.canonicalRegex) return false;
    try { return new RegExp(tracker.canonicalRegex, 'u').test(normalized); }
    catch { return false; }
  });
  return matches.length === 1 ? matches[0] : null;
}

export function trackerForTemplate(catalog, templateId) {
  return (catalog?.trackers || []).find(
    (tracker) => tracker?.templateId === String(templateId || ''),
  ) || null;
}
