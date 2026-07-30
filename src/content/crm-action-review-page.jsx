/* eslint-disable */
/**
 * Action Review custom page (CRM Page 286).
 *
 * The native WebForms page returns three datasets from one server-side search:
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
  actionReviewEmailTarget,
  actionReviewDocumentSignature,
  buildActionReviewRequest,
  filterActionReviewTasks,
  isActionReviewDocument,
  isActionReviewSnapshotSettled,
  paginateActionReviewRows,
  parseActionReviewDocument,
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
  EmailHistoryTable,
  EmptyRow,
  I,
  IconBtn,
  ScrollArea,
  SectionTitle,
  Spinner,
  Tag,
  TaskCheckbox,
  Td,
  Th,
  tableStyle,
  trStyle,
  txt,
} from '../lib/detail-shared.jsx';
import {
  ActivityRow,
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
  .gbar-review-search-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px 10px;
    border-bottom: 1px solid var(--gb-border-subtle);
  }
  .gbar-review-search-icon {
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
    grid-template-columns: minmax(230px, 1.4fr) minmax(125px, .65fr) minmax(165px, .8fr) auto;
    gap: 10px;
    align-items: end;
    padding: 12px 14px 14px;
  }
  .gbar-filter-grid--between {
    grid-template-columns: minmax(230px, 1.4fr) minmax(125px, .65fr) minmax(165px, .8fr) minmax(165px, .8fr) auto;
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
    .gbar-filter-grid--between {
      grid-template-columns: minmax(210px, 1fr) minmax(120px, .55fr) minmax(155px, .7fr) minmax(155px, .7fr) auto;
    }
    .gbar-stat-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .gbar-stat:nth-child(3) { border-left: 0; border-top: 1px solid var(--gb-border-subtle); }
    .gbar-stat:nth-child(4) { border-top: 1px solid var(--gb-border-subtle); }
  }
  @media (max-width: 760px) {
    .gbar-review-search-head { align-items: flex-start; }
    .gbar-filter-grid,
    .gbar-filter-grid--between { grid-template-columns: minmax(0, 1fr); }
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
  const activities = Array.isArray(review.activities) ? review.activities : [];
  const emails = Array.isArray(review.emails) ? review.emails : [];
  const tasks = Array.isArray(review.tasks) ? review.tasks : [];
  const explicitTables = review.resultTables && typeof review.resultTables === 'object'
    ? review.resultTables
    : null;
  const searched = typeof review.searched === 'boolean'
    ? review.searched
    : !!(activities.length || emails.length || tasks.length);
  return {
    ...review,
    activities,
    emails,
    tasks,
    searched,
    resultTables: {
      activities: explicitTables ? explicitTables.activities === true : activities.length > 0,
      emails: explicitTables ? explicitTables.emails === true : emails.length > 0,
      tasks: explicitTables ? explicitTables.tasks === true : tasks.length > 0,
    },
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
      reject(new Error('The native Action Review filters did not become available.'));
    };
    poll();
  });
}

async function requestActionReview({ review, filters }) {
  const request = buildActionReviewRequest(review, filters, window.location.href);
  const response = await fetch(request.url, request.init);
  if (!response.ok) {
    throw new Error(`Action Review returned HTTP ${response.status}.`);
  }
  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!isActionReviewDocument(doc)) {
    throw new Error('The CRM returned a sign-in or incomplete page instead of Action Review.');
  }
  return {
    ...normalizeReview(parseActionReviewDocument(doc)),
    // A successful POST is still a completed search when the CRM omits every
    // conditional result table because the result set is empty.
    searched: true,
  };
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

function SearchCard({
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
  onSearch,
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
      <div className="gbar-review-search-head">
        <span className="gbar-review-search-icon"><I.search size={14} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontSize: 13, fontWeight: 650 }}>
            Search
          </div>
          <div style={{ marginTop: 2, overflow: 'hidden', color: 'var(--gb-text-muted)', fontSize: 10.5, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedRep?.label || 'Choose a sales rep'} · {range}
          </div>
        </div>
        <Tag tone={busy ? 'warning' : review?.searched ? 'success' : 'info'} size="sm">
          {busy ? 'Searching' : review?.searched ? 'Loaded' : 'Ready'}
        </Tag>
      </div>

      <div className={`gbar-filter-grid ${dateOption === 'BETWEEN' ? 'gbar-filter-grid--between' : ''}`}>
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
        ) : null}
        <Btn
          variant="primary"
          size="md"
          icon={<I.search />}
          onClick={onSearch}
          disabled={busy || invalid || !(review?.reps.length)}
          style={{ minWidth: 108 }}
        >
          {busy ? 'Searching…' : 'Search'}
        </Btn>
      </div>

      {busy && <div className="gbar-loading-line" />}

      {review?.searched && (
        <div className="gbar-stat-strip">
          <Stat icon={<I.history />} label="Activity" value={review?.activities.length} />
          <Stat icon={<I.mail />} label="Email" value={review?.emails.length} />
          <Stat icon={<I.task />} label="Open tasks" value={openTasks} />
          <Stat icon={<I.check />} label="All tasks" value={review?.tasks.length} />
        </div>
      )}
    </Card>
  );
}

function PreSearchState() {
  return (
    <Card>
      <div style={{ padding: '34px 24px', textAlign: 'center' }}>
        <span style={{
          width: 34,
          height: 34,
          margin: '0 auto 10px',
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gb-brand-label)',
          background: 'var(--gb-brand-tint-soft)',
          border: '1px solid var(--gb-brand-tint-border)',
        }}>
          <I.search size={15} />
        </span>
        <div style={{ color: 'var(--gb-text-primary)', fontSize: 12.5, fontWeight: 650 }}>
          Choose a sales rep and run Search
        </div>
        <div style={{ marginTop: 4, color: 'var(--gb-text-muted)', fontSize: 11 }}>
          The CRM creates the Action Review tables only after the search is submitted.
        </div>
      </div>
    </Card>
  );
}

function ActivitySection({ rows }) {
  return (
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 2 }}>
      <SectionTitle
        icon={<I.history />}
        title="Activity Feed"
        count={NUMBER.format(rows.length)}
        sub="System, workflow, and human-logged events"
      />
      <div className="gbcp-list-head" aria-hidden="true">
        <span>Type</span><span>Activity</span><span>Owner</span><span style={{ textAlign: 'right' }}>Date</span>
      </div>
      <ScrollArea max={460}>
        {rows.map((activity, index) => (
          <ActivityRow
            key={activity.id || `${activity.date}-${index}`}
            a={activity}
            last={index === rows.length - 1}
          />
        ))}
        {!rows.length && (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: 'var(--gb-text-muted)' }}>
            No activity returned by this search.
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}

function EmailSection({ rows }) {
  const viewEmail = (email) => {
    const target = actionReviewEmailTarget(email, window.location.href);
    if (target && typeof window.__gbOpenEmailPreview === 'function') {
      window.__gbOpenEmailPreview({
        messageId: target.messageId,
        messageGuid: target.messageGuid,
        meta: target.meta,
      });
      return;
    }
    if (target) window.open(target.href, '_blank', 'noopener,noreferrer');
  };
  const downloadEmail = (email) => {
    const target = actionReviewEmailTarget(email, window.location.href);
    if (target) window.open(target.href, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <SectionTitle
        icon={<I.mail />}
        title="Email History"
        count={NUMBER.format(rows.length)}
        sub="Messages returned for the selected rep and date"
      />
      <EmailHistoryTable
        rows={rows}
        onOpen={viewEmail}
        onDownload={downloadEmail}
        emptyLabel="No email returned by this search."
      />
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
    const scroller = scrollRef.current?.closest?.('.gb-scroll') || scrollRef.current;
    if (scroller) scroller.scrollTop = 0;
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

      <ScrollArea max={520}>
        <div ref={scrollRef}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Task</Th>
              <Th style={{ width: 190 }}>Category</Th>
              <Th align="center" style={{ width: 105 }}>Status</Th>
              <Th align="right" style={{ width: 118 }}>Live</Th>
              <Th align="right" style={{ width: 118 }}>Due</Th>
              <Th align="right" style={{ width: 54 }}></Th>
            </tr>
          </thead>
          <tbody>
            {pagination.rows.map((task) => {
              const pending = rowStatus[task.id];
              const complete = /complete/i.test(task.status || '');
              return (
                <tr key={task.id} style={trStyle}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {pending === 'running' ? (
                        <span style={{ width: 15, height: 15, display: 'inline-block', flexShrink: 0, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                      ) : pending === 'error' ? (
                        <span style={{ width: 15, height: 15, color: 'var(--gb-error-fg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} title="Task update failed"><I.close size={12} sw={2.6} /></span>
                      ) : (
                        <TaskCheckbox
                          tone="success"
                          done={complete || pending === 'done'}
                          disabled={complete || !actionsEnabled}
                          onClick={!complete && actionsEnabled ? () => onComplete(task) : undefined}
                          title={complete ? 'Task complete' : 'Complete task'}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          color: complete ? 'var(--gb-text-muted)' : 'var(--gb-detail-text-primary, var(--gb-text-primary))',
                          fontWeight: 500,
                          lineHeight: 1.3,
                          textDecoration: complete ? 'line-through' : 'none',
                        }}>{txt(task.subject) || DASH}</div>
                        {task.id && <div style={{ marginTop: 2, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', fontSize: 9.5 }}>#{task.id}</div>}
                      </div>
                    </div>
                  </Td>
                  <Td muted style={{ width: 190 }}>{txt(task.category) || DASH}</Td>
                  <Td align="center" style={{ width: 105 }}><Tag tone={taskTone(task.status)} size="xs">{task.status || DASH}</Tag></Td>
                  <Td align="right" mono muted style={{ width: 118, whiteSpace: 'nowrap' }}>{txt(task.live) || DASH}</Td>
                  <Td align="right" mono muted style={{ width: 118, whiteSpace: 'nowrap' }}>{txt(task.due) || DASH}</Td>
                  <Td align="right" style={{ width: 54, whiteSpace: 'nowrap' }}>
                    {actionsEnabled ? (
                      <IconBtn size="xs" ghost icon={<I.edit />} title="Edit task" onClick={() => onEdit(task)} />
                    ) : <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>}
                  </Td>
                </tr>
              );
            })}
            {!pagination.rows.length && <EmptyRow colSpan={6} label="No tasks match these table filters." />}
          </tbody>
        </table>
        </div>
      </ScrollArea>

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
  reviewClient = requestActionReview,
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
      setError('Choose a sales rep and the complete date range before searching.');
      return;
    }
    setBusy(true);
    setError('');
    const filters = { rep, dateOption, date1, date2 };

    try {
      acceptReview(await reviewClient({
        type: 'filter',
        review,
        filters,
      }));
    } catch (filterError) {
      setError(filterError?.message || 'The CRM could not run this Action Review search.');
    } finally {
      setBusy(false);
    }
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
              <SearchCard
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
                onSearch={applyFilter}
              />
              {!review.searched ? <PreSearchState /> : (
                <>
                  {review.resultTables.activities && <ActivitySection rows={review.activities} />}
                  {review.resultTables.emails && <EmailSection rows={review.emails} />}
                  {review.resultTables.tasks && (
                    <TaskSection
                      rows={review.tasks}
                      rowStatus={rowStatus}
                      onEdit={editTask}
                      onComplete={completeTask}
                      actionsEnabled={actionsEnabled}
                    />
                  )}
                </>
              )}
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
