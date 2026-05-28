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
   (every array index normalized to [0]). Live row paths can carry
   a user-edited index (orders[2].total) so we normalize before
   looking up the schema type. */
const TYPE_BY_PATH = Object.fromEntries(SCHEMA_NODES.map((n) => [n.path, n.type]));
const canonicalPath = (p) => (p || '').replace(/\[\d+\]/g, '[0]');
const typeForPath = (p) => TYPE_BY_PATH[canonicalPath(p)] || 'string';

/* Find array-index positions in a path. Returns the path split
   into [text, idxNumber, text, idxNumber, …] so the UI can render
   editable inputs for the index positions. Single-array paths in
   the contact schema mean this usually has at most one index, but
   the helper handles N. */
function splitIndices(path) {
  if (!path) return [{ text: '' }];
  const parts = [];
  const re = /\[(\d+)\]/g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(path)) !== null) {
    parts.push({ text: path.slice(lastIdx, m.index) });
    parts.push({ index: Number(m[1]), at: m.index });
    lastIdx = m.index + m[0].length;
  }
  parts.push({ text: path.slice(lastIdx) });
  return parts;
}

/* Rewrite the Nth array-index in a path. Used when the user bumps
   the index on a `orders[0].total` row to e.g. `orders[3].total`. */
function setIndexAt(path, nthIndex, newValue) {
  let count = 0;
  return (path || '').replace(/\[(\d+)\]/g, (whole) => {
    if (count++ === nthIndex) return `[${Math.max(0, Number(newValue) || 0)}]`;
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
  // Already in new shape — accept verbatim, just (re)stamp the id.
  if (raw.path) {
    return {
      id:    raw.id || uid(),
      path:  raw.path,
      op:    raw.op || '',
      value: raw.value != null ? String(raw.value) : '',
      smart: raw.smart || {},
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
    emit([...rows, { id: uid(), path, op, value: '', smart: {} }]);
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
            /* No `layout` and no scale on the entry — those caused
               the row to nudge sideways during mount and made the
               op dropdown's open-state feel un-grounded. A plain
               fade is enough; the height-clip + the parent
               flex-gap handle the slide-in cleanly. */
            <motion.div
              key={row.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
              style={{ overflow: 'hidden' }}
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
   Grid: [type tag] [path button ▾] [op select] [value input]
         [smart bolt] [trash]. Path-button click toggles an inline
   PathPickerPopover anchored beneath it; the smart bolt opens the
   shared SmartPopover anchored to the cursor. */
function RuleRow({ row, onPatch, onRemove }) {
  const type = typeForPath(row.path);
  const ops  = OPS_BY_TYPE[type] || OPS_BY_TYPE.string;
  const opOptions = ops.map((o) => ({ id: o.id, label: o.label }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [smartCursor, setSmartCursor] = useState(null);
  const hasSmart = !!(row.smart && Object.keys(row.smart).length);
  const noValue  = NO_VALUE_OPS.has(row.op);
  /* Indices that the user can bump (one input per [N] in the
     path — usually 0 or 1 for the contact schema). */
  const indexSlots = useMemo(() => {
    const out = [];
    let count = 0;
    (row.path || '').replace(/\[(\d+)\]/g, (_, n) => {
      out.push({ value: Number(n), nth: count++ });
      return _;
    });
    return out;
  }, [row.path]);

  /* When the user picks a path whose type doesn't permit the
     current op, fall back to the first op for the new type so we
     never leave the row in a broken (path/op mismatch) state. */
  const onPickPath = (node) => {
    const nextType = node.type;
    const nextOps  = OPS_BY_TYPE[nextType] || OPS_BY_TYPE.string;
    const stillValid = nextOps.some((o) => o.id === row.op);
    onPatch({
      path:  node.path,
      op:    stillValid ? row.op : (nextOps[0]?.id || ''),
      value: '', // dropping the old value avoids a number landing in a string field after the swap
    });
    setPickerOpen(false);
  };

  const onIndexChange = (nth, newValue) => {
    onPatch({ path: setIndexAt(row.path, nth, newValue) });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr 130px 1fr auto auto',
        gap: 8,
        alignItems: 'center',
        padding: '8px 10px',
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-md)',
      }}
    >
      <Tag size="xs" tone={TYPE_TONE[type] || 'neutral'}>{type}</Tag>

      <div style={{ position: 'relative', display: 'flex', gap: 4, alignItems: 'center', minWidth: 0 }}>
        <PathButton
          path={row.path}
          type={type}
          open={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
        />
        {/* Per-index editable inputs, one per [N] in the path.
            Hides when the path has no array index. Each input bumps
            the matching index without re-opening the picker so the
            user can dial in "compare against the SECOND order"
            without re-walking the schema tree. */}
        {indexSlots.map((slot) => (
          <IndexInput
            key={slot.nth}
            value={slot.value}
            onChange={(v) => onIndexChange(slot.nth, v)}
          />
        ))}
        {pickerOpen && (
          <PathPickerPopover
            /* Canonical (all [N] → [0]) so the picker can highlight
               the schema entry the user originally chose, even
               when they've bumped the array index. */
            currentPath={canonicalPath(row.path)}
            onClose={() => setPickerOpen(false)}
            onSelect={onPickPath}
          />
        )}
      </div>

      {/* Op dropdown — the design-system Dropdown gives consistent
          chrome with everything else (font, border, focus ring,
          custom popover) instead of the native <select> that
          looked out of place. */}
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
   the design. Mono path text + type dot + rotating caret. */
function PathButton({ path, type, open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
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
        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{path || '— pick a field —'}</span>
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.18 }}
        style={{
          fontSize: 10,
          color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
          fontFamily: 'var(--gb-font-mono)',
          display: 'inline-flex',
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
