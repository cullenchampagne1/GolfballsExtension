/* eslint-disable */
/**
 * Opportunity-details custom page (CRM Page 280).
 *
 * Adapts opportunity, proposal, and margin data to the detail layout. Shared
 * CRM primitives live in `detail-shared.jsx`; contact-aware modals, navigation,
 * and state live in `contact-detail-shared.jsx`.
 */

import React, { useState, useMemo, useEffect, useCallback, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { ProposalEmailComposer } from '../modals/ProposalEmail.jsx';
import { buildEmailSourceFromCartIds } from '../lib/proposalEmailSource.js';
import { MarginBreakdown } from '../ui/components/MarginBreakdown.jsx';
import { submitCallLog } from '../lib/submitCallLog.js';
import { submitQuickTask } from '../lib/submitQuickTask.js';
import { buildCustomTaskTemplate, daysOutFromCrmDate, loadTaskTemplates } from '../lib/quickTask.js';
import { loadCallTemplates } from '../lib/callLog.js';
import { ARMOR, ActivityFilter, Btn, Card, ContactPill, DASH, DataCtx, DetailErrorBoundary, Dot, EmailsPanel, EmptyRow, I, IconBtn, InlineSearch, KV, PAGE_ZOOM, ScrollArea, SectionTitle, Tag, Td, Th, ThemeSelector, activityType, crmGo, crmHref, fmt$, fmtDate, fmtDateTime, fullName, goUrl, priTone, tableStyle, trStyle, txt, useD } from '../lib/detail-shared.jsx';
import { ActivityDetailModal, EditTaskModal, FormField, MiniSelect, ModalCtx, ModalShell, OPP_STAGES, OpenTaskRow, OpportunityModal, PRIORITY_OPTS, PatchCtx, QL_KEY, QT_KEY, Sidebar, TArea, TInput, TemplateModal, UI_CSS, adapt, crmGetOpportunity, currentEmployeeId, fromDateInput, gbToast, nextTaskTempId, priLabel, toDateInput, todayMDY, useModal, usePatch, useTemplates } from '../lib/contact-detail-shared.jsx';

/* Proposals live in the host DOM as checkboxes whose ONCHANGE is
   ProposalCheckToggle(this, '<cartId>', '<name>', '<expiration>', '<newSite>'). */
function extractProposals(doc) {
  const out = [];
  try {
    (doc || document).querySelectorAll('[onchange*="ProposalCheckToggle"], [onclick*="ProposalCheckToggle"]').forEach((el) => {
      const oc = el.getAttribute('onchange') || el.getAttribute('onclick') || '';
      const m = /ProposalCheckToggle\(\s*this\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*'((?:\\.|[^'])*)'\s*,\s*([^)]*)\)/.exec(oc);
      if (m) out.push({ cartId: m[1], name: (m[2] || '').replace(/\\'/g, "'").trim(), expiration: m[3], newSite: /true/i.test(m[4]) });
    });
  } catch (e) {}
  return out;
}

/* ════════════════════════════════════════════════════════════
   TOP BAR
════════════════════════════════════════════════════════════ */
function TopBar() {
  const D = useD();
  const { opp } = useOpp();
  const contactId = D.ids.contact;
  const contactName = fullName(D.contact);
  const contactHref = contactId ? `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}` : null;
  const oid = (opp && opp.id) || oppIdFromUrl();
  return (
    <div style={{
      height: 48, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 18px', gap: 14, position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Back-to-contact tag — the opportunity belongs to this contact */}
      {contactHref && (
        <a href={contactHref} onClick={(e) => { e.preventDefault(); goUrl(contactHref); }}
          title="Back to contact"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 11px 0 8px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', textDecoration: 'none', fontSize: 11.5, fontWeight: 600, flexShrink: 0 }}>
          <I.chevr size={12} style={{ transform: 'scaleX(-1)' }} />{contactName ? `Back to ${contactName}` : 'Back to contact'}
        </a>
      )}
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500, minWidth: 0 }}>
        <a href={crmHref(261)} onClick={(e) => { e.preventDefault(); crmGo(261); }} style={{ color: 'inherit', textDecoration: 'none' }}>CRM</a><I.chevr size={10} />
        <a href={crmHref(280)} onClick={(e) => { e.preventDefault(); crmGo(280); }} style={{ color: 'inherit', textDecoration: 'none' }}>Opportunity</a><I.chevr size={10} />
        <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{txt(D.account.name) || (opp && opp.subject) || 'Opportunity'}</span>
        {oid && <span style={{ marginLeft: 6, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)', fontSize: 10.5 }}>#{oid}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <InlineSearch />
      <ThemeSelector />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   OPPORTUNITY ACTIVITY
════════════════════════════════════════════════════════════ */
function ActivityRow({ a, last }) {
  const [hover, setHover] = useState(false);
  const { openModal } = useModal();
  const meta = activityType(a);
  const clickable = !!a.id;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={clickable ? () => openModal(<ActivityDetailModal activityId={a.id} />) : undefined}
      title={clickable ? 'View activity detail' : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '11px 18px',
        cursor: clickable ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--gb-border-subtle)',
        background: hover ? 'var(--gb-fill-faint)' : 'transparent',
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
        <div style={{ fontSize: 12.5, color: 'var(--gb-text-primary)', fontWeight: 500, lineHeight: 1.45 }}>
          {a.subject || <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5, flexWrap: 'wrap' }}>
          {a.category && <Tag tone={meta.tone} size="xs">{a.category}</Tag>}
          {a.direction && <Tag tone="neutral" size="xs">{a.direction}</Tag>}
          {a.employee && <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontWeight: 600 }}>{a.employee}</span>}
        </div>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 3 }}>{fmtDateTime(a.date)}</span>
    </div>
  );
}
function ActivityPanel() {
  const D = useD();
  const rows = D.activities;
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
            <Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => { try { window.__gbOpenNote && window.__gbOpenNote({}); } catch (e) {} }}>Add note</Btn>
          </div>
        }
      />
      <ScrollArea max={460}>
        {/* key by filter → the list fades/slides in on each filter change */}
        <div key={filter} style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          {filtered.map((a, idx) => <ActivityRow key={idx} a={a} last={idx === filtered.length - 1} />)}
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
      const template = buildCustomTaskTemplate({
        subject: t.Subject,
        body: t.Description,
        daysOut: daysOutFromCrmDate(t.DueDate),
        priority: t.Priority,
      });
      const result = await submitQuickTask({
        template,
        context: { contactId: D.ids.contact, employeeId: currentEmployeeId() },
      });
      if (!result || !result.ok) throw new Error((result && result.error) || 'create failed');
      const id = result.taskId || `new-${nextTaskTempId()}`;
      patch((Dd) => ({ ...Dd, openTasks: [{ id, subject: t.Subject.trim(), category: '', priority: priLabel(t.Priority), dueDate: t.DueDate || todayMDY(), status: 'Open' }, ...(Dd.openTasks || [])] }));
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
      const r = await submitQuickTask({ template: tpl, context: { contactId: D.ids.contact, employeeId: currentEmployeeId() } });
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
      const result = await submitQuickTask({
        template: buildCustomTaskTemplate({ subject: subj }),
        context: { contactId: D.ids.contact, employeeId: currentEmployeeId() },
      });
      if (!result || !result.ok) throw new Error((result && result.error) || 'create failed');
      addRow({ id: result.taskId || `new-${nextTaskTempId()}`, subject: subj, priority: priLabel(2), dueDate: todayMDY() });
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
      const ctx = {
        contactId: D.ids.contact,
        phone: String(D.contact.phone || '').replace(/\D/g, ''),
        employeeId: currentEmployeeId(),
        contactName: [D.contact.firstName, D.contact.lastName].filter(Boolean).join(' '),
      };
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
   OPPORTUNITY — header / stats / info (scalars fetched via
   Opportunity/Get; tasks/emails come from the shared schema).
════════════════════════════════════════════════════════════ */
const OppCtx = React.createContext({ opp: null });
const useOpp = () => React.useContext(OppCtx);
const OPP_SOURCES = [
  { value: 0, label: 'Not Set' }, { value: 1, label: 'Scramble Hunter' }, { value: 2, label: 'Play Yellow' },
  { value: 3, label: 'Perfect Golf Events' }, { value: 4, label: 'Green Grass' }, { value: 5, label: 'Ryan LeMaire' },
  { value: 6, label: 'Graeme Fidelak' }, { value: 7, label: 'Meta' },
];
function oppIdFromUrl() {
  try { const p = new URLSearchParams(location.search); return p.get('opportunityID') || p.get('opportunityId') || ''; } catch (e) { return ''; }
}
function adaptOpp(g, id) {
  if (!g) return null;
  const stage = (OPP_STAGES.find((s) => String(s.value) === String(g.OpportunityStageId)) || {}).label || g.Status || '';
  const source = (OPP_SOURCES.find((s) => String(s.value) === String(g.sourceID)) || {}).label || '';
  return {
    id: String(id || g.opportunityId || ''),
    subject: g.Subject || '', stage, stageId: g.OpportunityStageId, source,
    estimatedValue: Number(g.EstimatedValue) || 0,
    estimatedClosedDate: g.EstimatedClosedDate || '',
    closedProbability: g.ClosedProbability,
    description: g.Description || '',
  };
}
function oppStageTone(stage) {
  const s = (stage || '').toLowerCase();
  if (s.indexOf('won') !== -1 || s === 'ordered') return 'success';
  if (s.indexOf('lost') !== -1) return 'error';
  if (s === 'proposed') return 'brand';
  if (s === 'qualified' || s === 'open') return 'info';
  return 'warning';
}
function OppHeader() {
  const { opp } = useOpp();
  const D = useD();
  const { openModal } = useModal();
  const tone = oppStageTone(opp.stage);
  const cname = [D.contact.firstName, D.contact.lastName].filter(Boolean).join(' ');
  return (
    <Card pad={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0 }}>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--gb-brand-tint-medium)', border: '1px solid var(--gb-brand-tint-border)', color: 'var(--gb-brand-label)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I.target size={19} /></span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -.4, color: 'var(--gb-text-primary)' }}>{opp.subject || 'Opportunity'}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <Tag tone={tone} size="md" icon={<Dot tone={tone} glow />}>{opp.stage || '—'}</Tag>
                <Tag tone="neutral" size="md">Opportunity #{opp.id}</Tag>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', paddingTop: 12, borderTop: '1px dashed var(--gb-border-subtle)' }}>
            <ContactPill icon={<I.briefcase />} label="Account" value={txt(D.account.name)} />
            <ContactPill icon={<I.user />} label="Contact" value={cname || DASH} />
            <ContactPill icon={<I.phone />} label="Phone" value={txt(D.contact.phone)} />
            <ContactPill icon={<I.mail />} label="Email" value={txt(D.contact.email)} />
          </div>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0, borderLeft: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-faint)', minWidth: 210 }}>
          <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<OpportunityModal opportunityId={opp.id} />)}>Edit Opportunity</Btn>
          <Btn variant="tinted" status="warning" icon={<I.cart />} full onClick={() => goUrl(`https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}`)}>Proposal Mode</Btn>
          <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
        </div>
      </div>
    </Card>
  );
}
function OppStatsStrip() {
  const { opp } = useOpp();
  const D = useD();
  const cells = [
    { label: 'Estimated Value', value: fmt$(opp.estimatedValue), sub: `${opp.closedProbability != null ? opp.closedProbability : 0}% close prob.`, tone: 'brand', glow: true },
    { label: 'Stage', value: opp.stage || '—', sub: opp.source || 'Not Set', tone: oppStageTone(opp.stage) },
    { label: 'Open Tasks', value: D.openTasks.length, sub: 'follow-ups', tone: D.openTasks.length ? 'warning' : 'success' },
    { label: 'Emails', value: D.emails.length, sub: 'in thread', mono: true },
    { label: 'Est. Close', value: opp.estimatedClosedDate || DASH, sub: 'target', mono: true },
    { label: 'Source', value: opp.source || 'Not Set', sub: 'origin' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
      {cells.map((c, i) => (
        <Card key={i} className="gbcp-stat" pad="14px 16px" style={c.tone === 'brand' ? { background: 'var(--gb-brand-tint-soft)', borderColor: 'var(--gb-brand-tint-border)' } : null}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase', color: c.tone === 'brand' ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)' }}>{c.label}</div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, color: c.tone === 'brand' ? 'var(--gb-brand-label)' : c.tone === 'success' ? 'var(--gb-success-fg)' : c.tone === 'error' ? 'var(--gb-error-fg)' : c.tone === 'warning' ? 'var(--gb-warning-fg)' : 'var(--gb-text-primary)', fontFamily: c.mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', letterSpacing: -.4, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 3, fontWeight: 500 }}>{c.sub}</div>
        </Card>
      ))}
    </div>
  );
}
function OppInfoCard() {
  const { opp } = useOpp();
  const D = useD();
  const { openModal } = useModal();
  return (
    <Card>
      <SectionTitle icon={<I.target />} title="Opportunity Information" sub={`#${opp.id} · ${txt(D.account.name)}`}
        right={<Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => openModal(<OpportunityModal opportunityId={opp.id} />)}>Edit Opportunity</Btn>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 26px', padding: '8px 18px 16px' }}>
        <div>
          <KV label="Subject">{txt(opp.subject)}</KV>
          <KV label="Status"><Tag tone={oppStageTone(opp.stage)} size="sm">{opp.stage || '—'}</Tag></KV>
          <KV label="Source">{opp.source || 'Not Set'}</KV>
          <KV label="Estimated Value" mono>{fmt$(opp.estimatedValue)}</KV>
          <KV label="Est. Closed Date" mono>{opp.estimatedClosedDate || DASH}</KV>
          <KV label="Closed Probability" mono>{opp.closedProbability != null ? opp.closedProbability + '%' : DASH}</KV>
        </div>
        <div>
          <KV label="Opportunity ID" mono copyable>{opp.id}</KV>
          <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
          <KV label="Contact ID" mono copyable>{txt(D.ids.contact)}</KV>
        </div>
        <div style={{ gridColumn: '1 / -1', marginTop: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500, marginBottom: 5 }}>Description</div>
          <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)' }}>{opp.description || DASH}</div>
        </div>
      </div>
    </Card>
  );
}

/* Proposals + inline email generation (your modal, inlined): select proposals
   full-width, then the breakdown + generated email full-width below. */
function ProposalsSection() {
  const { opp } = useOpp();
  const D = useD();
  const [proposals, setProposals] = useState(() => extractProposals(document));
  useEffect(() => {
    if (proposals.length) return undefined;   // retry briefly if rows render late
    let n = 0;
    const t = setInterval(() => { const p = extractProposals(document); if (p.length) { setProposals(p); clearInterval(t); } else if (++n > 8) clearInterval(t); }, 500);
    return () => clearInterval(t);
  }, []);
  const [selected, setSelected] = useState([]);
  const [source, setSource] = useState(null);
  const [building, setBuilding] = useState(false);
  const toggle = (id) => { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); setSource(null); };
  const chosen = proposals.filter((p) => selected.includes(p.cartId));
  // Resolved lines for the margin report: single source carries rawLines; a
  // multi-proposal source carries them per section.
  const marginEntries = source ? ((source.rawLines && source.rawLines.length) ? source.rawLines : (source.sections || []).flatMap((s) => s.rawLines || [])) : [];
  const hasContent = !!(source && ((source.lines && source.lines.length) || (source.sections && source.sections.length)));
  const buildEmail = async () => {
    if (!chosen.length || building) return;
    setBuilding(true);
    try {
      // Reuse the modal's proven pipeline: loadProposalCart → cartToEntry →
      // linesFromSaved → proposalToEmailSource (single) / sections (multi).
      const src = await buildEmailSourceFromCartIds(chosen.map((p) => p.cartId), { name: chosen.length === 1 ? chosen[0].name : '' });
      setSource(src);
    } catch (e) { gbToast('Could not load proposal carts', 'error'); }
    finally { setBuilding(false); }
  };
  return (
    <>
      <Card>
        <SectionTitle icon={<I.cart />} title="Proposals" count={proposals.length} sub="Select proposals to build a customer email"
          right={<Btn variant="tinted" status="warning" size="sm" icon={<I.cart />} onClick={() => goUrl(`https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}`)}>Proposal Mode</Btn>} />
        {proposals.length === 0
          ? <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No proposals on this opportunity yet — use Proposal Mode to build one.</div>
          : (
            <ScrollArea max={300}>
              <table style={tableStyle}>
                <thead><tr><Th style={{ width: 34 }}></Th><Th>Name</Th><Th>Cart</Th><Th align="right">Expires</Th><Th align="center">Site</Th></tr></thead>
                <tbody>
                  {proposals.map((p) => {
                    const on = selected.includes(p.cartId);
                    return (
                      <tr key={p.cartId} style={{ ...trStyle, background: on ? 'var(--gb-brand-tint-soft)' : 'transparent', cursor: 'pointer', transition: 'background var(--gb-anim)' }} onClick={() => toggle(p.cartId)}>
                        <Td><span style={{ width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--gb-brand-label)' : 'transparent', border: '1.5px solid ' + (on ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'), color: 'var(--gb-surface-deep)' }}>{on && <I.check size={10} />}</span></Td>
                        <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 600 }}>{p.name}</span></Td>
                        <Td>
                          {(() => { const url = `https://www.golfballs.com/cart?proposalMode=true&opportunityID=${opp.id}&cartID=${p.cartId}`; return (
                            <a href={url} title={url} onClick={(e) => { e.stopPropagation(); e.preventDefault(); goUrl(url); }}
                              style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 10.5, color: 'var(--gb-brand-label)', textDecoration: 'none', wordBreak: 'break-all', lineHeight: 1.4 }}>{url}</a>
                          ); })()}
                        </Td>
                        <Td align="right" mono><span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{p.expiration}</span></Td>
                        <Td align="center">{p.newSite ? <Tag tone="info" size="xs">New</Tag> : <Tag tone="neutral" size="xs">Legacy</Tag>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          )}
      </Card>
      <Card>
        <SectionTitle icon={<I.bolt />} title="Build Proposal Breakdown" sub="Loads each selected proposal's cart → margin + customer email"
          right={<Btn variant="primary" size="sm" disabled={!chosen.length || building} onClick={buildEmail}
            icon={building ? <span style={{ width: 13, height: 13, borderRadius: '50%', borderStyle: 'solid', borderWidth: 2, borderColor: 'currentColor', borderTopColor: 'transparent', display: 'inline-block', animation: 'gb-spin 0.7s linear infinite' }} /> : <I.bolt />}>
            {building ? 'Loading…' : hasContent ? 'Rebuild' : 'Build'}</Btn>} />
        <div style={{ padding: 16 }}>
          {building ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '34px 0', color: 'var(--gb-text-muted)' }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', borderStyle: 'solid', borderWidth: 3, borderColor: 'var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin 0.7s linear infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Loading proposal cart{chosen.length > 1 ? 's' : ''} & building breakdown…</span>
            </div>
          ) : !source ? (chosen.length === 0
            ? <div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)', background: 'var(--gb-fill-faint)', border: '1px dashed var(--gb-border-default)', borderRadius: 'var(--gb-r-md)' }}>Select one or more proposals above, then Build.</div>
            : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{chosen.map((p) => <Tag key={p.cartId} tone="brand" size="sm">{p.name}</Tag>)}</div>
          ) : hasContent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--gb-success-fg)' }}>
              <I.check size={14} /> Built — margin breakdown and email below.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--gb-text-secondary)', lineHeight: 1.55 }}>
              Loaded the cart(s) but no line items came back for{' '}
              <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{chosen.map((p) => p.cartId).join(', ')}</span>. The carts may be empty or failed to load.
            </div>
          )}
        </div>
      </Card>

      {hasContent && marginEntries.length > 0 && (
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <SectionTitle icon={<I.spark />} title="Margin Breakdown" sub="Blended margin across the selected proposal(s)" />
          <div style={{ padding: 16 }}>
            <MarginBreakdown entries={marginEntries} />
          </div>
        </Card>
      )}

      {hasContent && (
        <Card style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          <SectionTitle icon={<I.mail />} title="Proposal Email" sub="Generated from the proposals' line items — pick a template & preview" />
          <div style={{ height: 'min(720px, 78vh)', display: 'flex', flexDirection: 'column' }}>
            <ProposalEmailComposer source={source} />
          </div>
        </Card>
      )}
    </>
  );
}

function App({ store }) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const [patches, setPatches] = useState([]);
  const patch = useCallback((fn) => setPatches((p) => [...p, fn]), []);
  const D = useMemo(
    () => patches.reduce((acc, fn) => { try { return fn(acc) || acc; } catch (e) { return acc; } }, adapt(data)),
    [data, patches],
  );
  // Opportunity scalars come from Opportunity/Get (more reliable than scraping);
  // tasks/emails/contact come from the shared schema (D).
  const [opp, setOpp] = useState(null);
  useEffect(() => {
    const id = oppIdFromUrl();
    if (!id) return undefined;
    let live = true;
    crmGetOpportunity(id).then((g) => { if (live) setOpp(adaptOpp(g, id)); }).catch(() => {});
    return () => { live = false; };
  }, []);

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
    <OppCtx.Provider value={{ opp, setOpp }}>
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
        <Sidebar currentLabel={'Opportunity · #' + oppIdFromUrl()} collapsed={sideCollapsed} setCollapsed={setSideCollapsed} />
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
            {!opp ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '90px 0', color: 'var(--gb-text-muted)' }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', borderStyle: 'solid', borderWidth: 3, borderColor: 'var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Loading opportunity…</span>
              </div>
            ) : (
              <>
                <OppHeader />
                <OppStatsStrip />
                <OppInfoCard />
                <ProposalsSection />
                <TasksPanel />
                <EmailsPanel />
              </>
            )}
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
    </OppCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbOpportunityDetailsRegistered) {
  window.__gbOpportunityDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.opportunity_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Opportunity page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
