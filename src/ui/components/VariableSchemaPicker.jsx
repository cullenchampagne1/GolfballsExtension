import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { I } from '../icons.jsx';
import { Tag } from './Tag.jsx';
import { contactSchema } from '../../lib/page-schemas/contact.js';
import { listPaths } from '../../lib/page-engine/resolve.js';

/* ───────────────────────────────────────────────────────────────
   VariableSchemaPicker — tree-style schema dropdown for the
   New Variable form. Same mechanics as AccountConditions' rule
   picker (PathButton + tree with search + array drill-in) but
   wired INLINE rather than absolute-positioned: when the tree
   opens, it takes vertical space in the form so the surrounding
   modal body expands / scrolls naturally instead of clipping a
   floating popover.

   • Width = 100% of the parent column (matches the input row).
   • Tree expansion + arrow-key nav + array drill-in carry over.
   • No portal, no fixed positioning — just normal block flow.
─────────────────────────────────────────────────────────────── */

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

const SCHEMA_NODES = (() => {
  try {
    const list = listPaths(contactSchema, /* sample */ {});
    return list.map((n) => ({
      path:     n.path,
      label:    n.label || n.path,
      type:     n.type,
      isFolder: n.type === 'object' || n.type === 'array',
      depth:    n.path.split(/[.[]/).filter(Boolean).length - 1,
    }));
  } catch { return []; }
})();
const TYPE_BY_PATH = Object.fromEntries(SCHEMA_NODES.map((n) => [n.path, n.type]));
const canonicalPath = (p) => (p || '').replace(/\[\d+\]/g, '[0]');
const typeForPath = (p) => TYPE_BY_PATH[canonicalPath(p)] || 'string';

export function VariableSchemaPicker({ value, onChange, placeholder = '— pick a field —' }) {
  const [open, setOpen] = useState(false);
  const type = typeForPath(value);
  /* Surface array selector only when the active path actually
     contains an array segment. Variables resolve to a single
     value — no any / none modes — so the dropdown carries the
     three single-value picks: first (=[0]), last (=[-1]), or a
     specific index. */
  const arrayInfo = useMemo(() => parseArraySegment(value), [value]);
  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <PathButton
        path={value}
        type={type}
        open={open}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
      />
      <AnimatePresence initial={false}>
        {open && (
          <InlineSchemaTree
            currentPath={canonicalPath(value)}
            onClose={() => setOpen(false)}
            onSelect={(node) => {
              onChange(typeof node === 'string' ? node : node.path);
              setOpen(false);
            }}
          />
        )}
      </AnimatePresence>
      {arrayInfo && (
        <ArraySelectorRow
          arrayName={arrayInfo.arrayName}
          mode={arrayInfo.mode}
          index={arrayInfo.index}
          onChange={(mode, index) => onChange(rewriteArrayIndex(value, mode, index))}
        />
      )}
    </div>
  );
}

/* Detects the FIRST `[N]` segment in a path and reports its
   mode + index. Returns null when the path has no array. */
function parseArraySegment(path) {
  if (!path) return null;
  const m = /\[(-?\d+)\]/.exec(path);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  /* The bit before `[` is the array's field name — kept short for
     the row's caption ("orders" rather than the full prefix). */
  const arrayName = path.slice(0, m.index).split('.').pop() || 'items';
  return {
    arrayName,
    mode: n === 0 ? 'first' : n === -1 ? 'last' : 'index',
    index: n >= 0 ? n : 0,
  };
}

/* Rewrite the first `[N]` in `path` according to mode + index.
   first → [0], last → [-1], index → [N] (clamped to >= 0). */
function rewriteArrayIndex(path, mode, index) {
  if (!path) return path;
  const next = mode === 'first' ? '[0]'
    : mode === 'last' ? '[-1]'
    : `[${Math.max(0, index | 0)}]`;
  return path.replace(/\[-?\d+\]/, next);
}

function ArraySelectorRow({ arrayName, mode, index, onChange }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      marginTop: 6,
      padding: '6px 8px',
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      fontFamily: 'var(--gb-font-mono)',
      fontSize: 10.5,
    }}>
      <span style={{ color: 'var(--gb-text-muted)' }}>{arrayName}[]</span>
      <span style={{ color: 'var(--gb-text-muted)' }}>·</span>
      <select
        value={mode}
        onChange={(e) => onChange(e.target.value, index)}
        style={{
          height: 22,
          padding: '0 6px',
          background: 'var(--gb-fill-subtle)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 3,
          color: 'var(--gb-text-primary)',
          fontFamily: 'inherit',
          fontSize: 10.5,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        <option value="first">first</option>
        <option value="last">last</option>
        <option value="index">index</option>
      </select>
      {mode === 'index' && (
        <input
          type="number"
          min={0}
          value={index}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            onChange('index', Number.isFinite(v) ? Math.max(0, v) : 0);
          }}
          style={{
            width: 56,
            height: 22,
            padding: '0 6px',
            background: 'var(--gb-fill-subtle)',
            border: '1px solid var(--gb-border-default)',
            borderRadius: 3,
            color: 'var(--gb-text-primary)',
            fontFamily: 'inherit',
            fontSize: 10.5,
            fontWeight: 600,
            outline: 'none',
            textAlign: 'right',
          }}
        />
      )}
    </div>
  );
}

function PathButton({ path, type, open, onClick, placeholder }) {
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
        background: path ? (TYPE_DOT[type] || 'var(--gb-text-muted)') : 'var(--gb-text-ghost)',
        flexShrink: 0,
      }} />
      <span style={{
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        WebkitMaskImage: fadeMask,
        maskImage: fadeMask,
        color: path ? 'inherit' : 'var(--gb-text-muted)',
      }}>{path || placeholder}</span>
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
      >▾</motion.span>
    </button>
  );
}

/* ── Inline tree — opens in flow, not absolute. The parent
   modal/form body's overflow handles scroll. ────────────────── */
function InlineSchemaTree({ currentPath, onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => initialExpansion(currentPath));
  const [focusedIdx, setFocusedIdx] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => { try { searchRef.current?.focus(); } catch {} });
    return () => cancelAnimationFrame(r);
  }, []);

  const rows = useMemo(() => filterAndProject(SCHEMA_NODES, search, expanded), [search, expanded]);
  useEffect(() => { setFocusedIdx(0); }, [search]);

  const toggleExpand = (path) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

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
      e.preventDefault();
      const r = rows[focusedIdx];
      if (r?.isFolder) toggleExpand(r.path);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const r = rows[focusedIdx];
      if (r?.isFolder && expanded.has(r.path)) toggleExpand(r.path);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      style={{
        overflow: 'hidden',
        marginTop: 4,
      }}
    >
      <div style={{
        background: 'var(--gb-surface-1)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-md)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--gb-border-subtle)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--gb-surface-2)',
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
              height: 24,
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
        <div style={{ maxHeight: 280, overflow: 'auto', padding: '4px 6px 8px' }}>
          {rows.length === 0 ? (
            <div style={{
              padding: 14, textAlign: 'center',
              fontSize: 11, color: 'var(--gb-text-muted)',
            }}>No fields match</div>
          ) : rows.map((r, i) => (
            <PathRow
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
      </div>
    </motion.div>
  );
}

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

function PathRow({ node, focused, expanded, isCurrent, onClick, onMouseEnter, onToggleExpand }) {
  const indent = node.depth * 12;
  const leafLabel = node.path.split('.').slice(-1)[0].replace(/\[0\]/g, '');
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
            >▸</motion.span>
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
