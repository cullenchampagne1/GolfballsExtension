/* eslint-disable */
/**
 * Action Review custom page (CRM Page 286).
 *
 * The native WebForms page is three datasets behind one server-side scope:
 * Activity, Email History, and Tasks. The task table can exceed 20,000 rows,
 * so the takeover keeps all three tables full-width while paging only the
 * task DOM. Parsing and postback construction live in actionReviewModel.js.
 */

import React, {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { completeTaskById } from '../lib/crmTasks.js';
import {
  actionReviewDocumentSignature,
  filterActionReviewTasks,
  isActionReviewDocument,
  isActionReviewSnapshotSettled,
  paginateActionReviewRows,
  parseActionReviewDocument,
  prepareActionReviewPostback,
  toIsoActionReviewDate,
} from '../lib/actionReviewModel.js';
import { Dropdown } from '../ui/components/Dropdown.jsx';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import {
  Btn,
  Card,
  DASH,
  DataCtx,
  DetailErrorBoundary,
  I,
  IconBtn,
  SectionTitle,
  Spinner,
  Tag,
  Td,
  Th,
  fmtBytes,
  fmtDateTime,
  tableStyle,
  trStyle,
  txt,
} from '../lib/detail-shared.jsx';
import {
  ActivityDetailModal,
  Breadcrumb,
  DetailPageFrame,
  EditTaskModal,
  ModalCtx,
  TopBar,
  useDetailData,
  useModalHost,
} from '../lib/crm-detail-shared.jsx';

const DATE_OPTIONS = [
  { id: 'ON', label: 'On' },
  { id: 'BETWEEN', label: 'Between' },
  { id: 'BEFORE', label: 'Before' },
  { id: 'AFTER', label: 'After' },
];
const PAGE_SIZES = [50, 100, 250];
const NUMBER = new Intl.NumberFormat('en-US');

const ACTION_REVIEW_CSS = `
  .gbar-page {
    width: 100%;
    min-width: 0;
    padding-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .gbar-scope-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--gb-border-subtle);
  }
  .gbar-scope-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    border: 1px solid var(--gb-brand-tint-border);
    border-radius: var(--gb-r-md);
    color: var(--gb-brand-label);
    background: var(--gb-brand-tint-soft);
  }
  .gbar-filter-grid {
    display: grid;
    grid-template-columns: minmax(230px, 1.4fr) minmax(125px, .65fr) minmax(165px, .8fr) minmax(165px, .8fr) auto;
    gap: 10px;
    align-items: end;
    padding: 12px 14px 14px;
  }
  .gbar-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .gbar-field-label {
    color: var(--gb-text-muted);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .65px;
    line-height: 1;
    text-transform: uppercase;
  }
  .gbar-stat-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-top: 1px solid var(--gb-border-subtle);
    background: color-mix(in srgb, var(--gb-surface-2) 58%, transparent);
  }
  .gbar-stat {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 14px;
    border-left: 1px solid var(--gb-border-subtle);
  }
  .gbar-stat:first-child { border-left: 0; }
  .gbar-stat-icon {
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--gb-text-tertiary);
    background: var(--gb-fill-subtle);
    border: 1px solid var(--gb-border-subtle);
    border-radius: var(--gb-r-sm);
  }
  .gbar-stat-value {
    color: var(--gb-detail-text-primary, var(--gb-text-primary));
    font-family: var(--gb-font-mono);
    font-size: 15px;
    font-weight: 650;
    line-height: 1.1;
  }
  .gbar-stat-label {
    margin-top: 2px;
    color: var(--gb-text-muted);
    font-size: 9px;
    font-weight: 650;
    letter-spacing: .45px;
    text-transform: uppercase;
  }
  .gbar-error {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 12px;
    color: var(--gb-error-fg);
    background: var(--gb-error-tint-soft);
    border: 1px solid var(--gb-error-tint-border);
    border-radius: var(--gb-r-md);
    font-size: 11.5px;
  }
  .gbar-table-scroll {
    width: 100%;
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .gbar-table-scroll--activity { max-height: 410px; }
  .gbar-table-scroll--email { max-height: 350px; }
  .gbar-table-scroll--tasks { height: min(570px, 62vh); min-height: 360px; }
  .gbar-table { min-width: 920px; }
  .gbar-table--email { min-width: 1080px; }
  .gbar-table--tasks { min-width: 1040px; }
  .gbar-table tbody tr:last-child { border-bottom: 0 !important; }
  .gbar-tr-clickable { cursor: pointer; }
  .gbar-subject {
    display: block;
    min-width: 0;
    overflow: hidden;
    color: var(--gb-detail-text-primary, var(--gb-text-primary));
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gbar-meta-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 2px 6px;
    overflow: hidden;
    color: var(--gb-text-tertiary);
    background: var(--gb-fill-subtle);
    border: 1px solid var(--gb-border-subtle);
    border-radius: 5px;
    font-size: 9.5px;
    font-weight: 550;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gbar-task-tools {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 190px 126px;
    gap: 9px;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--gb-border-subtle);
    background: color-mix(in srgb, var(--gb-surface-2) 45%, transparent);
  }
  .gbar-search {
    min-width: 0;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 9px;
    color: var(--gb-text-muted);
    background: var(--gb-surface-2);
    border: 1px solid var(--gb-border-default);
    border-radius: var(--gb-r-sm);
  }
  .gbar-search:focus-within {
    border-color: var(--gb-border-focus);
    box-shadow: 0 0 0 2px var(--gb-brand-tint-soft);
  }
  .gbar-search input {
    min-width: 0;
    flex: 1;
    color: var(--gb-text-primary);
    background: transparent;
    border: 0;
    outline: 0;
    font: 11.5px var(--gb-font-sans);
  }
  .gbar-search input::placeholder { color: var(--gb-text-ghost); }
  .gbar-task-footer {
    min-height: 43px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    border-top: 1px solid var(--gb-border-default);
    background: var(--gb-surface-2);
  }
  .gbar-task-range {
    color: var(--gb-text-muted);
    font-family: var(--gb-font-mono);
    font-size: 10.5px;
  }
  .gbar-loading-line {
    height: 2px;
    overflow: hidden;
    background: var(--gb-border-subtle);
  }
  .gbar-loading-line::after {
    content: "";
    display: block;
    width: 34%;
    height: 100%;
    background: var(--gb-brand-label);
    animation: gbar-load 1s ease-in-out infinite;
  }
  @keyframes gbar-load {
    from { transform: translateX(-110%); }
    to { transform: translateX(330%); }
  }
  @media (max-width: 1180px) {
    .gbar-filter-grid {
      grid-template-columns: minmax(210px, 1fr) minmax(120px, .55fr) minmax(155px, .7fr) auto;
    }
    .gbar-filter-grid .gbar-field--second-date { grid-column: 3; }
    .gbar-stat-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gbar-stat:nth-child(3) { border-left: 0; border-top: 1px solid var(--gb-border-subtle); }
    .gbar-stat:nth-child(4) { border-top: 1px solid var(--gb-border-subtle); }
  }
  @media (max-width: 760px) {
    .gbar-scope-head { align-items: flex-start; }
    .gbar-filter-grid { grid-template-columns: minmax(0, 1fr); }
    .gbar-filter-grid .gbar-field--second-date { grid-column: auto; }
    .gbar-stat-strip { grid-template-columns: minmax(0, 1fr); }
    .gbar-stat { border-left: 0; border-top: 1px solid var(--gb-border-subtle); }
    .gbar-stat:first-child { border-top: 0; }
    .gbar-task-tools { grid-template-columns: minmax(0, 1fr); }
    .gbar-task-footer { align-items: flex-start; flex-direction: column; }
  }
`;

function todayIso() {
  return toIsoActionReviewDate(new Date());
}

function normalizeReview(review) {
  if (!review || typeof review !== 'object') return null;
  return {
    ...review,
    activities: Array.isArray(review.activities) ? review.activities : [],
    emails: Array.isArray(review.emails) ? review.emails : [],
    tasks: Array.isArray(review.tasks) ? review.tasks : [],
    reps: Array.isArray(review.reps) ? review.reps : [],
    selected: {
      rep: review.selected?.rep || '',
      dateOption: review.selected?.dateOption || 'ON',
      date1: toIsoActionReviewDate(review.selected?.date1) || todayIso(),
      date2: toIsoActionReviewDate(review.selected?.date2) || todayIso(),
    },
    formState: review.formState && typeof review.formState === 'object' ? review.formState : {},
    formAction: review.formAction || '',
  };
}

function waitForLiveActionReview(timeoutMs = 10_000) {
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let signature = '';
  let stableSince = startedAt;

  return new Promise((resolve, reject) => {
    const poll = () => {
      const now = Date.now();
      const ready = isActionReviewDocument(document);
      const nextSignature = actionReviewDocumentSignature(document);
      if (nextSignature !== signature) {
        signature = nextSignature;
        stableSince = now;
      }

      // Native DataTables briefly detach every tbody row while initializing.
      // Require both a minimum host-settle window and a quiet row-count window
      // before parsing, including when the legitimate result is zero rows.
      if (isActionReviewSnapshotSettled({
        ready,
        elapsedMs: now - startedAt,
        stableMs: now - stableSince,
      })) {
        resolve(normalizeReview(parseActionReviewDocument(document)));
        return;
      }

      if (now < deadline) {
        window.setTimeout(poll, 125);
        return;
      }

      // A very large DataTable may still be finishing its "show all" draw.
      // Prefer the usable native rows already present over replacing the
      // authenticated page with a network error.
      if (isActionReviewDocument(document)) {
        resolve(normalizeReview(parseActionReviewDocument(document)));
        return;
      }
      reject(new Error('The native Action Review tables did not become available.'));
    };
    poll();
  });
}

function submitNativeActionReview(filters) {
  const form = prepareActionReviewPostback(document, filters);
  const nativeSubmit = window.HTMLFormElement?.prototype?.submit;
  if (typeof nativeSubmit !== 'function') {
    throw new Error('The native Action Review form cannot be submitted.');
  }
  nativeSubmit.call(form);
}

function FilterField({ label, className = '', children }) {
  return (
    <div className={`gbar-field ${className}`}>
      <span className="gbar-field-label">{label}</span>
      {children}
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="gbar-stat">
      <span className="gbar-stat-icon">{React.cloneElement(icon, { size: 12 })}</span>
      <div style={{ minWidth: 0 }}>
        <div className="gbar-stat-value">{NUMBER.format(value || 0)}</div>
        <div className="gbar-stat-label">{label}</div>
      </div>
    </div>
  );
}

function ScopeCard({
  review,
  rep,
  setRep,
  dateOption,
  setDateOption,
  date1,
  setDate1,
  date2,
  setDate2,
  busy,
  onApply,
}) {
  const selectedRep = review?.reps.find((item) => String(item.id) === String(rep));
  const completeTasks = review?.tasks.filter((task) => /complete/i.test(task.status || '')).length || 0;
  const openTasks = (review?.tasks.length || 0) - completeTasks;
  const range = dateOption === 'BETWEEN'
    ? `${date1 || 'Choose a date'} – ${date2 || 'Choose a date'}`
    : `${DATE_OPTIONS.find((item) => item.id === dateOption)?.label || 'On'} ${date1 || 'choose a date'}`;
  const invalid = !rep || !date1 || (dateOption === 'BETWEEN' && !date2);

  return (
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 8 }}>
      <div className="gbar-scope-head">
        <span className="gbar-scope-icon"><I.filter size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontSize: 13, fontWeight: 650 }}>
            Review scope
          </div>
          <div style={{ marginTop: 2, overflow: 'hidden', color: 'var(--gb-text-muted)', fontSize: 10.5, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedRep?.label || 'Choose a sales rep'} · {range}
          </div>
        </div>
        <Tag tone={busy ? 'warning' : 'success'} size="sm">{busy ? 'Updating' : 'Loaded'}</Tag>
      </div>

      <div className="gbar-filter-grid">
        <FilterField label="Sales rep">
          <Dropdown
            value={rep}
            options={review?.reps || []}
            onChange={setRep}
            size="sm"
            searchable
            placeholder="Select rep…"
          />
        </FilterField>
        <FilterField label="Date rule">
          <Dropdown value={dateOption} options={DATE_OPTIONS} onChange={setDateOption} size="sm" />
        </FilterField>
        <FilterField label={dateOption === 'BETWEEN' ? 'From' : 'Date'}>
          <DatePicker value={date1} onChange={setDate1} includeTime={false} clearable={false} placeholder="Choose date" />
        </FilterField>
        {dateOption === 'BETWEEN' ? (
          <FilterField label="To" className="gbar-field--second-date">
            <DatePicker value={date2} onChange={setDate2} includeTime={false} clearable={false} placeholder="Choose date" />
          </FilterField>
        ) : <div aria-hidden="true" />}
        <Btn
          variant="primary"
          size="md"
          icon={<I.refresh />}
          onClick={onApply}
          disabled={busy || invalid || !(review?.reps.length)}
          style={{ minWidth: 108 }}
        >
          {busy ? 'Updating…' : 'Apply scope'}
        </Btn>
      </div>

      {busy && <div className="gbar-loading-line" />}

      <div className="gbar-stat-strip">
        <Stat icon={<I.history />} label="Activity" value={review?.activities.length} />
        <Stat icon={<I.mail />} label="Email" value={review?.emails.length} />
        <Stat icon={<I.task />} label="Open tasks" value={openTasks} />
        <Stat icon={<I.check />} label="All tasks" value={review?.tasks.length} />
      </div>
    </Card>
  );
}

function EmptyTableRow({ colSpan, children }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: 28, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 11.5 }}>
        {children}
      </td>
    </tr>
  );
}

function ActivitySection({ rows, onOpen }) {
  return (
    <Card>
      <SectionTitle
        icon={<I.history />}
        title="Activity"
        count={NUMBER.format(rows.length)}
        sub="Calls, notes, emails, and workflow events in the selected scope"
      />
      <div className="gbar-table-scroll gbar-table-scroll--activity">
        <table style={tableStyle} className="gbar-table">
          <thead>
            <tr>
              <Th style={{ width: 132 }}>Employee</Th>
              <Th style={{ width: 126 }}>Category</Th>
              <Th style={{ width: 84 }}>Direction</Th>
              <Th>Subject</Th>
              <Th align="right" style={{ width: 168 }}>Date</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((activity, index) => (
              <tr
                key={activity.id || `${activity.date}-${index}`}
                className={activity.id ? 'gb-actrow gbar-tr-clickable' : 'gb-actrow'}
                style={trStyle}
                onClick={activity.id ? () => onOpen(activity) : undefined}
                title={activity.id ? 'View activity detail' : undefined}
              >
                <Td style={{ width: 132, fontWeight: 500 }}>{activity.employee || DASH}</Td>
                <Td style={{ width: 126 }}><span className="gbar-meta-chip">{activity.category || DASH}</span></Td>
                <Td muted style={{ width: 84 }}>{activity.direction || DASH}</Td>
                <Td><span className="gbar-subject" title={activity.subject || ''}>{activity.subject || DASH}</span></Td>
                <Td align="right" mono muted style={{ width: 168, whiteSpace: 'nowrap' }}>{fmtDateTime(activity.date)}</Td>
              </tr>
            ))}
            {!rows.length && <EmptyTableRow colSpan={5}>No activity in this scope.</EmptyTableRow>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function EmailSection({ rows }) {
  const openEmail = (href) => {
    if (!href) return;
    try {
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      window.open(url.href, '_blank', 'noopener,noreferrer');
    } catch (error) {}
  };

  return (
    <Card>
      <SectionTitle
        icon={<I.mail />}
        title="Email History"
        count={NUMBER.format(rows.length)}
        sub="Inbound and outbound messages for the selected rep and date"
      />
      <div className="gbar-table-scroll gbar-table-scroll--email">
        <table style={tableStyle} className="gbar-table gbar-table--email">
          <thead>
            <tr>
              <Th style={{ width: 230 }}>From</Th>
              <Th style={{ width: 230 }}>To</Th>
              <Th>Subject</Th>
              <Th align="right" style={{ width: 168 }}>Date</Th>
              <Th align="right" style={{ width: 80 }}>Size</Th>
              <Th align="center" style={{ width: 54 }}>File</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((email, index) => (
              <tr key={`${email.href || email.date}-${index}`} className="gb-actrow" style={trStyle}>
                <Td style={{ width: 230, fontWeight: 500 }}><span className="gbar-subject" title={email.from}>{email.from || DASH}</span></Td>
                <Td muted style={{ width: 230 }}><span className="gbar-subject" title={email.to}>{email.to || DASH}</span></Td>
                <Td><span className="gbar-subject" title={email.subject}>{email.subject || DASH}</span></Td>
                <Td align="right" mono muted style={{ width: 168, whiteSpace: 'nowrap' }}>{fmtDateTime(email.date)}</Td>
                <Td align="right" mono muted style={{ width: 80, whiteSpace: 'nowrap' }}>{email.size ? fmtBytes(email.size) : DASH}</Td>
                <Td align="center" style={{ width: 54 }}>
                  {email.href ? (
                    <IconBtn size="xs" ghost icon={<I.download />} title="Open email file" onClick={() => openEmail(email.href)} />
                  ) : DASH}
                </Td>
              </tr>
            ))}
            {!rows.length && <EmptyTableRow colSpan={6}>No email in this scope.</EmptyTableRow>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function taskTone(status) {
  if (/complete/i.test(status || '')) return 'success';
  if (/waiting|pending/i.test(status || '')) return 'warning';
  return 'info';
}

function TaskSection({
  rows,
  rowStatus,
  onEdit,
  onComplete,
  actionsEnabled,
}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState('all');
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(1);
  const scrollRef = useRef(null);

  const statusCounts = useMemo(() => {
    const counts = new Map();
    rows.forEach((task) => {
      const label = task.status || 'Unknown';
      counts.set(label, (counts.get(label) || 0) + 1);
    });
    return counts;
  }, [rows]);
  const statusOptions = useMemo(() => [
    { id: 'all', label: `All statuses · ${NUMBER.format(rows.length)}` },
    ...Array.from(statusCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ id: label.toLowerCase(), label: `${label} · ${NUMBER.format(count)}` })),
  ], [rows.length, statusCounts]);
  const filtered = useMemo(
    () => filterActionReviewTasks(rows, { query: deferredQuery, status }),
    [rows, deferredQuery, status],
  );
  const pagination = useMemo(
    () => paginateActionReviewRows(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => { setPage(1); }, [deferredQuery, status, pageSize]);
  useEffect(() => {
    if (page !== pagination.page) setPage(pagination.page);
  }, [page, pagination.page]);

  const goPage = (next) => {
    setPage(next);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  return (
    <Card>
      <SectionTitle
        icon={<I.task />}
        title="Tasks"
        count={filtered.length === rows.length
          ? NUMBER.format(rows.length)
          : `${NUMBER.format(filtered.length)} of ${NUMBER.format(rows.length)}`}
        sub="The CRM can return tens of thousands of rows; this table pages them without shrinking the workspace"
      />

      <div className="gbar-task-tools">
        <div className="gbar-search">
          <I.search size={12} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subject, category, status, or date…"
            aria-label="Search tasks"
          />
          {query && <IconBtn size="xs" ghost icon={<I.close />} title="Clear task search" onClick={() => setQuery('')} />}
        </div>
        <Dropdown value={status} options={statusOptions} onChange={setStatus} size="sm" />
        <Dropdown
          value={String(pageSize)}
          options={PAGE_SIZES.map((size) => ({ id: String(size), label: `${size} rows` }))}
          onChange={(value) => setPageSize(Number(value))}
          size="sm"
        />
      </div>

      <div ref={scrollRef} className="gbar-table-scroll gbar-table-scroll--tasks">
        <table style={tableStyle} className="gbar-table gbar-table--tasks">
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th style={{ width: 190 }}>Category</Th>
              <Th align="center" style={{ width: 105 }}>Status</Th>
              <Th align="right" style={{ width: 118 }}>Live</Th>
              <Th align="right" style={{ width: 118 }}>Due</Th>
              <Th align="center" style={{ width: 82 }}>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((task) => {
              const pending = rowStatus[task.id];
              const complete = /complete/i.test(task.status || '');
              return (
                <tr key={task.id} className="gb-actrow" style={trStyle}>
                  <Td><span className="gbar-subject" title={task.subject}>{txt(task.subject) || DASH}</span></Td>
                  <Td muted style={{ width: 190 }}><span className="gbar-subject" title={task.category}>{txt(task.category) || DASH}</span></Td>
                  <Td align="center" style={{ width: 105 }}><Tag tone={taskTone(task.status)} size="sm">{task.status || DASH}</Tag></Td>
                  <Td align="right" mono muted style={{ width: 118, whiteSpace: 'nowrap' }}>{txt(task.live) || DASH}</Td>
                  <Td align="right" mono muted style={{ width: 118, whiteSpace: 'nowrap' }}>{txt(task.due) || DASH}</Td>
                  <Td align="center" style={{ width: 82, whiteSpace: 'nowrap' }}>
                    {pending === 'running' ? (
                      <span style={{ width: 13, height: 13, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                    ) : pending === 'done' ? (
                      <span style={{ color: 'var(--gb-success)', display: 'inline-flex' }}><I.check size={14} sw={3} /></span>
                    ) : pending === 'error' ? (
                      <span style={{ color: 'var(--gb-error)', display: 'inline-flex' }} title="Task update failed"><I.close size={13} sw={2.6} /></span>
                    ) : actionsEnabled ? (
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <IconBtn size="xs" ghost icon={<I.edit />} title="Edit task" onClick={() => onEdit(task)} />
                        {!complete && <IconBtn size="xs" ghost icon={<I.check />} title="Complete task" onClick={() => onComplete(task)} />}
                      </span>
                    ) : <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>}
                  </Td>
                </tr>
              );
            })}
            {!pagination.rows.length && <EmptyTableRow colSpan={6}>No tasks match these table filters.</EmptyTableRow>}
          </tbody>
        </table>
      </div>

      <div className="gbar-task-footer">
        <span className="gbar-task-range">
          Showing {NUMBER.format(pagination.start)}–{NUMBER.format(pagination.end)} of {NUMBER.format(pagination.total)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Btn
            variant="secondary"
            size="sm"
            icon={<I.chevr style={{ transform: 'rotate(180deg)' }} />}
            disabled={pagination.page <= 1}
            onClick={() => goPage(pagination.page - 1)}
          >
            Previous
          </Btn>
          <span style={{ minWidth: 84, textAlign: 'center', color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', fontSize: 10.5 }}>
            {pagination.page} / {pagination.pageCount}
          </span>
          <Btn
            variant="secondary"
            size="sm"
            iconRight={<I.chevr />}
            disabled={pagination.page >= pagination.pageCount}
            onClick={() => goPage(pagination.page + 1)}
          >
            Next
          </Btn>
        </div>
      </div>
    </Card>
  );
}

export function ActionReviewApp({
  store,
  initialReview = null,
  reviewClient = null,
  actionsEnabled = true,
}) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();
  const preparedInitial = useMemo(() => normalizeReview(initialReview), [initialReview]);
  const [review, setReview] = useState(preparedInitial);
  const [loading, setLoading] = useState(!preparedInitial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rowStatus, setRowStatus] = useState({});
  const [rep, setRep] = useState(preparedInitial?.selected.rep || '');
  const [dateOption, setDateOption] = useState(preparedInitial?.selected.dateOption || 'ON');
  const [date1, setDate1] = useState(preparedInitial?.selected.date1 || todayIso());
  const [date2, setDate2] = useState(preparedInitial?.selected.date2 || todayIso());
  const requestId = useRef(0);

  const acceptReview = (nextReview) => {
    const next = normalizeReview(nextReview);
    if (!next) throw new Error('Action Review returned no usable data.');
    setReview(next);
    setRep(next.selected.rep || next.reps[0]?.id || '');
    setDateOption(next.selected.dateOption || 'ON');
    setDate1(next.selected.date1 || todayIso());
    setDate2(next.selected.date2 || todayIso());
    return next;
  };

  const loadInitial = async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const next = preparedInitial || await waitForLiveActionReview();
      if (id === requestId.current) acceptReview(next);
    } catch (loadError) {
      if (id === requestId.current) setError(loadError?.message || 'Could not load Action Review.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
    return () => { requestId.current += 1; };
  }, [preparedInitial, reviewClient]);

  const applyFilter = async () => {
    if (busy || !review) return;
    if (!rep || !date1 || (dateOption === 'BETWEEN' && !date2)) {
      setError('Choose a sales rep and the complete date scope before applying.');
      return;
    }
    setBusy(true);
    setError('');
    const filters = { rep, dateOption, date1, date2 };

    if (!reviewClient) {
      try {
        submitNativeActionReview(filters);
      } catch (filterError) {
        setError(filterError?.message || 'The native Action Review form could not be submitted.');
        setBusy(false);
      }
      return;
    }

    try {
      acceptReview(await reviewClient({
        type: 'filter',
        review,
        filters,
      }));
    } catch (filterError) {
      setError(filterError?.message || 'The CRM could not apply this Action Review scope.');
    } finally {
      setBusy(false);
    }
  };

  const openActivity = (activity) => {
    if (activity?.id) modalHost.openModal(<ActivityDetailModal activityId={activity.id} />);
  };
  const editTask = (task) => {
    if (actionsEnabled && task?.id) modalHost.openModal(<EditTaskModal taskId={task.id} />);
  };
  const completeTask = async (task) => {
    if (!actionsEnabled || !task?.id || /complete/i.test(task.status || '')) return;
    setRowStatus((current) => ({ ...current, [task.id]: 'running' }));
    try {
      await completeTaskById(task.id);
      setReview((current) => current ? {
        ...current,
        tasks: current.tasks.map((row) => row.id === task.id ? { ...row, status: 'Complete' } : row),
      } : current);
      setRowStatus((current) => ({ ...current, [task.id]: 'done' }));
      setTimeout(() => {
        setRowStatus((current) => {
          const next = { ...current };
          delete next[task.id];
          return next;
        });
      }, 700);
    } catch (taskError) {
      setRowStatus((current) => ({ ...current, [task.id]: 'error' }));
    }
  };

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Action Review"
        ready
        modalHost={modalHost}
        hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Action Review" /></TopBar>}
      >
        <style>{ACTION_REVIEW_CSS}</style>
        <div className="gbar-page">
          {error && (
            <div className="gbar-error">
              <I.close size={13} />
              <span style={{ flex: 1 }}>{error}</span>
              {!review && <Btn variant="danger" size="xs" onClick={loadInitial}>Retry</Btn>}
            </div>
          )}

          {loading && !review ? (
            <Card><Spinner label="Loading the full Action Review…" /></Card>
          ) : review ? (
            <>
              <ScopeCard
                review={review}
                rep={rep}
                setRep={setRep}
                dateOption={dateOption}
                setDateOption={setDateOption}
                date1={date1}
                setDate1={setDate1}
                date2={date2}
                setDate2={setDate2}
                busy={busy}
                onApply={applyFilter}
              />
              <ActivitySection rows={review.activities} onOpen={openActivity} />
              <EmailSection rows={review.emails} />
              <TaskSection
                rows={review.tasks}
                rowStatus={rowStatus}
                onEdit={editTask}
                onComplete={completeTask}
                actionsEnabled={actionsEnabled}
              />
            </>
          ) : null}
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* Register with the custom-pages engine (Page 286 → action_review). */
if (!window.__gbActionReviewPageRegistered) {
  window.__gbActionReviewPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.action_review = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="Action Review page">
            <ActionReviewApp store={ctx.store} />
          </DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (error) {} };
    },
  };
}
