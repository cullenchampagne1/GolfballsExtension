import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingPanel, ModalHeader,
  Btn, Dropdown, Input, Textarea, Field, SectionLabel,
  CollapsibleSection, Dot, TYPE_ICONS,
  DatePicker, parseDateValue,
  I, useToast,
} from '../ui/index.js';
import { useModalTopState } from '../lib/actionRegistry.js';
import { ensureMarchingAntsStyle } from '../ui/index.js';
import {
  PRIORITY_OPTIONS,
  DEFAULT_PRIORITY,
  loadTaskTemplates,
  subscribeToTaskTemplates,
  getPriority,
  getDueLabel,
  buildCustomTaskTemplate,
} from '../lib/quickTask.js';

/* ───────────────────────────────────────────────────────────────
   QuickTask — sibling of CallLog. Same layout idiom, different
   payload: instead of phone-call activity-log fields, it captures
   the four fields a CRM task needs (subject, body, priority,
   daysOut) plus a categoryId.

   Quick Log section is a 3-col compact grid of preset task
   templates pulled from chrome.storage.local.noteTemplates
   (subType === 'task'). Click → fires onSubmit(template) → CRM
   Task/Create.ajax (see src/lib/submitQuickTask.js).

   Custom Log section is collapsed by default and exposes the
   same fields a saved task template has so reps can spin up a
   one-off task without having to save a template first.

   Props
     contactName  string                 display name (header)
     contactType  'contact' | 'account'  routes the smart-action label
     onSubmit     (template) => Promise<{ ok, error?, taskId? }>   REQUIRED
     onClosed     () => void
     bindClose    (fn) => void
─────────────────────────────────────────────────────────────── */

export function QuickTask({
  contactName = 'Contact',
  contactType = 'contact',
  onSubmit,
  onClosed,
  bindClose,
}) {
  const toast = useToast();

  /* ── Preset templates ─────────────────────────────────────── */
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  /* ── Custom form state ────────────────────────────────────── */
  const [subject, setSubject]     = useState('');
  const [body, setBody]           = useState('');
  const [priority, setPriority]   = useState(DEFAULT_PRIORITY);
  /* dueDate is an ISO-ish 'YYYY-MM-DD' string from DatePicker. We
     convert it to a daysOut offset at submit time since the CRM
     stores tasks with a days-from-today value (matches the editor's
     `daysOut` field). Empty string = no date picked = "today". */
  const [dueDate, setDueDate]     = useState('');
  const [categoryId, setCategoryId] = useState('0');  // mono number string
  const [savingCustom, setSavingCustom] = useState(false);

  /* Keyboard nav over the Quick task grid — same mechanic as CallLog
     so reps get a consistent shortcut across both modals. activeQuickIdx
     drives the virtual-focus row indicator; Tab past the last quick
     row opens the Custom collapsible and focuses its first form field
     so subsequent Tabs walk Priority → Due → Subject → Description →
     Category → Save through normal browser focus. */
  const [activeQuickIdx, setActiveQuickIdx] = useState(-1);
  const [customOpen, setCustomOpen] = useState(false);
  const customFormRef = useRef(null);

  const bindCloseRef = useRef(null);
  const handleBindClose = (fn) => {
    bindCloseRef.current = fn;
    if (bindClose) bindClose(fn);
  };
  const animatedClose = () => bindCloseRef.current?.();

  useEffect(() => { ensureMarchingAntsStyle(); }, []);

  /* Keep activeQuickIdx in bounds when templates change. */
  useEffect(() => {
    setActiveQuickIdx((i) => (i >= templates.length ? -1 : i));
  }, [templates.length]);

  /* Document keydown for Tab / Shift+Tab / Enter / Esc — see CallLog
     for the rationale. Focus inside customFormRef bypasses so native
     Tab walks the form fields. */
  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName && el.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el.isContentEditable) return true;
      if (customFormRef.current?.contains(el)) return true;
      return false;
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && activeQuickIdx >= 0) {
        e.preventDefault();
        setActiveQuickIdx(-1);
        return;
      }
      if (e.key === 'Enter' && activeQuickIdx >= 0) {
        const tpl = templates[activeQuickIdx];
        if (tpl) {
          e.preventDefault();
          handlePresetClick(tpl);
        }
        return;
      }
      if (e.key !== 'Tab') return;
      /* Shift+Tab from the first focusable in the Custom task form
         returns to the last quick-task row — same symmetry as
         CallLog so the marching-ants visual stays consistent both
         directions. */
      if (e.shiftKey && customFormRef.current?.contains(e.target)) {
        const focusables = customFormRef.current.querySelectorAll(
          'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables[0] === e.target && templates.length > 0) {
          e.preventDefault();
          try { e.target.blur?.(); } catch {}
          setActiveQuickIdx(templates.length - 1);
          return;
        }
      }
      if (isTypingTarget(e.target)) return;
      if (templates.length === 0) return;
      if (e.shiftKey) {
        if (activeQuickIdx <= 0) { setActiveQuickIdx(-1); return; }
        e.preventDefault();
        setActiveQuickIdx((i) => i - 1);
        return;
      }
      if (activeQuickIdx === -1) {
        e.preventDefault();
        try { document.activeElement?.blur?.(); } catch {}
        setActiveQuickIdx(0);
        return;
      }
      if (activeQuickIdx < templates.length - 1) {
        e.preventDefault();
        setActiveQuickIdx((i) => i + 1);
        return;
      }
      // Past the last quick row → open Custom + focus first focusable.
      e.preventDefault();
      setActiveQuickIdx(-1);
      setCustomOpen(true);
      Promise.resolve().then(() => requestAnimationFrame(() => {
        const root = customFormRef.current;
        if (!root) return;
        const focusable = root.querySelector(
          'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        try { focusable?.focus({ preventScroll: false }); } catch {}
      }));
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuickIdx, templates]);

  useEffect(() => {
    let alive = true;
    loadTaskTemplates().then((t) => {
      if (!alive) return;
      setTemplates(t);
      setLoading(false);
    });
    const unsub = subscribeToTaskTemplates((next) => { if (alive) setTemplates(next); });
    return () => { alive = false; unsub(); };
  }, []);

  const handlePresetClick = async (tpl) => {
    if (busyId) return;
    if (!tpl.subject && !tpl.name) {
      toast?.error?.(`"${tpl.name || 'Untitled'}" has no subject. Open the Notes editor and add one.`);
      return;
    }
    if (!onSubmit) {
      toast?.error?.('Quick-task submit is not wired up');
      return;
    }
    setBusyId(tpl.id);
    try {
      const result = await onSubmit(tpl);
      if (result?.ok) {
        toast?.success?.(`Task created: ${tpl.name}`, { duration: 2200 });
        animatedClose();
      } else {
        toast?.error?.(`Couldn't create task: ${result?.error || 'unknown error'}`);
        setBusyId(null);
      }
    } catch (err) {
      toast?.error?.(`Couldn't create task: ${err?.message || err}`);
      setBusyId(null);
    }
  };

  const handleCustomSubmit = async () => {
    if (savingCustom || busyId) return;
    if (!subject.trim()) {
      toast?.warning?.('Add a subject before saving');
      return;
    }
    if (!onSubmit) {
      toast?.error?.('Quick-task submit is not wired up');
      return;
    }
    setSavingCustom(true);
    /* Convert the picked date → days-from-today integer. The CRM
       template shape stores daysOut, not an absolute date, so the
       round-trip works the same whether the rep picked a date here
       or set daysOut in the Notes editor. Empty / past date ⇒ null
       (today). */
    let daysOut = null;
    const picked = parseDateValue(dueDate);
    if (picked) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      picked.setHours(0, 0, 0, 0);
      const diff = Math.round((picked - today) / 86400000);
      daysOut = diff > 0 ? diff : 0;
    }
    const synthetic = buildCustomTaskTemplate({
      subject, body, priority, daysOut, categoryId,
    });
    try {
      const result = await onSubmit(synthetic);
      if (result?.ok) {
        toast?.success?.('Task created', { duration: 2200 });
        animatedClose();
      } else {
        toast?.error?.(`Couldn't create task: ${result?.error || 'unknown error'}`);
        setSavingCustom(false);
      }
    } catch (err) {
      toast?.error?.(`Couldn't create task: ${err?.message || err}`);
      setSavingCustom(false);
    }
  };

  const anyBusy = !!busyId || savingCustom;
  /* Single-visible-modal coordination — see useModalTopState. */
  const modalVisible = useModalTopState('quick-task', 'Quick Task');

  return (
    <FloatingPanel
      width={480}
      backdrop
      draggable
      visible={modalVisible}
      onClose={onClosed}
      bindClose={handleBindClose}
    >
      <ModalHeader
        icon={<TYPE_ICONS.task />}
        title="Create task"
        subtitle={contactName}
      />

      <div style={{
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 14,
        maxHeight: '76vh', overflowY: 'auto',
      }}>
        {/* ── Quick task — 3-col compact grid ────────────────── */}
        <div>
          <SectionLabel>Quick task</SectionLabel>
          {loading ? (
            <EmptyHint>Loading templates…</EmptyHint>
          ) : templates.length === 0 ? (
            <EmptyHint>
              No task templates configured. Open the Notes editor to add one.
            </EmptyHint>
          ) : (
            <div style={{
              maxHeight: 168,
              overflowY: 'auto',
              paddingRight: 4,
              marginTop: 6,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 5,
              }}>
                {templates.map((tpl, idx) => (
                  <PresetGridButton
                    key={tpl.id}
                    tpl={tpl}
                    busy={busyId === tpl.id}
                    disabled={anyBusy && busyId !== tpl.id}
                    isKbdActive={idx === activeQuickIdx}
                    onPick={() => handlePresetClick(tpl)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Custom task — collapsed by default ──────────────── */}
        <CollapsibleSection
          icon={<I.edit />}
          title="Custom task"
          subtitle="No preset fits? Build a one-off."
          open={customOpen}
          onOpenChange={setCustomOpen}
        >
          <div ref={customFormRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
            {/* Priority + Due date share a row. DatePicker defaults
                to 30px tall + content-box sizing — without
                box-sizing override, height:28 plus the 1+1 border
                renders at 30 total, mismatching the Dropdown which
                IS border-box (via inputBaseStyle). Forcing
                boxSizing: 'border-box' makes height:28 the OUTSIDE
                dimension on both, so the bottoms align cleanly. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
              <Field label="Priority">
                <Dropdown
                  size="sm"
                  value={String(priority)}
                  options={PRIORITY_OPTIONS}
                  onChange={(v) => setPriority(parseInt(v, 10) || DEFAULT_PRIORITY)}
                />
              </Field>
              <Field label="Due date">
                <DatePicker
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Today"
                  includeTime={false}
                  style={{ height: 28, fontSize: 11.5, boxSizing: 'border-box' }}
                />
              </Field>
            </div>

            <Field label="Subject" required>
              <Input
                size="sm"
                value={subject}
                onChange={setSubject}
                placeholder="What needs doing…"
              />
            </Field>

            <Field label="Description">
              <Textarea
                value={body}
                onChange={setBody}
                placeholder="Optional detail about this task…"
                rows={3}
                resize="vertical"
              />
            </Field>

            <Field label="Category ID" hint="CRM internal · 0 = Other">
              <Input
                size="sm" mono
                value={String(categoryId)}
                placeholder="0"
                onChange={(v) => setCategoryId(v.replace(/[^0-9]/g, ''))}
              />
            </Field>

            <Btn
              size="sm"
              variant="primary"
              full
              icon={<I.send />}
              onClick={handleCustomSubmit}
              disabled={anyBusy}
            >
              {savingCustom ? 'Creating…' : 'Create custom task'}
            </Btn>
          </div>
        </CollapsibleSection>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <div style={{
        padding: 12,
        borderTop: '1px solid var(--gb-border-subtle)',
        background: 'var(--gb-surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <span style={{
          fontSize: 10.5, color: 'var(--gb-text-muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          Creating task on {contactName}
        </span>
        <Btn size="sm" variant="secondary" onClick={animatedClose} disabled={anyBusy}>Cancel</Btn>
      </div>
    </FloatingPanel>
  );
}

/* ── Helpers / sub-components ─────────────────────────────── */

function EmptyHint({ children }) {
  return (
    <div style={{
      padding: '12px 10px', marginTop: 6,
      fontSize: 11, color: 'var(--gb-text-muted)',
      background: 'var(--gb-fill-subtle)',
      border: '1px dashed var(--gb-border-default)',
      borderRadius: 'var(--gb-r-sm)',
      textAlign: 'center', fontStyle: 'italic',
    }}>{children}</div>
  );
}

/* Single 3-col-grid cell. Same compact 30px button shape as
   CallLog's grid, with task-specific glyphs + meta:
     • check icon left (TYPE_ICONS.task style)
     • truncated template name center
     • priority dot + "in Nd" right (replaces IN/OUT)
   Busy state swaps the right side for a spinner so the cell
   width stays stable mid-submit. */
function PresetGridButton({ tpl, busy, disabled, isKbdActive, onPick }) {
  const [hover, setHover] = useState(false);
  const ref = useRef(null);
  const prio = getPriority(tpl.priority);
  const due = getDueLabel(tpl.daysOut);
  const inactive = disabled || busy;

  useEffect(() => {
    if (isKbdActive && ref.current) {
      try { ref.current.scrollIntoView({ block: 'nearest' }); } catch {}
    }
  }, [isKbdActive]);

  return (
    <button
      ref={ref}
      type="button"
      disabled={inactive}
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={isKbdActive ? 'gb-kbd-active' : undefined}
      title={[
        tpl.name,
        tpl.subject && tpl.subject !== tpl.name ? `Subject: ${tpl.subject}` : '',
        `Priority: ${prio.label}`,
        `Due: ${due}`,
      ].filter(Boolean).join('\n')}
      style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr auto',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 8px',
        background: hover && !inactive ? 'var(--gb-brand-tint-medium)' : 'var(--gb-brand-tint-soft)',
        border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)',
        borderRadius: 'var(--gb-r-sm)',
        cursor: inactive ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        textAlign: 'left',
        fontFamily: 'var(--gb-font-sans)',
        boxShadow: hover && !inactive ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
        transition: 'all var(--gb-anim-fast)',
        minWidth: 0,
      }}
    >
      <TYPE_ICONS.task size={12} />
      <span style={{
        fontSize: 11, fontWeight: 600,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        minWidth: 0,
      }}>{tpl.name || 'Untitled'}</span>
      {busy ? (
        <RowSpinner />
      ) : (
        /* Priority dot + due hint — denser than a labeled chip but
           still readable at a glance. Dot tone tracks priority. */
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
          opacity: 0.85, flexShrink: 0,
        }}>
          <Dot tone={prio.tone} size={6} />
          <span style={{ textTransform: 'uppercase' }}>{due === 'today' ? 'TDY' : due.replace('in ', '').toUpperCase()}</span>
        </span>
      )}
    </button>
  );
}

function RowSpinner() {
  return (
    <span style={{
      width: 10, height: 10, borderRadius: '50%',
      border: '1.5px solid currentColor',
      borderTopColor: 'transparent',
      animation: 'gb-spin .8s linear infinite',
      display: 'inline-block',
      flexShrink: 0,
    }} />
  );
}
