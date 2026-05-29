import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Kbd, TYPE_ICONS,
  KeyboardComposer, useComposerFilter, COMPOSER_TONE, DueControl,
  Icon, I, useToast,
} from '../ui/index.js';
import { useModalTopState } from '../lib/actionRegistry.js';
import {
  PRIORITY_OPTIONS,
  DEFAULT_PRIORITY,
  loadTaskTemplates,
  subscribeToTaskTemplates,
  getDueLabel,
  buildCustomTaskTemplate,
  qtResolveDue,
} from '../lib/quickTask.js';
import {
  TASK_CATEGORY_OPTIONS,
  getTaskCategoryLabel,
  getTaskCategoryTone,
} from '../lib/taskCategories.js';

/* ───────────────────────────────────────────────────────────────
   QuickTask — the redesigned, keyboard-first task creator.

   The old preset-grid + collapsible custom form is replaced by the
   shared KeyboardComposer (see ui/components/KeyboardComposer.jsx):

     • A filter bar over the rep's saved task templates. Type to
       filter; ↑↓ walk the rows; 1–9 fire the Nth; Enter fires the
       top match.
     • Press / (or type a category/priority word) and the bar grows
       into a keyboard-only composer — Category + Priority become
       coloured chips via the / menu, Subject + Note are explicit
       fields, and DATE is a first-class inline control (quick chips
       + a typed mm/dd/yy). A live preview mirrors the CRM task.

   Both paths fund the same onSubmit(template) the modal already takes,
   so the CRM Task/Create.ajax pipe (src/lib/submitQuickTask.js) is
   unchanged. Category is now the real CRM enum (taskCategories.js),
   never a forced numeric id.

   Props
     contactName  string                 display name (header)
     contactType  'contact' | 'account'  (informational)
     onSubmit     (template) => Promise<{ ok, error?, taskId? }>   REQUIRED
     onClosed     () => void
     bindClose    (fn) => void
─────────────────────────────────────────────────────────────── */

/* Composer glyphs. */
const FlagIcon  = (p) => <Icon {...p}><path d="M4 21V4M4 4h13l-2 4 2 4H4" /></Icon>;
const TagIcon   = (p) => <Icon {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><circle cx="7" cy="7" r="1.5" /></Icon>;
const CalIcon   = (p) => <Icon {...p}><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></Icon>;

const findPriority = (v) => PRIORITY_OPTIONS.find((p) => p.id === String(v)) || PRIORITY_OPTIONS[1];
const normTone = (t) => (t === 'muted' ? 'neutral' : t);

/* Schema for the composer's / menu: real Category enum + Priority. */
function buildTaskSchema() {
  const catOptions = TASK_CATEGORY_OPTIONS
    .filter((o) => o.id !== '0')
    .map((o) => ({ value: o.id, label: o.label, tone: getTaskCategoryTone(o.id) }));
  const prioOptions = PRIORITY_OPTIONS.map((p) => ({ value: p.id, label: p.label, tone: normTone(p.tone) }));

  /* shorthand: a typed word + space snaps to a chip. */
  const shPriority = (w) => ({ high: '1', p1: '1', urgent: '1', med: '2', medium: '2', p2: '2', low: '3', p3: '3' }[w] ?? null);
  const shCategory = (w) => {
    const hit = catOptions.find((c) => c.label.toLowerCase() === w || c.label.toLowerCase().split(/[ /]/)[0] === w);
    return hit ? hit.value : null;
  };

  return {
    filterPlaceholder: 'Filter quick tasks…   or / to compose',
    subjectPlaceholder: 'What needs doing?',
    requiredKey: 'category',
    fromTemplate: (tpl) => {
      const t = {};
      if (tpl.categoryId) t.category = String(tpl.categoryId);
      if (tpl.priority) t.priority = String(tpl.priority);
      return t;
    },
    tokenTypes: [
      {
        key: 'category', menuLabel: 'Category', options: catOptions, shorthand: shCategory,
        chip: (v) => ({ tone: getTaskCategoryTone(v), label: getTaskCategoryLabel(v) || 'Category', icon: <TagIcon size={12} /> }),
      },
      {
        key: 'priority', menuLabel: 'Priority', options: prioOptions, shorthand: shPriority,
        chip: (v) => { const p = findPriority(v); return { tone: normTone(p.tone), label: `${p.label} priority`, icon: <FlagIcon size={12} /> }; },
      },
    ],
  };
}

export function QuickTask({
  contactName = 'Contact',
  contactType = 'contact',
  onSubmit,
  onClosed,
  bindClose,
}) {
  void contactType;
  const toast = useToast();
  const schema = React.useMemo(() => buildTaskSchema(), []);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState(null);
  /* Due lives here (not in the composer) so onLog can read it back. */
  const [due, setDue] = useState({ kind: 'relative', days: 0 });

  const composerRef = useRef(null);
  const f = useComposerFilter(templates, {
    getText: (t) => getTaskCategoryLabel(t.categoryId),
  });

  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => { bindCloseRef.current = fn; if (bindClose) bindClose(fn); };
  const animatedClose = () => bindCloseRef.current?.();

  useEffect(() => {
    let alive = true;
    loadTaskTemplates().then((t) => { if (!alive) return; setTemplates(t); setLoading(false); });
    const unsub = subscribeToTaskTemplates((next) => { if (alive) setTemplates(next); });
    return () => { alive = false; unsub(); };
  }, []);

  /* Land focus in the composer's filter bar on open. */
  useEffect(() => {
    const id = setTimeout(() => composerRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  /* Fire a stored template straight to the CRM. */
  const fireTemplate = async (tpl) => {
    if (!tpl || busy) return;
    if (!tpl.subject && !tpl.name) {
      toast?.error?.(`"${tpl.name || 'Untitled'}" has no subject. Open the Notes editor and add one.`);
      return;
    }
    if (!onSubmit) { toast?.error?.('Quick-task submit is not wired up'); return; }
    setFlashId(tpl.id); setTimeout(() => setFlashId((id) => (id === tpl.id ? null : id)), 650);
    setBusy(true);
    try {
      const result = await onSubmit(tpl);
      if (result?.ok) { toast?.success?.(`Task created: ${tpl.name || tpl.subject}`, { duration: 2200 }); animatedClose(); }
      else { toast?.error?.(`Couldn't create task: ${result?.error || 'unknown error'}`); setBusy(false); }
    } catch (err) { toast?.error?.(`Couldn't create task: ${err?.message || err}`); setBusy(false); }
  };

  /* Fire a composed (custom) entry — tokens → template + the inline due. */
  const logComposed = async ({ tokens, subject, body }) => {
    if (busy) return;
    if (!subject) { toast?.warning?.('Add a subject before adding the task'); return; }
    if (!onSubmit) { toast?.error?.('Quick-task submit is not wired up'); return; }
    const resolved = qtResolveDue(due);
    const daysOut = resolved.daysOut > 0 ? resolved.daysOut : 0;
    const synthetic = buildCustomTaskTemplate({
      subject, body,
      priority: tokens.priority || DEFAULT_PRIORITY,
      daysOut,
      categoryId: tokens.category || 0,
    });
    setBusy(true);
    try {
      const result = await onSubmit(synthetic);
      if (result?.ok) { toast?.success?.('Task created', { duration: 2200 }); animatedClose(); }
      else { toast?.error?.(`Couldn't create task: ${result?.error || 'unknown error'}`); setBusy(false); }
    } catch (err) { toast?.error?.(`Couldn't create task: ${err?.message || err}`); setBusy(false); }
  };

  /* Customise a preset → seed the composer (incl. its due). */
  const customise = (tpl) => {
    setDue(tpl.daysOut != null ? { kind: 'relative', days: tpl.daysOut } : { kind: 'relative', days: 0 });
    composerRef.current?.loadTemplate({ ...tpl, subject: tpl.subject || tpl.name, body: tpl.body || '' });
  };

  const modalVisible = useModalTopState('quick-task', 'Quick Task');

  /* Preview extras driven by the inline due. */
  const resolved = qtResolveDue(due);
  const duePill = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 'var(--gb-r-pill)', background: COMPOSER_TONE.brand.bg, border: `1px solid ${COMPOSER_TONE.brand.bd}`, color: COMPOSER_TONE.brand.fg, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      <CalIcon size={11} /> {resolved.isToday ? 'Today' : resolved.human}
    </span>
  );
  const dueFooter = <span style={{ fontFamily: 'var(--gb-font-mono)' }}>due {resolved.crmDate}</span>;

  const renderList = (ff) => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 8px' }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Quick tasks</span>
        {templates.length > 0 && <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)' }}>{ff.results.length} of {templates.length}</span>}
      </div>
      {loading ? (
        <ListHint>Loading templates…</ListHint>
      ) : templates.length === 0 ? (
        <BuildPrompt onBuild={() => composerRef.current?.openMenu()} text="No task templates yet." />
      ) : ff.results.length === 0 ? (
        <BuildPrompt onBuild={() => composerRef.current?.openMenu()} text="No task matches." />
      ) : (
        ff.results.map((tpl, i) => (
          <TaskRow
            key={tpl.id} tpl={tpl} hotkey={i + 1}
            isActive={ff.active === i} flashing={flashId === tpl.id}
            rowRef={(el) => (ff.rowRefs.current[i] = el)}
            onFocus={() => ff.setActive(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); customise(tpl); return; }
              if (e.key === 'Tab') return;
              ff.onRowKey(e, i, fireTemplate);
            }}
            onClick={() => fireTemplate(tpl)}
            onCustomise={customise}
          />
        ))
      )}
    </div>
  );

  return (
    <FloatingPanel
      width={480}
      backdrop
      draggable
      visible={modalVisible}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader icon={<TYPE_ICONS.task />} title="Create task" subtitle={contactName} />

      <div
        style={{ display: 'flex', flexDirection: 'column', height: 'min(72vh, 600px)' }}
        onKeyDown={(e) => {
          if (e.key === '/') {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag !== 'input' && tag !== 'textarea') { e.preventDefault(); composerRef.current?.openMenu(); return; }
          }
          f.onContainerKey(e, fireTemplate);
        }}
      >
        <KeyboardComposer
          ref={composerRef}
          schema={schema}
          f={f}
          onLog={logComposed}
          onFilterEnter={fireTemplate}
          renderList={renderList}
          contact={contactName}
          composeTitle="Composing a task"
          subjectLabel="Task"
          noteLabel="Note"
          saveLabel="Add task"
          leadIcon={<TYPE_ICONS.task size={15} />}
          previewExtraChips={duePill}
          previewFooterMeta={dueFooter}
          previewReadyLabel="ready"
          previewNeedLabel="needs category"
          previewUntitled="Untitled task"
          buildExtra={(api) => <DueControl ref={api.ref} api={api} due={due} setDue={setDue} />}
        />
      </div>

      {/* Footer — keyboard legend + cancel */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-2)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Build a task</span><Kbd>/</Kbd>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-ghost)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Kbd>↑↓</Kbd> move · <Kbd>↵</Kbd> add
        </span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={busy}>Cancel</Btn>
      </div>
    </FloatingPanel>
  );
}

/* ── Preset row — scannable: hotkey · check · name/subject · due · category. */
function TaskRow({ tpl, hotkey, isActive, flashing, rowRef, onFocus, onKeyDown, onClick, onCustomise }) {
  const [hover, setHover] = useState(false);
  const lit = hover || isActive;
  const tone = COMPOSER_TONE[getTaskCategoryTone(tpl.categoryId)] || COMPOSER_TONE.neutral;
  const catLabel = getTaskCategoryLabel(tpl.categoryId);
  const due = getDueLabel(tpl.daysOut);
  const secondary = (tpl.subject && tpl.subject !== tpl.name) ? tpl.subject : (tpl.body || '');

  return (
    <button
      type="button" ref={rowRef} className={`clr-row${flashing ? ' clr-row-flash' : ''}`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onKeyDown={onKeyDown} onFocus={onFocus} onClick={onClick}
      style={{
        position: 'relative', outline: 'none', display: 'grid', gridTemplateColumns: '24px 22px 1fr auto',
        alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '10px 12px 10px 13px',
        background: isActive ? tone.bgMed : hover ? tone.bg : 'transparent',
        border: '1px solid', borderColor: isActive ? tone.bd : 'transparent',
        borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontFamily: 'var(--gb-font-sans)',
        transition: 'background .15s ease, border-color .15s ease', '--clr-flash': tone.solid,
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 3, background: tone.solid, transform: isActive ? 'scaleY(1)' : hover ? 'scaleY(.4)' : 'scaleY(0)', opacity: isActive ? 1 : hover ? 0.55 : 0, boxShadow: isActive ? `0 0 8px ${tone.solid}` : 'none', transition: 'transform .2s cubic-bezier(.34,1.4,.64,1), opacity .18s ease' }} />
      <span style={{ display: 'flex', justifyContent: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 17, height: 17, padding: '0 4px', borderRadius: 4, fontSize: 9.5, fontWeight: 700, fontFamily: 'var(--gb-font-mono)', background: isActive ? tone.bgMed : 'var(--gb-fill-inverse-medium)', border: `1px solid ${isActive ? tone.bd : 'var(--gb-border-default)'}`, color: isActive ? tone.fg : 'var(--gb-text-tertiary)', transition: 'all .15s' }}>{hotkey}</span>
      </span>
      <span style={{ display: 'flex', justifyContent: 'center', color: tone.fg }}><TYPE_ICONS.task size={15} /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--gb-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.name || 'Untitled'}</span>
        {secondary && <span style={{ display: 'block', fontSize: 11, color: 'var(--gb-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{secondary}</span>}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span role="button" tabIndex={-1} title="Customise · ⇧↵" onClick={(e) => { e.stopPropagation(); onCustomise(tpl); }}
          style={{ width: 24, height: 24, borderRadius: 'var(--gb-r-sm)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gb-fill-subtle)', border: '1px solid var(--gb-border-default)', color: 'var(--gb-text-tertiary)', cursor: 'pointer', opacity: lit ? 1 : 0, transform: lit ? 'none' : 'translateX(4px)', pointerEvents: lit ? 'auto' : 'none', transition: 'opacity .15s, transform .15s' }}><I.edit size={12} /></span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: COMPOSER_TONE.brand.bg, color: COMPOSER_TONE.brand.fg, border: `1px solid ${COMPOSER_TONE.brand.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>{due === 'today' ? 'TODAY' : due.replace('in ', '+')}</span>
        {catLabel && <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 'var(--gb-r-pill)', background: tone.bg, color: tone.fg, border: `1px solid ${tone.bd}`, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>}
      </span>
    </button>
  );
}

function ListHint({ children }) {
  return (
    <div style={{ padding: '14px 10px', fontSize: 11.5, color: 'var(--gb-text-muted)', textAlign: 'center', fontStyle: 'italic' }}>{children}</div>
  );
}

function BuildPrompt({ onBuild, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 16px', textAlign: 'center' }}>
      <I.search size={20} style={{ color: 'var(--gb-text-ghost)' }} />
      <div style={{ fontSize: 12, color: 'var(--gb-text-tertiary)', fontWeight: 600 }}>{text}</div>
      <button type="button" className="clr-focusable clr-no-lift" onClick={onBuild}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', borderRadius: 'var(--gb-r-md)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
        <I.plus size={13} /> Build a task <Kbd>↵</Kbd>
      </button>
    </div>
  );
}
