import React, { useState, useRef, useEffect } from 'react';
import { I } from '../icons.jsx';
import { inputBaseStyle } from '../shared.jsx';

/**
 * MultiSelectCombo — compact multi-select with search.
 * Selected values appear as removable chips inside the field.
 * Clicking the field opens a searchable dropdown.
 *
 * Props:
 *   value        string[]         currently selected values
 *   options      string[]         all available options
 *   onChange     (next: string[]) => void
 *   placeholder  string
 */
export function MultiSelectCombo({
  value = [],
  options = [],
  onChange,
  placeholder = 'Select…',
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = options.filter(
    o => !value.includes(o) && o.toLowerCase().includes(query.toLowerCase()),
  );

  const add = (opt) => {
    onChange?.([...value, opt]);
  };

  const remove = (opt) => {
    onChange?.(value.filter(v => v !== opt));
  };

  const allSelected = options.every(o => value.includes(o));

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Field shell */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          ...inputBaseStyle({ focused: open }),
          minHeight: 32, height: 'auto',
          padding: '4px 8px',
          flexWrap: 'wrap',
          gap: 4,
          cursor: 'pointer',
          alignItems: 'center',
        }}
      >
        {value.length === 0 && (
          <span style={{ color: 'var(--gb-text-ghost)', fontSize: 12, flex: 1 }}>{placeholder}</span>
        )}
        {value.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px',
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            borderRadius: 4,
            fontSize: 11, fontWeight: 500,
            fontFamily: 'var(--gb-font-mono)',
            whiteSpace: 'nowrap',
          }}>
            {v}
            <span
              onClick={e => { e.stopPropagation(); remove(v); }}
              style={{ display: 'flex', cursor: 'pointer', opacity: 0.7 }}
            >
              <I.close size={9} />
            </span>
          </span>
        ))}
        {value.length > 0 && <div style={{ flex: 1 }} />}
        <I.chevd
          size={11}
          style={{
            color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--gb-anim)',
            flexShrink: 0,
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
          background: 'var(--gb-surface-1)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)',
          boxShadow: 'var(--gb-shadow-popover)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', border: 'none', outline: 'none',
                background: 'transparent',
                fontSize: 12, color: 'var(--gb-text-primary)',
                fontFamily: 'var(--gb-font-sans)',
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center' }}>
                {allSelected ? 'All selected' : 'No matches'}
              </div>
            )}
            {filtered.map(opt => (
              <div
                key={opt}
                onClick={(e) => { e.stopPropagation(); add(opt); }}
                style={{
                  padding: '7px 12px', fontSize: 12, cursor: 'pointer',
                  color: 'var(--gb-text-secondary)',
                  transition: 'background var(--gb-anim-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gb-fill-subtle)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
