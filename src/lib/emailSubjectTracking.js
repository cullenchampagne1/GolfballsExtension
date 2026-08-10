/* Automatic subject trackers for saved email templates.
 *
 * Subjects are compiled into a deliberately small regular-language grammar:
 * literal characters plus one-or-more dynamic character classes. Because the
 * grammar is regular, two templates can be checked for a real intersection
 * instead of guessing from a handful of rendered examples. Unknown values are
 * represented conservatively as any non-newline text; uncertainty therefore
 * creates a conflict, never an incorrectly "unique" tracker.
 */

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;
const REPLY_PREFIX = '^(?:(?:re|fw|fwd)\\s*:\\s*|\\[external(?:\\s+email)?\\]\\s*)*';
const MAX_ALTERNATIVES = 32;
const MAX_CONFLICTS = 12;

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

/** Normalize a received subject before applying a canonical tracker regex. */
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
    // Accept the ordinary escapes used in variable snippets without executing
    // the code body itself.
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

/** Infer fixed text surrounding code output without ever evaluating user code. */
function inferCodeAtoms(definition) {
  const body = String(definition?.body ?? definition?.config ?? '').trim();
  // Only infer a single-return body. More complicated code remains an unknown
  // dynamic value; being conservative is what protects uniqueness.
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
  if (smart.conditional) return { conditional: true, alternatives: [] };

  if (def.type === 'literal' && def.value != null && String(def.value).length
      && !smart.transform && !smart.extract && !smart.format) {
    return { conditional: false, alternatives: [literalAtoms(def.value)] };
  }
  if (def.type === 'code') {
    const inferred = inferCodeAtoms(def);
    if (inferred?.length) return { conditional: false, alternatives: [inferred] };
  }
  return {
    conditional: false,
    alternatives: [[repeat(variableClass(name, def))]],
  };
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
  let conditional = false;
  for (const match of raw.matchAll(PLACEHOLDER)) {
    alternatives = appendAlternatives(
      alternatives,
      [literalAtoms(raw.slice(cursor, match.index))],
    );
    const names = String(match[1]).split('|').map((name) => name.trim()).filter(Boolean);
    const choices = [];
    for (const name of names) {
      const inferred = variableAlternatives(name, defs[name]);
      conditional = conditional || inferred.conditional;
      choices.push(...inferred.alternatives);
    }
    alternatives = appendAlternatives(
      alternatives,
      choices.length ? choices : [[repeat('any')]],
    );
    cursor = match.index + match[0].length;
  }
  alternatives = appendAlternatives(alternatives, [literalAtoms(raw.slice(cursor))])
    .map(compactAtoms)
    .filter((atoms) => atoms.length > 0);
  const fixedCharacters = Math.max(0, ...alternatives.map((atoms) => (
    atoms.filter((atom) => atom.kind === 'exact' && /[\p{L}\p{N}]/u.test(atom.char)).length
  )));
  return { alternatives, conditional, fixedCharacters };
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

function compileNfa(atoms) {
  const transitions = new Map();
  const epsilon = new Map();
  const addTransition = (from, label, to) => {
    if (!transitions.has(from)) transitions.set(from, []);
    transitions.get(from).push({ label, to });
  };
  const addEpsilon = (from, to) => {
    if (!epsilon.has(from)) epsilon.set(from, []);
    epsilon.get(from).push(to);
  };
  let state = 0;
  for (const atom of atoms) {
    if (atom.kind === 'exact') {
      addTransition(state, { kind: 'exact', char: atom.char }, state + 1);
      state += 1;
    } else {
      const loop = state + 1;
      const end = state + 2;
      const label = { kind: atom.className || 'any' };
      addTransition(state, label, loop);
      addTransition(loop, label, loop);
      addEpsilon(loop, end);
      if (atom.minimum === 0) addEpsilon(state, end);
      state = end;
    }
  }
  return { start: 0, accept: state, transitions, epsilon };
}

function epsilonClosure(nfa, states) {
  const found = new Set(states);
  const stack = [...found];
  while (stack.length) {
    const state = stack.pop();
    for (const next of nfa.epsilon.get(state) || []) {
      if (!found.has(next)) { found.add(next); stack.push(next); }
    }
  }
  return [...found].sort((a, b) => a - b);
}

function labelWitness(left, right) {
  if (left.kind === 'exact' && right.kind === 'exact') {
    return left.char === right.char ? left.char : null;
  }
  if (left.kind === 'exact') {
    if (right.kind === 'digit') return /[0-9]/.test(left.char) ? left.char : null;
    return /[\r\n]/.test(left.char) ? null : left.char;
  }
  if (right.kind === 'exact') return labelWitness(right, left);
  if (left.kind === 'digit' || right.kind === 'digit') return '0';
  return 'x';
}

/** Return one witness when two compiled subject languages intersect. */
function intersectionWitness(leftAtoms, rightAtoms) {
  const left = compileNfa(leftAtoms);
  const right = compileNfa(rightAtoms);
  const startLeft = epsilonClosure(left, [left.start]);
  const startRight = epsilonClosure(right, [right.start]);
  const queue = [{ l: startLeft, r: startRight, text: '' }];
  const visited = new Set();
  while (queue.length) {
    const current = queue.shift();
    const key = `${current.l.join(',')}|${current.r.join(',')}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (current.l.includes(left.accept) && current.r.includes(right.accept)) {
      return current.text.slice(0, 160);
    }
    const leftMoves = current.l.flatMap((state) => left.transitions.get(state) || []);
    const rightMoves = current.r.flatMap((state) => right.transitions.get(state) || []);
    for (const lm of leftMoves) {
      for (const rm of rightMoves) {
        const char = labelWitness(lm.label, rm.label);
        if (char == null) continue;
        queue.push({
          l: epsilonClosure(left, [lm.to]),
          r: epsilonClosure(right, [rm.to]),
          text: current.text.length < 160 ? current.text + char : current.text,
        });
      }
    }
  }
  return null;
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

function initialTracker(template, index) {
  const templateId = String(template?.id || '').trim();
  const templateName = String(template?.name || `Template ${index + 1}`).trim();
  const type = template?.type === 'email' ? 'order' : (template?.type || 'order');
  if (template?.enabled === false) {
    return { templateId, templateName, status: 'disabled', trackerId: null, regex: null, flags: 'iu', variants: [], conflictsWith: [], reason: 'Template is disabled.' };
  }
  if (type === 'case') {
    return { templateId, templateName, status: 'not_applicable', trackerId: null, regex: null, flags: 'iu', variants: [], conflictsWith: [], reason: 'Case replies use the existing conversation subject.' };
  }
  if (!templateId) {
    return { templateId, templateName, status: 'incomplete', trackerId: null, regex: null, flags: 'iu', variants: [], conflictsWith: [], reason: 'Save the template before generating its tracker.' };
  }

  const variants = templateSubjects(template).map((entry) => {
    const compiled = compileSubject(entry.subject, template?.vars);
    return {
      ...entry,
      canonicalRegex: compiled.alternatives.length ? unionRegex(compiled.alternatives) : null,
      regex: compiled.alternatives.length ? unionRegex(compiled.alternatives, true) : null,
      _alternatives: compiled.alternatives,
      _conditional: compiled.conditional,
      _fixedCharacters: compiled.fixedCharacters,
    };
  });
  const alternatives = variants.flatMap((variant) => variant._alternatives);
  let reason = '';
  if (variants.some((variant) => !variant._alternatives.length)) {
    reason = 'Every subject variation needs a subject line.';
  } else if (variants.some((variant) => variant._conditional)) {
    reason = 'A conditional variable can remove the subject, so it cannot be tracked safely.';
  } else if (variants.some((variant) => variant._fixedCharacters < 3)) {
    reason = 'Add at least three fixed letters or numbers to every subject variation.';
  }
  const candidateRegex = alternatives.length ? unionRegex(alternatives, true) : null;
  const canonicalRegex = alternatives.length ? unionRegex(alternatives) : null;
  return {
    templateId,
    templateName,
    status: reason ? 'incomplete' : 'ready',
    trackerId: reason ? null : `email-template:${templateId}:${shortHash(canonicalRegex)}`,
    regex: reason ? null : candidateRegex,
    canonicalRegex: reason ? null : canonicalRegex,
    candidateRegex,
    candidateCanonicalRegex: canonicalRegex,
    flags: 'iu',
    variants,
    conflictsWith: [],
    reason,
    _alternatives: alternatives,
  };
}

function publicTracker(tracker) {
  const { _alternatives, ...rest } = tracker;
  return {
    ...rest,
    variants: (rest.variants || []).map((variant) => {
      const { _alternatives: ignored, _conditional: ignoredConditional, _fixedCharacters: ignoredFixed, ...visible } = variant;
      return visible;
    }),
  };
}

/**
 * Build a deterministic tracker catalog. Ready trackers are guaranteed not to
 * intersect another enabled, non-case template in this catalog.
 */
export function buildEmailTemplateTrackerCatalog(templates) {
  const trackers = (Array.isArray(templates) ? templates : [])
    .map(initialTracker);

  // An untrackable template still participates in overlap checks when it has
  // a subject language. Otherwise a dynamic-only "{{name}}" template could
  // silently make every apparently-ready tracker non-unique.
  const comparable = trackers.filter((tracker) => (
    ['ready', 'incomplete'].includes(tracker.status) && tracker._alternatives?.length
  ));
  for (let i = 0; i < comparable.length; i += 1) {
    for (let j = i + 1; j < comparable.length; j += 1) {
      const left = comparable[i];
      const right = comparable[j];
      let collision = null;
      for (const leftVariant of left.variants) {
        for (const rightVariant of right.variants) {
          for (const leftAtoms of leftVariant._alternatives) {
            for (const rightAtoms of rightVariant._alternatives) {
              const witness = intersectionWitness(leftAtoms, rightAtoms);
              if (witness != null) {
                collision = {
                  leftVariationId: leftVariant.variationId,
                  leftVariationLabel: leftVariant.label,
                  rightVariationId: rightVariant.variationId,
                  rightVariationLabel: rightVariant.label,
                  witness,
                };
                break;
              }
            }
            if (collision) break;
          }
          if (collision) break;
        }
        if (collision) break;
      }
      if (!collision) continue;
      if (left.conflictsWith.length < MAX_CONFLICTS) {
        left.conflictsWith.push({
          templateId: right.templateId,
          templateName: right.templateName,
          variationId: collision.leftVariationId,
          variationLabel: collision.leftVariationLabel,
          otherVariationId: collision.rightVariationId,
          otherVariationLabel: collision.rightVariationLabel,
          witness: collision.witness,
        });
      }
      if (right.conflictsWith.length < MAX_CONFLICTS) {
        right.conflictsWith.push({
          templateId: left.templateId,
          templateName: left.templateName,
          variationId: collision.rightVariationId,
          variationLabel: collision.rightVariationLabel,
          otherVariationId: collision.leftVariationId,
          otherVariationLabel: collision.leftVariationLabel,
          witness: collision.witness,
        });
      }
    }
  }

  for (const tracker of comparable) {
    if (!tracker.conflictsWith.length) continue;
    tracker.status = 'conflict';
    tracker.trackerId = null;
    tracker.regex = null;
    tracker.canonicalRegex = null;
    tracker.reason = `Subject overlaps ${tracker.conflictsWith.length} other enabled template${tracker.conflictsWith.length === 1 ? '' : 's'}.`;
  }

  return {
    version: 1,
    trackers: trackers.map(publicTracker),
  };
}

/** Match only when exactly one ready template accepts the received subject. */
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
