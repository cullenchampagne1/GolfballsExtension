import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { I } from '../icons.jsx';
import { Tag } from './Tag.jsx';
import { contactSchema } from '../../lib/page-schemas/contact.js';
import { listPaths } from '../../lib/page-engine/resolve.js';

/* ───────────────────────────────────────────────────────────────
   SchemaPathPicker — shared tree-style picker over the page-engine
   schema. Replaces flat <Dropdown> over a 100+ row enumeration in
   the surfaces that need to pick a schema path (Account
   Conditions rules, the New Variable schema kind, etc.).

   Behavior
   --------
     • Tree row layout, indented by depth. Folders (object /
       array types) toggle their children inline.
     • Search input filters across path + label substrings —
       hides expansion when searching so every match shows.
     • Arrow keys move focus through the rows; Enter commits the
       focused row; ArrowRight expands a focused folder, ArrowLeft
       collapses; Escape closes.
     • Auto-expands the ancestors of the currently selected path
       on open so the rep lands on a useful row.

   The component is fully controlled — `value` + `onChange(path)`.
   Open state is internal; the popover auto-closes on selection
   AND on outside click.
─────────────────────────────────────────────────────────────── */

/* Tag tone + dot color per leaf type. Keep aligned with the
   AccountConditions copy so both surfaces feel the same. */
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

/* Flat schema-node list — built once at import time. Folders are
   retained so the picker can render the contact/account/stats
   tree the rep navigates instead of a 100+ row flat dropdown. */
export const SCHEMA_NODES = (() => {
  try {
    const list = listPaths(contactSchema, /* sample data */ {});
    return list.map((n) => ({
      path:     n.path,
      label:    n.label || n.path,
      type:     n.type,
      isFolder: n.type === 'object' || n.type === 'array',
      depth:    n.path.split(/[.[]/).filter(Boolean).length - 1,
    }));
  } catch { return []; }
})();
export const TYPE_BY_PATH = Object.fromEntries(SCHEMA_NODES.map((n) => [n.path, n.type]));
export const canonicalPath = (p) => (p || '').replace(/\[\d+\]/g, '[0]');
export const typeForPath = (p) => TYPE_BY_PATH[canonicalPath(p)] || 'string';

/* ── High-level wrapper — internal open state, button trigger
   ──────────────────────────────────────────────────────────────
   Drop into any field slot: `<SchemaPathPicker value path onChange />`.
   The button styles itself with a fade-mask on long paths +
   brand-tint on open. */
export function SchemaPathPicker({
  value,
  onChange,
  placeholder = '— pick a field —',
  /* When true, leaf-only — the rep can't pick folder/array nodes.
     Useful for surfaces that only consume scalar leaves (variable
     value lookups) — Account Conditions explicitly wants arrays
     as a pickable option for its `hasAny / countGt` family. */
  leafOnly = false,
}) {
  const [open, setOpen] = useState(false);
  const type = typeForPath(value);
  return (
    <div style={{ position: 'relative', width: '100%', minWidth: 0 }}>
      <PathButton
        path={value}
        type={type}
        open={open}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
      />
      <AnimatePresence>
        {open && (
          <PathPickerPopover
            currentPath={canonicalPath(value)}
            leafOnly={leafOnly}
            onClose={() => setOpen(false)}
            onSelect={(node) => {
              const next = typeof node === 'string' ? node : node.path;
              onChange(next);
              setOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── PathButton — trigger with type dot, masked path, chevron ── */
export function PathButton({ path, type, open, onClick, placeholder = '— pick a field —' }) {
  /* Mask fades the last 18px of the text into transparent so
     long paths read as "…ackHand" without a hard cut. */
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

/* ── Popover — inline tree browser ─────────────────────────── */
export function PathPickerPopover({ currentPath, onClose, onSelect, leafOnly = false }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(() => initialExpansion(currentPath));
  const [focusedIdx, setFocusedIdx] = useState(0);
  const searchRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => { try { searchRef.current?.focus(); } catch {} });
    return () => cancelAnimationFrame(r);
  }, []);

  /* Outside-click dismiss using mousedown so the trigger's onClick
     still wins when the user toggles the picker from the same
     button. */
  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    };
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

  const pickRow = (r) => {
    if (r.type === 'array') {
      if (leafOnly) toggleExpand(r.path);
      else onSelect(r);
    } else if (r.isFolder) {
      toggleExpand(r.path);
    } else {
      onSelect(r);
    }
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
        maxWidth: 'calc(100vw - 24px)',
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
          }}>No fields match</div>
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

function PathPickerRow({ node, focused, expanded, isCurrent, onClick, onMouseEnter, onToggleExpand }) {
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
