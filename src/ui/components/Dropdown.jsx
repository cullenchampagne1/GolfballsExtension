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
  leading, searchable, disabled, error, onChange, maxHeight, style,
  // Override what the trigger shows. Useful when `value` is a composite
  // id whose option isn't in the visible list (e.g. a sub-view's pick).
  displayLabel,
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
  /* Two compounding scale transforms can be in play here:

       1) Body / ancestor CSS `zoom` (editor, popup, modal hosts).
          getBoundingClientRect returns POST-zoom viewport coords in
          modern Chromium, but a fixed-positioned popover portaled to
          body is laid out in PRE-zoom CSS pixels — the browser
          multiplies by the cumulative zoom when painting. So to land
          the popover's TOP-LEFT under the trigger we divide r.left
          and r.bottom by the zoom chain.

       2) The popover's own CSS `scale` (from data-gb-scale="popovers"
          → `scale: var(--gb-scale-popovers)` with transform-origin
          top-left). This doesn't move the top-left corner — it only
          scales the popover's CONTENT around that anchor. So the
          rendered visual width = CSS width × popover scale × body
          zoom. To make the popover's visible width MATCH the
          trigger's visible width we divide r.width by the popover
          scale only (the body zoom cancels: trigger and popover both
          live inside the same zoomed body).

     The previous version divided width by the zoom chain too, which
     was correct for body zoom but ignored the popover scale — so a
     `popovers` slider set to 0.85 left the menu ~15% narrower than
     the input it sat under (the "tiny text + width mismatch" bug). */
  function readZoomChain() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return 1;
    let z = 1;
    let el = document.body;
    while (el && el !== document.documentElement.parentNode) {
      try {
        const raw = getComputedStyle(el).zoom;
        const n = parseFloat(raw);
        if (Number.isFinite(n) && n > 0) z *= n;
      } catch {}
      el = el.parentElement;
    }
    return z || 1;
  }
  function readPopoverScale() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--gb-scale-popovers');
      const n = parseFloat(String(v || '').trim());
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch { return 1; }
  }
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) { setPos(null); return undefined; }
    function update() {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const z = readZoomChain();
      const s = readPopoverScale();
      const left = r.left / z;
      /* Popover's rendered visual width = css_width × popover_scale ×
         body_zoom. r.width is already the trigger's visual width
         (modern Chromium includes ancestor zoom + transforms in
         getBoundingClientRect). To make the popover paint at the
         SAME visual width as the trigger we divide r.width by
         (S × Z) — both factors multiply when the popover is rendered. */
      const width = r.width / (s * z);
      // documentElement.clientHeight tracks the actual rendered viewport,
      // including dynamic Chrome popup auto-resizing — window.innerHeight
      // can lag a frame during the resize.
      const viewportH = document.documentElement.clientHeight || window.innerHeight;
      const ceiling = typeof maxHeight === 'number' ? maxHeight : 240;
      const vh = viewportH / z;
      const belowTop = (r.bottom + 4) / z;      // menu top if opening downward
      const roomBelow = vh - belowTop - 8;
      const roomAbove = r.top / z - 4 - 8;       // room above the trigger
      /* Flip the menu ABOVE the trigger when there isn't enough room
         below for a usable list AND there's more room above — e.g. a
         field pinned near the bottom of the settings page, where the
         downward menu was getting clipped to a sliver. Anchored by its
         bottom edge so it hugs the trigger regardless of content height. */
      if (roomBelow < Math.min(ceiling, 160) && roomAbove > roomBelow) {
        const maxListHeight = Math.max(80, Math.min(ceiling, roomAbove));
        setPos({ placement: 'top', bottom: vh - r.top / z + 4, left, width, maxListHeight });
      } else {
        const maxListHeight = Math.max(80, Math.min(ceiling, roomBelow));
        setPos({ placement: 'bottom', top: belowTop, left, width, maxListHeight });
      }
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

  /* Expanded-parent state for options with sub-options (inline variations
     picker). Resets to empty when the menu closes so re-opening always
     shows the collapsed tree. */
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  useEffect(() => { if (!open) setExpandedIds(new Set()); }, [open]);

  /* Resolve the selected option — check sub-options too so a sub-id
     selection still lights up the right row. Used for the trailing
     check mark + active highlight. */
  const findOption = (opts, id) => {
    for (const o of opts) {
      if (o.id === id) return o;
      if (Array.isArray(o.subOptions)) {
        const sub = o.subOptions.find((s) => s.id === id);
        if (sub) return sub;
      }
    }
    return null;
  };
  const selected = findOption(options, value);

  const filtered = useMemo(() => {
    if (!searchable || !search) return options;
    const q = search.toLowerCase();
    const out = [];
    for (const o of options) {
      const parentHit = o.label.toLowerCase().includes(q);
      const subs = (o.subOptions || []).filter((s) => s.label.toLowerCase().includes(q));
      if (parentHit) {
        // Parent matched — include with all its sub-options (if any) so
        // the user can see the whole set.
        out.push(o);
      } else if (subs.length) {
        // Only some subs matched — render the parent with just the
        // matches so context is preserved. _forceExpanded surfaces
        // them without requiring the user to click the chevron.
        out.push({ ...o, subOptions: subs, _forceExpanded: true });
      }
    }
    return out;
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
    // `keepOpen` lets the consumer swap the option list in response to
    // a click (e.g. two-step variation picker) without closing the menu.
    if (o.keepOpen) return;
    setOpen(false);
    setSearch('');
  };

  /* Toggle whether a parent option is expanded. No-op for leaf options. */
  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* Keyboard-active option index used to highlight a row in the open
     popover and pick it on Enter. -1 = no row active (mouse-driven).
     Arrow Up/Down move through the flat list of pickable options. */
  const [activeIdx, setActiveIdx] = useState(-1);
  useEffect(() => { if (!open) setActiveIdx(-1); }, [open]);
  /* Flat list of pickable items in the same order they render in the
     popover — used for ArrowUp/Down navigation. Mirrors the rendering
     logic (group + parent/sub expansion). */
  const pickableList = useMemo(() => {
    const out = [];
    for (const [, opts] of groups) {
      for (const o of opts) {
        out.push(o);
        const subsExpanded = o._forceExpanded || expandedIds.has(o.id);
        if (subsExpanded && Array.isArray(o.subOptions)) {
          for (const s of o.subOptions) out.push(s);
        }
      }
    }
    return out;
  }, [groups, expandedIds]);

  /* Trigger keydown — implements the standard combobox/listbox pattern
     so the Dropdown works as a single Tab stop with full keyboard nav. */
  const onTriggerKeyDown = (e) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
        setActiveIdx(0);
      }
      return;
    }
    // Open state.
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (pickableList.length === 0 ? -1 : (i + 1) % pickableList.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (pickableList.length === 0 ? -1 : (i <= 0 ? pickableList.length - 1 : i - 1)));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (activeIdx >= 0 && activeIdx < pickableList.length) {
        e.preventDefault();
        pick(pickableList[activeIdx]);
      }
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        style={{
          ...inputBaseStyle({ focused: open, error, size }),
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1, userSelect: 'none',
          outline: 'none',
        }}
      >
        {leading && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--gb-text-muted)' }}>{leading}</span>}
        <span style={{
          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: (displayLabel || selected) ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)',
        }}>
          {displayLabel || (selected ? selected.label : placeholder)}
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
            className="gb-dd-popover"
            data-gb-scale="popovers"
            initial={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scaleY: 0.95 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            exit={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scaleY: 0.95, transition: T.base }}
            transition={T.bounce}
            style={{
              position: 'fixed',
              ...(pos.placement === 'top' ? { bottom: pos.bottom } : { top: pos.top }),
              left: pos.left, width: pos.width,
              transformOrigin: pos.placement === 'top' ? 'bottom' : 'top', zIndex: 2147483400,
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
                  onKeyDown={onTriggerKeyDown}
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
            {/* data-gb-scale lives on the outer motion.div only — having
                it here too would double-apply the popovers scale (S × S),
                shrinking the list's text far below the trigger's. */}
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
                  {opts.map((o) => (
                    <Row
                      key={o.id}
                      o={o}
                      value={value}
                      depth={0}
                      expandedIds={expandedIds}
                      onToggleExpand={toggleExpand}
                      onPick={pick}
                      kbdActiveId={pickableList[activeIdx]?.id}
                    />
                  ))}
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

/* ── Row ─────────────────────────────────────────────────────
   One dropdown option. Renders the parent row + (if it has
   subOptions) an AnimatePresence container for the children
   that slides them in/out below. Indented children call back
   into the same component recursively, but in practice we only
   ever have one level (templates → variations).

   Click behavior:
     • Parent with subOptions → toggles expansion, doesn't pick.
     • Leaf row (or parent without subs) → pick + close menu.

   `_forceExpanded` (set by the search filter) overrides the
   user's collapse state so a matching sub-option is always
   visible during search without needing the user to expand
   each parent manually. */
function Row({ o, value, depth, expandedIds, onToggleExpand, onPick, kbdActiveId }) {
  const active = o.id === value;
  const hasSubs = Array.isArray(o.subOptions) && o.subOptions.length > 0;
  const expanded = hasSubs && (o._forceExpanded || expandedIds.has(o.id));
  // Sub-option active even when collapsed — surface that the
  // parent has a "stale" pick inside so the user can see at a glance.
  const subActive = hasSubs && (o.subOptions || []).some((s) => s.id === value);
  const isActive = active || (subActive && !expanded);
  /* Keyboard-highlighted row (ArrowUp/Down inside the open menu).
     Distinct from the selected-value highlight so the user can SEE
     where their next Enter will land before committing the pick. */
  const isKbdHighlighted = kbdActiveId === o.id;
  const accentColor = o.accent
    ? `var(--gb-${o.accent === 'brand' ? 'brand-label' : `${o.accent}-fg`})`
    : null;

  /* `pickableParent` decouples row-click from expansion: clicking
     the row body picks the parent (and closes the menu), while
     clicking the chevron toggles expansion. Used by EmailRunner
     where the parent template represents the "random across
     variations" pick — chevron exposes the specific-variation
     overrides without forcing the user through an extra step to
     get the default behavior. */
  const handleClick = () => {
    if (o.disabled) return;
    if (hasSubs && !o.pickableParent) { onToggleExpand(o.id); return; }
    onPick(o);
  };
  const handleChevronClick = (e) => {
    if (o.disabled) return;
    if (!o.pickableParent) return; // legacy behavior — row-click already toggled
    e.stopPropagation();
    onToggleExpand(o.id);
  };

  return (
    <>
      <motion.div
        layout="position"
        onClick={handleClick}
        whileHover={o.disabled ? undefined : { backgroundColor: 'var(--gb-fill-soft)' }}
        style={{
          position: 'relative',
          padding: '6px 8px',
          paddingLeft: (o.accent ? 12 : 8) + depth * 14,
          borderRadius: 'var(--gb-r-sm)',
          fontSize: 12, fontFamily: 'var(--gb-font-sans)',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: o.disabled ? 'not-allowed' : 'pointer',
          opacity: o.disabled ? 0.4 : 1,
          color: isActive ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
          fontWeight: isActive ? 600 : 500,
          background: isKbdHighlighted
            ? 'var(--gb-brand-tint-medium)'
            : isActive ? 'var(--gb-brand-tint-soft)' : 'transparent',
          boxShadow: isKbdHighlighted ? 'inset 0 0 0 1px var(--gb-brand-fg)' : 'none',
        }}
      >
        {o.accent && (
          <span style={{
            position: 'absolute',
            top: 4, bottom: 4, left: 4,
            width: 2,
            background: accentColor,
            borderRadius: 1,
            pointerEvents: 'none',
          }} />
        )}
        {depth > 0 && (
          /* Subtle dot indicator on indented children — gives the
             tree a visual rhythm without needing borders. */
          <span style={{
            width: 4, height: 4, borderRadius: '50%',
            background: 'var(--gb-text-tertiary)',
            flexShrink: 0,
          }} />
        )}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {o.label}
        </span>
        {o.trailing && (
          <span style={{ display: 'flex', flexShrink: 0 }}>{o.trailing}</span>
        )}
        {hasSubs && (
          /* Right-pointing chevron that rotates 90° on expand. When
             the parent is pickableParent, this is the ONLY surface
             that toggles expansion — slightly larger hit area so the
             control doesn't feel fiddly to click separately from the
             row body. */
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={T.fast}
            onClick={handleChevronClick}
            style={{
              display: 'flex',
              color: 'var(--gb-text-muted)',
              flexShrink: 0,
              padding: o.pickableParent ? '4px' : 0,
              margin: o.pickableParent ? '-4px' : 0,
              cursor: o.pickableParent ? 'pointer' : 'inherit',
            }}
          >
            <I.chevr size={10} />
          </motion.span>
        )}
        {active && <I.check size={12} />}
      </motion.div>
      <AnimatePresence initial={false}>
        {hasSubs && expanded && (
          <motion.div
            key="sub"
            layout
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {o.subOptions.map((sub) => (
              <Row
                key={sub.id}
                o={sub}
                value={value}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onPick={onPick}
                kbdActiveId={kbdActiveId}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
