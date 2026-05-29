import React, { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../icons.jsx';

/* ───────────────────────────────────────────────────────────────
   CategorizeRail — right-side rail for the Email Case modal.

   Ported from the design handoff (case-categorize.jsx). The unit
   of tab focus is the SECTION, not the chip:

     • Tab / Shift-Tab walks the sections (each is a real focusable
       <div class="gb-ev-focusable"> so the browser drives it).
     • Once a section has focus, 1–9 pick that chip, ↓↑ move a
       highlight, ↵ fires the highlighted chip. Clicking a chip
       always works regardless of focus.
     • A breadcrumb chip in the header tracks the focused section
       (and the highlighted chip within it) so the user can verify
       position without looking down.
     • The ✦ Recommended section (template-suggested pairs) renders
       first with a brand accent.

   onApply(category, subcategory) always receives the STRUCTURED
   pair — no concatenated strings, no sentinel category (the
   legacy bug). recommended entries carry { category, subcategory,
   label } where label is display-only.
─────────────────────────────────────────────────────────────── */

const FOCUS_STYLE_ID = '__gb-ev-focus-style';
function ensureFocusStyle() {
  if (typeof document === 'undefined' || document.getElementById(FOCUS_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = FOCUS_STYLE_ID;
  s.textContent = `
    .gb-ev-focusable { position: relative; outline: none !important; }
    .gb-ev-focusable:focus, .gb-ev-focusable:focus-visible { outline: none !important; }
    .gb-ev-focusable::before, .gb-ev-focusable::after {
      content: ''; position: absolute; inset: 0; border-radius: inherit;
      pointer-events: none; opacity: 0; transition: opacity .2s ease;
    }
    .gb-ev-focusable:focus-visible::before,
    .gb-ev-focusable:focus-visible::after { opacity: 1; }
    .gb-ev-focusable::before {
      box-shadow: 0 0 0 1.5px var(--gb-brand-label);
      animation: gb-ev-breath 1.7s ease-in-out infinite paused;
    }
    .gb-ev-focusable:focus-visible::before { animation-play-state: running; }
    .gb-ev-focusable::after {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--gb-brand-label) 14%, transparent),
                  0 0 20px 0 color-mix(in srgb, var(--gb-brand-label) 20%, transparent);
    }
    @keyframes gb-ev-breath {
      0%, 100% { box-shadow: 0 0 0 1.5px var(--gb-brand-label); }
      50%      { box-shadow: 0 0 0 1.5px var(--gb-brand-label),
                             inset 0 0 12px 1px color-mix(in srgb, var(--gb-brand-label) 30%, transparent); }
    }
    @keyframes gb-ev-chip-pop {
      0%   { transform: scale(.92); opacity: 0; }
      100% { transform: scale(1);   opacity: 1; }
    }
    .gb-ev-chip { animation: gb-ev-chip-pop .2s cubic-bezier(.34,1.4,.64,1); }
  `;
  document.head.appendChild(s);
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 16, height: 16, padding: '0 4px',
      background: 'var(--gb-surface-2)',
      border: '1px solid var(--gb-border-default)',
      borderRadius: 3,
      fontSize: 9.5, fontWeight: 700,
      fontFamily: 'var(--gb-font-mono)',
      color: 'var(--gb-text-secondary)',
    }}>{children}</span>
  );
}

function BreadcrumbChip({ focused, chipIdx, sections }) {
  if (!focused) {
    return (
      <div style={{
        marginTop: 8,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 10px',
        background: 'var(--gb-fill-subtle)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-pill)',
        fontSize: 10.5,
        color: 'var(--gb-text-muted)',
      }}>
        <Kbd>Tab</Kbd>
        <span>to start walking sections</span>
      </div>
    );
  }
  const sect = sections.find((s) => s.id === focused.section);
  const sub = sect?.subs?.[chipIdx];
  return (
    <div
      key={focused.section}
      className="gb-ev-chip"
      style={{
        marginTop: 8,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '5px 10px',
        background: 'var(--gb-brand-tint-medium)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        borderRadius: 'var(--gb-r-pill)',
        fontSize: 10.5, fontWeight: 600,
        maxWidth: '100%',
      }}
    >
      <span style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6,
        textTransform: 'uppercase',
        fontFamily: 'var(--gb-font-mono)',
      }}>{sect?.title || focused.section}</span>
      {sub && (
        <>
          <span style={{ color: 'color-mix(in srgb, var(--gb-brand-label) 50%, transparent)' }}>›</span>
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{sub.subcategory}</span>
        </>
      )}
    </div>
  );
}

function CategoryChip({ index, label, applied, highlighted, sectionFocused, accent, onClick }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '20px 1fr auto',
        gap: 8, alignItems: 'center',
        padding: '8px 10px',
        background: applied
          ? 'var(--gb-brand-tint-medium)'
          : highlighted
            ? 'color-mix(in srgb, var(--gb-brand-tint-medium) 60%, var(--gb-surface-2))'
            : accent
              ? 'color-mix(in srgb, var(--gb-brand-tint-soft) 80%, transparent)'
              : 'var(--gb-surface-2)',
        border: '1px solid ' + ((applied || highlighted || accent)
          ? 'var(--gb-brand-tint-border)'
          : 'var(--gb-border-subtle)'),
        color: (applied || highlighted) ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)',
        borderRadius: 'var(--gb-r-sm)',
        cursor: applied ? 'default' : 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        fontSize: 11.5, fontWeight: 600,
        transition: 'background-color .2s, border-color .2s, color .2s',
        minHeight: 32,
        outline: 'none',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 4,
        background: (sectionFocused || applied) ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
        border: '1px solid ' + ((sectionFocused || applied) ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
        color: (sectionFocused || applied) ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
        fontSize: 9.5, fontWeight: 800,
        fontFamily: 'var(--gb-font-mono)',
        flexShrink: 0,
        transition: 'background-color .25s, border-color .25s, color .25s',
      }}>{index <= 9 ? index : '·'}</span>

      <span style={{
        flex: 1, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>

      {applied
        ? <I.check size={11} strokeWidth={3} />
        : (highlighted
            ? <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                color: 'var(--gb-brand-label)',
                fontFamily: 'var(--gb-font-mono)',
                textTransform: 'uppercase',
              }}>↵</span>
            : null)}
    </button>
  );
}

function CategorySection({ sect, applied, focusedSection, chipIdx, onFocus, onApply }) {
  const sectionFocused = focusedSection === sect.id;
  const isRecommended = !!sect.accent;
  const ref = useRef(null);

  useEffect(() => {
    if (sectionFocused && ref.current) {
      const scroller = ref.current.closest('[data-cc-scroll]');
      if (scroller) {
        const top = ref.current.offsetTop - 12;
        const visibleTop = scroller.scrollTop;
        const visibleBot = visibleTop + scroller.clientHeight;
        const elBot = top + ref.current.offsetHeight;
        if (top < visibleTop || elBot > visibleBot) {
          scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
        }
      }
    }
  }, [sectionFocused]);

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={sect.title}
      onFocus={onFocus}
      className="gb-ev-focusable"
      style={{
        marginBottom: 10,
        borderRadius: 'var(--gb-r-md)',
        padding: '6px 8px 8px',
        background: sectionFocused
          ? 'color-mix(in srgb, var(--gb-brand-tint-medium) 30%, transparent)'
          : isRecommended
            ? 'color-mix(in srgb, var(--gb-brand-tint-soft) 60%, transparent)'
            : 'transparent',
        boxShadow: sectionFocused
          ? 'inset 0 0 0 1px var(--gb-brand-tint-border)'
          : isRecommended
            ? 'inset 0 0 0 1px color-mix(in srgb, var(--gb-brand-label) 18%, transparent)'
            : 'none',
        transition: 'background-color .25s, box-shadow .25s',
        cursor: 'default',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        padding: '6px 4px 4px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: isRecommended ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
          }}>{sect.title}</span>
          {sect.subtitle && (
            <span style={{
              fontSize: 9.5, color: 'var(--gb-text-muted)',
              fontFamily: 'var(--gb-font-mono)',
            }}>· {sect.subtitle}</span>
          )}
        </div>
        {sectionFocused && (
          <span style={{
            padding: '1px 6px', borderRadius: 4,
            background: 'var(--gb-brand-tint-medium)',
            border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)',
            fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
            fontFamily: 'var(--gb-font-mono)',
            textTransform: 'uppercase',
          }}>1–9 · ↓↑ ↵</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sect.subs.map((s, i) => {
          const isApplied = applied && applied.category === s.category && applied.subcategory === s.subcategory;
          return (
            <CategoryChip
              key={`${s.category}-${s.subcategory}-${i}`}
              index={i + 1}
              label={s.label}
              applied={isApplied}
              highlighted={sectionFocused && chipIdx === i}
              sectionFocused={sectionFocused}
              accent={isRecommended}
              onClick={() => onApply(s.category, s.subcategory)}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CategorizeRail({
  sections: sectionsProp,
  recommended,
  applied,
  focused,
  onFocus,
  onApply,
  width = 380,
  title = 'Categorize',
}) {
  useEffect(() => { ensureFocusStyle(); }, []);

  const sections = useMemo(() => {
    const arr = [];
    if (recommended && recommended.length) {
      arr.push({
        id: '__recommended__',
        title: '✦ Recommended',
        subtitle: 'From template match',
        accent: true,
        subs: recommended.map((r) => ({
          category: r.category,
          subcategory: r.subcategory,
          label: r.label || `${r.subcategory} · ${r.category}`,
        })),
      });
    }
    (sectionsProp || []).forEach(({ category, subs }) => {
      if (!subs || subs.length === 0) return;
      arr.push({
        id: category,
        title: category,
        accent: false,
        subs: subs.map((s) => ({ category, subcategory: s, label: s })),
      });
    });
    return arr;
  }, [sectionsProp, recommended]);

  const [chipIdx, setChipIdx] = useState(0);
  useEffect(() => { setChipIdx(0); }, [focused?.section]);

  /* In-section keyboard. Only active while a section is focused;
     ignores keystrokes that originate in a text field so the reply
     composer keeps its own typing. */
  useEffect(() => {
    if (!focused) return undefined;
    const sect = sections.find((s) => s.id === focused.section);
    if (!sect) return undefined;
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || e.target?.isContentEditable) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setChipIdx((i) => Math.min(i + 1, sect.subs.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setChipIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const sel = sect.subs[chipIdx];
        if (sel) { e.preventDefault(); onApply(sel.category, sel.subcategory); }
      } else if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (sect.subs[i]) { e.preventDefault(); onApply(sect.subs[i].category, sect.subs[i].subcategory); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [focused, sections, chipIdx, onApply]);

  return (
    <div style={{
      width, flexShrink: 0,
      background: 'var(--gb-surface-1)',
      display: 'flex', flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{
        padding: '14px 16px 12px',
        borderBottom: '1px solid var(--gb-border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: 'var(--gb-text-muted)',
          }}>{title}</span>
          <div style={{ flex: 1 }} />
          {applied && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 8px',
              background: 'var(--gb-brand-tint-medium)',
              border: '1px solid var(--gb-brand-tint-border)',
              borderRadius: 'var(--gb-r-pill)',
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
              color: 'var(--gb-brand-label)',
              fontFamily: 'var(--gb-font-mono)',
              textTransform: 'uppercase',
            }}>
              <I.check size={9} strokeWidth={3.5} />
              Categorized
            </span>
          )}
        </div>

        <BreadcrumbChip focused={focused} chipIdx={chipIdx} sections={sections} />

        <div style={{
          marginTop: 10,
          display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
          fontSize: 10.5, color: 'var(--gb-text-muted)',
        }}>
          <Kbd>Tab</Kbd><span>walks sections</span>
          <span>·</span>
          <Kbd>1</Kbd><Kbd>–</Kbd><Kbd>9</Kbd><span>or</span>
          <Kbd>↓</Kbd><Kbd>↑</Kbd><Kbd>↵</Kbd><span>fires a row</span>
        </div>
      </div>

      <div data-cc-scroll style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '12px 12px 20px' }}>
        {sections.map((sect) => (
          <CategorySection
            key={sect.id}
            sect={sect}
            applied={applied}
            focusedSection={focused?.section}
            chipIdx={chipIdx}
            onFocus={() => onFocus({ section: sect.id })}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
}
