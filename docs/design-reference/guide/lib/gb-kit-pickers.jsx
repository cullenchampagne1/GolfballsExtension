/* ───────────────────────────────────────────────────────────────
   gb-kit-pickers.jsx — TemplatePicker + Dropdown, ported from
   src/ui/components. Extends window.GB.
─────────────────────────────────────────────────────────────── */
(function () {
  const { motion, AnimatePresence } = window.Motion;
  const { useState, useEffect, useRef, useMemo } = React;
  const { createPortal } = ReactDOM;
  const { Dot, I, T, inputBaseStyle } = window.GB;

  /* ============ TemplatePicker ============ */
  const PICKER_STYLE_ID = '__gb-template-picker-style';
  function ensurePickerStyle() {
    if (document.getElementById(PICKER_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = PICKER_STYLE_ID;
    el.textContent = `
      .gb-tpl-list { scrollbar-width: none; -ms-overflow-style: none; }
      .gb-tpl-list::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none !important; }
      @keyframes gb-tpl-row-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(el);
  }
  const ORIGINAL_VARIATION_ID = '__original';
  function parseTemplateValue(value) {
    if (!value) return [null, null];
    const i = value.indexOf('::');
    if (i === -1) return [value, null];
    return [value.slice(0, i), value.slice(i + 2)];
  }
  function SwapIcon({ size = 9 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M7 10l-3 3 3 3M4 13h16M17 4l3 3-3 3M20 7H4" /></svg>; }
  function ShuffleIcon({ size = 10 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>; }
  function PinIcon({ size = 10 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 4 3 5H7l3-5-1-4z" /></svg>; }
  function ChevDownIcon({ size = 10 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>; }
  function CheckIcon({ size = 10, style }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={style}><polyline points="20 6 9 17 4 12" /></svg>; }

  function CollapsedBadge({ mode, selectedTpl, hasPinnedVariation }) {
    if (!selectedTpl) return <span />;
    if (hasPinnedVariation) return <span title="Variation pinned" style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--gb-info-tint-medium)', color: 'var(--gb-info-fg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><PinIcon size={10} /></span>;
    if (mode === 'random' && (selectedTpl.variations?.length || 0) > 0) return <span title="Random across variations" style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ShuffleIcon size={10} /></span>;
    return <span />;
  }
  function SwapChip({ open }) {
    return <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', background: open ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)', color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', borderRadius: 3, fontSize: 8, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', transition: 'background .18s, color .18s' }}><SwapIcon size={7} />{open ? 'cancel' : 'swap'}</div>;
  }
  function GroupHeader({ label, tone }) {
    return <div style={{ padding: '6px 8px 3px', fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: tone === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>{tone === 'brand' && <Dot tone="brand" glow size={5} />}{label}</div>;
  }
  function EmptyHint({ children }) { return <div style={{ padding: '10px 12px', fontSize: 11, fontStyle: 'italic', color: 'var(--gb-text-muted)', textAlign: 'center', flexShrink: 0 }}>{children}</div>; }
  function RowStateBadge({ mode, isSelected, pinnedVarId, hasVariations }) {
    if (isSelected) {
      if (mode === 'random' && hasVariations) return <span aria-label="Random" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, color: 'var(--gb-brand-label)' }}><ShuffleIcon size={9} /></span>;
      return <div style={{ width: 14, height: 14, borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-brand-label)', color: 'var(--gb-text-on-brand, var(--gb-surface-deep))' }}><CheckIcon size={9} /></div>;
    }
    if (pinnedVarId) return <div style={{ width: 14, height: 14, borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-info-tint-medium)', color: 'var(--gb-info-fg)' }}><PinIcon size={8} /></div>;
    return <span style={{ width: 14, height: 14 }} />;
  }
  function ExpandWhen({ open, children }) {
    const ref = useRef(null);
    const [h, setH] = useState(0);
    useEffect(() => {
      if (!ref.current) return;
      const measure = () => { if (ref.current) setH(ref.current.scrollHeight); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(ref.current);
      return () => ro.disconnect();
    }, [open]);
    return <div style={{ maxHeight: open ? h : 0, opacity: open ? 1 : 0, overflow: 'hidden', transition: 'max-height .32s cubic-bezier(.4,0,.2,1), opacity .25s' }}><div ref={ref}>{children}</div></div>;
  }
  function SubRow({ label, meta, isPicked, onPick }) {
    return (
      <button type="button" onClick={onPick} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 7, alignItems: 'center', padding: '5px 7px', background: isPicked ? 'var(--gb-info-tint-medium)' : 'transparent', border: `1px solid ${isPicked ? 'var(--gb-info-tint-border)' : 'transparent'}`, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit', transition: 'background .15s, border-color .15s' }}>
        <Dot tone={isPicked ? 'info' : 'muted'} glow={isPicked} size={4} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: isPicked ? 'var(--gb-info-fg)' : 'var(--gb-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          {meta && <div style={{ fontSize: 9, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
        </div>
        {isPicked && <CheckIcon size={10} style={{ color: 'var(--gb-info-fg)' }} />}
      </button>
    );
  }
  function TplRow({ tpl, idx, mode, isMatched, isResolving, isSelected, pinnedVarId, expanded, onPickParent, onToggleExpand, onPickVariation }) {
    const hasVariations = (tpl.variations?.length || 0) > 0;
    const isAnyHere = isSelected || pinnedVarId !== null;
    const parentBg = isSelected ? 'var(--gb-brand-tint-medium)' : isAnyHere ? 'var(--gb-info-tint-soft)' : 'transparent';
    return (
      <div style={{ borderRadius: 'var(--gb-r-sm)', background: parentBg, animation: `gb-tpl-row-in .22s cubic-bezier(.4,0,.2,1) ${Math.min(idx, 8) * 0.03}s both`, overflow: 'hidden', transition: 'background .18s', flexShrink: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: hasVariations ? 'auto minmax(0, 1fr) auto auto auto' : 'auto minmax(0, 1fr) auto', gap: 6, alignItems: 'center', padding: '5px 7px' }}>
          <Dot tone={isMatched ? 'brand' : (isResolving || isAnyHere) ? 'info' : 'muted'} glow={isMatched || isResolving || isAnyHere} size={6} />
          <button type="button" onClick={onPickParent} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', minWidth: 0, fontSize: 11.5, fontWeight: 600, color: isSelected ? 'var(--gb-brand-label)' : pinnedVarId ? 'var(--gb-text-secondary)' : 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name || 'Untitled'}</button>
          {hasVariations && <span style={{ padding: '1px 5px', borderRadius: 3, background: isSelected ? 'var(--gb-brand-tint-soft)' : 'var(--gb-fill-subtle)', color: isSelected ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', fontSize: 9, fontWeight: 700, letterSpacing: 0.4, fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{tpl.variations.length + 1}v</span>}
          <RowStateBadge mode={mode} isSelected={isSelected} pinnedVarId={pinnedVarId} hasVariations={hasVariations} />
          {hasVariations && <button type="button" onClick={onToggleExpand} aria-label={expanded ? 'Collapse' : 'Expand'} style={{ width: 16, height: 16, padding: 0, background: 'transparent', border: 'none', borderRadius: 3, cursor: 'pointer', color: expanded ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color .18s, transform .25s cubic-bezier(.4,0,.2,1)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}><ChevDownIcon size={9} /></button>}
        </div>
        {hasVariations && (
          <ExpandWhen open={expanded}>
            <div style={{ paddingLeft: 15, paddingRight: 5, paddingBottom: 5, display: 'flex', flexDirection: 'column', gap: 1, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 9, top: 0, bottom: 5, width: 1, background: 'var(--gb-border-default)' }} />
              <SubRow key={ORIGINAL_VARIATION_ID} label="Variation 1" isPicked={pinnedVarId === ORIGINAL_VARIATION_ID} onPick={() => onPickVariation(ORIGINAL_VARIATION_ID)} />
              {tpl.variations.map((v, vi) => <SubRow key={v.id} label={`Variation ${vi + 2}`} meta={v.preview || ''} isPicked={pinnedVarId === v.id} onPick={() => onPickVariation(v.id)} />)}
            </div>
          </ExpandWhen>
        )}
      </div>
    );
  }
  function ListBody({ templates, placeholder, useGroups, matched, rest, expanded, toggleExpand, valueTplId, valueVarId, mode, onChange, resolvingSet = new Set() }) {
    if (templates.length === 0) return <EmptyHint>{placeholder}</EmptyHint>;
    const matchedArr = matched || [];
    const matchedSet = new Set(matchedArr.map((t) => t.id));
    const renderRow = (tpl, idx, isMatched) => (
      <TplRow key={tpl.id} tpl={tpl} idx={idx} mode={mode} isMatched={isMatched} isResolving={resolvingSet.has(tpl.id)}
        isSelected={valueTplId === tpl.id && !valueVarId} pinnedVarId={valueTplId === tpl.id ? valueVarId : null}
        expanded={expanded.has(tpl.id)} onPickParent={() => onChange(tpl.id)} onToggleExpand={(e) => toggleExpand(tpl.id, e)} onPickVariation={(vid) => onChange(`${tpl.id}::${vid}`)} />
    );
    if (useGroups) {
      const restArr = rest || [];
      return (
        <>
          <GroupHeader label="Matched on this page" tone="brand" />
          {matchedArr.map((tpl, idx) => renderRow(tpl, idx, true))}
          {restArr.length > 0 && <><GroupHeader label="All templates" />{restArr.map((tpl, idx) => renderRow(tpl, matchedArr.length + idx, false))}</>}
        </>
      );
    }
    return templates.map((tpl, idx) => renderRow(tpl, idx, matchedSet.has(tpl.id)));
  }
  function TemplatePicker({ templates = [], matchedIds = [], resolvingIds = [], value, onChange, mode = 'random', initialOpen = false, placeholder = 'Pick a template', disabled = false, listMaxHeight = 360, forceExpandId = null, floating = true }) {
    const [open, setOpen] = useState(initialOpen);
    useEffect(() => { setOpen(initialOpen); }, [initialOpen]);
    useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
    useEffect(() => { ensurePickerStyle(); }, []);
    const rootRef = useRef(null);
    useEffect(() => {
      if (!open) return undefined;
      const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', onDoc);
      return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    const [expanded, setExpanded] = useState(() => new Set());
    useEffect(() => { if (!forceExpandId) return; setExpanded((s) => { if (s.has(forceExpandId)) return s; const n = new Set(s); n.add(forceExpandId); return n; }); }, [forceExpandId]);
    const [valueTplId, valueVarId] = useMemo(() => parseTemplateValue(value), [value]);
    useEffect(() => { if (!valueVarId || !valueTplId) return; setExpanded((s) => { if (s.has(valueTplId)) return s; const n = new Set(s); n.add(valueTplId); return n; }); }, [valueTplId, valueVarId]);
    const matchedSet = useMemo(() => new Set(matchedIds), [matchedIds]);
    const resolvingSet = useMemo(() => new Set(resolvingIds), [resolvingIds]);
    const selectedTpl = templates.find((t) => t.id === valueTplId) || null;
    const isOriginalPinned = valueVarId === ORIGINAL_VARIATION_ID;
    const selectedVarIdx = selectedTpl && valueVarId && !isOriginalPinned ? (selectedTpl.variations || []).findIndex((v) => v.id === valueVarId) : -1;
    const selectedVar = selectedVarIdx >= 0 ? selectedTpl.variations[selectedVarIdx] : null;
    const pinnedDisplayName = isOriginalPinned ? 'Variation 1' : selectedVar ? `Variation ${selectedVarIdx + 2}` : null;
    const toggleExpand = (id, e) => { e?.stopPropagation?.(); setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
    const collapsedLabel = selectedTpl ? (mode === 'single' && pinnedDisplayName ? `${selectedTpl.name || 'Untitled'} · ${pinnedDisplayName}` : (selectedTpl.name || 'Untitled')) : placeholder;
    const useGroups = mode === 'single' && matchedSet.size > 0 && templates.some((t) => !matchedSet.has(t.id)) && templates.some((t) => matchedSet.has(t.id));
    const matched = useGroups ? templates.filter((t) => matchedSet.has(t.id)) : null;
    const rest = useGroups ? templates.filter((t) => !matchedSet.has(t.id)) : null;
    const listInner = (
      <div className="gb-tpl-list" style={{ background: 'var(--gb-surface-modal, var(--gb-surface-2))', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', boxShadow: floating ? '0 12px 32px -8px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.18)' : 'none', padding: 5, display: 'flex', flexDirection: 'column', gap: 1, maxHeight: listMaxHeight, overflowY: 'auto' }}>
        <ListBody templates={templates} placeholder={placeholder} useGroups={useGroups} matched={matched} rest={rest} expanded={expanded} toggleExpand={toggleExpand} valueTplId={valueTplId} valueVarId={valueVarId} mode={mode} onChange={onChange} resolvingSet={resolvingSet} />
      </div>
    );
    return (
      <div ref={rootRef} style={{ position: 'relative', background: 'var(--gb-surface-2)', border: `1px solid ${open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`, borderRadius: 'var(--gb-r-md)', transition: 'border-color .18s', opacity: disabled ? 0.55 : 1 }}>
        <button type="button" onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled} style={{ width: '100%', background: 'transparent', border: 'none', padding: '9px 10px', display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', gap: 8, alignItems: 'center', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
          <Dot tone={selectedTpl && (mode === 'random' ? 'brand' : matchedSet.has(selectedTpl?.id) ? 'brand' : 'success')} size={7} glow={!!selectedTpl} />
          <div style={{ minWidth: 0, fontSize: 12, fontWeight: 600, color: selectedTpl ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collapsedLabel}</div>
          <CollapsedBadge mode={mode} selectedTpl={selectedTpl} hasPinnedVariation={!!pinnedDisplayName} />
          <SwapChip open={open} />
        </button>
        <AnimatePresence initial={false}>
          {open && (floating ? (
            <motion.div key="floating" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18, ease: [0.34, 1.4, 0.64, 1] }} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: -1, right: -1, zIndex: 30, transformOrigin: 'top center' }}>{listInner}</motion.div>
          ) : (
            <motion.div key="inline" initial={{ height: 0, opacity: 0, marginTop: 0 }} animate={{ height: 'auto', opacity: 1, marginTop: 4 }} exit={{ height: 0, opacity: 0, marginTop: 0 }} transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }} style={{ overflow: 'hidden' }}>{listInner}</motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  /* ============ Dropdown (faithful, viewport-anchored portal) ============ */
  function DDRow({ o, value, depth, expandedIds, onToggleExpand, onPick }) {
    const [hov, setHov] = useState(false);
    const active = o.id === value;
    const hasSubs = Array.isArray(o.subOptions) && o.subOptions.length > 0;
    const expanded = hasSubs && (o._forceExpanded || expandedIds.has(o.id));
    const subActive = hasSubs && (o.subOptions || []).some((s) => s.id === value);
    const isActive = active || (subActive && !expanded);
    const accentColor = o.accent ? `var(--gb-${o.accent === 'brand' ? 'brand-label' : `${o.accent}-fg`})` : null;
    const handleClick = () => { if (o.disabled) return; if (hasSubs && !o.pickableParent) { onToggleExpand(o.id); return; } onPick(o); };
    const bg = isActive ? 'var(--gb-brand-tint-soft)' : hov && !o.disabled ? 'var(--gb-fill-soft)' : 'transparent';
    return (
      <>
        <div onClick={handleClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
          style={{ position: 'relative', padding: '6px 8px', paddingLeft: (o.accent ? 12 : 8) + depth * 14, borderRadius: 'var(--gb-r-sm)', fontSize: 12, fontFamily: 'var(--gb-font-sans)', display: 'flex', alignItems: 'center', gap: 8, cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.4 : 1, color: isActive ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)', fontWeight: isActive ? 600 : 500, background: bg, transition: 'background-color .12s' }}>
          {o.accent && <span style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: 2, background: accentColor, borderRadius: 1, pointerEvents: 'none' }} />}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
          {o.trailing && <span style={{ display: 'flex', flexShrink: 0 }}>{o.trailing}</span>}
          {active && <I.check size={12} />}
        </div>
      </>
    );
  }
  function Dropdown({ value, placeholder = 'Select…', options = [], size = 'md', leading, searchable, disabled, error, onChange, maxHeight, style, displayLabel }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const rootRef = useRef(null);
    const popoverRef = useRef(null);
    const [pos, setPos] = useState(null);
    useEffect(() => {
      if (!open) { setPos(null); return undefined; }
      function update() {
        const el = rootRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const viewportH = document.documentElement.clientHeight || window.innerHeight;
        const ceiling = typeof maxHeight === 'number' ? maxHeight : 240;
        const belowTop = r.bottom + 4;
        const roomBelow = viewportH - belowTop - 8;
        const roomAbove = r.top - 4 - 8;
        if (roomBelow < Math.min(ceiling, 160) && roomAbove > roomBelow) {
          setPos({ placement: 'top', bottom: viewportH - r.top + 4, left: r.left, width: r.width, maxListHeight: Math.max(80, Math.min(ceiling, roomAbove)) });
        } else {
          setPos({ placement: 'bottom', top: belowTop, left: r.left, width: r.width, maxListHeight: Math.max(80, Math.min(ceiling, roomBelow)) });
        }
      }
      update();
      const onScroll = (e) => { if (popoverRef.current?.contains(e.target)) return; setOpen(false); };
      window.addEventListener('resize', update);
      window.addEventListener('scroll', onScroll, true);
      return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', onScroll, true); };
    }, [open, maxHeight]);
    useEffect(() => {
      if (!open) return undefined;
      const onDown = (e) => { if (rootRef.current?.contains(e.target)) return; if (popoverRef.current?.contains(e.target)) return; setOpen(false); };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);
    const [expandedIds, setExpandedIds] = useState(() => new Set());
    useEffect(() => { if (!open) setExpandedIds(new Set()); }, [open]);
    const findOption = (opts, id) => { for (const o of opts) { if (o.id === id) return o; if (Array.isArray(o.subOptions)) { const sub = o.subOptions.find((s) => s.id === id); if (sub) return sub; } } return null; };
    const selected = findOption(options, value);
    const filtered = useMemo(() => {
      if (!searchable || !search) return options;
      const q = search.toLowerCase();
      return options.filter((o) => o.label.toLowerCase().includes(q));
    }, [options, search, searchable]);
    const groups = useMemo(() => { const map = new Map(); filtered.forEach((o) => { const g = o.group || ''; if (!map.has(g)) map.set(g, []); map.get(g).push(o); }); return [...map.entries()]; }, [filtered]);
    const pick = (o) => { if (o.disabled) return; onChange?.(o.id); if (o.keepOpen) return; setOpen(false); setSearch(''); };
    const toggleExpand = (id) => setExpandedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    return (
      <div ref={rootRef} style={{ position: 'relative', ...style }}>
        <div role="combobox" aria-expanded={open} tabIndex={disabled ? -1 : 0} onClick={() => !disabled && setOpen((v) => !v)}
          style={{ ...inputBaseStyle({ focused: open, error, size }), cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, userSelect: 'none', outline: 'none' }}>
          {leading && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--gb-text-muted)' }}>{leading}</span>}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: (displayLabel || selected) ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)' }}>{displayLabel || (selected ? selected.label : placeholder)}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={T.fast} style={{ display: 'flex', color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}><I.chevd size={11} /></motion.span>
        </div>
        {createPortal(
          <AnimatePresence>
            {open && pos && (
              <motion.div ref={popoverRef} initial={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scaleY: 0.95 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: pos.placement === 'top' ? 4 : -4, scaleY: 0.95, transition: T.base }} transition={T.bounce}
                style={{ position: 'fixed', ...(pos.placement === 'top' ? { bottom: pos.bottom } : { top: pos.top }), left: pos.left, width: pos.width, transformOrigin: pos.placement === 'top' ? 'bottom' : 'top', zIndex: 2147483400, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)', overflow: 'hidden' }}>
                {searchable && (
                  <div style={{ padding: 6, borderBottom: '1px solid var(--gb-border-subtle)' }}>
                    <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', boxSizing: 'border-box', height: 26, background: 'var(--gb-surface-2)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-sm)', outline: 'none', color: 'var(--gb-text-primary)', padding: '0 8px', fontSize: 11.5, fontFamily: 'var(--gb-font-sans)' }} />
                  </div>
                )}
                <div className="gb-dd-list" style={{ maxHeight: pos.maxListHeight, overflowY: 'auto', padding: 4, scrollbarWidth: 'none' }}>
                  {filtered.length === 0 ? <div style={{ padding: '10px 8px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center' }}>No matches</div>
                    : groups.map(([group, opts]) => (
                      <div key={group || '_'}>
                        {group && <div style={{ padding: '6px 8px 3px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--gb-text-muted)' }}>{group}</div>}
                        {opts.map((o) => <DDRow key={o.id} o={o} value={value} depth={0} expandedIds={expandedIds} onToggleExpand={toggleExpand} onPick={pick} />)}
                      </div>
                    ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>, document.body)}
      </div>
    );
  }

  window.GB = Object.assign(window.GB || {}, { TemplatePicker, parseTemplateValue, ORIGINAL_VARIATION_ID, Dropdown });
})();
