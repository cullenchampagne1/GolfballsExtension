import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Btn } from '../Btn.jsx';
import { IconBtn } from '../IconBtn.jsx';
import { SectionLabel } from '../SectionLabel.jsx';
import { Tag } from '../Tag.jsx';
import { Dropdown } from '../Dropdown.jsx';
import { SmartPopover } from '../SmartPopover.jsx';
import { I } from '../../icons.jsx';
import { contactSchema } from '../../../lib/page-schemas/contact.js';
import { listPaths } from '../../../lib/page-engine/resolve.js';

/* ───────────────────────────────────────────────────────────────
   AccountConditions — schema-driven gate rules for account-type
   templates. Replaces the legacy AccountRules (flat Solr field
   dropdown) with the page-engine schema browser the rest of the
   new resolution system uses.

   Each rule is:

     {
       id:    string,    // internal — React key, stripped on commit
       path:  string,    // engine path, e.g. "stats.orderCount"
       op:    string,    // canonical op id, e.g. "gte" / "before"
       value: string,    // user-entered value (string-typed)
       smart: object,    // optional SmartPopover options applied to
                         // `value` BEFORE evaluation. Lets fallback /
                         // transform / format / (future) code run on
                         // the comparison literal — same pipeline
                         // that resolves email-template variables.
     }

   Migration: legacy rows in the shape { field, op, val, num, unit }
   normalize on read — `field` becomes `path`, `val` becomes `value`,
   relative-date ops collapse `num`/`unit` into a compact value
   string (e.g. "30:days"). When a legacy op has no direct mapping,
   the row keeps its op id and the user will see it as an unknown
   string in the dropdown until they re-pick.
─────────────────────────────────────────────────────────────── */

/* ── Operator catalog ──────────────────────────────────────────
   Keyed by schema-leaf type. Each op has a canonical id (saved)
   and a display label (rendered). Ops are intentionally narrow —
   complex comparisons should grow into SmartPopover code options
   when we wire those up, not into a sprawling op list. */
const OPS_BY_TYPE = {
  string: [
    { id: 'eq',         label: 'equals' },
    { id: 'contains',   label: 'contains' },
    { id: 'startsWith', label: 'starts with' },
    { id: 'exists',     label: 'is set' },
    { id: 'notExists',  label: 'is not set' },
  ],
  number: [
    { id: 'eq',  label: '=' },
    { id: 'ne',  label: '≠' },
    { id: 'gt',  label: '>' },
    { id: 'gte', label: '≥' },
    { id: 'lt',  label: '<' },
    { id: 'lte', label: '≤' },
    { id: 'exists',    label: 'is set' },
    { id: 'notExists', label: 'is not set' },
  ],
  currency: [
    { id: 'eq',  label: '=' },
    { id: 'ne',  label: '≠' },
    { id: 'gt',  label: '>' },
    { id: 'gte', label: '≥' },
    { id: 'lt',  label: '<' },
    { id: 'lte', label: '≤' },
    { id: 'exists',    label: 'is set' },
    { id: 'notExists', label: 'is not set' },
  ],
  date: [
    { id: 'before',    label: 'before' },
    { id: 'after',     label: 'after' },
    { id: 'relBefore', label: 'more than… ago' },
    { id: 'relAfter',  label: 'within next…' },
    { id: 'exists',    label: 'is set' },
    { id: 'notExists', label: 'is not set' },
  ],
  bool: [
    { id: 'isTrue',  label: 'is true' },
    { id: 'isFalse', label: 'is false' },
  ],
  array: [
    { id: 'hasAny',  label: 'has any' },
    { id: 'hasNone', label: 'has none' },
    { id: 'countGt', label: 'count >' },
    { id: 'countLt', label: 'count <' },
  ],
};

/* Ops where the row carries NO user-entered value. The value cell
   collapses to a muted "no value needed" line (matches the design's
   bool treatment). exists / notExists are tri-state predicates that
   only need the path, not a comparison literal. */
const NO_VALUE_OPS = new Set(['exists', 'notExists', 'isTrue', 'isFalse']);

/* ── Type-driven visuals ───────────────────────────────────────
   Tag tone next to each leaf in the picker AND on the rule row.
   Same palette as the new design — keeps the visual link between
   "this is a date field" obvious across both surfaces. */
const TYPE_TONE = {
  string:   'neutral',
  number:   'brand',
  currency: 'success',
  date:     'warning',
  bool:     'info',
  array:    'neutral',
  object:   'neutral',
};
const TYPE_DOT = {
  string:   'var(--gb-text-tertiary)',
  number:   'var(--gb-brand-label)',
  currency: 'var(--gb-success-fg)',
  date:     'var(--gb-warning-fg)',
  bool:     'var(--gb-info-fg)',
  array:    'var(--gb-text-muted)',
  object:   'transparent',
};

/* ── Build schema picker nodes from the page-engine schema ────
   listPaths() walks the schema tree and returns leaves + folders;
   we keep folders so the picker can render the contact / account
   / stats / orders tree the user navigates instead of a flat
   89-row dropdown. */
const SCHEMA_NODES = (() => {
  const list = listPaths(contactSchema, /* sample data */ {});
  return list.map((n) => ({
    path:     n.path,
    label:    n.label || n.path,
    type:     n.type,
    isFolder: n.type === 'object' || n.type === 'array',
    depth:    n.path.split(/[.[]/).filter(Boolean).length - 1,
  }));
})();

/* Type lookup by path — keyed off the CANONICAL path
   (every array index normalized to [0]). Live row paths stay
   canonical; the per-row arraySelector + arrayIndex carry the
   user's choice separately. */
const TYPE_BY_PATH = Object.fromEntries(SCHEMA_NODES.map((n) => [n.path, n.type]));
const canonicalPath = (p) => (p || '').replace(/\[\d+\]/g, '[0]');
const typeForPath = (p) => TYPE_BY_PATH[canonicalPath(p)] || 'string';

/* Does the path traverse an array? (`orders[0].total` yes;
   `contact.firstName` no; `stats` no.) */
const pathHasArray = (p) => /\[\d+\]/.test(p || '');

/* ── Array selector ────────────────────────────────────────────
   When a row's path goes through an array (`orders[0].total`,
   `orders[0].number`, …), the user picks HOW to combine across
   items. Five modes:

     index   compare a single item at a fixed [N]    → IndexInput
     first   shorthand for index=0                    → no input
     last    the final item (engine resolves at eval) → no input
     any     true if ANY item matches the op          → no input
     none    true if NO item matches the op           → no input

   Stored on the row as { arraySelector, arrayIndex }. The path
   itself stays canonical (always [0]); the selector drives both
   the UI display and the future engine evaluation. */
export const ARRAY_SELECTORS = [
  { id: 'index', label: 'Index' },
  { id: 'first', label: 'First' },
  { id: 'last',  label: 'Last' },
  { id: 'any',   label: 'Any' },
  { id: 'none',  label: 'None' },
];

/* Render a path with the array slot replaced to reflect the
   current selector — used for the PathButton's display text. The
   canonical path keeps [0]; this swap is purely visual. */
function decoratePathDisplay(path, arraySelector, arrayIndex) {
  if (!pathHasArray(path)) return path || '';
  let replaced = false;
  return path.replace(/\[\d+\]/g, (whole) => {
    if (replaced) return whole;
    replaced = true;
    if (arraySelector === 'index') return `[${Math.max(0, Number(arrayIndex) || 0)}]`;
    if (arraySelector === 'first') return '[first]';
    if (arraySelector === 'last')  return '[last]';
    if (arraySelector === 'any')   return '[any]';
    if (arraySelector === 'none')  return '[none]';
    return whole;
  });
}

let _uidSeq = 0;
const uid = () => `cnd_${Date.now().toString(36)}_${(_uidSeq++).toString(36)}`;

/* ── Normalize legacy rows ────────────────────────────────────
   The pre-engine AccountRules emitted { field, op, val, num, unit }.
   Map onto the new shape so existing saved templates open without
   the user having to re-key conditions. Unknown op ids carry through
   verbatim — the dropdown will show "—" until the user re-picks,
   but the row isn't silently dropped. */
const LEGACY_OP_MAP = {
  eq:     'eq',
  ne:     'ne',
  gt:     'gt',
  gte:    'gte',
  lt:     'lt',
  lte:    'lte',
  is:     'eq',
  contains: 'contains',
  before:    'before',
  after:     'after',
  rel_before:'relBefore',
  rel_after: 'relAfter',
  exists:    'exists',
  not_exists:'notExists',
  before_today: 'before',
  after_today:  'after',
};
function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // Already in new shape — accept verbatim, just (re)stamp the id
  // and fill in array-selector defaults when the path traverses
  // an array but the saved row predates that field.
  if (raw.path) {
    const path = raw.path;
    const hasArr = pathHasArray(path);
    let arraySelector = raw.arraySelector;
    let arrayIndex    = raw.arrayIndex;
    if (hasArr) {
      /* Pull the first [N] off the path so a row saved before the
         selector existed (where the index lived IN the path
         literally) still surfaces with the right index pre-filled. */
      const m = path.match(/\[(\d+)\]/);
      if (arrayIndex == null && m) arrayIndex = Number(m[1]) || 0;
      if (!arraySelector) arraySelector = 'index';
    }
    return {
      id:    raw.id || uid(),
      path:  canonicalPath(path),
      op:    raw.op || '',
      value: raw.value != null ? String(raw.value) : '',
      smart: raw.smart || {},
      ...(hasArr ? { arraySelector, arrayIndex: arrayIndex ?? 0 } : {}),
    };
  }
  // Legacy shape — best-effort migration.
  const op = LEGACY_OP_MAP[raw.op] || raw.op || '';
  let value = raw.val != null ? String(raw.val) : '';
  if ((op === 'relBefore' || op === 'relAfter') && raw.num != null) {
    value = `${raw.num}:${raw.unit || 'days'}`;
  }
  return {
    id:    uid(),
    path:  raw.field || '',
    op,
    value,
    smart: raw.smart || {},
  };
}

/* Strip internal ids before emitting upstream. */
function exportRows(rows) {
  return rows.map(({ id, ...rest }) => rest); // eslint-disable-line no-unused-vars
}

/* ── effectiveRuleValue ────────────────────────────────────────
   Applies the rule's smart options to its literal value BEFORE
   the rule's evaluator hands it to the comparison. Exported for
   the future runtime evaluator so the same "smart-then-validate"
   order the email-template variable resolver uses also applies
   here — if smart.fallback fills the empty value, the rule should
   see the filled string, not the empty one.

   Pipeline order (matches variable-resolution.js's applySmart):
     1. fallback     → fill in when value is empty
     2. extract      → optional regex capture
     3. transform    → upper / lower / titleCase / etc.
     4. format       → number / currency / date / percent

   No regex / format helpers here yet — kept light until the
   runtime needs them. */
export function effectiveRuleValue(row) {
  if (!row) return '';
  let v = row.value == null ? '' : String(row.value);
  const smart = row.smart || {};
  if ((v === '' || v == null) && typeof smart.fallback === 'string' && smart.fallback.length) {
    v = smart.fallback;
  }
  if (smart.transform === 'upper')      v = v.toUpperCase();
  else if (smart.transform === 'lower') v = v.toLowerCase();
  else if (smart.transform === 'trim')  v = v.trim();
  return v;
}

export function AccountConditions({ initial, onChange }) {
  const [rows, setRows] = useState(() => {
    if (!Array.isArray(initial)) return [];
    return initial.map(normalizeRow).filter(Boolean);
  });

  /* When the user opens a different template, the parent feeds
     fresh `initial`. Re-normalize so we don't keep the prior
     template's rows stuck in state. */
  useEffect(() => {
    if (!Array.isArray(initial)) { setRows([]); return; }
    setRows(initial.map(normalizeRow).filter(Boolean));
  }, [initial]);

  const emit = (next) => {
    setRows(next);
    onChange?.(exportRows(next));
  };

  const addRule = () => {
    /* Default to the first leaf in the schema — contact.firstName
       in our contact schema. Empty path lands the user in an
       awkward "pick something" state; defaulting picks for them. */
    const firstLeaf = SCHEMA_NODES.find((n) => !n.isFolder);
    const path = firstLeaf?.path || '';
    const type = TYPE_BY_PATH[path] || 'string';
    const op   = OPS_BY_TYPE[type]?.[0]?.id || '';
    const arr  = pathHasArray(path)
      ? { arraySelector: 'index', arrayIndex: 0 }
      : {};
    emit([...rows, { id: uid(), path, op, value: '', smart: {}, ...arr }]);
  };
  const patchRule = (id, patch) => emit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id) => emit(rows.filter((r) => r.id !== id));

  return (
    <div>
      <SectionLabel
        action={
          <Btn variant="ghost" size="xs" icon={<I.plus />} onClick={addRule}>
            Add condition
          </Btn>
        }
      >
        Account conditions
      </SectionLabel>
      <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', marginTop: -4, marginBottom: 10, lineHeight: 1.5 }}>
        When every rule passes, this template auto-suggests on the account page. Same path picker as variables.
      </div>

      <AnimatePresence initial={false}>
        {rows.length === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            style={{
              padding: 14,
              border: '1px dashed var(--gb-border-default)',
              borderRadius: 'var(--gb-r-md)',
              textAlign: 'center',
              color: 'var(--gb-text-muted)',
              fontSize: 11.5,
              background: 'var(--gb-fill-subtle)',
            }}
          >
            No conditions — this template will appear for every account page.
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimatePresence initial={false}>
          {rows.map((row) => (
            /* Plain fade entry — no height clip, no overflow:
               hidden. Anything that needed clipping (the row's own
               background corner) is handled by the row's own
               border-radius. Importantly: NO overflow:hidden lets
               the path picker (position: absolute inside) extend
               past the row's box without being masked. The picker
               clip-bug the user reported was caused by an earlier
               height animation that wrapped this in overflow:
               hidden. */
            <motion.div
              key={row.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            >
              <RuleRow
                row={row}
                onPatch={(patch) => patchRule(row.id, patch)}
                onRemove={() => removeRule(row.id)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── RuleRow ────────────────────────────────────────────────────
   Top row:   [path button ▾] [op select] [value input] [smart] [trash]
   Sub-row:   [Array item: <selector ▾> <index # if Index>]
              — only rendered when the path traverses an array.

   The sub-row is its own AnimatePresence so it slides + fades in
   when the user picks an array path AND slides out when they pick
   a non-array path. Keeping the array controls on their own line
   gives the path button + value the full row width — which was
   the squish the user reported. The type tag on the left came out
   too: the row's path text already encodes the type (and the path
   picker shows a tag next to each leaf), so the dedicated column
   was redundant noise. */
function RuleRow({ row, onPatch, onRemove }) {
  const type = typeForPath(row.path);
  const ops  = OPS_BY_TYPE[type] || OPS_BY_TYPE.string;
  const opOptions = ops.map((o) => ({ id: o.id, label: o.label }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [smartCursor, setSmartCursor] = useState(null);
  const hasSmart = !!(row.smart && Object.keys(row.smart).length);
  const noValue  = NO_VALUE_OPS.has(row.op);
  const isArr    = pathHasArray(row.path);
  const arraySelector = row.arraySelector || 'index';
  const arrayIndex    = row.arrayIndex ?? 0;
  /* Path string the user actually sees on the button — canonical
     path with the [0] swapped for the live selector. The stored
     path stays canonical so the picker's match logic and the
     schema type lookup work uniformly across all selector modes. */
  const displayPath = decoratePathDisplay(row.path, arraySelector, arrayIndex);

  /* When the user picks a path whose type doesn't permit the
     current op, fall back to the first op for the new type so we
     never leave the row in a broken (path/op mismatch) state.
     Also seeds array-selector defaults when the new path traverses
     an array. */
  const onPickPath = (node) => {
    const nextType = node.type;
    const nextOps  = OPS_BY_TYPE[nextType] || OPS_BY_TYPE.string;
    const stillValid = nextOps.some((o) => o.id === row.op);
    const arrPatch = pathHasArray(node.path)
      ? { arraySelector: row.arraySelector || 'index', arrayIndex: row.arrayIndex ?? 0 }
      : { arraySelector: undefined, arrayIndex: undefined };
    onPatch({
      path:  canonicalPath(node.path),
      op:    stillValid ? row.op : (nextOps[0]?.id || ''),
      value: '', // dropping the old value avoids a number landing in a string field after the swap
      ...arrPatch,
    });
    setPickerOpen(false);
  };

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* ── Top row ──────────────────────────────────────────────
          Grid uses `minmax(0, …)` on the flexible columns so the
          path button can shrink BELOW its content's natural width
          — without that, a long path like
          `contact.account.creditApproved` would grow the column,
          push the op + value sideways, and overlap neighboring
          dropdowns. minmax(0, 2fr) for the path gives it twice the
          slack of the value column (so it stays readable), but the
          inner span's text-overflow:ellipsis kicks in once the
          column runs out of room. Layout no longer shifts when the
          user picks a longer / shorter path. */}
      <div
        style={{
          display: 'grid',
          /* Op dropdown trimmed to 100px and the value column promoted
             from 1fr to 1.4fr (so the path/value split goes from
             2:1 → ~1.4:1). Net effect: the value input gains the
             ~40px the op gave up PLUS a bigger share of free space,
             which is where users were running out of room to type
             longer comparison literals. Op labels are short enough
             ("contains", "is set", "≥", etc.) that 100px still fits
             everything except the date "more than… ago" line — the
             Dropdown gracefully truncates that one with an ellipsis. */
          gridTemplateColumns: 'minmax(0, 2fr) 100px minmax(0, 1.4fr) auto auto',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {/* width: '100%' so the button fills the grid column instead
            of sizing to its text content. Without this the column
            collapses to fit short paths ("orders") and stretches for
            long ones ("contact.account.creditApproved"), making the
            whole row's layout shift every time the user picks a new
            path. The text inside the button truncates with a right
            fade — see PathButton. */}
        <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
          <PathButton
            path={displayPath}
            type={type}
            open={pickerOpen}
            onClick={() => setPickerOpen((o) => !o)}
          />
          {pickerOpen && (
            <PathPickerPopover
              /* Canonical so the picker highlights the schema entry
                 the user originally chose, even when they've bumped
                 the array index or picked a non-index selector. */
              currentPath={canonicalPath(row.path)}
              onClose={() => setPickerOpen(false)}
              onSelect={onPickPath}
            />
          )}
        </div>

        {/* Op dropdown — the design-system Dropdown gives consistent
            chrome with the path button (font, border, focus ring,
            custom popover) instead of the native <select>. */}
        <Dropdown
          size="sm"
          value={row.op}
          options={opOptions}
          onChange={(id) => onPatch({ op: id })}
        />

        <RuleValueInput
          type={type}
          op={row.op}
          value={row.value}
          noValue={noValue}
          onChange={(v) => onPatch({ value: v })}
        />

        {/* Smart-options bolt — applies the same fallback / transform /
            format (and eventually code) pipeline the template variable
            resolver uses, BUT to the rule's literal value, so the
            comparison literal can resolve dynamically (e.g.
            "{{stats.orderCount}} > 10" comparing one path against
            another, or a code expression evaluating to a number). */}
        <IconBtn
          size="xs"
          variant={hasSmart ? 'tinted' : 'ghost'}
          status={hasSmart ? 'brand' : undefined}
          icon={<I.bolt />}
          tooltip={hasSmart ? 'Smart options set' : 'Add smart options'}
          disabled={noValue}
          onClick={(e) => setSmartCursor({ x: e.clientX, y: e.clientY })}
        />

        <IconBtn
          size="xs"
          variant="ghost"
          danger
          icon={<I.trash />}
          tooltip="Remove condition"
          onClick={onRemove}
        />
      </div>

      {/* ── Array-item sub-row ─────────────────────────────────
          Slides in when the row's path traverses an array; the
          IndexInput slides in next to the selector when Index is
          picked. Height-collapse is contained to THIS subtree so
          the path picker popover above (which can be tall) is
          never clipped. */}
      <AnimatePresence initial={false}>
        {isArr && (
          <motion.div
            key="arr-row"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingTop: 6,
                borderTop: '1px solid var(--gb-border-subtle)',
              }}
            >
              <span style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: 'var(--gb-text-muted)',
                flexShrink: 0,
              }}>
                Array item
              </span>
              <div style={{ width: 140, flexShrink: 0 }}>
                <Dropdown
                  size="sm"
                  value={arraySelector}
                  options={ARRAY_SELECTORS}
                  onChange={(id) => onPatch({ arraySelector: id })}
                />
              </div>
              <AnimatePresence initial={false}>
                {arraySelector === 'index' && (
                  <motion.div
                    key="idx"
                    initial={{ opacity: 0, width: 0, marginLeft: -8 }}
                    animate={{ opacity: 1, width: 60, marginLeft: 0 }}
                    exit={{ opacity: 0, width: 0, marginLeft: -8 }}
                    transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden', flexShrink: 0 }}
                  >
                    <IndexInput
                      value={arrayIndex}
                      onChange={(n) => onPatch({ arrayIndex: n })}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <span style={{
                fontSize: 10.5,
                color: 'var(--gb-text-muted)',
                flex: 1,
                textAlign: 'right',
              }}>
                {arrayHintText(arraySelector)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {smartCursor && (
          <SmartPopover
            key="smart"
            variable={{
              /* Faux variable record — SmartPopover only reads
                 `name` (for the title) and `smart` (initial state). */
              name: row.path || 'condition',
              smart: row.smart || {},
            }}
            cursor={smartCursor}
            onSave={(smart) => onPatch({ smart })}
            onClose={() => setSmartCursor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* Per-selector hint shown at the right of the array sub-row. Helps
   the user understand the aggregation without leaving the editor. */
function arrayHintText(selector) {
  if (selector === 'index') return 'compare one item at this index';
  if (selector === 'first') return 'compare the first item';
  if (selector === 'last')  return 'compare the most recent item';
  if (selector === 'any')   return 'pass if any item matches';
  if (selector === 'none')  return 'pass if no item matches';
  return '';
}

/* ── IndexInput ─────────────────────────────────────────────────
   Tiny numeric input rendered after the path button for each [N]
   in the row's path. Keeps a local draft so the user can clear
   the field and type a fresh number without React snapping it
   back to 0 mid-keystroke. Commits when the value parses to a
   non-negative integer. */
function IndexInput({ value, onChange }) {
  const [draft, setDraft] = useState(String(value ?? 0));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value ?? 0));
  }, [value]);
  return (
    <input
      type="number"
      min={0}
      step={1}
      value={draft}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => {
        focusedRef.current = false;
        const n = Math.max(0, Math.floor(Number(draft)));
        if (!Number.isFinite(n)) { setDraft(String(value ?? 0)); return; }
        setDraft(String(n));
        if (n !== value) onChange(n);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (v === '') return;
        const n = Number(v);
        if (Number.isFinite(n) && n >= 0 && n !== value) onChange(Math.floor(n));
      }}
      style={{
        width: 40,
        height: 28,
        padding: '0 4px',
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-sm)',
        color: 'var(--gb-text-primary)',
        fontFamily: 'var(--gb-font-mono)',
        fontSize: 11,
        fontWeight: 600,
        textAlign: 'center',
        outline: 'none',
        flexShrink: 0,
      }}
      title="Array index"
    />
  );
}

/* ── PathButton ─────────────────────────────────────────────────
   The custom dropdown trigger the user specifically liked from
   the design. Mono path text + type dot + rotating caret.

   width: '100%' so the button fills its grid cell — without that,
   the button sizes to its text and the column collapses for short
   paths, blowing the layout's consistency. The text span uses a
   right-side mask-image fade INSTEAD OF text-overflow: ellipsis
   so a too-long path softens off into the row's background rather
   than ending with a `…` glyph. The chevron stays sharp on the
   right because it's a separate sibling outside the masked span. */
function PathButton({ path, type, open, onClick }) {
  /* Mask fades the last 18px of the text into transparent. Falls
     back to a plain right-side cut on browsers without
     mask-image, which is fine — we ship Chrome only anyway. */
  const fadeMask = 'linear-gradient(to right, black calc(100% - 18px), transparent 100%)';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        height: 28,
        padding: '0 8px',
        background: open ? 'var(--gb-brand-tint-medium)' : 'var(--gb-surface-2)',
        border: '1px solid ' + (open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        borderRadius: 'var(--gb-r-sm)',
        color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-primary)',
        cursor: 'pointer',
        fontFamily: 'var(--gb-font-mono)',
        fontSize: 11.5,
        fontWeight: 600,
        textAlign: 'left',
        transition: 'background-color .15s, border-color .15s, color .15s',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 2,
        background: TYPE_DOT[type] || 'var(--gb-text-muted)',
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        WebkitMaskImage: fadeMask,
        maskImage: fadeMask,
      }}>{path || '— pick a field —'}</span>
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.18 }}
        style={{
          fontSize: 10,
          color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          fontFamily: 'var(--gb-font-mono)',
          display: 'inline-flex',
          flexShrink: 0,
        }}
      >
        ▾
      </motion.span>
    </button>
  );
}

/* ── PathPickerPopover ──────────────────────────────────────────
   Inline absolute-positioned tree browser (not portaled — anchors
   relative to the row's path button). Search input + arrow/enter
   keyboard nav. Auto-expands the ancestors of the currently
   selected path so the user lands on a useful row. */
function PathPickerPopover({ currentPath, onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => initialExpansion(currentPath));
  const [focusedIdx, setFocusedIdx] = useState(0);
  const searchRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    /* rAF so focus lands after layout settles. */
    const r = requestAnimationFrame(() => { try { searchRef.current?.focus(); } catch {} });
    return () => cancelAnimationFrame(r);
  }, []);

  /* Outside-click dismiss — checks both the popover AND the parent
     trigger position so a click on the trigger that toggles us
     closed doesn't immediately re-fire as "outside." */
  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
    /* mousedown (not click) so the trigger's onClick still wins
       when the user toggles the picker from the same button. */
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const rows = useMemo(() => filterAndProject(SCHEMA_NODES, search, expanded), [search, expanded]);
  useEffect(() => { setFocusedIdx(0); }, [search]);

  const toggleExpand = (path) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  /* Click semantics differ by node type:
       leaf       click → select (close picker, set row.path)
       object     click → expand (objects have no selectable state)
       array      click → select (array gets array-level ops);
                  chevron click → expand inline (drill into items)
     This is the only way to give the user BOTH "filter on the
     whole array" (hasAny / countGt) and "filter on a specific
     item field" (orders[0].total > 100) from one picker. */
  const pickRow = (r) => {
    if (r.type === 'array') onSelect(r);
    else if (r.isFolder) toggleExpand(r.path);
    else onSelect(r);
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = rows[focusedIdx];
      if (r) pickRow(r);
    } else if (e.key === 'ArrowRight') {
      /* Arrow-right expands the focused folder/array — Enter would
         select an array, so this gives keyboard users an explicit
         "drill into" gesture. */
      e.preventDefault();
      const r = rows[focusedIdx];
      if (r?.isFolder) toggleExpand(r.path);
    } else if (e.key === 'ArrowLeft') {
      /* Mirror: collapse the focused folder/array. No-op on leaves. */
      e.preventDefault();
      const r = rows[focusedIdx];
      if (r?.isFolder && expanded.has(r.path)) toggleExpand(r.path);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.34, 1.4, 0.64, 1] }}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        width: 380,
        zIndex: 30,
        background: 'var(--gb-surface-modal)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        boxShadow: 'var(--gb-shadow-popover, 0 12px 32px -8px rgba(0,0,0,0.45))',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        /* Visual scale-down per user request — the 380×~360 popover
           overwhelmed the rule row at the editor's form factor.
           transform:scale keeps interaction working at the smaller
           apparent size; top-left origin so the popover stays
           pinned under the trigger button. */
        transform: 'scale(0.75)',
        transformOrigin: 'top left',
      }}
    >
      <div style={{
        padding: '8px 10px',
        borderBottom: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--gb-surface-1)',
      }}>
        <I.search size={11} style={{ color: 'var(--gb-text-muted)' }} />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKey}
          placeholder="Filter schema · ↓↑ ↵"
          style={{
            flex: 1,
            height: 26,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 12,
            fontFamily: 'var(--gb-font-mono)',
            color: 'var(--gb-text-primary)',
          }}
        />
        <span style={{
          fontSize: 9.5, color: 'var(--gb-text-muted)',
          fontFamily: 'var(--gb-font-mono)',
        }}>{rows.length}</span>
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto', padding: '4px 6px 8px' }}>
        {rows.length === 0 ? (
          <div style={{
            padding: 18, textAlign: 'center',
            fontSize: 11, color: 'var(--gb-text-muted)',
          }}>
            No fields match
          </div>
        ) : rows.map((r, i) => (
          <PathPickerRow
            key={r.path}
            node={r}
            focused={i === focusedIdx}
            expanded={expanded.has(r.path)}
            isCurrent={r.path === currentPath}
            onMouseEnter={() => setFocusedIdx(i)}
            onClick={() => pickRow(r)}
            onToggleExpand={() => toggleExpand(r.path)}
          />
        ))}
      </div>
    </motion.div>
  );
}

/* Initial expansion set when the popover opens. If a current path
   is selected, walk its ancestors so the user lands on the row
   visible. Otherwise default to the top-level branches the user is
   most likely to want. */
function initialExpansion(currentPath) {
  const out = new Set();
  if (currentPath) {
    const parts = currentPath.split('.');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}.${parts[i]}` : parts[i];
      out.add(acc);
    }
    return out;
  }
  out.add('contact');
  out.add('stats');
  return out;
}

/* Filter the flat list by search query and apply the expanded
   set so collapsed branches' children stay hidden. When the user
   is searching we ignore expansion entirely — every match shows.

   Array semantics: listPaths emits an entry for the array path
   itself (e.g. `orders`) plus per-item paths anchored at `[0]`
   (e.g. `orders[0].number`). Item paths only ever have one [0]
   parent — the array — and there's no separate folder node for
   `orders[0]` for the user to expand. So when an ancestor key
   ends in `[N]`, we accept it as visible if EITHER the full key
   OR the base array name is in the expanded set. This way
   clicking `orders` reveals every `orders[0].*` field below. */
function filterAndProject(nodes, search, expanded) {
  const q = search.trim().toLowerCase();
  return nodes.filter((n) => {
    if (q) return n.path.toLowerCase().includes(q) || n.label.toLowerCase().includes(q);
    if (n.depth === 0) return true;
    const parts = n.path.split(/[.[]/).filter(Boolean);
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}.${parts[i]}` : parts[i];
      acc = acc.replace(/\.0\]$/, '[0]');
      if (expanded.has(acc)) continue;
      const baseKey = acc.replace(/\[\d+\]$/, '');
      if (baseKey !== acc && expanded.has(baseKey)) continue;
      return false;
    }
    return true;
  });
}

function PathPickerRow({ node, focused, expanded, isCurrent, onClick, onMouseEnter, onToggleExpand }) {
  const indent = node.depth * 12;
  /* Leaf labels show just the final path segment so the row reads
     "firstName" instead of "contact.firstName" — the path itself
     is already in the row's right-side tag and the indent shows
     hierarchy. Folder labels show the full path so users searching
     can tell "stats" from "contact.stats". */
  const leafLabel = node.path.split('.').slice(-1)[0].replace(/\[0\]/g, '');
  /* Arrays are SELECTABLE (array ops live on the array path itself
     — hasAny / countGt / etc.) so the row's chevron has its own
     click target. Clicking the chevron expands inline without
     picking; clicking anywhere else on the row selects the array
     and closes the picker. Objects don't have a selectable state,
     so for them the whole row expands and no separate chevron is
     needed (kept for visual consistency). */
  const showTag = !node.isFolder || node.type === 'array';
  return (
    <div
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      style={{
        display: 'grid',
        gridTemplateColumns: `${indent + 16}px 1fr auto 16px`,
        gap: 6,
        alignItems: 'center',
        width: '100%',
        padding: '4px 6px',
        background: focused
          ? 'var(--gb-brand-tint-medium)'
          : isCurrent
            ? 'var(--gb-brand-tint-soft)'
            : 'transparent',
        border: '1px solid ' + (focused
          ? 'var(--gb-brand-tint-border)'
          : isCurrent
            ? 'var(--gb-brand-tint-border)'
            : 'transparent'),
        borderRadius: 'var(--gb-r-sm)',
        color: 'var(--gb-text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        transition: 'background-color .12s, border-color .12s',
        userSelect: 'none',
      }}
    >
      <div style={{
        paddingLeft: indent,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}>
        {node.isFolder ? (
          /* Chevron with its own click target. stopPropagation
             so it doesn't bubble up to the row's onClick (which
             would select the array). For pure objects this is a
             redundant click (row click also expands) but keeps
             the visual + keyboard model uniform. */
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{
              width: 14, height: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 0,
              color: 'var(--gb-text-muted)',
              fontFamily: 'var(--gb-font-mono)',
              fontSize: 9,
            }}
          >
            <motion.span
              animate={{ rotate: expanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'inline-flex' }}
            >
              ▸
            </motion.span>
          </button>
        ) : (
          <span style={{
            width: 6, height: 6, borderRadius: 2,
            background: TYPE_DOT[node.type] || 'var(--gb-text-muted)',
            opacity: focused ? 1 : 0.7,
          }} />
        )}
      </div>
      <span style={{
        fontFamily: 'var(--gb-font-mono)',
        fontSize: 11.5,
        fontWeight: node.isFolder ? 700 : 500,
        color: focused
          ? 'var(--gb-brand-label)'
          : node.isFolder ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {node.isFolder ? node.path : leafLabel}
      </span>
      {showTag && (
        <Tag size="xs" tone={TYPE_TONE[node.type] || 'neutral'}>{node.type}</Tag>
      )}
      <div style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
        {isCurrent && <I.check size={10} strokeWidth={3} style={{ color: 'var(--gb-brand-label)' }} />}
      </div>
    </div>
  );
}

/* ── Value input ────────────────────────────────────────────────
   Type-aware input that switches its native control between
   text / number / date based on the path's schema type. Relative-
   date ops (`relBefore` / `relAfter`) split the value into a
   number + unit pair — the engine reads "30:days" / "2:weeks" /
   "1:months" at evaluation time. */
const UNIT_OPTIONS = [
  { id: 'days',   label: 'days' },
  { id: 'weeks',  label: 'weeks' },
  { id: 'months', label: 'months' },
  { id: 'years',  label: 'years' },
];

function RuleValueInput({ type, op, value, noValue, onChange }) {
  if (noValue) {
    return (
      <span style={{
        fontSize: 11, color: 'var(--gb-text-muted)',
        fontStyle: 'italic',
      }}>
        no value needed
      </span>
    );
  }

  if (op === 'relBefore' || op === 'relAfter') {
    /* Split "30:days" into the two inputs. The colon delimiter is
       internal; the engine + future evaluator know to parse it. */
    const [rawNum = '', rawUnit = 'days'] = String(value || '').split(':');
    const setBoth = (n, u) => onChange(`${n || ''}:${u || 'days'}`);
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="number"
          value={rawNum}
          onChange={(e) => setBoth(e.target.value, rawUnit)}
          placeholder="30"
          style={{ ...inputStyle, width: 60, fontFamily: 'var(--gb-font-mono)' }}
        />
        <select
          value={rawUnit}
          onChange={(e) => setBoth(rawNum, e.target.value)}
          style={{ ...inputStyle, paddingRight: 4, cursor: 'pointer', flex: 1 }}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (type === 'date') {
    return (
      <input
        type="date"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, fontFamily: 'var(--gb-font-mono)' }}
      />
    );
  }

  if (type === 'number' || type === 'currency') {
    return (
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        style={{ ...inputStyle, fontFamily: 'var(--gb-font-mono)' }}
      />
    );
  }

  return (
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="value or {{path}}"
      style={inputStyle}
    />
  );
}

const inputStyle = {
  height: 28,
  width: '100%',
  padding: '0 8px',
  background: 'var(--gb-surface-2)',
  border: '1px solid var(--gb-border-default)',
  borderRadius: 'var(--gb-r-sm)',
  color: 'var(--gb-text-primary)',
  fontFamily: 'var(--gb-font-sans)',
  fontSize: 11.5,
  outline: 'none',
  boxSizing: 'border-box',
};
