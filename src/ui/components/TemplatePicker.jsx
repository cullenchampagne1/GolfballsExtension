import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dot } from './Dot.jsx';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   TemplatePicker — inline expanding picker shared by the
   EmailRunner panel and the toolbar popup. Replaces the legacy
   Dropdown / InlinePicker — same surface morphs into the option
   list (no portal, no flying menu, no clipping).

   Selection model — both surfaces emit the same string:
     • parent body click       → onChange(tplId)
     • variation sub-row click → onChange(`${tplId}::${varId}`)
   The caller parses with parseTemplateValue() to drive selectedId
   + selectedVariationId state.

   Modes
   -----
     mode="random"   (EmailRunner)
       Parent click means "random across this template's variations
       per recipient" — the run loop weights via the weights panel
       below. Shows a shuffle badge on a selected parent with
       variations and a check badge on a selected parent without.

     mode="single"   (popup)
       Parent click means "use the parent body for this single
       send" — there's no random mode. Matched-on-page templates
       are grouped under a "Matched on this page" header with a
       brand-glow dot regardless of selection.

   Form factor — designed to read at 280–380px panel widths. The
   collapsed bar is a 4-column grid (dot · label/sub · badge ·
   swap chip) so the rightmost chip stays pinned to the right
   edge no matter how long the template label is.
─────────────────────────────────────────────────────────────── */

const TINT_LIGHT = 'color-mix(in srgb, var(--gb-brand-label) 30%, transparent)';

/* Sentinel variation id meaning "the parent template's base body" —
   i.e., the synthetic Variation 1 that the picker exposes at the
   top of every sub-list. Picking it pins the original so the rep
   can lock that body in without falling back to random. Both the
   EmailRunner orchestrator and the popup's renderStr already treat
   a varId of '__original' as "no variation match" and fall through
   to tpl.subject / tpl.body. */
export const ORIGINAL_VARIATION_ID = '__original';

/** Split a composite value into [tplId, varId]. */
export function parseTemplateValue(value) {
  if (!value) return [null, null];
  const i = value.indexOf('::');
  if (i === -1) return [value, null];
  return [value.slice(0, i), value.slice(i + 2)];
}

export function TemplatePicker({
  templates = [],
  matchedIds = [],
  value,
  onChange,
  /* 'random' (EmailRunner) | 'single' (popup) */
  mode = 'random',
  /* Open / collapsed state mirror. The popup wants the picker
     visible on first paint so the rep sees the matched templates
     without clicking; the EmailRunner ships closed and only
     expands on click. */
  initialOpen = false,
  placeholder = 'Pick a template',
  disabled = false,
  /* Cap the visible scrollable height of the option list. Default
     360 fits comfortably in the EmailRunner panel; the popup
     overrides with a smaller value so the list never tries to grow
     past the popup body and get clipped by its overflow. */
  listMaxHeight = 360,
  /* When non-null, expand exactly that template's variations on
     mount — useful for the demo phase bar but also helpful when
     restoring a previously-pinned variation so the rep sees the
     active sub-row without expanding again. */
  forceExpandId = null,
}) {
  const [open, setOpen] = useState(initialOpen);
  useEffect(() => { setOpen(initialOpen); }, [initialOpen]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  /* Set<tplId> of parents whose variations are currently expanded
     inline. Local UI state — does NOT affect selection. */
  const [expanded, setExpanded] = useState(() => new Set());
  useEffect(() => {
    if (!forceExpandId) return;
    setExpanded((s) => {
      if (s.has(forceExpandId)) return s;
      const n = new Set(s);
      n.add(forceExpandId);
      return n;
    });
  }, [forceExpandId]);

  /* Also auto-expand the currently-pinned variation's parent when
     a value with a variation id arrives — so re-opening the picker
     on an active selection lands the user on the pinned sub-row. */
  const [valueTplId, valueVarId] = useMemo(() => parseTemplateValue(value), [value]);
  useEffect(() => {
    if (!valueVarId || !valueTplId) return;
    setExpanded((s) => {
      if (s.has(valueTplId)) return s;
      const n = new Set(s);
      n.add(valueTplId);
      return n;
    });
  }, [valueTplId, valueVarId]);

  const matchedSet = useMemo(() => new Set(matchedIds), [matchedIds]);
  const selectedTpl = templates.find((t) => t.id === valueTplId) || null;
  /* A pinned variation lookup that also recognizes the synthetic
     ORIGINAL_VARIATION_ID. The original is exposed as "Variation
     1" at the top of the sub-list; picking it pins the parent
     body without falling back to random. */
  const isOriginalPinned = valueVarId === ORIGINAL_VARIATION_ID;
  const selectedVar = selectedTpl && valueVarId && !isOriginalPinned
    ? (selectedTpl.variations || []).find((v) => v.id === valueVarId) || null
    : null;
  const pinnedDisplayName = isOriginalPinned
    ? 'Variation 1'
    : selectedVar
      ? (selectedVar.label || selectedVar.name || 'variation')
      : null;

  const toggleExpand = (id, e) => {
    e?.stopPropagation?.();
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  /* Sub-line on the collapsed bar reads differently per mode +
     selection state. Kept compact so the 320–380px form factor
     doesn't wrap. The variation count we show is N+1 because the
     sub-list always includes a synthetic Variation 1 = the
     parent's base body alongside the N saved variations. */
  const savedVarCount = selectedTpl?.variations?.length || 0;
  const totalVarCount = savedVarCount > 0 ? savedVarCount + 1 : 0;
  const collapsedSub = (() => {
    if (!selectedTpl) {
      return `${templates.length} available`;
    }
    if (pinnedDisplayName) {
      return mode === 'single'
        ? `pinned · ${selectedTpl.type || 'email'}`
        : `pinned · ${pinnedDisplayName}`;
    }
    if (totalVarCount === 0) {
      return `${selectedTpl.type || 'email'} · no variations`;
    }
    return mode === 'random'
      ? `random · ${totalVarCount} variations`
      : `using base body · ${totalVarCount} variation${totalVarCount === 1 ? '' : 's'}`;
  })();

  const collapsedLabel = selectedTpl
    ? (mode === 'single' && pinnedDisplayName
      ? `${selectedTpl.name || 'Untitled'} · ${pinnedDisplayName}`
      : (selectedTpl.name || 'Untitled'))
    : placeholder;

  /* Group split — only used in single mode (popup) and only when
     both buckets have entries. Same logic the legacy
     dropdownOptions builder used. */
  const useGroups = mode === 'single'
    && matchedSet.size > 0
    && templates.some((t) => !matchedSet.has(t.id))
    && templates.some((t) => matchedSet.has(t.id));
  const matched = useGroups ? templates.filter((t) => matchedSet.has(t.id)) : null;
  const rest    = useGroups ? templates.filter((t) => !matchedSet.has(t.id)) : null;

  return (
    <div
      style={{
        background: 'var(--gb-surface-2)',
        border: `1px solid ${open ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'}`,
        borderRadius: 'var(--gb-r-md)',
        overflow: 'hidden',
        transition: 'border-color .18s',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {/* Collapsed bar — current selection + SWAP / CANCEL chip.
          4-column grid pins the chip to the right edge regardless
          of how long the label is. */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        style={{
          width: '100%', background: 'transparent', border: 'none',
          padding: '9px 10px',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
          gap: 8, alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          color: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        <Dot
          tone={selectedTpl && (mode === 'random'
            ? 'brand'
            : matchedSet.has(selectedTpl?.id) ? 'brand' : 'success')}
          size={7}
          glow={!!selectedTpl}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: selectedTpl ? 'var(--gb-text-primary)' : 'var(--gb-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{collapsedLabel}</div>
          <div style={{
            fontSize: 9.5, color: 'var(--gb-text-muted)', marginTop: 2,
            fontFamily: 'var(--gb-font-mono)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{collapsedSub}</div>
        </div>
        <CollapsedBadge
          mode={mode}
          selectedTpl={selectedTpl}
          /* Treat the synthetic Variation 1 the same as any
             pinned saved variation so the pin badge renders. */
          hasPinnedVariation={!!pinnedDisplayName}
        />
        <SwapChip open={open} />
      </button>

      {/* Inline expanding option list. ExpandWhen tracks the inner
          height via ResizeObserver so the max-height tween hits the
          right target even as the variation sub-lists open. */}
      <ExpandWhen open={open}>
        <div style={{
          borderTop: '1px dashed var(--gb-border-default)',
          padding: 5,
          display: 'flex', flexDirection: 'column', gap: 1,
          /* `listMaxHeight` caps the scrollable region so the picker
             never expands past the popup body and gets clipped.
             When a variation expands inside a row, the content
             grows past this cap and the option list shows a
             scrollbar; rows below the expanded one still push
             down inside the scrollable region. */
          maxHeight: listMaxHeight,
          overflowY: 'auto',
          /* Visible thin scrollbar so the rep knows the list scrolls
             when variations are expanded. The popup's host page
             style sheet doesn't get to override these (the popup
             is its own document). */
          scrollbarWidth: 'thin',
        }}>
          {templates.length === 0 ? (
            <EmptyHint>{placeholder}</EmptyHint>
          ) : useGroups ? (
            <>
              <GroupHeader label="Matched on this page" tone="brand" />
              {matched.map((tpl, idx) => (
                <Row
                  key={tpl.id}
                  tpl={tpl}
                  idx={idx}
                  mode={mode}
                  isMatched
                  isSelected={valueTplId === tpl.id && !valueVarId}
                  pinnedVarId={valueTplId === tpl.id ? valueVarId : null}
                  expanded={expanded.has(tpl.id)}
                  onPickParent={() => onChange(tpl.id)}
                  onToggleExpand={(e) => toggleExpand(tpl.id, e)}
                  onPickVariation={(vid) => onChange(`${tpl.id}::${vid}`)}
                />
              ))}
              {rest.length > 0 && (
                <>
                  <GroupHeader label="All templates" />
                  {rest.map((tpl, idx) => (
                    <Row
                      key={tpl.id}
                      tpl={tpl}
                      idx={matched.length + idx}
                      mode={mode}
                      isMatched={false}
                      isSelected={valueTplId === tpl.id && !valueVarId}
                      pinnedVarId={valueTplId === tpl.id ? valueVarId : null}
                      expanded={expanded.has(tpl.id)}
                      onPickParent={() => onChange(tpl.id)}
                      onToggleExpand={(e) => toggleExpand(tpl.id, e)}
                      onPickVariation={(vid) => onChange(`${tpl.id}::${vid}`)}
                    />
                  ))}
                </>
              )}
            </>
          ) : (
            templates.map((tpl, idx) => (
              <Row
                key={tpl.id}
                tpl={tpl}
                idx={idx}
                mode={mode}
                isMatched={matchedSet.has(tpl.id)}
                isSelected={valueTplId === tpl.id && !valueVarId}
                pinnedVarId={valueTplId === tpl.id ? valueVarId : null}
                expanded={expanded.has(tpl.id)}
                onPickParent={() => onChange(tpl.id)}
                onToggleExpand={(e) => toggleExpand(tpl.id, e)}
                onPickVariation={(vid) => onChange(`${tpl.id}::${vid}`)}
              />
            ))
          )}
        </div>
      </ExpandWhen>
    </div>
  );
}

/* ── Collapsed bar — right-side state badge ──────────────────
   EmailRunner: shuffle when selected parent has variations,
   check when it doesn't. Pin appears on pinned-variation parents.
   Popup: pin only — selected parent reads as the parent body. */
function CollapsedBadge({ mode, selectedTpl, hasPinnedVariation }) {
  if (!selectedTpl) return <span />;
  if (hasPinnedVariation) {
    return (
      <span
        title="Variation pinned"
        style={{
          width: 18, height: 18, borderRadius: 4,
          background: 'var(--gb-info-tint-medium)', color: 'var(--gb-info-fg)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      ><PinIcon size={10} /></span>
    );
  }
  if (mode === 'random' && (selectedTpl.variations?.length || 0) > 0) {
    return (
      <span
        title="Random across variations"
        style={{
          width: 18, height: 18, borderRadius: 4,
          background: 'var(--gb-brand-tint-medium)', color: 'var(--gb-brand-label)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      ><ShuffleIcon size={10} /></span>
    );
  }
  return <span />;
}

function SwapChip({ open }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '3px 6px',
      background: open ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
      color: open ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
      borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
      transition: 'background .18s, color .18s',
    }}>
      <SwapIcon size={9} />
      {open ? 'cancel' : 'swap'}
    </div>
  );
}

function GroupHeader({ label, tone }) {
  return (
    <div style={{
      padding: '6px 8px 3px',
      fontSize: 8.5, fontWeight: 800,
      textTransform: 'uppercase', letterSpacing: 0.8,
      color: tone === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
      display: 'flex', alignItems: 'center', gap: 5,
      /* Defensive flex-shrink:0 — the option list is a flex column
         with maxHeight + overflowY:auto, and flex children default
         to shrink:1, which would squash every row to fit instead
         of producing a scrollbar. Set on every direct child of
         the list so the scroll behavior is reliable. */
      flexShrink: 0,
    }}>
      {tone === 'brand' && <Dot tone="brand" glow size={5} />}
      {label}
    </div>
  );
}

function EmptyHint({ children }) {
  return (
    <div style={{
      padding: '10px 12px',
      fontSize: 11, fontStyle: 'italic',
      color: 'var(--gb-text-muted)',
      textAlign: 'center',
      flexShrink: 0,
    }}>{children}</div>
  );
}

/* ── Single template row + variations ────────────────────── */
function Row({
  tpl, idx, mode, isMatched, isSelected, pinnedVarId,
  expanded, onPickParent, onToggleExpand, onPickVariation,
}) {
  const hasVariations = (tpl.variations?.length || 0) > 0;
  const isAnyHere = isSelected || pinnedVarId !== null;
  /* Selected parent: brand tint. Parent with a pinned variation:
     info-tint-soft (the variation owns the brand-tint highlight). */
  const parentBg = isSelected
    ? 'var(--gb-brand-tint-medium)'
    : isAnyHere
      ? 'var(--gb-info-tint-soft)'
      : 'transparent';

  return (
    <div
      style={{
        borderRadius: 'var(--gb-r-sm)',
        background: parentBg,
        animation: `gb-tpl-row-in .22s cubic-bezier(.4,0,.2,1) ${Math.min(idx, 8) * 0.03}s both`,
        overflow: 'hidden',
        transition: 'background .18s',
        /* Defensive flex-shrink:0 — the option list (parent) is a
           flex column with maxHeight + overflowY:auto. Without
           this, the row's natural height is shrunk by flex layout
           to fit the cap, so the rows squish + overlap instead of
           overflowing and triggering the scrollbar. */
        flexShrink: 0,
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: hasVariations
          ? 'auto minmax(0, 1fr) auto auto'
          : 'auto minmax(0, 1fr) auto',
        gap: 7, alignItems: 'center',
        padding: '6px 7px',
      }}>
        <Dot
          tone={isMatched ? 'brand' : isAnyHere ? 'info' : 'muted'}
          glow={isMatched || isAnyHere}
          size={6}
        />
        <button
          type="button"
          onClick={onPickParent}
          style={{
            background: 'transparent', border: 'none', padding: 0,
            cursor: 'pointer', textAlign: 'left',
            color: 'inherit', fontFamily: 'inherit',
            minWidth: 0,
          }}
        >
          <div style={{
            fontSize: 11.5, fontWeight: 600,
            color: isSelected
              ? 'var(--gb-brand-label)'
              : pinnedVarId ? 'var(--gb-text-secondary)' : 'var(--gb-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{tpl.name || 'Untitled'}</div>
          <div style={{
            fontSize: 9, color: 'var(--gb-text-muted)',
            fontFamily: 'var(--gb-font-mono)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tpl.type || 'email'}
            {hasVariations && (
              <>
                {' · '}
                {/* +1 because the sub-list includes a synthetic
                    Variation 1 = the parent's base body alongside
                    the N saved variations. */}
                <span style={{ color: isSelected ? 'var(--gb-brand-label)' : undefined }}>
                  {tpl.variations.length + 1} var
                </span>
              </>
            )}
            {pinnedVarId && (() => {
              if (pinnedVarId === ORIGINAL_VARIATION_ID) {
                return (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--gb-info-fg)' }}>Variation 1</span>
                  </>
                );
              }
              const idx = tpl.variations.findIndex((x) => x.id === pinnedVarId);
              const v = idx >= 0 ? tpl.variations[idx] : null;
              return v ? (
                <>
                  {' · '}
                  <span style={{ color: 'var(--gb-info-fg)' }}>
                    {v.label || v.name || `Variation ${idx + 2}`}
                  </span>
                </>
              ) : null;
            })()}
          </div>
        </button>
        {/* Row state indicator */}
        <RowStateBadge mode={mode} isSelected={isSelected} pinnedVarId={pinnedVarId} hasVariations={hasVariations} />
        {hasVariations && (
          /* Chevron is a pure rotate-on-toggle affordance — no
             background swap. The fill behind the arrow when
             expanded read as a stuck button-press to the rep, so
             we drop it and let the rotation + the variation list
             carry the "open" signal. Color tints brighter when
             active so there's still a subtle state change. */
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Collapse variations' : 'Expand variations'}
            style={{
              width: 20, height: 20, padding: 0,
              background: 'transparent',
              border: 'none', borderRadius: 3, cursor: 'pointer',
              color: expanded ? 'var(--gb-text-secondary)' : 'var(--gb-text-tertiary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color .18s, transform .25s cubic-bezier(.4,0,.2,1)',
              transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          >
            <ChevDownIcon size={10} />
          </button>
        )}
      </div>
      {hasVariations && (
        <ExpandWhen open={expanded}>
          <div style={{
            paddingLeft: 15, paddingRight: 5, paddingBottom: 5,
            display: 'flex', flexDirection: 'column', gap: 1,
            position: 'relative',
          }}>
            {/* Indent guide */}
            <div style={{
              position: 'absolute',
              left: 9, top: 0, bottom: 5,
              width: 1,
              background: 'var(--gb-border-default)',
            }} />
            {/* Synthetic Variation 1 = the parent template's base
                body. Picking it pins the original so it goes out as
                a fixed selection (no random roll). Both the
                EmailRunner orchestrator and the popup renderer
                already fall through to tpl.subject / tpl.body when
                varId === ORIGINAL_VARIATION_ID, so no resolver
                change is needed. */}
            <SubRow
              key={ORIGINAL_VARIATION_ID}
              label="Variation 1"
              isPicked={pinnedVarId === ORIGINAL_VARIATION_ID}
              onPick={() => onPickVariation(ORIGINAL_VARIATION_ID)}
            />
            {tpl.variations.map((v, vi) => (
              <SubRow
                key={v.id}
                /* Saved variations renumber from 2 because the
                   original took Variation 1's slot. Custom labels
                   still win — only the auto-numbered fallback
                   shifts. */
                label={v.label || v.name || `Variation ${vi + 2}`}
                meta={v.preview || ''}
                isPicked={pinnedVarId === v.id}
                onPick={() => onPickVariation(v.id)}
              />
            ))}
          </div>
        </ExpandWhen>
      )}
    </div>
  );
}

function RowStateBadge({ mode, isSelected, pinnedVarId, hasVariations }) {
  /* When the parent itself is selected, paint a solid brand check.
     In random mode with variations, the indicator carries a shuffle
     glyph instead so the rep can tell the row will roll at send
     time. A pinned-variation parent gets an info-tinted pin. */
  if (isSelected) {
    const icon = mode === 'random' && hasVariations
      ? <ShuffleIcon size={9} />
      : <CheckIcon size={10} />;
    return (
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-brand-label)',
        color: 'var(--gb-text-on-brand, var(--gb-surface-deep))',
      }}>{icon}</div>
    );
  }
  if (pinnedVarId) {
    return (
      <div style={{
        width: 16, height: 16, borderRadius: 4,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--gb-info-tint-medium)',
        color: 'var(--gb-info-fg)',
      }}><PinIcon size={9} /></div>
    );
  }
  return <span style={{ width: 16, height: 16 }} />;
}

function SubRow({ label, meta, isPicked, onPick }) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 7, alignItems: 'center',
        padding: '5px 7px',
        background: isPicked ? 'var(--gb-info-tint-medium)' : 'transparent',
        border: `1px solid ${isPicked ? 'var(--gb-info-tint-border)' : 'transparent'}`,
        borderRadius: 'var(--gb-r-sm)',
        cursor: 'pointer', textAlign: 'left',
        color: 'inherit', fontFamily: 'inherit',
        transition: 'background .15s, border-color .15s',
      }}
    >
      <Dot tone={isPicked ? 'info' : 'muted'} glow={isPicked} size={4} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10.5, fontWeight: 600,
          color: isPicked ? 'var(--gb-info-fg)' : 'var(--gb-text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>
        {meta && (
          <div style={{
            fontSize: 9, color: 'var(--gb-text-muted)',
            fontFamily: 'var(--gb-font-mono)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{meta}</div>
        )}
      </div>
      {isPicked && <CheckIcon size={10} style={{ color: 'var(--gb-info-fg)' }} />}
    </button>
  );
}

/* ── ExpandWhen — height + opacity reveal driven by a
   ResizeObserver so the open-state max-height tracks nested
   children (variation lists expanding/collapsing). ── */
function ExpandWhen({ open, children }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const measure = () => setH(ref.current.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [open]);
  return (
    <div style={{
      maxHeight: open ? h : 0,
      opacity: open ? 1 : 0,
      overflow: 'hidden',
      transition: 'max-height .32s cubic-bezier(.4,0,.2,1), opacity .25s',
    }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

/* ── Inline icons. Kept local so the component is portable
   between popup + content-script bundles without pulling
   icons.jsx into the popup's bundle graph (which the popup
   already does, but keeping local makes the component self-
   contained for future extraction). ── */
function SwapIcon({ size = 9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 10l-3 3 3 3M4 13h16M17 4l3 3-3 3M20 7H4" />
    </svg>
  );
}
function ShuffleIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}
function PinIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M9 3h6l-1 4 3 5H7l3-5-1-4z" />
    </svg>
  );
}
function ChevDownIcon({ size = 10 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
function CheckIcon({ size = 10, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
      style={style}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* Inject the row-stagger keyframes once. Loose CSS animation
   instead of motion.div so the lists can re-render rapidly during
   typeahead / filter changes without restarting animations. */
const KF_ID = '__gb-tpl-picker-anims';
(function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KF_ID)) return;
  const s = document.createElement('style');
  s.id = KF_ID;
  s.textContent = `
    @keyframes gb-tpl-row-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
})();
