/* eslint-disable */
/**
 * Contact-detail custom page (CRM Page 240).
 *
 * This entry owns contact-specific activity, local-note, and task
 * orchestration. Shared CRM layout, modals, navigation, and data adapters live
 * in the two detail-shared modules imported below.
 */

import React, { useState, useMemo, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { submitCallLog } from '../lib/submitCallLog.js';
import { submitQuickTask, readTaskContext } from '../lib/submitQuickTask.js';
import { buildCustomTaskTemplate, daysOutFromCrmDate, loadTaskTemplates } from '../lib/quickTask.js';
import { loadCallTemplates } from '../lib/callLog.js';
import { sendContactEmail } from '../lib/contactEmail.js';
import { readEmailConfig } from '../lib/emailSender.js';
import { accountEmailTemplates, evaluateAccountEmailTemplate, savedProposalPlaceholder } from '../lib/emailComposerCommands.js';
import { EmailComposer } from '../modals/EmailPreview.jsx';
import { ARMOR, ActivityFilter, Btn, Card, CasesPanel, DASH, DataCtx, DetailErrorBoundary, EmailsPanel, EmptyRow, I, IconBtn, InlineSearch, OrdersPanel, PAGE_ZOOM, ScrollArea, SectionTitle, StatsStrip, SystemCard, Tag, Td, Th, ThemeSelector, activityType, crmGo, crmHref, fmtDate, fmtDateTime, fullName, priTone, tableStyle, trStyle, useD } from '../lib/detail-shared.jsx';
import { AccountInfoCard, ActivityDetailModal, AltLookupsCard, ContactInfoCard, EditTaskModal, FormField, Hero, MailerCard, MiniSelect, ModalCtx, ModalShell, OpenTaskRow, OpportunitiesPanel, PRIORITY_OPTS, PatchCtx, ProofsPanel, QL_KEY, QT_KEY, Sidebar, TArea, TInput, TemplateModal, UI_CSS, adapt, currentEmployeeId, fromDateInput, gbToast, nextTaskTempId, priLabel, toDateInput, todayMDY, useModal, usePatch, useTemplates } from '../lib/contact-detail-shared.jsx';

/**
 * Resolve the authenticated task/call context from storage and the current
 * CRM page. The schema contact ID is used only when the native page context
 * does not expose one.
 */
async function taskContext(fallbackContactId, extra = {}) {
  let ctx = {};
  try { ctx = await readTaskContext(); } catch (e) {}
  if (!ctx.employeeId || ctx.employeeId === '0') { const fb = currentEmployeeId(); if (fb && fb !== '0') ctx.employeeId = fb; }
  if (!ctx.contactId && fallbackContactId) ctx.contactId = String(fallbackContactId);
  return { ...ctx, ...extra };
}

function ContactEmailModal() {
  const D = useD();
  const { closeModal } = useModal();
  const [config, setConfig] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [sending, setSending] = useState(false);
  const to = String(D.contact.email || '').trim();
  const contactName = fullName(D.contact) || 'Contact';

  useEffect(() => {
    let live = true;
    readEmailConfig().then((next) => { if (live) setConfig(next); });
    try {
      chrome.storage.local.get('gbSavedProposals', (data) => {
        if (live) setProposals(Array.isArray(data?.gbSavedProposals) ? data.gbSavedProposals : []);
      });
    } catch (e) {}
    return () => { live = false; };
  }, []);

  const applyTemplate = async (template) => {
    try {
      const resolver = window.__gbResolveAllVarsAsync;
      const result = await evaluateAccountEmailTemplate(template, (vars, toField) => {
        if (typeof resolver !== 'function') throw new Error('Reload this page before using account templates');
        return resolver(vars, toField, document);
      });
      return { ok: true, htmlBody: result.htmlBody, subject: result.subject };
    } catch (error) {
      const message = error?.message || 'Could not evaluate that template';
      gbToast(message, 'error');
      return { ok: false, error: message };
    }
  };

  const send = async (draft) => {
    if (sending) return { ok: false };
    setSending(true);
    const result = await sendContactEmail({ ...draft, config: config || undefined });
    setSending(false);
    if (result.state === 'sent') {
      gbToast(`Email sent to ${contactName}`, 'success'); return { ok: true };
    }
    if (result.state === 'opened') {
      gbToast(`Opened email to ${contactName} in Outlook`, 'success'); return { ok: true };
    }
    gbToast(result.error || 'Could not send email', 'error');
    return { ok: false, error: result.error };
  };

  return (
    <ModalShell title="Send Email" icon={<I.send />} subtitle={`${contactName} · ${to}`} width={780}>
      <EmailComposer
        replyTo={to}
        subject=""
        onSend={send}
        sending={sending}
        accountTemplates={accountEmailTemplates(config?.templates)}
        onApplyAccountTemplate={applyTemplate}
        savedProposals={proposals}
        onApplySavedProposal={async (proposal) => ({ ok: true, mode: 'insert', text: savedProposalPlaceholder(proposal) })}
        initiallyExpanded
        editableSubject
        sticky={false}
        onDiscard={closeModal}
        transportLabel={config ? (config.paReady ? 'Power Automate' : 'Outlook') : 'Checking…'}
        placeholder="Write your email…  Type / for commands"
      />
    </ModalShell>
  );
}
/* ════════════════════════════════════════════════════════════
   TOP BAR
════════════════════════════════════════════════════════════ */
function TopBar() {
  const D = useD();
  const name = fullName(D.contact) || 'Contact';
  return (
    <div style={{
      height: 48, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 18px', gap: 18, position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500 }}>
        <a href={crmHref(261)} onClick={(e) => { e.preventDefault(); crmGo(261); }} style={{ color: 'inherit', textDecoration: 'none' }}>CRM</a><I.chevr size={10} />
        <a href={crmHref(360)} onClick={(e) => { e.preventDefault(); crmGo(360); }} style={{ color: 'inherit', textDecoration: 'none' }}>Customers</a><I.chevr size={10} />
        <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{name}</span>
        {D.ids.contact && <span style={{ marginLeft: 6, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)', fontSize: 10.5 }}>#{D.ids.contact}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <InlineSearch />
      <ThemeSelector />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   CONTACT ACTIVITY
════════════════════════════════════════════════════════════ */
function ActivityRow({ a, last, onDelete }) {
  const [hover, setHover] = useState(false);
  const { openModal } = useModal();
  const meta = activityType(a);
  const isNote = !!a.localNote;
  const clickable = !!a.id && !isNote;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={clickable ? () => openModal(<ActivityDetailModal activityId={a.id} />) : undefined}
      title={clickable ? 'View activity detail' : (isNote ? 'Personal note (local)' : undefined)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '11px 18px',
        cursor: clickable ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--gb-border-subtle)',
        borderLeft: isNote ? '3px solid var(--gb-warning-tint-border)' : '3px solid transparent',
        background: isNote ? 'var(--gb-warning-tint-soft)' : (hover ? 'var(--gb-fill-faint)' : 'transparent'),
        transition: 'background var(--gb-anim)',
      }}>
      <span style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0, marginTop: 1,
        background: `var(--gb-${meta.tone}-tint-medium)`,
        border: `1px solid var(--gb-${meta.tone}-tint-border)`,
        color: `var(--gb-${meta.tone}-fg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{React.cloneElement(meta.icon, { size: 13 })}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: 'var(--gb-text-primary)', fontWeight: 500, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {a.subject || <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
          {a.category && <Tag tone={meta.tone} size="xs">{a.category}</Tag>}
          {a.direction && <Tag tone="neutral" size="xs">{a.direction}</Tag>}
          {a.employee && <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 600 }}>{a.employee}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 3 }}>
        <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{fmtDateTime(a.date)}</span>
        {isNote && onDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(a.noteId); }} title="Delete note"
            style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1, opacity: hover ? 1 : 0, transition: 'opacity var(--gb-anim)' }}>×</button>
        )}
      </div>
    </div>
  );
}
function ActivityPanel() {
  const D = useD();
  const { openModal } = useModal();
  const ln = useLocalNotes(D.ids.contact);
  // Local notes ride at the top of the feed (newest annotations first), then
  // the real CRM activity.
  const noteRows = useMemo(() => ln.notes.map((n) => ({ localNote: true, noteId: n.id, subject: n.text, category: 'Note', employee: 'You', date: new Date(n.ts).toLocaleString() })), [ln.notes]);
  const rows = useMemo(() => [...noteRows, ...D.activities], [noteRows, D.activities]);
  const [filter, setFilter] = useState('all');
  const counts = useMemo(() => {
    const c = { all: rows.length };
    rows.forEach((a) => { const k = activityType(a).key; c[k] = (c[k] || 0) + 1; });
    return c;
  }, [rows]);
  const filtered = filter === 'all' ? rows : rows.filter((a) => activityType(a).key === filter);
  return (
    // overflow:visible + raised z so the filter dropdown isn't clipped by the
    // card (or covered by the panels below) when the list is short.
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 2 }}>
      <SectionTitle
        icon={<I.history />}
        title="Activity Feed"
        count={filter === 'all' ? `${rows.length}` : `${filtered.length} of ${rows.length}`}
        sub="System, workflow, and human-logged events"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <ActivityFilter value={filter} onChange={setFilter} counts={counts} />
            <Btn variant="tinted" size="sm" icon={<I.note />} onClick={() => openModal(<NoteModal onSave={ln.add} />)}>Add note</Btn>
          </div>
        }
      />
      <ScrollArea max={460}>
        {/* key by filter → the list fades/slides in on each filter change */}
        <div key={filter} style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          {filtered.map((a, idx) => <ActivityRow key={a.noteId || idx} a={a} last={idx === filtered.length - 1} onDelete={ln.remove} />)}
          {filtered.length === 0 && (
            <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>
              {rows.length ? 'No matching activity.' : 'No activity recorded.'}
            </div>
          )}
        </div>
      </ScrollArea>
    </Card>
  );
}

/* Creates a CRM task through the validated shared task transport. */
function AddTaskModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ Subject: '', Description: '', DueDate: '', Priority: '2' });
  const save = async () => {
    if (!t.Subject.trim() || busy) return;
    setBusy(true);
    try {
      const ctx = await taskContext(D.ids.contact);
      const tpl = buildCustomTaskTemplate({ subject: t.Subject, body: t.Description, daysOut: daysOutFromCrmDate(t.DueDate), priority: t.Priority, categoryId: 0 });
      const res = await submitQuickTask({ template: tpl, context: ctx });
      if (!res || !res.ok) { gbToast((res && res.error) || 'Could not create task', 'error'); setBusy(false); return; }
      patch((Dd) => ({ ...Dd, openTasks: [{ id: res.taskId || `new-${Date.now()}`, subject: t.Subject.trim(), category: '', priority: priLabel(t.Priority), dueDate: t.DueDate, status: 'Open' }, ...(Dd.openTasks || [])] }));
      closeModal();
    } catch (e) { gbToast('Could not create task', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="New Task" icon={<I.task />} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !t.Subject.trim()}>{busy ? 'Creating…' : 'Create'}</Btn>
    </>}>
      <FormField label="Subject"><TInput autoFocus value={t.Subject} onChange={(e) => setT({ ...t, Subject: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></FormField>
      <FormField label="Description"><TArea value={t.Description} onChange={(e) => setT({ ...t, Description: e.target.value })} rows={3} /></FormField>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Due date" style={{ flex: 1 }}><DatePicker includeTime={false} value={toDateInput(t.DueDate)} onChange={(v) => setT({ ...t, DueDate: v ? fromDateInput(String(v).slice(0,10)) : "" })} /></FormField>
        <FormField label="Priority" style={{ width: 130 }}>
          <MiniSelect value={t.Priority} options={PRIORITY_OPTS} onChange={(v) => setT({ ...t, Priority: v })} />
        </FormField>
      </div>
    </ModalShell>
  );
}

/* Add a local note — stored in our storage (not the CRM); shows as a yellow
   row in the Activity Feed. */
function NoteModal({ onSave }) {
  const { closeModal } = useModal();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onSave(t); closeModal(); } catch (e) { setBusy(false); }
  };
  return (
    <ModalShell title="Add note" icon={<I.note />} subtitle="Personal — stored locally, shown in the activity feed" width={460} footer={<>
      <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
      <Btn variant="primary" disabled={!text.trim() || busy} onClick={save}>Add note</Btn>
    </>}>
      <FormField label="Note">
        <TArea value={text} maxLength={LOCAL_NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Type a note about this contact…" />
      </FormField>
    </ModalShell>
  );
}

/* ── Local notes — a personal annotation layer the CRM doesn't have. Stored in
   chrome.storage.local under gbLocalNotes, keyed by contact id, and merged into
   the Activity Feed as yellow-tinted rows. (Not synced to the CRM; the native
   Activity/SaveLeadNote endpoint exists if real CRM notes are wanted later.) */
const LOCAL_NOTES_KEY = 'gbLocalNotes';
const LOCAL_NOTE_MAX_CHARS = 4_000;
const LOCAL_NOTE_MAX_PER_CONTACT = 100;
function loadLocalNotesMap() {
  return new Promise((res) => {
    try {
      chrome.storage.local.get(LOCAL_NOTES_KEY, (d) => {
        const value = d && d[LOCAL_NOTES_KEY];
        res(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      });
    }
    catch (e) { res({}); }
  });
}
function localNoteContactKey(value) {
  const key = String(value == null ? '' : value).trim();
  return /^\d{1,12}$/.test(key) ? key : '';
}
function normalizeLocalNotes(value) {
  return (Array.isArray(value) ? value : [])
    .filter((note) => note && typeof note === 'object' && typeof note.text === 'string')
    .slice(0, LOCAL_NOTE_MAX_PER_CONTACT)
    .map((note) => ({
      id: String(note.id || '').slice(0, 64),
      text: note.text.slice(0, LOCAL_NOTE_MAX_CHARS),
      ts: Number.isFinite(Number(note.ts)) ? Number(note.ts) : Date.now(),
    }));
}
function useLocalNotes(key) {
  const safeKey = localNoteContactKey(key);
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    if (!safeKey) { setNotes([]); return undefined; }
    let live = true;
    const read = () => loadLocalNotesMap().then((m) => { if (live) setNotes(normalizeLocalNotes(m[safeKey])); });
    read();
    const onChg = (ch, area) => { if (area === 'local' && ch[LOCAL_NOTES_KEY]) read(); };
    try { chrome.storage.onChanged.addListener(onChg); } catch (e) {}
    return () => { live = false; try { chrome.storage.onChanged.removeListener(onChg); } catch (e) {} };
  }, [safeKey]);
  const add = async (text) => {
    const t = String(text || '').trim().slice(0, LOCAL_NOTE_MAX_CHARS);
    if (!t || !safeKey) return;
    const m = await loadLocalNotesMap();
    const list = normalizeLocalNotes(m[safeKey]);
    m[safeKey] = [{ id: 'ln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: t, ts: Date.now() }, ...list]
      .slice(0, LOCAL_NOTE_MAX_PER_CONTACT);
    try { chrome.storage.local.set({ [LOCAL_NOTES_KEY]: m }); } catch (e) {}
  };
  const remove = async (id) => {
    if (!safeKey) return;
    const m = await loadLocalNotesMap();
    m[safeKey] = normalizeLocalNotes(m[safeKey]).filter((n) => n.id !== String(id || ''));
    try { chrome.storage.local.set({ [LOCAL_NOTES_KEY]: m }); } catch (e) {}
  };
  return { notes, add, remove };
}

/* One open-task row with a working Complete action (optimistic strike-through). */

function TasksPanel() {
  const D = useD();
  const patch = usePatch();
  const { openModal } = useModal();
  const qt = useTemplates(QT_KEY);
  const [manage, setManage] = useState(false);
  const editTask = (t) => openModal(<TemplateModal kind="task" initial={t} onSave={(tpl) => qt.update(t.id, tpl)} onDelete={() => qt.remove(t.id)} />);
  const [quickTask, setQuickTask] = useState('');
  const [adding, setAdding] = useState(false);
  // Optimistically prepend a row (after a real create) and animate it in.
  const addRow = (row) => patch((Dd) => ({ ...Dd, openTasks: [{ id: `new-${nextTaskTempId()}`, category: '', status: 'Open', ...row }, ...(Dd.openTasks || [])] }));
  // A quick-task button: fire the referenced saved template directly, no modal.
  const runTaskTemplate = async (chip) => {
    try {
      const all = await loadTaskTemplates();
      const tpl = (all || []).find((t) => String(t.id) === String(chip.templateId));
      if (!tpl) { gbToast('Template not found', 'error'); return; }
      const r = await submitQuickTask({ template: tpl, context: await taskContext(D.ids.contact) });
      if (r && r.ok) addRow({ subject: tpl.subject || tpl.name || chip.label, priority: priLabel(tpl.priorityId || tpl.priority || 2), dueDate: todayMDY() });
      else gbToast((r && r.error) || 'Could not create task', 'error');
    } catch (e) { gbToast('Could not create task', 'error'); }
  };
  // Reuse the proven QuickTask composer (correct preset templates, employee
  // resolution, CRM create); animate the row in on its onCreated callback.
  const openComposer = () => {
    try {
      window.__gbShowQuickTaskModal && window.__gbShowQuickTaskModal({
        onCreated: ({ template }) => addRow({
          subject: (template && (template.subject || template.name)) || 'New task',
          priority: priLabel((template && (template.priorityId || template.priority)) || 2),
          dueDate: (template && (template.crmDate || template.dueDate)) || todayMDY(),
        }),
      });
    } catch (e) {}
  };
  // Typed quick-add: subject = exactly what was typed (correct freeform task).
  const quickCreate = async (subject) => {
    const subj = (subject || '').trim();
    if (!subj || adding) return;
    setAdding(true);
    try {
      const ctx = await taskContext(D.ids.contact);
      const r = await submitQuickTask({ template: buildCustomTaskTemplate({ subject: subj }), context: ctx });
      if (!r || !r.ok) { gbToast((r && r.error) || 'Could not create task', 'error'); return; }
      addRow({ id: r.taskId || `new-${nextTaskTempId()}`, subject: subj, priority: priLabel(2), dueDate: todayMDY() });
      setQuickTask('');
    } catch (e) { gbToast('Could not create task', 'error'); }
    finally { setAdding(false); }
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <SectionTitle
          icon={<I.task />} title="Open Tasks" count={D.openTasks.length}
          right={<Btn variant="tinted" size="sm" icon={<I.plus />} onClick={openComposer}>New task</Btn>}
        />
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flex: 1 }}>
              {manage ? 'Manage — click to edit · × to remove' : 'Quick create — one click adds a task'}
            </span>
            {qt.list.length > 0 && <IconBtn size="xs" ghost active={manage} icon={<I.edit />} title="Manage buttons" onClick={() => setManage((m) => !m)} />}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            {qt.list.map((t) => (
              <span key={t.id} style={{ position: 'relative', display: 'inline-flex' }}>
                <Btn variant={manage ? 'tinted' : 'secondary'} size="xs"
                  title={manage ? 'Click to edit' : 'Click to add · right-click to edit'}
                  onClick={() => (manage ? editTask(t) : runTaskTemplate(t))}
                  onContextMenu={(e) => { e.preventDefault(); editTask(t); }}>{t.label}</Btn>
                {manage && <span onClick={(e) => { e.stopPropagation(); qt.remove(t.id); }} title="Remove"
                  style={{ position: 'absolute', top: -5, right: -5, width: 15, height: 15, borderRadius: '50%', background: 'var(--gb-error-tint-medium)', border: '1px solid var(--gb-error-tint-border)', color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, lineHeight: 1, cursor: 'pointer' }}>×</span>}
              </span>
            ))}
            <IconBtn size="xs" ghost icon={<I.plus />} title="New quick task" onClick={() => openModal(<TemplateModal kind="task" onSave={qt.add} />)} />
            {qt.list.length === 0 && <span style={{ fontSize: 11, color: 'var(--gb-text-muted)' }}>Add a quick task with +</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <div style={{
              flex: 1, height: 30, borderRadius: 'var(--gb-r-md)',
              background: 'var(--gb-fill-inverse-medium)',
              border: '1px solid var(--gb-border-default)',
              display: 'flex', alignItems: 'center', padding: '0 10px', gap: 7,
            }}>
              <I.bolt size={11} style={{ color: 'var(--gb-text-muted)' }} />
              <input value={quickTask} onChange={(e) => setQuickTask(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') quickCreate(quickTask); }}
                placeholder="Quick add a task… (Enter to save)"
                style={{
                  flex: 1, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 11.5,
                  color: 'var(--gb-text-primary)',
                }} />
            </div>
            <Btn variant="primary" size="sm" icon={<I.check />} disabled={adding || !quickTask.trim()} onClick={() => quickCreate(quickTask)}>Add</Btn>
          </div>
        </div>
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Subject</Th>
            <Th>Category</Th>
            <Th align="center">Pri</Th>
            <Th align="right">Due</Th>
            <Th></Th>
          </tr></thead>
          <tbody>
            {D.openTasks.map((t, i) => <OpenTaskRow key={t.id || i} t={t} />)}
            {D.openTasks.length === 0 && <EmptyRow colSpan={5} label="No open tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>

      <Card>
        <SectionTitle icon={<I.check />} title="Completed Tasks" count={D.doneTasks.length} />
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Subject</Th>
            <Th>Category</Th>
            <Th align="right">Completed</Th>
          </tr></thead>
          <tbody>
            {D.doneTasks.map((t, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: 4,
                      background: 'var(--gb-brand-tint-medium)',
                      border: '1.5px solid var(--gb-brand-label)',
                      color: 'var(--gb-brand-label)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}><I.check size={9} sw={3} /></div>
                    <span style={{ color: 'var(--gb-text-muted)', textDecoration: 'line-through', fontWeight: 500 }}>{t.subject}</span>
                  </div>
                </Td>
                <Td muted>{t.category}</Td>
                <Td align="right" mono muted>{fmtDate(t.dueDate)}</Td>
              </tr>
            ))}
            {D.doneTasks.length === 0 && <EmptyRow colSpan={3} label="No completed tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   RIGHT RAIL — Quick Log, Alt Lookups, Mailer, System
════════════════════════════════════════════════════════════ */
function QuickLogCard() {
  const D = useD();
  const patch = usePatch();
  const { openModal } = useModal();
  const ql = useTemplates(QL_KEY);
  const [busy, setBusy] = useState(null);
  const [manage, setManage] = useState(false);
  const editLog = (t) => openModal(<TemplateModal kind="call" initial={t} onSave={(tpl) => ql.update(t.id, tpl)} onDelete={() => ql.remove(t.id)} />);
  // A quick-log button: fire the referenced saved call template directly.
  const runLog = async (chip) => {
    if (busy) return;
    setBusy(chip.id);
    try {
      const all = await loadCallTemplates();
      const tpl = (all || []).find((t) => String(t.id) === String(chip.templateId));
      if (!tpl) { gbToast('Template not found', 'error'); setBusy(null); return; }
      const ctx = await taskContext(D.ids.contact, {
        phone: String(D.contact.phone || '').replace(/\D/g, ''),
        contactName: [D.contact.firstName, D.contact.lastName].filter(Boolean).join(' '),
      });
      const r = await submitCallLog({ template: tpl, context: ctx });
      if (r && r.ok) {
        patch((Dd) => ({ ...Dd, activities: [{ id: '', employee: 'You', category: 'Call', direction: tpl.callDirection === 1 ? 'In' : 'Out', subject: tpl.subject || tpl.name || chip.label, date: new Date().toLocaleString() }, ...(Dd.activities || [])] }));
      } else { gbToast((r && r.error) || 'Could not log call', 'error'); }
    } catch (e) { gbToast('Could not log call', 'error'); }
    finally { setBusy(null); }
  };
  return (
    <Card>
      <SectionTitle icon={<I.zap />} title="Quick Log" sub={manage ? 'Click a button to edit · × to remove' : 'Log a call instantly — one click'}
        right={<div style={{ display: 'flex', gap: 4 }}>
          {ql.list.length > 0 && <IconBtn size="xs" ghost active={manage} icon={<I.edit />} title="Manage buttons" onClick={() => setManage((m) => !m)} />}
          <IconBtn size="xs" ghost icon={<I.plus />} title="New quick log" onClick={() => openModal(<TemplateModal kind="call" onSave={ql.add} />)} />
        </div>} />
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {ql.list.map((t) => (
          <button key={t.id} disabled={busy === t.id && !manage}
            onClick={() => (manage ? editLog(t) : runLog(t))}
            onContextMenu={(e) => { e.preventDefault(); editLog(t); }}
            title={manage ? 'Click to edit' : 'Click to log · right-click to edit'}
            style={{
              position: 'relative', minWidth: 0,   // let the grid cell constrain width so text can wrap
              background: 'var(--gb-fill-subtle)',
              border: '1px ' + (manage ? 'dashed var(--gb-brand-tint-border)' : 'solid var(--gb-border-default)'),
              borderRadius: 'var(--gb-r-md)', padding: '10px 9px',
              display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start',
              cursor: busy === t.id && !manage ? 'default' : 'pointer', textAlign: 'left', opacity: busy === t.id && !manage ? 0.6 : 1,
              transition: 'all var(--gb-anim)', fontFamily: 'var(--gb-font-sans)',
            }}>
            {manage && <span onClick={(e) => { e.stopPropagation(); ql.remove(t.id); }} title="Remove"
              style={{ position: 'absolute', top: 5, right: 5, width: 16, height: 16, borderRadius: '50%', background: 'var(--gb-error-tint-medium)', border: '1px solid var(--gb-error-tint-border)', color: 'var(--gb-error-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, lineHeight: 1, cursor: 'pointer' }}>×</span>}
            <span style={{ color: 'var(--gb-text-tertiary)', display: 'flex' }}><I.phone size={13} /></span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)', lineHeight: 1.25, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.label}</span>
            <span style={{ fontSize: 9, letterSpacing: .5, fontWeight: 600, color: 'var(--gb-text-muted)', lineHeight: 1.3, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.templateName || ''}</span>
          </button>
        ))}
        {ql.list.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>Add a quick-log button with +</div>}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
function App({ store }) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const [patches, setPatches] = useState([]);
  const patch = useCallback((fn) => setPatches((p) => [...p, fn]), []);
  const D = useMemo(
    () => patches.reduce((acc, fn) => { try { return fn(acc) || acc; } catch (e) { return acc; } }, adapt(data)),
    [data, patches],
  );

  // Theme is owned globally by the extension (theme.js / applyTheme writes
  // data-theme + the --gb-* tokens on <html> from the user's settings). We
  // inherit it — no per-page light/dark toggle.
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [modal, setModal] = useState(null);
  const [modalClosing, setModalClosing] = useState(false);
  const openModal = useCallback((node) => { setModalClosing(false); setModal(node); }, []);
  const closeModal = useCallback(() => { setModalClosing(true); setTimeout(() => { setModal(null); setModalClosing(false); }, 190); }, []);
  const modalApi = { openModal, closeModal, closing: modalClosing };   // closing drives the exit animation

  return (
    <DataCtx.Provider value={D}>
    <PatchCtx.Provider value={patch}>
    <ModalCtx.Provider value={modalApi}>
      {/* data-gb-scale="custom-page" is intentionally NOT one of
          scales.js's SCALE_CATEGORIES, so applyScales() emits no zoom rule
          for it — the takeover renders at the host website's own scale,
          unaffected by the extension's UI-scale sliders. The bare
          [data-gb-scale] selector still applies the host-CSS reset
          (box-sizing / line-height / font). height:100% + own scroll so it
          fills the fixed root the engine mounts. */}
      <div data-gb-scale="custom-page" style={{
        ...ARMOR,
        zoom: PAGE_ZOOM,                 // fixed scale — not slider-driven
        // No PAGE scroll — the sidebar and content column each scroll
        // themselves. This also kills the page-scrollbar appear/disappear
        // that was flickering a scrollbar onto the quick-actions menu.
        height: '100%', overflow: 'hidden',
        background: 'var(--gb-surface-deep)',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        display: 'flex', alignItems: 'stretch',
      }}>
        <style>{UI_CSS}</style>
        <Sidebar currentLabel={'Customer · #' + (D.ids.contact || '')} collapsed={sideCollapsed} setCollapsed={setSideCollapsed} />
        <div className="gb-scroll" style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}>
          <TopBar />
          {!D.ready && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '90px 0', color: 'var(--gb-text-muted)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', borderStyle: 'solid', borderWidth: 3, borderColor: 'var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Loading…</span>
            </div>
          )}
          <div style={{
            maxWidth: 2200, margin: '0 auto',
            padding: '20px 28px 60px',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <Hero onSendEmail={() => {
              if (!String(D.contact.email || '').trim()) { gbToast('This contact has no email address', 'error'); return; }
              openModal(<ContactEmailModal />);
            }} />

            {/* Account Info + Contact Info side-by-side, always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <AccountInfoCard />
              <ContactInfoCard />
            </div>

            <StatsStrip />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'flex-start' }}>
              {/* No tabs — every section stacked on one screen, each
                  capped to a custom-scroll area (see panels). */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <ActivityPanel />
                <EmailsPanel />
                <OpportunitiesPanel />
                <OrdersPanel />
                <ProofsPanel />
                <TasksPanel />
                <CasesPanel />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 64 }}>
                <QuickLogCard />
                <AltLookupsCard />
                <MailerCard />
                <SystemCard />
              </div>
            </div>
          </div>
        </div>
      </div>
      {modal && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) modalApi.closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,.55)', padding: 20,
            animation: modalClosing ? 'gb-backdrop-out .19s ease both' : 'gb-fade-slide var(--gb-anim) both',
          }}>
          {modal}
        </div>
      )}
    </ModalCtx.Provider>
    </PatchCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbContactDetailsRegistered) {
  window.__gbContactDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.contact_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Contact page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
