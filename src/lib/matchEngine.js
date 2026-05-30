/* ───────────────────────────────────────────────────────────────
   matchEngine.js — grouped AND/OR rule evaluation, variable-aware.

   The unified evaluator the rule UIs (account / order / case) save
   into and the popup / content script evaluate against. It replaces
   three divergent, half-migrated paths: checkRules (flat AND, order),
   checkAccountConditions (flat AND, legacy Solr field names), and
   caseMatch.evalCaseRule (flat AND, email fields).

   Tree shape (same grouped form CaseRules.jsx already saves):

     {
       outerJoiner: 'AND' | 'OR',          // joins groups
       groups: [
         {
           joiner: 'AND' | 'OR',           // joins conditions in group
           conditions: [
             {
               source: 'schema'|'var'|'field'|'dom',
               ref:    string,             // schema path / var name / field / selector
               op:     string,
               value:  string,
               not:    boolean,
             },
           ],
         },
       ],
     }

   This module is PURE — it never touches the DOM or the page engine.
   The caller passes `getValue(condition)` which resolves a
   condition's subject to a value (and may return a Promise — variable
   conditions backed by `code` resolve asynchronously). That keeps the
   engine usable in the content script, the editor, and the popup.

   Empty tree (no groups, or a group with no conditions) → true: no
   constraint is unsatisfied. Callers decide whether a no-rule template
   should be surfaced as "matched on this page".
─────────────────────────────────────────────────────────────── */

const UNIT_MS = { days: 864e5, weeks: 7 * 864e5, months: 30 * 864e5, years: 365 * 864e5 };

const normOp = (op) => String(op || '').replace(/[\s_]+/g, '').toLowerCase();

function parseNum(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function parseDate(v) {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
/* Relative-date spec is "N:unit" (e.g. "30:days") — the form the
   account-condition picker collapses its number+unit inputs into. */
function relDate(spec) {
  const m = String(spec || '').match(/^(\d+(?:\.\d+)?)\s*:\s*(\w+)/);
  const n = m ? parseFloat(m[1]) : 1;
  const unit = m ? m[2].toLowerCase() : 'days';
  return new Date(Date.now() - n * (UNIT_MS[unit] || UNIT_MS.days));
}

function isPresent(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * applyOp(op, rawValue, compareValue) → boolean.
 *
 * Reconciles the operator vocabularies of all three legacy
 * evaluators. `op` is normalized (case + underscores stripped) so
 * `starts_with`, `startsWith`, and `STARTSWITH` are one op. Numeric
 * and date ops coerce; string ops compare case-insensitively.
 */
export function applyOp(op, rawValue, compareValue) {
  const k = normOp(op);

  if (k === 'exists') return isPresent(rawValue);
  if (k === 'notexists') return !isPresent(rawValue);
  // Every other operator on a missing value fails (matches the legacy
  // `if (rawVal == null) return false` short-circuit).
  if (!isPresent(rawValue)) return false;

  switch (k) {
    // ── numeric ──
    case 'eq': case 'ne': case 'gt': case 'gte': case 'lt': case 'lte': {
      const a = parseNum(rawValue), b = parseNum(compareValue);
      if (a == null || b == null) {
        // `eq`/`ne` fall back to string compare when not numeric.
        if (k === 'eq') return String(rawValue).toLowerCase() === String(compareValue || '').toLowerCase();
        if (k === 'ne') return String(rawValue).toLowerCase() !== String(compareValue || '').toLowerCase();
        return false;
      }
      if (k === 'eq')  return a === b;
      if (k === 'ne')  return a !== b;
      if (k === 'gt')  return a > b;
      if (k === 'gte') return a >= b;
      if (k === 'lt')  return a < b;
      if (k === 'lte') return a <= b;
      return false;
    }

    // ── date ──
    case 'before': case 'after': case 'beforetoday': case 'aftertoday':
    case 'relbefore': case 'relafter': {
      const d = parseDate(rawValue);
      if (!d) return false;
      if (k === 'before')      return parseDate(compareValue) ? d < parseDate(compareValue) : false;
      if (k === 'after')       return parseDate(compareValue) ? d > parseDate(compareValue) : false;
      if (k === 'beforetoday') return d < startOfToday();
      if (k === 'aftertoday')  return d > startOfToday();
      if (k === 'relbefore')   return d < relDate(compareValue);   // older than N units
      if (k === 'relafter')    return d >= relDate(compareValue);  // within the last N units
      return false;
    }

    // ── string ──
    default: {
      const s = String(rawValue).toLowerCase();
      const c = String(compareValue == null ? '' : compareValue).toLowerCase();
      if (k === 'is' || k === 'equals')   return s === c;
      if (k === 'contains')               return s.includes(c);
      if (k === 'notcontains')            return !s.includes(c);
      if (k === 'startswith')             return s.startsWith(c);
      if (k === 'endswith')               return s.endsWith(c);
      if (k === 'matchesregex') {
        try { return new RegExp(compareValue, 'i').test(String(rawValue)); }
        catch { return false; }
      }
      return false;
    }
  }
}

/* Operators offered per subject type — drives the rule UI's op
   dropdown. `valueless` ops (exists / not set) hide the value input. */
export const OPS_BY_TYPE = {
  string: [
    { id: 'is',           label: 'is' },
    { id: 'contains',     label: 'contains' },
    { id: 'notContains',  label: 'does not contain' },
    { id: 'startsWith',   label: 'starts with' },
    { id: 'endsWith',     label: 'ends with' },
    { id: 'matchesRegex', label: 'matches /regex/' },
    { id: 'exists',       label: 'is set',     valueless: true },
    { id: 'notExists',    label: 'is not set', valueless: true },
  ],
  number: [
    { id: 'eq',  label: '=' },
    { id: 'ne',  label: '≠' },
    { id: 'gt',  label: '>' },
    { id: 'gte', label: '≥' },
    { id: 'lt',  label: '<' },
    { id: 'lte', label: '≤' },
    { id: 'exists',    label: 'is set',     valueless: true },
    { id: 'notExists', label: 'is not set', valueless: true },
  ],
  date: [
    { id: 'before',      label: 'before (date)' },
    { id: 'after',       label: 'after (date)' },
    { id: 'relBefore',   label: 'older than' },
    { id: 'relAfter',    label: 'within the last' },
    { id: 'beforeToday', label: 'before today' },
    { id: 'afterToday',  label: 'after today' },
    { id: 'exists',      label: 'is set',     valueless: true },
    { id: 'notExists',   label: 'is not set', valueless: true },
  ],
};

const VALUELESS_OPS = new Set(['exists', 'notExists']);
export function isValuelessOp(op) {
  return VALUELESS_OPS.has(op) || normOp(op) === 'exists' || normOp(op) === 'notexists';
}

/** True if any condition in the tree reads a variable — lets the
 *  popup split templates into instant (var-free) vs pending. */
export function treeUsesVars(tree) {
  const groups = tree && tree.groups;
  if (!Array.isArray(groups)) return false;
  return groups.some((g) => Array.isArray(g.conditions)
    && g.conditions.some((c) => c && c.source === 'var'));
}

/** The set of variable names referenced anywhere in the tree. */
export function varsReferenced(tree) {
  const out = new Set();
  for (const g of (tree && tree.groups) || []) {
    for (const c of (g.conditions) || []) {
      if (c && c.source === 'var' && c.ref) out.add(c.ref);
    }
  }
  return [...out];
}

async function evalCondition(cond, getValue) {
  if (!cond) return true;
  let value;
  try { value = await getValue(cond); } catch { value = undefined; }
  const res = applyOp(cond.op, value, cond.value);
  return cond.not ? !res : res;
}

async function evalGroup(group, getValue) {
  const conds = group && group.conditions;
  if (!Array.isArray(conds) || conds.length === 0) return true;
  const orJoin = (group.joiner === 'OR');
  // Sequential await keeps getValue's per-variable cache warm (a
  // variable referenced twice resolves once) without racing.
  for (const c of conds) {
    const ok = await evalCondition(c, getValue);
    if (orJoin && ok) return true;     // OR short-circuits on first pass
    if (!orJoin && !ok) return false;  // AND short-circuits on first fail
  }
  return !orJoin; // AND: all passed → true. OR: none passed → false.
}

/**
 * evalTree(tree, getValue) → Promise<boolean>.
 *
 *   tree      { outerJoiner, groups }
 *   getValue  (condition) => value | Promise<value> — resolves a
 *             condition's subject (schema path / variable / field /
 *             selector) to the value applyOp compares against.
 *
 * Empty tree → true (no constraints). Group/outer joiners short-
 * circuit, so a failing var-free AND condition avoids resolving the
 * variable conditions after it.
 */
export async function evalTree(tree, getValue) {
  const groups = tree && tree.groups;
  if (!Array.isArray(groups) || groups.length === 0) return true;
  const orJoin = (tree.outerJoiner === 'OR');
  for (const g of groups) {
    const ok = await evalGroup(g, getValue);
    if (orJoin && ok) return true;
    if (!orJoin && !ok) return false;
  }
  return !orJoin;
}

/* Shared blank-tree + node factories so the rule UIs and the
   migration produce identical shapes. */
export function emptyTree() {
  return { outerJoiner: 'AND', groups: [] };
}
export function blankCondition(source = 'schema') {
  return { source, ref: '', op: 'contains', value: '', not: false };
}
export function blankGroup(source) {
  return { joiner: 'AND', conditions: [blankCondition(source)] };
}
