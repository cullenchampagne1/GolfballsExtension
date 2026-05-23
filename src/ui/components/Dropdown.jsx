import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { T, inputBaseStyle } from '../shared.jsx';
import { I } from '../icons.jsx';

/* Hide the menu's scrollbar (Chrome needs a ::-webkit rule) while keeping it
   scrollable. Injected once, shared by every Dropdown. */
const SCROLLBAR_STYLE_ID = '__gb-dd-noscroll';
function ensureScrollbarStyle() {
  if (typeof document === 'undefined' || document.getElementById(SCROLLBAR_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = SCROLLBAR_STYLE_ID;
  el.textContent = '.gb-dd-list::-webkit-scrollbar{width:0;height:0;display:none}';
  (document.head || document.documentElement).appendChild(el);
}

/**
 * Dropdown — select control with an animated menu.
 *
 * Props: value, placeholder, size, leading, searchable, disabled,
 *   options: Array<{ id, label, disabled?, group?, trailing?, accent? }>,
 *     - trailing: ReactNode rendered on the right side of the row,
 *       before the check mark. Useful for tags / badges / counts.
 *     - accent:   'brand'|'error'|'warning'|'success'|'info'
 *                 paints a 2px left-border in the matching --gb-{tone}
 *                 color and pads the row to keep the label aligned.
 *                 Use it to mark a row without spending a whole group.
 *   maxHeight    number — explicit ceiling for the menu list (px). Overrides
 *                the auto-clamp against the viewport bottom. Use it when the
 *                Dropdown lives inside a wrapper whose available height isn't
 *                window.innerHeight (e.g. a Chrome toolbar popup whose body
 *                resizes dynamically based on feature flags).
 *   onChange(id).
 */
export function Dropdown({
  value, placeholder = 'Select…', options = [], size = 'md',
  leading, searchable, disabled, onChange, maxHeight, style,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef(null);
  const popoverRef = useRef(null);

  // Position the portaled menu under the trigger. Recompute on resize +
  // close on outside scroll (so it doesn't float when ancestors scroll).
  // Portal-to-body lets the menu escape `overflow: hidden` parents like
  // the InlineVariableForm wrapper or a modal body.
  //
  // `pos.maxListHeight` is the available room between the trigger's bottom
  // edge and the viewport's bottom edge, minus an 8px margin so the menu
  // never sits flush against the window chrome. Capped at 240px (the
  // historical max) so existing surfaces don't suddenly grow huge menus.
  // Critical in the toolbar popup where the viewport is only ~340px tall —
  // without this clamp the menu spills past the popup's bottom edge and
  // gets clipped by Chrome.
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    function update() {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.bottom + 4;
      // documentElement.clientHeight tracks the actual rendered viewport,
      // including dynamic Chrome popup auto-resizing — window.innerHeight
      // can lag a frame during the resize.
      const viewportH = document.documentElement.clientHeight || window.innerHeight;
      const ceiling = typeof maxHeight === 'number' ? maxHeight : 240;
      const maxListHeight = Math.max(80, Math.min(ceiling, viewportH - top - 8));
      setPos({ top, left: r.left, width: r.width, maxListHeight });
    }
    update();
    const onScroll = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, maxHeight]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => { ensureScrollbarStyle(); }, []);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    if (!searchable || !search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search, searchable]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((o) => {
      const g = o.group || '';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(o);
    });
    return [...map.entries()];
  }, [filtered]);

  const pick = (o) => {
    if (o.disabled) return;
    onChange?.(o.id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <div
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          ...inputBaseStyle({ focused: open, size }),
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1, userSelect: 'none',
        }}
      >
        {leading && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--gb-text-muted)' }}>{leading}</span>}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: selected ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
        }}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={T.fast}
          style={{ display: 'flex', color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}
        >
          <I.chevd size={11} />
        </motion.span>
      </div>

      {/* Menu is portaled to <body> so it escapes overflow:hidden parents
          (modals, the inline-add wrapper's height-animation clip). It's
          fixed-positioned from the trigger's bounding rect; updates on
          window resize, closes on ancestor scroll. */}
      {typeof document !== 'undefined' && createPortal(
      <AnimatePresence>
        {open && pos && (
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: -4, scaleY: 0.95, transition: T.base }}
            transition={T.bounce}
            style={{
              position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
              transformOrigin: 'top', zIndex: 2147483400,
              background: 'var(--gb-surface-modal)',
              border: '1px solid var(--gb-border-default)',
              borderRadius: 'var(--gb-r-md)',
              boxShadow: 'var(--gb-shadow-popover)',
              overflow: 'hidden',
            }}
          >
            {searchable && (
              <div style={{ padding: 6, borderBottom: '1px solid var(--gb-border-subtle)' }}>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  style={{
                    width: '100%', boxSizing: 'border-box', height: 26,
                    background: 'var(--gb-surface-2)',
                    border: '1px solid var(--gb-border-default)',
                    borderRadius: 'var(--gb-r-sm)', outline: 'none',
                    color: 'var(--gb-text-primary)', padding: '0 8px',
                    fontSize: 11.5, fontFamily: 'var(--gb-font-sans)',
                  }}
                />
              </div>
            )}
            <div className="gb-dd-list" style={{ maxHeight: pos.maxListHeight, overflowY: 'auto', padding: 4, scrollbarWidth: 'none' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center' }}>
                  No matches
                </div>
              ) : groups.map(([group, opts]) => (
                <div key={group || '_'}>
                  {group && (
                    <div style={{
                      padding: '6px 8px 3px', fontSize: 9, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)',
                    }}>{group}</div>
                  )}
                  {opts.map((o) => {
                    const active = o.id === value;
                    // Accent colours mirror the status tokens so an `info`
                    // accent reads info-blue, etc. The accent bar is an
                    // absolutely-positioned child rather than a borderLeft —
                    // a borderLeft inherits the row's border-radius and gets
                    // rounded at the corners, which looks like a fat
                    // tear-drop instead of a clean indicator bar.
                    const accentColor = o.accent
                      ? `var(--gb-${o.accent === 'brand' ? 'brand-label' : `${o.accent}-fg`})`
                      : null;
                    return (
                      <motion.div
                        key={o.id}
                        onClick={() => pick(o)}
                        whileHover={o.disabled ? undefined : { backgroundColor: 'var(--gb-fill-soft)' }}
                        style={{
                          position: 'relative',
                          padding: o.accent ? '6px 8px 6px 10px' : '6px 8px',
                          borderRadius: 'var(--gb-r-sm)',
                          fontSize: 12, fontFamily: 'var(--gb-font-sans)',
                          display: 'flex', alignItems: 'center', gap: 8,
                          cursor: o.disabled ? 'not-allowed' : 'pointer',
                          opacity: o.disabled ? 0.4 : 1,
                          color: active ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
                          fontWeight: active ? 600 : 500,
                          background: active ? 'var(--gb-brand-tint-soft)' : 'transparent',
                        }}
                      >
                        {o.accent && (
                          <span style={{
                            position: 'absolute',
                            top: 4, bottom: 4, left: 3,
                            width: 2,
                            background: accentColor,
                            borderRadius: 1,
                            pointerEvents: 'none',
                          }} />
                        )}
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.label}
                        </span>
                        {o.trailing && (
                          <span style={{ display: 'flex', flexShrink: 0 }}>{o.trailing}</span>
                        )}
                        {active && <I.check size={12} />}
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body)}
    </div>
  );
}
