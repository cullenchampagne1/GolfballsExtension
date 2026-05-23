import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T } from '../shared.jsx';
import { Checkbox } from './Checkbox.jsx';
import { I } from '../icons.jsx';

/**
 * CollapsibleChecklist — one collapsible section with a tri-state
 * "select all" header and a grid of per-item checkboxes inside.
 *
 * Designed for the "Custom Pages" settings group: pick which CRM /
 * Orders / Reports / etc. pages this extension should override. Same
 * shape works for any "select N of these K things" surface.
 *
 * Props:
 *   icon         Optional React element rendered in the header tile.
 *   title        Required. Header label (e.g., "CRM").
 *   items        Required. Array of { id, label } objects.
 *   selected     Required. Array of ids currently selected.
 *   onChange     Required. Receives the next array of selected ids.
 *   columns      Default 2. How many columns in the checkbox grid.
 *   defaultOpen  Default true.
 */
export function CollapsibleChecklist({
  icon, title, items = [], selected = [], onChange,
  columns = 2, defaultOpen = true,
}) {
  const [open, setOpen] = useState(defaultOpen);

  /* Tristate header checkbox: empty when none picked, indeterminate when
     some, checked when all. The same checkbox doubles as the bulk action
     — clicking it toggles between "all" and "none". */
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const total       = items.length;
  const picked      = items.filter((it) => selectedSet.has(it.id)).length;
  const allOn       = total > 0 && picked === total;
  const someOn      = picked > 0 && !allOn;

  const toggleAll = () => onChange(allOn ? [] : items.map((it) => it.id));
  const toggleOne = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange([...next]);
  };

  return (
    <div style={{
      border: '1px solid var(--gb-border-default)',
      borderRadius: 'var(--gb-r-md)',
      background: 'var(--gb-surface-1)',
      overflow: 'hidden',
    }}>
      {/* Header — click anywhere to collapse/expand. The tristate
          checkbox stops propagation so toggling the master doesn't
          also close the section. */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: 'pointer', userSelect: 'none',
          borderBottom: open ? '1px solid var(--gb-border-subtle)' : '1px solid transparent',
        }}
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={T.fast}
          style={{ display: 'inline-flex', color: 'var(--gb-text-muted)', flexShrink: 0 }}
        >
          <I.chevr size={10} />
        </motion.span>
        {icon && (
          <span style={{
            width: 22, height: 22, borderRadius: 'var(--gb-r-sm)', flexShrink: 0,
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {React.cloneElement(icon, { size: 11 })}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)' }}>
            {title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 1 }}>
            {picked} of {total} selected
          </div>
        </div>
        <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
          <Checkbox
            size="sm"
            checked={allOn}
            indeterminate={someOn}
            onChange={toggleAll}
          />
        </span>
      </div>

      {/* Body — grid of checkboxes. Animated height so collapsing
          feels like every other collapsible in the system. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={T.base}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '10px 12px',
              background: 'var(--gb-fill-inverse-soft)',
              display: 'grid',
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              columnGap: 14,
              rowGap: 7,
            }}>
              {items.map((it) => (
                <Checkbox
                  key={it.id}
                  size="sm"
                  checked={selectedSet.has(it.id)}
                  label={it.label}
                  onChange={() => toggleOne(it.id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
