/* eslint-disable */
/**
 * Action Review custom page (CRM Page 286).
 *
 * The native page is a firm-wide "what has this rep been doing" review, driven
 * by a filter header (Sales Rep + a due-date option) that postbacks and rebuilds
 * THREE stacked tables:
 *   1. Activity      (#ActivityTable) — Employee / Category / Direction / Subject / Date
 *   2. Email History (the striped From/To/Subject/Date/Size table)
 *   3. Tasks         (#TableTasks)    — Subject / Category / Status / Live / Due
 *
 * This takeover reproduces that exact structure in the shared shell: the filter
 * header on top, then the three panels rendered with the SAME components the
 * contact/account detail pages use (ActivityRow, the email table, the task
 * table). No search bar, no facet sidebar — this is a review surface, and the
 * rep/date filter is the native postback, not client-side filtering.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { completeTaskById } from '../lib/crmTasks.js';
import { Dropdown } from '../ui/components/Dropdown.jsx';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Btn, Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, ScrollArea,
  SectionTitle, Spinner, Tag, Td, Th, fmtBytes, fmtDateTime, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import {
  ActivityRow, Breadcrumb, DetailPageFrame, EditTaskModal, ModalCtx, TopBar,
  useDetailData, useModalHost,
} from '../lib/crm-detail-shared.jsx';

const TASK_BATCH = 60;

/* M/D/YYYY for the WebForms postback (native date-picker format). */
const fmtMDY = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : '');
const cellText = (td) => (td ? (td.textContent || '').replace(/\s+/g, ' ').trim() : '');

/* ── Parsers (one per native table) ─────────────────────────────── */

/* #ActivityTable → { id, employee, category, direction, subject, date }.
   Cells: [icon, Employee, Category, Direction, Subject(anchor), Date]. The
   subject anchor carries the activity id: CreateActivityDetailModal(1234). */
function parseActivities(doc) {
  const table = doc.querySelector('#ActivityTable');
  if (!table) return [];
  const out = [];
  table.querySelectorAll('tbody tr').forEach((row) => {
    const tds = row.querySelectorAll('td');
    if (tds.length < 6) return;
    let id = '';
    const link = row.querySelector('a[href*="CreateActivityDetailModal"]');
    if (link) { const m = /CreateActivityDetailModal\((\d+)\)/.exec(link.getAttribute('href') || ''); if (m) id = m[1]; }
    out.push({
      id,
      employee: cellText(tds[1]),
      category: cellText(tds[2]),
      direction: cellText(tds[3]),
      subject: cellText(tds[4]),
      date: cellText(tds[5]),
    });
  });
  return out;
}

/* The Email History table has no id — find it by its header shape
   (From / To / Subject / Size), skipping the two id'd tables. */
function findEmailTable(doc) {
  const tables = Array.from(doc.querySelectorAll('table'));
  for (const t of tables) {
    if (t.id === 'TableTasks' || t.id === 'ActivityTable') continue;
    // The header row is a <tr> of <th> living in <tbody> (not <thead>), so
    // match against every <th> in the table, wherever it sits.
    const heads = Array.from(t.querySelectorAll('th')).map((h) => (h.textContent || '').trim().toLowerCase());
    if (heads.includes('from') && heads.includes('to') && heads.includes('subject') && heads.includes('size')) return t;
  }
  return null;
}

/* Email table → { from, to, subject, date, size, href }. Row cells:
   [icon, From, To, Subject, Date, Size, Download-link]. */
function parseEmails(doc) {
  const table = findEmailTable(doc);
  if (!table) return [];
  const out = [];
  table.querySelectorAll('tbody tr').forEach((row) => {
    const tds = row.querySelectorAll('td');
    if (tds.length < 6) return;
    const from = cellText(tds[1]);
    if (!from) return;                     // skip the "Emails Not Shown" spacer rows
    const a = tds[tds.length - 1].querySelector('a[href]');
    out.push({
      from,
      to: cellText(tds[2]),
      subject: cellText(tds[3]),
      date: cellText(tds[4]),
      size: Number(cellText(tds[5])) || 0,
      href: a ? a.getAttribute('href') : '',
    });
  });
  return out;
}

/* #TableTasks → { id, subject, category, status, live, due }. */
function parseTasks(doc) {
  const table = doc.querySelector('#TableTasks');
  if (!table) return [];
  const out = [];
  table.querySelectorAll('tr[id^="taskrow_"]').forEach((row) => {
    if (row.id.includes('taskrow2_')) return;
    const cells = Array.from(row.querySelectorAll('td')).map(cellText);
    if (cells.length < 5) return;
    const off = /^(new|waiting|complete)/i.test(cells[2] || '') ? 0 : 1;
    const [subject, category, status, live, due] = cells.slice(off, off + 5);
    out.push({ id: row.id.replace('taskrow_', ''), subject: subject || '', category: category || '', status: status || '', live: live || '', due: due || '' });
  });
  return out;
}

function parseAll(doc) {
  return { activities: parseActivities(doc), emails: parseEmails(doc), tasks: parseTasks(doc) };
}

/* ── Server-side filter (native GetSalesRep postback) ───────────────
   The native Submit runs GetSalesRepData() →
   __doPostBack('GetSalesRep', JSON.stringify({SalesRep, DateOption,
   DateTime, SecondDateTime})). We replay that WebForms POST and re-parse. */
function collectFormState(doc) {
  const state = {};
  doc.querySelectorAll('form input[name], form select[name], form textarea[name]').forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'image') return;
    if ((type === 'checkbox' || type === 'radio') && !el.checked) return;
    state[el.name] = el.value ?? '';
  });
  return state;
}
function parseRepOptions(doc) {
  const out = [];
  doc.querySelectorAll('#SalesRep option').forEach((o) => {
    const label = (o.textContent || '').trim();
    if (label) out.push({ id: o.getAttribute('value') || '', label });
  });
  return out;
}
async function postFilter(formState, { rep, dateOption, date1, date2 }) {
  const fields = { ...formState };
  fields.__EVENTTARGET = 'GetSalesRep';
  fields.__EVENTARGUMENT = JSON.stringify({ SalesRep: rep, DateOption: dateOption, DateTime: date1 || '', SecondDateTime: date2 || '' });
  fields['ctl00$SalesRep'] = rep;
  fields['ctl00$DateOption'] = dateOption;
  fields['ctl00$DateTime'] = date1 || '';
  fields['ctl00$SecondDateTime'] = date2 || '';
  const res = await fetch(window.location.href, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  return new DOMParser().parseFromString(await res.text(), 'text/html');
}

/* ── The three panels ───────────────────────────────────────────── */

function ActivitySection({ rows }) {
  return (
    <Card style={{ overflow: 'visible' }}>
      <SectionTitle icon={<I.history />} title="Activity" count={`${rows.length}`} sub="Calls, notes, and workflow events" />
      <div className="gbcp-list-head" aria-hidden="true">
        <span>Type</span><span>Activity</span><span>Owner</span><span style={{ textAlign: 'right' }}>Date</span>
      </div>
      <ScrollArea max={460}>
        {rows.map((a, i) => <ActivityRow key={a.id || i} a={a} last={i === rows.length - 1} />)}
        {rows.length === 0 && <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No activity in range.</div>}
      </ScrollArea>
    </Card>
  );
}

function EmailSection({ rows }) {
  const open = (href) => { if (href) { try { window.open(href, '_blank'); } catch (e) {} } };
  return (
    <Card>
      <SectionTitle icon={<I.mail />} title="Email History" count={`${rows.length} shown`} sub="Messages to or from the rep in range" />
      <ScrollArea max={420}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>From</Th><Th>To</Th><Th>Subject</Th>
            <Th align="right">Date</Th><Th align="right">Size</Th><Th></Th>
          </tr></thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} style={trStyle}>
                <Td><span style={{ fontWeight: 500, color: 'var(--gb-text-secondary)' }}>{e.from}</span></Td>
                <Td muted>{e.to}</Td>
                <Td><span style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))' }}>{e.subject || DASH}</span></Td>
                <Td align="right" mono muted>{fmtDateTime(e.date)}</Td>
                <Td align="right" mono muted>{e.size ? fmtBytes(e.size) : DASH}</Td>
                <Td align="right">
                  {e.href
                    ? <IconBtn size="xs" ghost icon={<I.download />} title="Download .eml" onClick={() => open(e.href)} />
                    : null}
                </Td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 26, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No email in range.</td></tr>}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  );
}

const statusTone = (s) => (/complete/i.test(s) ? 'success' : /waiting/i.test(s) ? 'warning' : 'info');

function TaskSection({ rows, onEdit, onComplete, rowStatus }) {
  const [count, setCount] = useState(TASK_BATCH);
  const sentinelRef = useRef(null);
  useEffect(() => { setCount(TASK_BATCH); }, [rows]);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || count >= rows.length) return undefined;
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) setCount((c) => Math.min(c + TASK_BATCH, rows.length));
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [count, rows.length]);
  const shown = rows.slice(0, count);
  return (
    <Card>
      <SectionTitle icon={<I.task />} title="Tasks"
        count={rows.length > count ? `${count} of ${rows.length}` : `${rows.length}`}
        sub="Open and completed tasks in range" />
      <table style={tableStyle}>
        <thead><tr>
          <Th>Subject</Th><Th>Category</Th><Th align="center">Status</Th>
          <Th align="right">Live</Th><Th align="right">Due</Th><Th align="center">Actions</Th>
        </tr></thead>
        <tbody>
          {shown.map((t) => (
            <tr key={t.id} style={trStyle}>
              <Td><span style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontWeight: 400 }}>{t.subject || DASH}</span></Td>
              <Td muted>{t.category || DASH}</Td>
              <Td align="center"><Tag tone={statusTone(t.status)} size="sm">{t.status || '—'}</Tag></Td>
              <Td align="right" mono muted>{txt(t.live) || DASH}</Td>
              <Td align="right" mono muted>{txt(t.due) || DASH}</Td>
              <Td align="center" style={{ width: 84, whiteSpace: 'nowrap' }}>
                {rowStatus[t.id] === 'running' ? (
                  <span style={{ width: 13, height: 13, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                ) : rowStatus[t.id] === 'done' ? (
                  <span style={{ color: 'var(--gb-success)', display: 'inline-flex' }}><I.check size={14} sw={3} /></span>
                ) : rowStatus[t.id] === 'error' ? (
                  <span style={{ color: 'var(--gb-error)', display: 'inline-flex' }} title="Failed"><I.close size={13} sw={2.6} /></span>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    <IconBtn size="xs" ghost icon={<I.edit />} title="Edit task" onClick={() => onEdit(t)} />
                    <IconBtn size="xs" ghost icon={<I.check />} title="Complete task" onClick={() => onComplete(t)} />
                  </span>
                )}
              </Td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 26, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>No tasks in range.</td></tr>}
        </tbody>
      </table>
      {count < rows.length && (
        <div ref={sentinelRef} style={{ padding: 14, textAlign: 'center', fontSize: 11, color: 'var(--gb-text-muted)' }}>Loading more…</div>
      )}
    </Card>
  );
}

/* ── Filter header (native postback) ────────────────────────────── */

function FilterBar({ reps, rep, setRep, dateOption, setDateOption, date1, setDate1, date2, setDate2, busy, onApply }) {
  return (
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 5 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '12px 14px' }}>
        <Field label="Sales Rep" width={220}>
          <Dropdown value={rep} options={reps} onChange={setRep} size="sm" searchable placeholder="Select rep…" />
        </Field>
        <Field label="Due date" width={130}>
          <Dropdown value={dateOption} onChange={setDateOption} size="sm"
            options={[{ id: 'ON', label: 'On' }, { id: 'BETWEEN', label: 'Between' }, { id: 'BEFORE', label: 'Before' }, { id: 'AFTER', label: 'After' }]} />
        </Field>
        <Field label={dateOption === 'BETWEEN' ? 'From' : 'Date'} width={168}>
          <DatePicker value={date1} onChange={setDate1} includeTime={false} placeholder="Pick a date" />
        </Field>
        {dateOption === 'BETWEEN' && (
          <Field label="To" width={168}>
            <DatePicker value={date2} onChange={setDate2} includeTime={false} placeholder="and…" />
          </Field>
        )}
        <Btn variant="primary" size="sm" icon={<I.search />} onClick={onApply} disabled={busy || !reps.length}>
          {busy ? 'Loading…' : 'Apply'}
        </Btn>
      </div>
    </Card>
  );
}
function Field({ label, width, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: .4, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{label}</span>
      {children}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

function ActionReviewApp({ store }) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();
  const [data, setData] = useState(null);            // { activities, emails, tasks } | null
  const [reps, setReps] = useState([]);
  const [rep, setRep] = useState('');
  const [dateOption, setDateOption] = useState('ON');
  const [date1, setDate1] = useState(() => new Date());   // defaults to today
  const [date2, setDate2] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowStatus, setRowStatus] = useState({});
  const formStateRef = useRef({});

  // Initial load: re-fetch the page (server ships every row; the live DOM is
  // stripped to a single DataTables page) and parse all three tables.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(window.location.href, { credentials: 'include' });
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        if (cancelled) return;
        formStateRef.current = collectFormState(doc);
        setReps(parseRepOptions(doc));
        const sel = doc.querySelector('#SalesRep');
        if (sel && sel.value) setRep(sel.value);
        setData(parseAll(doc));
      } catch (e) {
        if (!cancelled) setData(parseAll(document));   // fallback: live DOM
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const applyFilter = async () => {
    if (busy) return;
    setBusy(true);
    setData(null);
    try {
      const doc = await postFilter(formStateRef.current, { rep, dateOption, date1: fmtMDY(date1), date2: fmtMDY(date2) });
      formStateRef.current = collectFormState(doc);
      if (parseRepOptions(doc).length) setReps(parseRepOptions(doc));
      setData(parseAll(doc));
    } catch (e) {
      setData({ activities: [], emails: [], tasks: [] });
    } finally { setBusy(false); }
  };

  const onEdit = (t) => modalHost.openModal(<EditTaskModal taskId={t.id} />);
  const onComplete = async (t) => {
    setRowStatus((m) => ({ ...m, [t.id]: 'running' }));
    try {
      await completeTaskById(t.id);
      setRowStatus((m) => ({ ...m, [t.id]: 'done' }));
      setTimeout(() => {
        setData((cur) => (cur ? { ...cur, tasks: cur.tasks.filter((x) => x.id !== t.id) } : cur));
        setRowStatus((m) => { const n = { ...m }; delete n[t.id]; return n; });
      }, 650);
    } catch (e) { setRowStatus((m) => ({ ...m, [t.id]: 'error' })); }
  };

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Action Review" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Action Review" /></TopBar>}
      >
        <div className="gbcp-search-body gbcp-stack" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 1180, margin: '0 auto' }}>
          <FilterBar
            reps={reps} rep={rep} setRep={setRep}
            dateOption={dateOption} setDateOption={setDateOption}
            date1={date1} setDate1={setDate1} date2={date2} setDate2={setDate2}
            busy={busy} onApply={applyFilter}
          />
          {data == null ? <Spinner label="Loading action review…" /> : (
            <>
              <ActivitySection rows={data.activities} />
              <EmailSection rows={data.emails} />
              <TaskSection rows={data.tasks} onEdit={onEdit} onComplete={onComplete} rowStatus={rowStatus} />
            </>
          )}
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* ── Register with the custom-pages engine (Page 286 → action_review) ── */
if (!window.__gbActionReviewPageRegistered) {
  window.__gbActionReviewPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.action_review = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="Action Review page"><ActionReviewApp store={ctx.store} /></DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
