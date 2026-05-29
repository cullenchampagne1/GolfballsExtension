import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FloatingPanel, ModalHeader, Btn, Input, IconBtn, Tag, I, Dropdown, DatePicker,
} from '../ui/index.js';
import { useToast } from '../ui/components/ToastHost.jsx';
import { useDevSetting } from '../lib/devSettings.js';

/* ── Saved-queries storage ───────────────────────────────────────
   Mirrors the legacy content/crm-query-builder.js storage at
   `chrome.storage.local.crmSavedQueries`. Outside an extension
   context (playground, dev) we transparently fall back to
   localStorage under the same key. */
const QB_STORAGE_KEY = 'crmSavedQueries';
const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; } catch { return false; }
};

async function loadSavedQueries() {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(QB_STORAGE_KEY, (data) => {
        resolve(Array.isArray(data?.[QB_STORAGE_KEY]) ? data[QB_STORAGE_KEY] : []);
      });
    });
  }
  try {
    const raw = localStorage.getItem(QB_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
async function persistSavedQueries(list) {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [QB_STORAGE_KEY]: list }, resolve);
    });
  }
  try { localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(list)); } catch {}
}

/* Quick-preset user layer over the built-in QUICK_PRESETS:
     custom  — saved queries the rep promoted to one-click presets
     hidden  — built-in preset ids the rep removed
   Persisted separately so the built-ins stay code-defined. */
const QB_PRESETS_KEY = 'crmQuickPresets';
const emptyPresetLayer = () => ({ custom: [], hidden: [] });
function normalizePresetLayer(v) {
  return (v && typeof v === 'object')
    ? { custom: Array.isArray(v.custom) ? v.custom : [], hidden: Array.isArray(v.hidden) ? v.hidden : [] }
    : emptyPresetLayer();
}
async function loadQuickPresets() {
  if (hasChromeStorage()) {
    return new Promise((resolve) => {
      chrome.storage.local.get(QB_PRESETS_KEY, (data) => resolve(normalizePresetLayer(data?.[QB_PRESETS_KEY])));
    });
  }
  try {
    const raw = localStorage.getItem(QB_PRESETS_KEY);
    return normalizePresetLayer(raw ? JSON.parse(raw) : null);
  } catch { return emptyPresetLayer(); }
}
async function persistQuickPresets(layer) {
  if (hasChromeStorage()) {
    return new Promise((resolve) => { chrome.storage.local.set({ [QB_PRESETS_KEY]: layer }, resolve); });
  }
  try { localStorage.setItem(QB_PRESETS_KEY, JSON.stringify(layer)); } catch {}
}

/* ───────────────────────────────────────────────────────────────
   QueryBuilder — group-based redesign.

   Surface:
     • per-condition NOT toggle
     • per-condition duplicate + reorder
     • condition groups joined by AND or OR INSIDE the group
     • outer joiner (AND or OR) BETWEEN groups
     • quick presets sidebar (4 pre-baked starting points)
     • saved queries sidebar (round-trips through crmSavedQueries)
     • live preview row with human label, compiled fq, copy buttons,
       and a brand pulse on every edit

   State shape kept on the panel:
     {
       outerJoiner: 'AND' | 'OR',
       groups: [
         {
           id, joiner: 'AND' | 'OR',
           conditions: [
             { id, fieldKey, op, val, val2, num, unit, not },
             ...
           ],
         },
         ...
       ],
     }

   Back-compat — CRMSearch's filter bar still consumes the flat
   exports `compileToSolr` / `compileToLabel` / `describeCondition`
   over a flat conditions list. On Apply, we ship the rich `state`
   AND a flattened `conditions` array. Re-opening with the flat
   array (no state) collapses to a single AND-joined group; the
   rich state survives a round trip when callers pass it back via
   `initialState`.

   QB_FIELDS is the locked column list — same set CRMSearch's table
   exposes. Each field carries a `category` for the picker grouping
   and the in-row category chip. ─────────────────────────────────── */

export const QB_FIELDS = [
  { key: 'recordType_s',        label: 'Record Type',        type: 'enum',  category: 'Identity', options: ['Contact', 'Account'] },
  { key: 'salesRep_s',          label: 'Sales Rep',          type: 'text',  category: 'Identity' },
  { key: 'salesRepID_s',        label: 'Sales Rep ID',       type: 'text',  category: 'Identity' },
  { key: 'role_s',              label: 'Role',               type: 'enum',  category: 'Identity', options: ['BDR', 'AE', 'CSM', 'SE', 'Manager'] },
  { key: 'podID_i',             label: 'Pod ID',             type: 'int',   category: 'Identity' },
  { key: 'contactName_t',       label: 'Contact Name',       type: 'text',  category: 'Identity' },
  { key: 'accountName_t',       label: 'Account Name',       type: 'text',  category: 'Identity' },
  { key: 'accountID_s',         label: 'Account ID',         type: 'text',  category: 'Identity' },
  { key: 'emails_tps',          label: 'Email',              type: 'text',  category: 'Contact'  },
  { key: 'phones_ss',           label: 'Phone',              type: 'text',  category: 'Contact'  },
  { key: 'orderCount_i',        label: 'Order Count',        type: 'int',   category: 'Activity' },
  { key: 'lastOrderDate_dt',    label: 'Last Order Date',    type: 'date',  category: 'Activity' },
  { key: 'nextTaskDate_dt',     label: 'Next Task Date',     type: 'date',  category: 'Activity' },
  { key: 'priorYearRevenue_f',  label: 'Prior Year Revenue', type: 'float', category: 'Revenue'  },
  { key: 'yearToDateRevenue_f', label: 'YTD Revenue',        type: 'float', category: 'Revenue'  },
];

const CATEGORY_TONE = {
  Identity: 'neutral',
  Contact:  'brand',
  Activity: 'warning',
  Revenue:  'success',
};

export const QB_OPS = {
  text:  [
    { id: 'is',         label: 'is (exact)'  },
    { id: 'contains',   label: 'contains'    },
    { id: 'starts',     label: 'starts with' },
    { id: 'exists',     label: 'is set'      },
    { id: 'not_exists', label: 'is not set'  },
  ],
  enum:  [
    { id: 'is',         label: 'is'      },
    { id: 'is_not',     label: 'is not'  },
  ],
  int:   [
    { id: 'eq',         label: '=' },
    { id: 'ne',         label: '≠' },
    { id: 'gt',         label: '>' },
    { id: 'gte',        label: '≥' },
    { id: 'lt',         label: '<' },
    { id: 'lte',        label: '≤' },
    { id: 'between',    label: 'between'    },
    { id: 'exists',     label: 'is set'     },
    { id: 'not_exists', label: 'is not set' },
  ],
  float: [
    { id: 'eq',         label: '=' },
    { id: 'gt',         label: '>' },
    { id: 'gte',        label: '≥' },
    { id: 'lt',         label: '<' },
    { id: 'lte',        label: '≤' },
    { id: 'between',    label: 'between'    },
    { id: 'exists',     label: 'is set'     },
    { id: 'not_exists', label: 'is not set' },
  ],
  date:  [
    { id: 'rel_past',     label: 'more than … ago'  },
    { id: 'rel_recent',   label: 'less than … ago'  },
    { id: 'rel_future',   label: 'within next …'    },
    { id: 'before',       label: 'before date'      },
    { id: 'after',        label: 'after date'       },
    { id: 'after_today',  label: 'after today'      },
    { id: 'before_today', label: 'before today'     },
    { id: 'exists',       label: 'is set'           },
    { id: 'not_exists',   label: 'is not set'       },
  ],
};

const QB_UNITS      = ['days', 'weeks', 'months', 'years'];
const QB_UNIT_SOLR  = { days: 'DAY', weeks: 'WEEK', months: 'MONTH', years: 'YEAR' };
const VALUELESS     = new Set(['exists', 'not_exists', 'after_today', 'before_today']);

/* Client-local id counter so every row carries a stable React key
   even when the user duplicates / reorders frequently. */
let _nextId = 1;
const uid = () => ++_nextId;

const newCondition = () => {
  const field = QB_FIELDS[0];
  return {
    id: uid(),
    fieldKey: field.key,
    op: 'is',
    val: field.type === 'enum' ? (field.options[0] ?? '') : '',
    val2: '', num: '1', unit: 'years', not: false,
  };
};
const newGroup = () => ({ id: uid(), joiner: 'AND', conditions: [newCondition()] });

/* ── Solr compilation — verbatim semantics from the legacy
   crm-query-builder.js + new `not` wrapper. */
function qbQuote(v) { return v.includes(' ') ? `"${v}"` : v; }

function conditionToSolr(field, c) {
  const k = field.key;
  const v = (c.val || '').trim();
  const v2 = (c.val2 || '').trim();
  const n = c.num || '1';
  const u = QB_UNIT_SOLR[c.unit] || 'YEAR';
  let out = null;
  switch (c.op) {
    case 'is':           out = v ? `${k}:${qbQuote(v)}` : null; break;
    case 'contains':     out = v ? `${k}:*${v}*` : null; break;
    case 'starts':       out = v ? `${k}:${v}*` : null; break;
    case 'is_not':       out = v ? `-${k}:${qbQuote(v)}` : null; break;
    case 'exists':       out = `${k}:[* TO *]`; break;
    case 'not_exists':   out = `-${k}:[* TO *]`; break;
    case 'eq':           out = v ? `${k}:${v}` : null; break;
    case 'ne':           out = v ? `-${k}:${v}` : null; break;
    case 'gt':           out = v ? `${k}:{${v} TO *}` : null; break;
    case 'gte':          out = v ? `${k}:[${v} TO *]` : null; break;
    case 'lt':           out = v ? `${k}:{* TO ${v}}` : null; break;
    case 'lte':          out = v ? `${k}:[* TO ${v}]` : null; break;
    case 'between':      out = (v && v2) ? `${k}:[${v} TO ${v2}]` : null; break;
    case 'rel_past':     out = `${k}:[* TO NOW-${n}${u}]`; break;
    case 'rel_recent':   out = `${k}:[NOW-${n}${u} TO NOW]`; break;
    case 'rel_future':   out = `${k}:[NOW TO NOW%2B${n}${u}]`; break;
    case 'after_today':  out = `${k}:[NOW TO *]`; break;
    case 'before_today': out = `${k}:[* TO NOW]`; break;
    case 'before':       out = v ? `${k}:[* TO ${v}T00:00:00Z]` : null; break;
    case 'after':        out = v ? `${k}:[${v}T00:00:00Z TO *]` : null; break;
    default:             out = null;
  }
  if (!out) return null;
  /* NOT wraps the whole condition. For ops that already emit a
     leading `-` (is_not / ne / not_exists) the toggle becomes a
     double-negative, which we collapse rather than emitting
     `-(-foo)` and forcing Solr to parse it back out. */
  if (c.not) {
    if (out.startsWith('-')) return out.slice(1);
    return `-(${out})`;
  }
  return out;
}

function conditionToLabel(field, c) {
  const fl = field.label;
  const v = (c.val || '').trim();
  const v2 = (c.val2 || '').trim();
  const n = c.num || '1';
  const u = c.unit || 'years';
  let label = null;
  switch (c.op) {
    case 'is':            label = v ? `${fl} is ${v}` : null; break;
    case 'contains':      label = v ? `${fl} contains "${v}"` : null; break;
    case 'starts':        label = v ? `${fl} starts with "${v}"` : null; break;
    case 'is_not':        label = v ? `${fl} is not ${v}` : null; break;
    case 'exists':        label = `${fl} is set`; break;
    case 'not_exists':    label = `${fl} is not set`; break;
    case 'eq':            label = v ? `${fl} = ${v}`  : null; break;
    case 'ne':            label = v ? `${fl} ≠ ${v}`  : null; break;
    case 'gt':            label = v ? `${fl} > ${v}`  : null; break;
    case 'gte':           label = v ? `${fl} ≥ ${v}`  : null; break;
    case 'lt':            label = v ? `${fl} < ${v}`  : null; break;
    case 'lte':           label = v ? `${fl} ≤ ${v}`  : null; break;
    case 'between':       label = (v && v2) ? `${fl} between ${v} and ${v2}` : null; break;
    case 'rel_past':      label = `${fl} more than ${n} ${u} ago`; break;
    case 'rel_recent':    label = `${fl} less than ${n} ${u} ago`; break;
    case 'rel_future':    label = `${fl} within next ${n} ${u}`; break;
    case 'after_today':   label = `${fl} after today`; break;
    case 'before_today':  label = `${fl} before today`; break;
    case 'before':        label = v ? `${fl} before ${v}` : null; break;
    case 'after':         label = v ? `${fl} after ${v}`  : null; break;
    default:              label = null;
  }
  if (label && c.not) return `NOT (${label})`;
  return label;
}

/* ── Flat-conditions back-compat exports — CRMSearch's filter bar
   keeps using these to render per-tag removal. They still treat
   the input as an AND-joined list, which is what the legacy modal
   produced. */
export function compileToSolr(conditions) {
  return conditions.map((c) => {
    const field = QB_FIELDS.find((f) => f.key === c.fieldKey);
    return field ? conditionToSolr(field, c) : null;
  }).filter(Boolean).join(' AND ');
}
export function compileToLabel(conditions) {
  const parts = conditions.map((c) => {
    const field = QB_FIELDS.find((f) => f.key === c.fieldKey);
    return field ? conditionToLabel(field, c) : null;
  }).filter(Boolean);
  return parts.join(' · ');
}
export function describeCondition(c) {
  const field = QB_FIELDS.find((f) => f.key === c.fieldKey);
  if (!field) return null;
  return conditionToLabel(field, c);
}

/* ── Group-aware compilers used inside the modal. */
function compileGroup(group) {
  const parts = group.conditions.map((c) => {
    const f = QB_FIELDS.find((ff) => ff.key === c.fieldKey);
    return f ? conditionToSolr(f, c) : null;
  }).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${group.joiner} `)})`;
}
function compileGroupsToSolr(groups, outerJoiner) {
  const parts = groups.map(compileGroup).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.join(` ${outerJoiner} `);
}
function compileGroupLabel(group) {
  const parts = group.conditions.map((c) => {
    const f = QB_FIELDS.find((ff) => ff.key === c.fieldKey);
    return f ? conditionToLabel(f, c) : null;
  }).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `(${parts.join(` ${group.joiner} `)})`;
}
function compileGroupsToLabel(groups, outerJoiner) {
  const parts = groups.map(compileGroupLabel).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.join(` ${outerJoiner} `);
}

/* ── Quick presets — pre-baked starting points the rep can load
   with one click. Each builder returns a fresh state shape. */
const QUICK_PRESETS = [
  {
    id: 'vip',
    name: 'VIP accounts',
    desc: 'High-revenue, frequent reorderers',
    build: () => ({
      outerJoiner: 'AND',
      groups: [{
        id: uid(), joiner: 'AND',
        conditions: [
          { ...newCondition(), fieldKey: 'orderCount_i',        op: 'gte', val: '12' },
          { ...newCondition(), fieldKey: 'yearToDateRevenue_f', op: 'gte', val: '10000' },
        ],
      }],
    }),
  },
  {
    id: 'stale',
    name: 'Stale leads',
    desc: 'No order in 90 days, no task pending',
    build: () => ({
      outerJoiner: 'AND',
      groups: [{
        id: uid(), joiner: 'AND',
        conditions: [
          { ...newCondition(), fieldKey: 'lastOrderDate_dt', op: 'rel_past', num: '90', unit: 'days' },
          { ...newCondition(), fieldKey: 'nextTaskDate_dt',  op: 'not_exists' },
        ],
      }],
    }),
  },
  {
    id: 'recent',
    name: 'Recent reorder',
    desc: 'Last order in the past 30 days',
    build: () => ({
      outerJoiner: 'AND',
      groups: [{
        id: uid(), joiner: 'AND',
        conditions: [
          { ...newCondition(), fieldKey: 'lastOrderDate_dt', op: 'after_today' },
        ],
      }],
    }),
  },
  {
    id: 'tour',
    name: 'Tournament prospects',
    desc: 'AEs or BDRs with no recent contact',
    build: () => ({
      outerJoiner: 'AND',
      groups: [
        {
          id: uid(), joiner: 'OR',
          conditions: [
            { ...newCondition(), fieldKey: 'role_s', op: 'is', val: 'AE' },
            { ...newCondition(), fieldKey: 'role_s', op: 'is', val: 'BDR' },
          ],
        },
        {
          id: uid(), joiner: 'AND',
          conditions: [
            { ...newCondition(), fieldKey: 'lastOrderDate_dt', op: 'rel_past', num: '60', unit: 'days' },
          ],
        },
      ],
    }),
  },
];

/* Build the panel's initial state from props:
   - initialState (group shape) takes priority — round-trips a
     previously-saved rich query.
   - initialConditions (flat) falls back to a single AND group.
   - empty starts with one default-field condition. */
function buildInitial({ initialState, initialConditions }) {
  if (initialState?.groups?.length) {
    return {
      outerJoiner: initialState.outerJoiner || 'AND',
      groups: initialState.groups.map((g) => ({
        id: uid(),
        joiner: g.joiner || 'AND',
        conditions: (g.conditions || []).map((c) => ({ ...c, id: uid() })),
      })),
    };
  }
  if (Array.isArray(initialConditions) && initialConditions.length) {
    return {
      outerJoiner: 'AND',
      groups: [{
        id: uid(), joiner: 'AND',
        conditions: initialConditions.map((c) => ({ ...c, id: uid() })),
      }],
    };
  }
  return { outerJoiner: 'AND', groups: [newGroup()] };
}

/* Flatten a group structure into the legacy single-conditions
   array CRMSearch's filter bar expects. The flattened list loses
   group/joiner structure — re-importing it produces a single AND
   group, which is the correct degradation when a user trims a tag
   from CRMSearch. */
function flattenGroups(groups) {
  const out = [];
  for (const g of groups) {
    for (const c of g.conditions) {
      // Strip the runtime id; CRMSearch keeps its own per-tag key.
      const { id: _id, ...rest } = c;
      out.push(rest);
    }
  }
  return out;
}

/* ── Component ─────────────────────────────────────────────── */
export function QueryBuilder({ onClosed, bindClose, initialConditions = [], initialState, onApply }) {
  const draggable = useDevSetting('crmSearch.draggable') ?? false;
  const toast = useToast();

  const [{ outerJoiner, groups }, setBuilder] = useState(() =>
    buildInitial({ initialState, initialConditions }));
  const [savedQueries, setSavedQueries] = useState([]);
  const [presetLayer, setPresetLayer] = useState(emptyPresetLayer);
  const [saveName, setSaveName] = useState('');
  /* Pulse counter — re-keys the preview row's fq box so the
     animation restarts on every edit. Cheap visual cue that the
     query actually changed. */
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    let alive = true;
    loadSavedQueries().then((list) => { if (alive) setSavedQueries(list); });
    loadQuickPresets().then((layer) => { if (alive) setPresetLayer(layer); });
    return () => { alive = false; };
  }, []);

  /* Built-in presets the rep hasn't removed, then their promoted ones. */
  const visiblePresets = useMemo(() => [
    ...QUICK_PRESETS.filter((p) => !presetLayer.hidden.includes(p.id)),
    ...presetLayer.custom,
  ], [presetLayer]);

  const bindCloseRef = useRef(null);
  const handleBindClose = useCallback((fn) => {
    bindCloseRef.current = fn;
    bindClose?.(fn);
  }, [bindClose]);

  const solrFq = useMemo(() => compileGroupsToSolr(groups, outerJoiner), [groups, outerJoiner]);
  const label  = useMemo(() => compileGroupsToLabel(groups, outerJoiner), [groups, outerJoiner]);
  const canApply = solrFq.length > 0;
  const conditionCount = groups.reduce((n, g) => n + g.conditions.length, 0);

  useEffect(() => { setPulseKey((k) => k + 1); }, [solrFq]);

  /* ── Mutators ── */
  const patchCondition = (gid, cid, patch) => {
    setBuilder((s) => ({
      ...s,
      groups: s.groups.map((g) => g.id !== gid ? g : {
        ...g,
        conditions: g.conditions.map((c) => c.id === cid ? { ...c, ...patch } : c),
      }),
    }));
  };
  const removeCondition = (gid, cid) => {
    setBuilder((s) => {
      const next = s.groups.map((g) => g.id !== gid ? g : {
        ...g,
        conditions: g.conditions.filter((c) => c.id !== cid),
      });
      const filtered = next.filter((g) => g.conditions.length > 0);
      return { ...s, groups: filtered.length === 0 ? [newGroup()] : filtered };
    });
  };
  const duplicateCondition = (gid, cid) => {
    setBuilder((s) => ({
      ...s,
      groups: s.groups.map((g) => g.id !== gid ? g : {
        ...g,
        conditions: g.conditions.flatMap((c) => c.id === cid
          ? [c, { ...c, id: uid() }]
          : [c]),
      }),
    }));
  };
  const moveCondition = (gid, cid, dir) => {
    setBuilder((s) => ({
      ...s,
      groups: s.groups.map((g) => {
        if (g.id !== gid) return g;
        const idx = g.conditions.findIndex((c) => c.id === cid);
        const next = idx + dir;
        if (idx < 0 || next < 0 || next >= g.conditions.length) return g;
        const arr = g.conditions.slice();
        [arr[idx], arr[next]] = [arr[next], arr[idx]];
        return { ...g, conditions: arr };
      }),
    }));
  };
  const addCondition = (gid) => {
    setBuilder((s) => ({
      ...s,
      groups: s.groups.map((g) => g.id !== gid ? g : {
        ...g, conditions: [...g.conditions, newCondition()],
      }),
    }));
  };
  const setGroupJoiner = (gid, joiner) => {
    setBuilder((s) => ({
      ...s,
      groups: s.groups.map((g) => g.id === gid ? { ...g, joiner } : g),
    }));
  };
  const removeGroup = (gid) => {
    setBuilder((s) => s.groups.length <= 1
      ? s
      : { ...s, groups: s.groups.filter((g) => g.id !== gid) });
  };
  const addGroup = () => setBuilder((s) => ({ ...s, groups: [...s.groups, newGroup()] }));
  const setOuterJoiner = (joiner) => setBuilder((s) => ({ ...s, outerJoiner: joiner }));

  const loadFromState = (st) => {
    setBuilder({
      outerJoiner: st.outerJoiner || 'AND',
      groups: (st.groups || [newGroup()]).map((g) => ({
        id: uid(),
        joiner: g.joiner || 'AND',
        conditions: (g.conditions || []).map((c) => ({ ...c, id: uid() })),
      })),
    });
  };
  const handleClear = () => setBuilder({ outerJoiner: 'AND', groups: [newGroup()] });

  /* ── Apply / save / load ── */
  const handleApply = () => {
    if (!canApply) return;
    const flat = flattenGroups(groups);
    const payload = {
      label,
      solrFq,
      conditions: flat,
      /* Rich state for round-tripping; CRMSearch can stash this
         and pass it back via initialState on the next open. */
      state: {
        outerJoiner,
        groups: groups.map((g) => ({
          joiner: g.joiner,
          conditions: g.conditions.map(({ id: _id, ...rest }) => rest),
        })),
      },
    };
    if (typeof onApply === 'function') {
      onApply(payload);
    } else {
      toast?.info?.(`Query ready: ${solrFq}`, { duration: 4500, placement: 'top-center' });
    }
    bindCloseRef.current?.();
  };

  const handleCopy = async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      toast?.success?.(`${label} copied`, { duration: 1800 });
    } catch (err) {
      toast?.warning?.(`Couldn't copy: ${err?.message || 'clipboard blocked'}`, { duration: 3200 });
    }
  };

  const canSave = !!saveName.trim() && canApply;
  const handleSave = async () => {
    if (!canSave) return;
    const name = saveName.trim();
    const entry = {
      id: Date.now().toString(36),
      name,
      query: solrFq,
      conditions: flattenGroups(groups),
      state: {
        outerJoiner,
        groups: groups.map((g) => ({
          joiner: g.joiner,
          conditions: g.conditions.map(({ id: _id, ...rest }) => rest),
        })),
      },
      savedAt: Date.now(),
    };
    const updated = [entry, ...savedQueries.filter((q) => q.name !== name)];
    setSavedQueries(updated);
    await persistSavedQueries(updated);
    setSaveName('');
    toast?.success?.(`Saved "${name}"`, { duration: 1800 });
  };
  const handleLoadSaved = (q) => {
    if (q?.state?.groups?.length) {
      loadFromState(q.state);
    } else if (Array.isArray(q?.conditions) && q.conditions.length) {
      loadFromState({
        outerJoiner: 'AND',
        groups: [{ id: uid(), joiner: 'AND', conditions: q.conditions }],
      });
    }
  };
  const handleDeleteSaved = async (id) => {
    const updated = savedQueries.filter((q) => q.id !== id);
    setSavedQueries(updated);
    await persistSavedQueries(updated);
  };

  /* Load a quick preset — built-ins build fresh state, promoted ones
     carry a stored state (like a saved query). */
  const handleLoadPreset = (p) => loadFromState(p.build ? p.build() : (p.state || { outerJoiner: 'AND', groups: [newGroup()] }));

  /* Promote a saved query into the quick presets. */
  const handlePromotePreset = async (q) => {
    if (presetLayer.custom.some((p) => p.name === q.name)) {
      toast?.info?.(`"${q.name}" is already a quick preset`, { duration: 1800 });
      return;
    }
    const preset = {
      id: `qp-${Date.now().toString(36)}`,
      name: q.name,
      desc: 'Saved query',
      state: q.state || { outerJoiner: 'AND', groups: [{ joiner: 'AND', conditions: q.conditions || [] }] },
      custom: true,
    };
    const next = { ...presetLayer, custom: [preset, ...presetLayer.custom] };
    setPresetLayer(next);
    await persistQuickPresets(next);
    toast?.success?.(`Pinned "${q.name}" to quick presets`, { duration: 1800 });
  };

  /* Remove a quick preset — built-ins are hidden (recoverable in code),
     promoted ones are dropped from the custom list. */
  const handleDeletePreset = async (p) => {
    const isBuiltin = QUICK_PRESETS.some((b) => b.id === p.id);
    const next = isBuiltin
      ? { ...presetLayer, hidden: [...new Set([...presetLayer.hidden, p.id])] }
      : { ...presetLayer, custom: presetLayer.custom.filter((c) => c.id !== p.id) };
    setPresetLayer(next);
    await persistQuickPresets(next);
  };

  return (
    <FloatingPanel
      width={1080}
      height={620}
      backdrop
      draggable={draggable}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<FunnelIcon size={14} />}
        title="Query Builder"
        subtitle={`Filter CRM contacts and accounts · ${QB_FIELDS.length} queryable fields · Solr fq output`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CountChip>{conditionCount} CONDITION{conditionCount === 1 ? '' : 'S'}</CountChip>
            <CountChip>{groups.length} GROUP{groups.length === 1 ? '' : 'S'}</CountChip>
          </div>
        }
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          presets={visiblePresets}
          saved={savedQueries}
          onLoadPreset={handleLoadPreset}
          onDeletePreset={handleDeletePreset}
          onLoadSaved={handleLoadSaved}
          onDeleteSaved={handleDeleteSaved}
          onPromoteSaved={handlePromotePreset}
        />

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Groups area — scrolls when there are many groups. */}
          <div style={{
            flex: 1, minHeight: 0,
            overflow: 'auto',
            padding: '16px 18px 12px',
            background: 'var(--gb-surface-canvas)',
          }}>
            <AnimatePresence initial={false}>
              {groups.map((g, i) => (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
                >
                  <GroupCard
                    group={g}
                    index={i}
                    onPatchCondition={(cid, patch) => patchCondition(g.id, cid, patch)}
                    onRemoveCondition={(cid) => removeCondition(g.id, cid)}
                    onDuplicateCondition={(cid) => duplicateCondition(g.id, cid)}
                    onMoveCondition={(cid, dir) => moveCondition(g.id, cid, dir)}
                    onAddCondition={() => addCondition(g.id)}
                    onJoinerChange={(j) => setGroupJoiner(g.id, j)}
                    canRemove={groups.length > 1}
                    onRemoveGroup={() => removeGroup(g.id)}
                  />
                  {i < groups.length - 1 && (
                    <JoinerDivider
                      value={outerJoiner}
                      onChange={setOuterJoiner}
                      label="GROUP JOIN"
                      large
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <div style={{ marginTop: 12, display: 'flex' }}>
              <Btn size="sm" variant="dashed" icon={<I.plus size={11} />} onClick={addGroup}>
                Add group
              </Btn>
            </div>
          </div>

          {/* Preview row — human label + compiled fq + copy buttons.
              Pulse re-keys on every fq edit so the user gets a visual
              confirmation their change registered. */}
          <div style={{
            padding: '10px 18px',
            background: 'var(--gb-surface-1)',
            borderTop: '1px solid var(--gb-border-default)',
            display: 'flex', flexDirection: 'column', gap: 6,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PreviewKey>HUMAN</PreviewKey>
              <span style={{
                flex: 1, minWidth: 0,
                fontSize: 12.5, fontWeight: 600,
                color: canApply ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
                fontStyle: canApply ? 'normal' : 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={label}>
                {canApply ? label : '— add a valid condition above —'}
              </span>
              <IconBtn
                size="xs" variant="ghost"
                icon={<I.copy size={10} />}
                disabled={!canApply}
                onClick={() => handleCopy(label, 'Label')}
                tooltip="Copy label"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PreviewKey>FQ</PreviewKey>
              <motion.code
                key={pulseKey}
                initial={{ opacity: 0.6 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                style={{
                  flex: 1, minWidth: 0,
                  fontSize: 11,
                  fontFamily: 'var(--gb-font-mono)',
                  color: canApply ? 'var(--gb-text-secondary)' : 'var(--gb-text-muted)',
                  fontStyle: canApply ? 'normal' : 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  padding: '2px 8px',
                  background: 'var(--gb-fill-inverse-medium)',
                  border: '1px solid var(--gb-border-subtle)',
                  borderRadius: 4,
                }}
                title={solrFq}
              >
                {canApply ? solrFq : '—'}
              </motion.code>
              <IconBtn
                size="xs" variant="ghost"
                icon={<I.copy size={10} />}
                disabled={!canApply}
                onClick={() => handleCopy(solrFq, 'fq')}
                tooltip="Copy fq"
              />
            </div>
          </div>

          {/* Footer row — save name + Reset/Cancel/Apply actions. */}
          <div style={{
            padding: '10px 18px',
            background: 'var(--gb-fill-inverse-strong)',
            borderTop: '1px solid var(--gb-border-default)',
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <Input
              size="sm"
              value={saveName}
              onChange={setSaveName}
              placeholder="Name this query to save it…"
              style={{ flex: 1, minWidth: 0, maxWidth: 320 }}
            />
            <Btn
              size="sm" variant="secondary"
              icon={<SaveIcon size={11} />}
              disabled={!canSave}
              onClick={handleSave}
            >Save</Btn>
            <div style={{ flex: 1 }} />
            <Btn size="sm" variant="ghost" onClick={handleClear}>Reset</Btn>
            <Btn size="sm" variant="ghost" onClick={() => bindCloseRef.current?.()}>Cancel</Btn>
            <Btn
              size="sm" variant="tinted" status="brand"
              icon={<I.check size={11} />}
              disabled={!canApply}
              onClick={handleApply}
            >
              {onApply ? 'Apply filter' : 'Done'}
            </Btn>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
}

/* ════════════════════════════════════════════════════════════
   Sidebar — quick presets + saved queries
═══════════════════════════════════════════════════════════ */
function Sidebar({ presets, saved, onLoadPreset, onDeletePreset, onLoadSaved, onDeleteSaved, onPromoteSaved }) {
  return (
    <aside style={{
      width: 232, flexShrink: 0,
      background: 'var(--gb-surface-1)',
      borderRight: '1px solid var(--gb-border-default)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 12px 16px' }}>
        <SidebarHeader>Quick presets</SidebarHeader>
        {presets.length === 0 ? (
          <div style={{
            padding: '12px 10px',
            fontSize: 10.5, color: 'var(--gb-text-muted)',
            fontStyle: 'italic',
            border: '1px dashed var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)',
            textAlign: 'center',
          }}>No quick presets — pin a saved query below</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {presets.map((p) => (
              <PresetButton key={p.id} name={p.name} desc={p.desc}
                onClick={() => onLoadPreset(p)}
                onDelete={() => onDeletePreset(p)} />
            ))}
          </div>
        )}

        <SidebarHeader style={{ marginTop: 18 }}>
          <span>Saved queries</span>
          {saved.length > 0 && (
            <span style={{
              fontFamily: 'var(--gb-font-mono)', fontSize: 10,
              color: 'var(--gb-text-tertiary)',
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: 'none',
            }}>{saved.length}</span>
          )}
        </SidebarHeader>
        {saved.length === 0 ? (
          <div style={{
            padding: '12px 10px',
            fontSize: 10.5, color: 'var(--gb-text-muted)',
            fontStyle: 'italic',
            border: '1px dashed var(--gb-border-default)',
            borderRadius: 'var(--gb-r-sm)',
            textAlign: 'center',
          }}>No saved queries yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {saved.map((q) => (
              <SavedQueryRow
                key={q.id}
                query={q}
                onLoad={() => onLoadSaved(q)}
                onDelete={() => onDeleteSaved(q.id)}
                onPromote={() => onPromoteSaved(q)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function SidebarHeader({ children, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginBottom: 6,
      fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
      textTransform: 'uppercase',
      color: 'var(--gb-text-muted)',
      ...style,
    }}>{children}</div>
  );
}

function PresetButton({ name, desc, onClick, onDelete }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px',
        background: hover ? 'var(--gb-brand-tint-soft)' : 'var(--gb-surface-2)',
        border: '1px solid ' + (hover ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-subtle)'),
        borderRadius: 'var(--gb-r-sm)',
        color: 'var(--gb-text-secondary)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        transition: 'background-color .15s, border-color .15s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</span>
      </div>
      {onDelete && (
        <span style={{ opacity: hover ? 1 : 0, transition: 'opacity .15s', flexShrink: 0 }}>
          <IconBtn
            size="xs" variant="ghost" danger
            icon={<I.close size={9} />}
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            tooltip="Remove preset"
          />
        </span>
      )}
    </div>
  );
}

function SavedQueryRow({ query, onLoad, onDelete, onPromote }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        padding: '8px 10px',
        background: 'var(--gb-surface-2)',
        border: '1px solid var(--gb-border-subtle)',
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'pointer',
      }}
      onClick={onLoad}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          flex: 1, minWidth: 0,
          fontSize: 11.5, fontWeight: 700,
          color: 'var(--gb-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{query.name}</span>
        {onPromote && (
          <IconBtn
            size="xs" variant="ghost"
            icon={<I.bolt size={10} />}
            onClick={(e) => { e.stopPropagation(); onPromote(); }}
            tooltip="Make quick preset"
          />
        )}
        <IconBtn
          size="xs" variant="ghost" danger
          icon={<I.close size={9} />}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          tooltip="Delete"
        />
      </div>
      <code style={{
        fontSize: 9.5,
        fontFamily: 'var(--gb-font-mono)',
        color: 'var(--gb-text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title={query.query}>{query.query}</code>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   GroupCard — one group of conditions joined by AND or OR
═══════════════════════════════════════════════════════════ */
function GroupCard({
  group, index,
  onPatchCondition, onRemoveCondition, onDuplicateCondition, onMoveCondition,
  onAddCondition, onJoinerChange,
  canRemove, onRemoveGroup,
}) {
  return (
    <div style={{
      padding: 14,
      background: 'var(--gb-surface-1)',
      border: '1px solid var(--gb-border-subtle)',
      borderRadius: 'var(--gb-r-md)',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--gb-text-muted)',
        }}>Group {String.fromCharCode(65 + index)}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: .8,
          textTransform: 'uppercase',
          color: 'var(--gb-text-muted)',
        }}>match</span>
        <JoinerToggle value={group.joiner} onChange={onJoinerChange} />
        <IconBtn
          size="xs" variant="ghost" danger
          icon={<I.trash size={10} />}
          disabled={!canRemove}
          onClick={onRemoveGroup}
          tooltip={canRemove ? 'Remove group' : 'At least one group required'}
        />
      </div>

      {group.conditions.map((c, i) => (
        <React.Fragment key={c.id}>
          {i > 0 && <JoinerDivider value={group.joiner} small label="" />}
          <ConditionRow
            condition={c}
            onPatch={(patch) => onPatchCondition(c.id, patch)}
            onRemove={() => onRemoveCondition(c.id)}
            onDuplicate={() => onDuplicateCondition(c.id)}
            onMoveUp={i > 0 ? () => onMoveCondition(c.id, -1) : null}
            onMoveDown={i < group.conditions.length - 1 ? () => onMoveCondition(c.id, 1) : null}
            canRemove={group.conditions.length > 1}
          />
        </React.Fragment>
      ))}

      <div style={{ marginTop: 8 }}>
        <Btn size="xs" variant="ghost" icon={<I.plus size={10} />} onClick={onAddCondition}>
          Add condition
        </Btn>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   JoinerToggle — compact AND/OR segmented control
═══════════════════════════════════════════════════════════ */
function JoinerToggle({ value, onChange }) {
  return (
    <div style={{
      display: 'inline-flex', padding: 2, gap: 2,
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
    }}>
      {['AND', 'OR'].map((j) => {
        const on = value === j;
        return (
          <button
            key={j}
            type="button"
            onClick={() => onChange(j)}
            style={{
              padding: '0 8px', height: 20,
              border: 'none', cursor: 'pointer',
              background: on ? 'var(--gb-brand-tint-medium)' : 'transparent',
              color: on ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
              fontSize: 10, fontWeight: 800, letterSpacing: .5,
              fontFamily: 'var(--gb-font-mono)',
              borderRadius: 3,
            }}
          >{j}</button>
        );
      })}
    </div>
  );
}

function JoinerDivider({ value, onChange, label, small, large }) {
  const hr = <span style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: small ? '6px 0' : large ? '14px 0' : '8px 0',
    }}>
      {hr}
      {label && (
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--gb-text-muted)',
        }}>{label}</span>
      )}
      {onChange
        ? <JoinerToggle value={value} onChange={onChange} />
        : <span style={{
            display: 'inline-flex', padding: '2px 8px',
            background: 'var(--gb-brand-tint-soft)',
            border: '1px solid var(--gb-brand-tint-border)',
            borderRadius: 'var(--gb-r-pill)',
            fontSize: 9.5, fontWeight: 800, letterSpacing: .6,
            color: 'var(--gb-brand-label)',
            fontFamily: 'var(--gb-font-mono)',
          }}>{value}</span>}
      {hr}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   ConditionRow
═══════════════════════════════════════════════════════════ */
function ConditionRow({ condition, onPatch, onRemove, onDuplicate, onMoveUp, onMoveDown, canRemove }) {
  const field = QB_FIELDS.find((f) => f.key === condition.fieldKey) || QB_FIELDS[0];
  const ops = QB_OPS[field.type] || QB_OPS.text;

  const onFieldChange = (newKey) => {
    const newField = QB_FIELDS.find((f) => f.key === newKey) || QB_FIELDS[0];
    const newOps = QB_OPS[newField.type] || QB_OPS.text;
    const opStillValid = newOps.some((o) => o.id === condition.op);
    const patch = { fieldKey: newKey };
    if (!opStillValid) patch.op = newOps[0].id;
    if (newField.type === 'enum') patch.val = newField.options[0] ?? '';
    else if (field.type === 'enum' && newField.type !== 'enum') patch.val = '';
    onPatch(patch);
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: 10,
      background: 'var(--gb-surface-2)',
      border: '1px solid ' + (condition.not ? 'var(--gb-error-tint-border)' : 'var(--gb-border-subtle)'),
      borderRadius: 'var(--gb-r-sm)',
      transition: 'border-color .2s',
    }}>
      <div style={{
        flex: 1, minWidth: 0,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      }}>
        <NotPill on={condition.not} onClick={() => onPatch({ not: !condition.not })} />
        <FieldSelect value={condition.fieldKey} onChange={onFieldChange} />
        <Tag tone={CATEGORY_TONE[field.category]} size="xs">{field.category}</Tag>
        <OpSelect value={condition.op} ops={ops} onChange={(op) => onPatch({ op })} />
        <ValueEditor field={field} condition={condition} onPatch={onPatch} />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        flexShrink: 0,
      }}>
        <IconBtn
          size="xs" variant="ghost"
          icon={<ChevUpIcon size={11} />}
          onClick={onMoveUp}
          disabled={!onMoveUp}
          tooltip="Move up"
        />
        <IconBtn
          size="xs" variant="ghost"
          icon={<ChevDownIcon size={11} />}
          onClick={onMoveDown}
          disabled={!onMoveDown}
          tooltip="Move down"
        />
        <IconBtn
          size="xs" variant="ghost"
          icon={<I.copy size={10} />}
          onClick={onDuplicate}
          tooltip="Duplicate"
        />
        <IconBtn
          size="xs" variant="ghost" danger
          icon={<I.trash size={10} />}
          disabled={!canRemove}
          onClick={onRemove}
          tooltip={canRemove ? 'Remove condition' : 'At least one condition is required'}
        />
      </div>
    </div>
  );
}

function NotPill({ on, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? 'Negation on (remove)' : 'Negate this condition'}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 26,
        borderRadius: 4,
        background: on ? 'var(--gb-error-tint-medium)' : 'var(--gb-fill-subtle)',
        border: '1px solid ' + (on ? 'var(--gb-error-tint-border)' : 'var(--gb-border-default)'),
        color: on ? 'var(--gb-error-fg)' : 'var(--gb-text-muted)',
        fontSize: 10, fontWeight: 800, letterSpacing: .4,
        fontFamily: 'var(--gb-font-mono)',
        cursor: 'pointer',
        transition: 'background-color .2s, border-color .2s, color .2s',
        flexShrink: 0,
      }}
    >NOT</button>
  );
}

/* ── Field / op / value pickers — every control routes through
   the design-system Dropdown, Input, and DatePicker so the query
   builder reads as one tool rather than a mashup of styled
   native form elements. Dropdown supports per-option grouping
   via `group`, so FieldSelect can still surface category headers
   (Identity, Contact, Account, …) without a native optgroup. */

const QB_UNIT_OPTIONS = QB_UNITS.map((u) => ({ id: u, label: u }));

function FieldSelect({ value, onChange }) {
  const options = useMemo(
    () => QB_FIELDS.map((f) => ({ id: f.key, label: f.label, group: f.category })),
    [],
  );
  return (
    <Dropdown
      size="sm"
      value={value}
      options={options}
      onChange={onChange}
      style={{ width: 180 }}
      searchable
    />
  );
}

function OpSelect({ value, ops, onChange }) {
  const options = useMemo(
    () => ops.map((o) => ({ id: o.id, label: o.label })),
    [ops],
  );
  return (
    <Dropdown
      size="sm"
      value={value}
      options={options}
      onChange={onChange}
      style={{ width: 152 }}
    />
  );
}

function ValueEditor({ field, condition, onPatch }) {
  if (VALUELESS.has(condition.op)) {
    return (
      <span style={{
        flex: 1, minWidth: 0,
        fontSize: 11, fontStyle: 'italic',
        color: 'var(--gb-text-muted)',
        padding: '0 8px',
      }}>no value needed</span>
    );
  }
  if (field.type === 'enum') {
    return (
      <div style={{ flex: 1, minWidth: 130 }}>
        <Dropdown
          size="sm"
          value={condition.val || field.options[0]}
          options={field.options.map((o) => ({ id: o, label: o }))}
          onChange={(v) => onPatch({ val: v })}
        />
      </div>
    );
  }
  if (field.type === 'text') {
    return (
      <div style={{ flex: 1, minWidth: 140 }}>
        <Input
          size="sm"
          value={condition.val}
          placeholder="value…"
          onChange={(v) => onPatch({ val: v })}
        />
      </div>
    );
  }
  if (field.type === 'int' || field.type === 'float') {
    const inputMode = field.type === 'int' ? 'numeric' : 'decimal';
    if (condition.op === 'between') {
      return (
        <>
          <div style={{ width: 90 }}>
            <Input
              size="sm" mono
              type="number"
              inputMode={inputMode}
              value={condition.val}
              placeholder="min"
              onChange={(v) => onPatch({ val: v })}
            />
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>to</span>
          <div style={{ width: 90 }}>
            <Input
              size="sm" mono
              type="number"
              inputMode={inputMode}
              value={condition.val2}
              placeholder="max"
              onChange={(v) => onPatch({ val2: v })}
            />
          </div>
        </>
      );
    }
    return (
      <div style={{ flex: 1, minWidth: 100, maxWidth: 160 }}>
        <Input
          size="sm" mono
          type="number"
          inputMode={inputMode}
          value={condition.val}
          placeholder="0"
          onChange={(v) => onPatch({ val: v })}
        />
      </div>
    );
  }
  if (field.type === 'date') {
    if (condition.op === 'rel_past' || condition.op === 'rel_recent' || condition.op === 'rel_future') {
      return (
        <>
          <div style={{ width: 64 }}>
            <Input
              size="sm" mono
              type="number"
              inputMode="numeric"
              value={condition.num}
              placeholder="1"
              onChange={(v) => onPatch({ num: v })}
            />
          </div>
          <div style={{ width: 92 }}>
            <Dropdown
              size="sm"
              value={condition.unit || 'years'}
              options={QB_UNIT_OPTIONS}
              onChange={(v) => onPatch({ unit: v })}
            />
          </div>
          <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
            {condition.op === 'rel_future' ? 'from now' : 'ago'}
          </span>
        </>
      );
    }
    if (condition.op === 'before' || condition.op === 'after') {
      return (
        <div style={{ flex: 1, minWidth: 150, maxWidth: 220 }}>
          <DatePicker
            value={condition.val}
            includeTime={false}
            onChange={(v) => onPatch({ val: v })}
          />
        </div>
      );
    }
    return null;
  }
  return null;
}

/* ── Header chrome bits ── */
function CountChip({ children }) {
  return (
    <span style={{
      padding: '1px 7px', borderRadius: 4,
      background: 'var(--gb-fill-subtle)',
      border: '1px solid var(--gb-border-default)',
      fontSize: 10, fontWeight: 700, letterSpacing: .4,
      color: 'var(--gb-text-muted)',
      fontFamily: 'var(--gb-font-mono)',
    }}>{children}</span>
  );
}
function PreviewKey({ children }) {
  return (
    <span style={{
      fontSize: 8.5, fontWeight: 800, letterSpacing: .8,
      textTransform: 'uppercase',
      color: 'var(--gb-text-muted)',
      fontFamily: 'var(--gb-font-mono)',
      width: 36, flexShrink: 0,
    }}>{children}</span>
  );
}

/* ── Inline icons used in the row + header ── */
function FunnelIcon({ size = 12, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}
function SaveIcon({ size = 12, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}
function ChevUpIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}
function ChevDownIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
