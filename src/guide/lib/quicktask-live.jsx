import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  COMPOSER_TONE, CornerKey, StatusBadge, TYPE_ICONS, Kbd, I, Icon, DueControl, Btn,
} from '../../ui/index.js';
import { getTaskCategoryLabel, getTaskCategoryTone } from '../../lib/taskCategories.js';
import { getDueLabel, PRIORITY_OPTIONS } from '../../lib/quickTask.js';

/* ───────────────────────────────────────────────────────────────
   quicktask-live.jsx — a faithful port of the QuickTask composer
   for the guide. Same KeyboardComposer chrome (filter rows + the
   compose bar: tag chips, subject, note, due, preview) rebuilt as
   self-contained pieces on sample templates, reusing the real
   DueControl / StatusBadge / tones. Reusable cutouts:
     • QuickTaskLive  — the whole modal (LiveStage hero)
     • QtTemplateRow  — a filter-list template row
     • QtComposeBar   — the compose bar (chips + subject + note + due)
     • QtTokenMenu    — the “/” category / priority picker
─────────────────────────────────────────────────────────────── */

const CalIcon = (p) => <Icon {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Icon>;

export const SAMPLE_TEMPLATES = [
  { id: 'qt1', name: 'Proposal Follow-up', subject: 'Follow up on quote', categoryId: 8, daysOut: 5 },
  { id: 'qt2', name: '15-Day Call', subject: '15 day call/email', categoryId: 12, daysOut: 15 },
  { id: 'qt3', name: 'Order Day Call', subject: '', categoryId: 9, daysOut: 0 },
  { id: 'qt4', name: 'Replacement Contact', subject: '', categoryId: 18, daysOut: 3 },
];

/* ── QtTemplateRow — faithful filter-list row (TaskRow port). */
export function QtTemplateRow({ tpl, hotkey, isActive, onClick, flashing }) {
  const [hover, setHover] = useState(false);
  const lit = hover || isActive;
  const tone = COMPOSER_TONE[getTaskCategoryTone(tpl.categoryId)] || COMPOSER_TONE.neutral;
  const catLabel = getTaskCategoryLabel(tpl.categoryId);
  const due = getDueLabel(tpl.daysOut);
  const secondary = (tpl.subject && tpl.subject !== tpl.name) ? tpl.subject : (tpl.body || '');
  return (
    <button type="button" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onClick}
      style={{ position: 'relative', outline: 'none', display: 'grid', gridTemplateColumns: '24px 22px 1fr auto', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 12px 10px 13px', background: isActive ? tone.bgMed : hover ? tone.bg : 'transparent', border: '1px solid', borderColor: isActive ? tone.bd : 'transparent', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)', transition: 'background .15s ease, border-color .15s ease' }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: tone.solid, transform: isActive ? 'scaleY(1)' : hover ? 'scaleY(.4)' : 'scaleY(0)', opacity: isActive ? 1 : hover ? 0.55 : 0, transition: 'transform .2s cubic-bezier(.34,1.4,.64,1), opacity .18s ease' }} />
      <span style={{ display: 'flex', justifyContent: 'center' }}><StatusBadge active={isActive} tone={tone}>{hotkey}</StatusBadge></span>
      <span style={{ display: 'flex', justifyContent: 'center', color: tone.fg }}><TYPE_ICONS.task size={15} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name || 'Untitled'}</span>
        {secondary && <span style={{ display: 'block', fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', opacity: lit ? 1 : 0, transition: 'opacity .15s' }}><I.edit size={12} /></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: COMPOSER_TONE.brand.bg, color: COMPOSER_TONE.brand.fg, border: `1px solid ${COMPOSER_TONE.brand.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{due === 'today' ? 'TODAY' : due.replace('in ', '+')}</span>
        {catLabel && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', flexShrink: 0 }}>{catLabel}</span>}
      </span>
    </button>
  );
}

/* ── QtTokenMenu — the “/” category + priority picker. */
const MENU_CATEGORIES = [8, 9, 11, 12, 18];
export function QtTokenMenu({ tokens, onSelect }) {
  const Section = ({ label }) => <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '8px 8px 4px' }}>{label}</div>;
  const Item = ({ tone, label, on }) => {
    const T = COMPOSER_TONE[tone] || COMPOSER_TONE.neutral;
    return (
      <div role="option" onClick={() => onSelect?.()} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', background: on ? T.bg : 'transparent', border: `1px solid ${on ? T.bd : 'transparent'}` }}>
        <span style={{ width: 20, display: 'flex', justifyContent: 'center', color: T.fg }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: T.solid }} /></span>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: 'var(--gb-text-primary)' }}>{label}</span>
        {on && <I.check size={13} style={{ color: T.fg }} />}
      </div>
    );
  };
  return (
    <div role="listbox" style={{ maxHeight: 280, overflowY: 'auto', padding: 6, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-strong)', borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)' }}>
      <Section label="Category" />
      {MENU_CATEGORIES.map((id) => <Item key={id} tone={getTaskCategoryTone(id)} label={getTaskCategoryLabel(id)} on={tokens?.category === id} />)}
      <Section label="Priority" />
      {PRIORITY_OPTIONS.map((p) => <Item key={p.id} tone={p.tone} label={p.label} on={tokens?.priority === p.id} />)}
    </div>
  );
}

/* ── ComposePreview — faithful preview card. */
function ComposePreview({ tokens, subject, note, contact, due }) {
  const cat = tokens.category != null;
  const catTone = cat ? COMPOSER_TONE[getTaskCategoryTone(tokens.category)] : null;
  const prio = tokens.priority ? PRIORITY_OPTIONS.find((p) => p.id === tokens.priority) : null;
  const leadTone = catTone || COMPOSER_TONE.brand;
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)', padding: '2px 2px 8px' }}>Preview</div>
      <div style={{ display: 'flex', gap: 11, padding: 12, background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
        <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 'var(--gb-r-md)', background: leadTone.bgMed, border: `1px solid ${leadTone.bd}`, color: leadTone.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TYPE_ICONS.task size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: subject ? 'var(--gb-text-primary)' : 'var(--gb-text-ghost)' }}>{subject || 'Untitled task'}</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: COMPOSER_TONE.brand.bg, border: `1px solid ${COMPOSER_TONE.brand.bd}`, color: COMPOSER_TONE.brand.fg, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}><CalIcon size={11} /> {due}</span>
            {cat && <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 'var(--gb-r-pill)', background: catTone.bg, color: catTone.fg, border: `1px solid ${catTone.bd}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{getTaskCategoryLabel(tokens.category)}</span>}
            {prio && <span style={{ display: 'inline-flex', padding: '3px 8px', borderRadius: 'var(--gb-r-pill)', background: COMPOSER_TONE[prio.tone].bg, color: COMPOSER_TONE[prio.tone].fg, border: `1px solid ${COMPOSER_TONE[prio.tone].bd}`, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{prio.label}</span>}
          </div>
          {note ? <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', marginTop: 7, lineHeight: 1.5 }}>{note}</div> : <div style={{ fontSize: 11.5, color: 'var(--gb-text-ghost)', marginTop: 7, fontStyle: 'italic' }}>Add a description below…</div>}
          <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', marginTop: 8, display: 'flex', gap: 6, fontFamily: 'var(--gb-font-mono)' }}>
            <span>{contact}</span><span style={{ opacity: 0.5 }}>·</span>
            <span style={{ color: cat ? 'var(--gb-brand-label)' : 'var(--gb-warning-fg)', fontWeight: 600 }}>{cat ? 'ready' : 'needs category'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── QtComposeBar — the compose bar (chips + subject + note + due). */
export function QtComposeBar({ tokens, setTokens, subject, setSubject, note, setNote, due, setDue, onOpenMenu, onCommit, onClear, demo }) {
  const dueApi = { ref: useRef(), commit: onCommit || (() => {}), reset: onClear || (() => {}), focusSubject: () => {}, focusBody: () => {} };
  const removeToken = (k) => setTokens((t) => { const n = { ...t }; delete n[k]; return n; });
  const chips = [];
  if (tokens.category != null) { const T = COMPOSER_TONE[getTaskCategoryTone(tokens.category)]; chips.push({ key: 'category', label: getTaskCategoryLabel(tokens.category), T }); }
  if (tokens.priority) { const p = PRIORITY_OPTIONS.find((x) => x.id === tokens.priority); chips.push({ key: 'priority', label: p.label, T: COMPOSER_TONE[p.tone] }); }
  return (
    <div className="gb-kbd-composer" data-demo={demo} style={{ padding: '14px 16px 10px' }}>
      <div className="clr-bar" style={{ display: 'flex', flexDirection: 'column', padding: '10px 11px', background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)', gap: 9 }}>
        {/* tags row */}
        <div data-demo={demo ? `${demo}-chips` : undefined} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span style={{ display: 'flex', color: 'var(--gb-brand-label)', flexShrink: 0, marginRight: 1 }}><CornerKey size={15} /></span>
          {chips.map((c) => (
            <span key={c.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 8px', borderRadius: 'var(--gb-r-sm)', background: c.T.bgMed, border: `1px solid ${c.T.bd}`, color: c.T.fg, fontSize: 11.5, fontWeight: 600 }}>
              {c.label}
              <span role="button" onClick={() => removeToken(c.key)} style={{ display: 'flex', cursor: 'pointer', opacity: 0.7, marginLeft: 1 }}><I.close size={11} /></span>
            </span>
          ))}
          <button type="button" onClick={onOpenMenu} title="Add tag · /" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 'var(--gb-r-sm)', background: 'var(--gb-fill-subtle)', border: '1px dashed var(--gb-border-strong)', color: 'var(--gb-text-tertiary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'var(--gb-font-sans)' }}>
            <I.plus size={11} /> tag
          </button>
        </div>
        {/* subject */}
        <div data-demo={demo ? `${demo}-subject` : undefined} style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
          <span style={FIELD_TAG}>Task</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What needs doing?" autoComplete="off" spellCheck={false}
            style={{ flex: 1, minWidth: 0, height: 24, background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--gb-font-sans)' }} />
        </div>
        {/* note */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
          <span style={{ ...FIELD_TAG, paddingTop: 3 }}>Note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a description…" spellCheck={false}
            style={{ flex: 1, minWidth: 0, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-secondary)', fontSize: 13, fontWeight: 500, lineHeight: 1.5, fontFamily: 'var(--gb-font-sans)', padding: 0 }} />
        </div>
        {/* due (real DueControl) */}
        <div data-demo={demo ? `${demo}-due` : undefined}><DueControl ref={dueApi.ref} api={dueApi} due={due} setDue={setDue} /></div>
        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--gb-border-subtle)', paddingTop: 9 }}>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClear} style={GHOST_BTN}>Clear</button>
          <button type="button" onClick={onCommit} style={SAVE_BTN}>Add task</button>
        </div>
      </div>
    </div>
  );
}

const FIELD_TAG = { width: 54, flexShrink: 0, fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--gb-text-muted)', userSelect: 'none' };
const GHOST_BTN = { background: 'transparent', border: 'none', color: 'var(--gb-text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 10px', fontFamily: 'var(--gb-font-sans)' };
const SAVE_BTN = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 30, padding: '0 16px', background: 'var(--gb-fill-strong)', color: 'var(--gb-text-primary)', border: '1px solid var(--gb-border-strong)', borderRadius: 'var(--gb-r-sm)', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: 700, cursor: 'pointer' };

/* ── QuickTaskLive — the whole modal, faithful, with imperative API. */
export const QuickTaskLive = forwardRef(function QuickTaskLive({ contact = 'Marcus Chen' }, ref) {
  const [mode, setMode] = useState('compose'); // 'filter' | 'compose'
  const [filter, setFilter] = useState('');
  const [tokens, setTokens] = useState({ category: 8, priority: '2' });
  const [subject, setSubject] = useState('Confirm artwork before reorder');
  const [note, setNote] = useState('');
  const [due, setDue] = useState({ kind: 'relative', days: 5 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState(0);

  const results = SAMPLE_TEMPLATES.filter((t) => !filter.trim() || (t.name + ' ' + (t.subject || '')).toLowerCase().includes(filter.trim().toLowerCase()));
  const dueHuman = (() => { const d = due?.days || 0; return d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d}d`; })();

  const fire = (tpl) => { setMode('compose'); setTokens({ category: tpl.categoryId, priority: '2' }); setSubject(tpl.subject || tpl.name); setDue({ kind: 'relative', days: tpl.daysOut || 0 }); };

  useImperativeHandle(ref, () => ({
    toFilter: () => setMode('filter'),
    toCompose: () => setMode('compose'),
    openMenu: () => { setMode('compose'); setMenuOpen(true); },
    closeMenu: () => setMenuOpen(false),
    setActive, fireActive: () => fire(results[active] || results[0]),
    setSubject, setDue,
  }), [results, active]);

  return (
    <div style={{ width: 480, display: 'flex', flexDirection: 'column', background: 'var(--gb-surface-canvas)', color: 'var(--gb-text-secondary)', fontFamily: 'var(--gb-font-sans)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal)', overflow: 'hidden' }}>
      {/* header */}
      <div data-demo="header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--gb-surface-1)', borderBottom: '1px solid var(--gb-border-subtle)' }}>
        <div style={{ width: 28, height: 28, borderRadius: 'var(--gb-r-md)', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><TYPE_ICONS.task size={15} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)' }}>Create task</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{contact}</div>
        </div>
      </div>

      {mode === 'compose' ? (
        <div style={{ position: 'relative' }}>
          <QtComposeBar demo="compose" {...{ tokens, setTokens, subject, setSubject, note, setNote, due, setDue }}
            onOpenMenu={() => setMenuOpen((v) => !v)} onCommit={() => {}} onClear={() => { setSubject(''); setNote(''); setTokens({}); }} />
          {menuOpen && (
            <div style={{ position: 'absolute', left: 16, right: 16, top: 60, zIndex: 40 }}>
              <QtTokenMenu tokens={tokens} onSelect={() => setMenuOpen(false)} />
            </div>
          )}
          <ComposePreview tokens={tokens} subject={subject} note={note} contact={contact} due={dueHuman} />
        </div>
      ) : (
        <>
          <div style={{ padding: '14px 16px 10px' }}>
            <div className="clr-bar" style={{ display: 'flex', alignItems: 'center', gap: 9, height: 38, padding: '0 10px', background: 'var(--gb-fill-medium)', border: '1px solid var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>
              <I.search size={15} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter quick tasks…   or / to compose" autoComplete="off" spellCheck={false}
                style={{ flex: 1, minWidth: 0, height: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--gb-text-primary)', fontSize: 13, fontWeight: 500, fontFamily: 'var(--gb-font-sans)' }} />
              <Kbd>/</Kbd>
            </div>
          </div>
          <div data-demo="list" style={{ maxHeight: 280, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 8px' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Quick tasks</span>
              <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{results.length} of {SAMPLE_TEMPLATES.length}</span>
            </div>
            {results.map((tpl, i) => <QtTemplateRow key={tpl.id} tpl={tpl} hotkey={i + 1} isActive={active === i} onClick={() => fire(tpl)} />)}
          </div>
        </>
      )}

      {/* footer */}
      <div data-demo="footer" style={{ padding: 12, borderTop: '1px solid var(--gb-border-subtle)', background: 'var(--gb-surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Build a task</span><Kbd>/</Kbd>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Kbd>↑↓</Kbd> move · <Kbd>↵</Kbd> add</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="secondary">Cancel</Btn>
      </div>
    </div>
  );
});
