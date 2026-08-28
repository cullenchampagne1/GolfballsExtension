/* eslint-disable */
/**
 * Replacement Contacts modal.
 *
 * The queue is the CRM's own automated bounce tasks ("Investigate bounced
 * contact" / "Replacement contact needed"), lifted out of the Task List modal
 * and page so they stop crowding rep work and get the one view that actually
 * fits them: triaged by what the bounced ADDRESS is, because that decides
 * whether a replacement can be found at all. What a record is and what the
 * queue says lives in src/lib/replacementContacts.js, where it is testable.
 *
 * Two things are worth knowing about the data:
 *   • Tasks come from the Task List's already-loaded Page=349 snapshot, so this
 *     modal never downloads and parses that large CRM page a second time.
 *   • The bounced ADDRESS is not on the task row — it is on the contact. Rows
 *     hydrate progressively through Contact/Get, and a row says whether its
 *     address is still loading rather than pretending the contact has none.
 *
 * Closing a row (Replaced / No replacement / Archive) COMPLETES the underlying
 * CRM task — that is the point of this workspace. Every other status is the rep's
 * own working note and lives in chrome.storage.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { selectReplacementTasks } from '../lib/taskListModel.js';
import { completeTaskById } from '../lib/crmTasks.js';
import {
  DOMAIN_META, RC_SETTABLE, RC_STATE_KEY, RC_STATUSES,
  buildReplacementRecords, closeReplacementTasks, closingSummary, contactIdFromUrl,
  filterReplacementRecords, isClosingStatus, kindLabel, normalizeReplacementStates,
  pruneReplacementStates, replacementKpis, sortReplacementRecords,
} from '../lib/replacementContacts.js';
import {
  Btn, Card, Dropdown, FloatingPanel, I, IconBtn, ModalFooter, ModalHeader, Tag,
} from '../ui/index.js';
import { crmGetContact, gbToast } from '../lib/crmContactApi.js';

const LINK_STYLE = { color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' };

/* How many contact lookups are in flight at once. The CRM is a shared admin
   box; four keeps a 300-row queue resolving in seconds without hammering it. */
const HYDRATE_CONCURRENCY = 4;

/* Contact/Get is the only place the bounced address exists. Keep successful
   summaries for the lifetime of the CRM tab so closing/reopening this modal
   does not issue the same contact requests again. Concurrent opens also share
   one in-flight promise per contact. */
const contactSummaryCache = new Map();
const contactSummaryRequests = new Map();

function loadContactSummary(contactId) {
  if (contactSummaryCache.has(contactId)) return Promise.resolve(contactSummaryCache.get(contactId));
  if (contactSummaryRequests.has(contactId)) return contactSummaryRequests.get(contactId);
  const request = crmGetContact(contactId)
    .then((contact) => ({
      email: String(contact?.email || '').trim(),
      jobTitle: String(contact?.jobTitle || '').trim(),
    }))
    .then((summary) => {
      contactSummaryCache.set(contactId, summary);
      return summary;
    })
    .finally(() => contactSummaryRequests.delete(contactId));
  contactSummaryRequests.set(contactId, request);
  return request;
}

const DASH = '—';
const txt = (value) => (value === null || value === undefined || value === '' ? null : String(value));
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 11.5 };
const trStyle = { borderBottom: '1px solid var(--gb-border-subtle)' };

function SectionTitle({ icon, title, count, right, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--gb-surface-2)', borderBottom: '1px solid var(--gb-border-default)' }}>
      {icon && <span style={{ width: 16, height: 20, color: 'var(--gb-text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{React.cloneElement(icon, { size: 12 })}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{title}</span>
          {count != null && <span style={{ fontSize: 10.5, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-muted)' }}>{count}</span>}
        </div>
        {sub && <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function StatCardGrid({ cells }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8 }}>
      {cells.map((cell) => (
        <Card key={cell.label} padding="10px 12px">
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: .75, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>{cell.label}</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 3, color: cell.tone === 'success' ? 'var(--gb-success-fg)' : cell.tone === 'error' ? 'var(--gb-error-fg)' : cell.tone === 'warning' ? 'var(--gb-warning-fg)' : 'var(--gb-text-primary)', fontFamily: cell.mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', letterSpacing: -.5, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.value}</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 2 }}>{cell.sub}</div>
        </Card>
      ))}
    </div>
  );
}

function QueueSpinner({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '90px 0', color: 'var(--gb-text-muted)' }}>
      <span style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid var(--gb-border-strong)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function TaskCheckbox({ done, onClick, disabled, title }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || !onClick} title={title} style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, padding: 0, border: `1.5px solid ${done ? 'var(--gb-brand-label)' : 'var(--gb-border-strong)'}`, background: done ? 'var(--gb-brand-tint-medium)' : 'transparent', color: 'var(--gb-brand-label)', cursor: onClick && !disabled ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {done && <I.check size={9} sw={3} />}
    </button>
  );
}

function Th({ children, align = 'left', style }) {
  return <th style={{ padding: '6px 12px', textAlign: align, fontSize: 9, fontWeight: 600, letterSpacing: .65, textTransform: 'uppercase', color: 'var(--gb-text-muted)', borderBottom: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-2)', position: 'sticky', top: 0, zIndex: 3, whiteSpace: 'nowrap', ...style }}>{children}</th>;
}

function Td({ children, align = 'left', style }) {
  return <td style={{ padding: '8px 12px', textAlign: align, verticalAlign: 'middle', fontFamily: 'var(--gb-font-sans)', fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 400, ...style }}>{children}</td>;
}

/* ── local annotations ────────────────────────────────────────────
   Only the closing statuses exist in the CRM (as a completed task). Everything
   between "needs review" and "done" is the rep's own note, so it lives here. */
function loadStates() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(RC_STATE_KEY, (d) => resolve(normalizeReplacementStates(d?.[RC_STATE_KEY])));
    } catch { resolve({}); }
  });
}
function saveStates(states) {
  try { chrome.storage.local.set({ [RC_STATE_KEY]: states }); } catch { /* not in an extension context */ }
}

/* ── bits ─────────────────────────────────────────────────────── */
const Mono = ({ children, size = 11, color = 'var(--gb-text-muted)', style }) => (
  <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: size, color, ...style }}>{children}</span>
);

/* The bounced address, struck through — a rep reads this column to decide
   whether the row is workable, so its state has to be legible at a glance. */
function BouncedEmail({ rec }) {
  if (rec.emailState === 'pending') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--gb-text-ghost)', fontSize: 11 }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--gb-border-default)',
          borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite',
        }} />
        resolving…
      </span>
    );
  }
  if (rec.emailState === 'error') return <Mono color="var(--gb-error-fg)">lookup failed</Mono>;
  if (!rec.email) return <Mono color="var(--gb-text-ghost)">no address on contact</Mono>;
  return (
    <Mono color="var(--gb-text-secondary)" style={{
      textDecoration: 'line-through', textDecorationColor: 'var(--gb-error)',
      wordBreak: 'break-all',
    }}>{rec.email}</Mono>
  );
}

function StatusTag({ status, size = 'sm' }) {
  const meta = RC_STATUSES[status] || RC_STATUSES.pending;
  return <Tag tone={meta.tone} size={size}>{meta.label}</Tag>;
}

/* Per-row action feedback, mirroring the Task List page: spinner while the CRM
   write is in flight, ✓ when it lands, × when it doesn't. */
function RowStatus({ st }) {
  if (!st) return null;
  if (st.phase === 'running') {
    return <span title={st.label || 'Working…'} style={{ width: 14, height: 14, display: 'inline-block', borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite', verticalAlign: 'middle' }} />;
  }
  if (st.phase === 'done') return <span title={st.label || 'Done'} style={{ color: 'var(--gb-success)', display: 'inline-flex', verticalAlign: 'middle' }}><I.check size={15} sw={3} /></span>;
  if (st.phase === 'error') return <span title={st.detail || 'Failed'} style={{ color: 'var(--gb-error)', display: 'inline-flex', verticalAlign: 'middle' }}><I.close size={14} sw={2.6} /></span>;
  return null;
}

/* ── the auto-linkage panel ───────────────────────────────────────
   The lookup service that would search a company domain for a replacement does
   not exist yet. This renders the shape it will take — and stays useful in the
   meantime: the rep can run the search themselves and type back what they
   found, which is what "mark replaced" then records. It is labelled as not
   connected so nobody mistakes an empty list for "no candidates exist". */
function AutoLinkPanel({ rec, onUse }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const label = { fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' };
  const canUse = name.trim() && email.trim().includes('@');
  const searchUrl = rec.domain
    ? `https://www.google.com/search?q=${encodeURIComponent(`"${rec.domain}" ${rec.account} contact email`)}`
    : '';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={label}>Replacement candidates</span>
        <div style={{ flex: 1, height: 1, background: 'var(--gb-border-subtle)' }} />
        <Tag size="sm" tone="neutral">Not connected</Tag>
      </div>

      {rec.searchable ? (
        <div style={{
          background: 'var(--gb-fill-faint)', border: '1px dashed var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', padding: '12px 12px', display: 'grid', gap: 10,
        }}>
          <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', lineHeight: 1.55 }}>
            Automatic lookup against <Mono size={11} color="var(--gb-text-secondary)">{rec.domain}</Mono> isn’t wired up yet —
            no candidates are being fetched. Run the search yourself and record who you found.
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <Btn size="sm" variant="secondary" icon={<I.ext />} disabled={!searchUrl}
              onClick={() => { try { window.open(searchUrl, '_blank', 'noopener'); } catch {} }}>
              Search {rec.domain || 'the domain'}
            </Btn>
            {rec.accountUrl && (
              <Btn size="sm" variant="ghost" icon={<I.briefcase />}
                onClick={() => { try { window.open(rec.accountUrl, '_blank', 'noopener'); } catch {} }}>
                Open account
              </Btn>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 7, alignItems: 'center' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Replacement name"
              style={{ height: 30, padding: '0 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-inverse-medium)', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12, outline: 0, minWidth: 0 }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com"
              style={{ height: 30, padding: '0 9px', borderRadius: 'var(--gb-r-sm)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-inverse-medium)', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-mono)', fontSize: 11.5, outline: 0, minWidth: 0 }} />
            <Btn size="sm" variant="primary" icon={<I.check />} disabled={!canUse}
              onClick={() => onUse({ name: name.trim(), email: email.trim(), source: 'Manual' })}>
              Use
            </Btn>
          </div>
        </div>
      ) : (
        <div style={{
          background: 'var(--gb-fill-faint)', border: '1px dashed var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', padding: '14px 12px', fontSize: 11.5,
          color: 'var(--gb-text-muted)', lineHeight: 1.55,
        }}>
          {DOMAIN_META[rec.dtype]?.hint || 'No company domain to search.'}
          {' '}Check the account for another contact, or close this row as no replacement.
        </div>
      )}
    </div>
  );
}

/* ── analyze modal ────────────────────────────────────────────── */
function AnalyzeModal({ rec, onStatus, onUseReplacement, onClosed }) {
  const closeRef = useRef(null);
  const close = useCallback(() => closeRef.current?.(), []);
  const bindClose = useCallback((requestClose) => { closeRef.current = requestClose; }, []);
  const meta = DOMAIN_META[rec.dtype] || DOMAIN_META.unknown;
  const label = { fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' };
  const facts = [
    ['Account', rec.account || DASH],
    ['Task', `${kindLabel(rec.kind)} · due ${rec.due || DASH}`],
    ['Title', rec.title || DASH],
  ];
  return (
    <FloatingPanel
      width={620}
      maxHeight={680}
      backdrop={false}
      draggable
      onClose={onClosed}
      bindClose={bindClose}
      cardClassName="gb-replacement-contact-review-modal"
    >
      <ModalHeader
        title="Bounced contact"
        icon={<I.mail />}
        subtitle={`${rec.contact || 'Unknown contact'} · ${rec.account || 'no account'}`}
      />
      <div className="gb-scroll" style={{ padding: 18, overflowY: 'auto', display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '12px 14px' }}>
            <div style={label}>Bounced address</div>
            <div style={{ marginTop: 5 }}><BouncedEmail rec={rec} /></div>
            <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tag size="sm" tone="error" icon={<I.mail />}>{kindLabel(rec.kind)}</Tag>
              <Mono size={9.5} color="var(--gb-text-ghost)">task #{rec.taskId}</Mono>
            </div>
          </div>
          <div style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '12px 14px' }}>
            <div style={label}>Domain</div>
            <div style={{ marginTop: 5 }}>
              <Mono size={12} color="var(--gb-text-primary)">{rec.domain || DASH}</Mono>
            </div>
            <div style={{ marginTop: 8 }}><Tag size="sm" tone={meta.tone}>{meta.label}</Tag></div>
            <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', marginTop: 6, lineHeight: 1.45 }}>{meta.hint}</div>
          </div>
        </div>

        {rec.replacement && (
          <div style={{ background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)', borderRadius: 'var(--gb-r-md)', padding: '10px 12px' }}>
            <div style={{ ...label, color: 'var(--gb-brand-label)' }}>Recorded replacement</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gb-text-primary)', marginTop: 4 }}>{rec.replacement.name}</div>
            <Mono size={11}>{rec.replacement.email}</Mono>
          </div>
        )}

        <AutoLinkPanel rec={rec} onUse={(replacement) => { onUseReplacement(rec.id, replacement); close(); }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {facts.map(([l, v]) => (
            <div key={l} style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '8px 10px' }}>
              <div style={{ ...label, fontSize: 9 }}>{l}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      <ModalFooter style={{ padding: '12px 16px' }}>
        <Dropdown
          size="sm"
          value={rec.status}
          style={{ width: 162 }}
          options={RC_SETTABLE.map((key) => ({ id: key, label: RC_STATUSES[key].label }))}
          onChange={(next) => { onStatus([rec.id], next); if (isClosingStatus(next)) close(); }}
        />
        <div style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={close}>Close</Btn>
        {rec.contactUrl && (
          <Btn size="sm" variant="secondary" icon={<I.ext />}
            onClick={() => { try { window.open(rec.contactUrl, '_blank', 'noopener'); } catch {} }}>
            Open contact
          </Btn>
        )}
      </ModalFooter>
    </FloatingPanel>
  );
}

/* ── row ──────────────────────────────────────────────────────── */
function ContactRow({ rec, index, selected, active, onToggle, onOpen, onStatus, status, busy }) {
  const stop = (e) => e.stopPropagation();
  const meta = DOMAIN_META[rec.dtype] || DOMAIN_META.unknown;
  const overdue = rec.dueBucket === 'overdue';
  const rowStyle = {
    ...trStyle,
    cursor: 'pointer',
    ...(overdue ? { boxShadow: 'inset 3px 0 0 var(--gb-error)' } : null),
    ...(selected ? { background: 'var(--gb-brand-tint-soft)', boxShadow: 'inset 3px 0 0 var(--gb-brand-label)' } : null),
    ...(active ? {
      background: 'var(--gb-brand-tint-medium)',
      boxShadow: 'inset 3px 0 0 var(--gb-brand-label), inset 0 0 0 1px var(--gb-brand-tint-border)',
    } : null),
    ...(isClosingStatus(rec.status) ? { opacity: .55 } : null),
    transition: 'background-color var(--gb-anim), box-shadow var(--gb-anim), opacity var(--gb-anim)',
  };
  return (
    <tr className="gb-actrow" style={rowStyle} aria-current={active ? 'true' : undefined} onClick={() => onOpen(rec.id)}>
      <Td align="center" style={{ width: 38, padding: '8px 8px' }}>
        <span onClick={stop} style={{ display: 'inline-flex' }}>
          <TaskCheckbox done={selected} onClick={(e) => { e?.stopPropagation?.(); onToggle(index, !!e?.shiftKey); }}
            title={selected ? 'Deselect' : 'Select (shift-click for a range)'} />
        </span>
      </Td>
      <Td>
        <div style={{ fontWeight: 600, color: 'var(--gb-text-primary)' }}>
          {rec.contactUrl
            ? <a href={rec.contactUrl} onClick={stop} style={LINK_STYLE}>{txt(rec.contact) || DASH}</a>
            : (txt(rec.contact) || DASH)}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {rec.accountUrl
            ? <a href={rec.accountUrl} onClick={stop} style={{ ...LINK_STYLE, fontWeight: 500, color: 'var(--gb-text-muted)' }}>{txt(rec.account) || DASH}</a>
            : (txt(rec.account) || DASH)}
        </div>
      </Td>
      <Td style={{ maxWidth: 260 }}>
        <BouncedEmail rec={rec} />
        {rec.title ? <div style={{ fontSize: 9.5, color: 'var(--gb-text-ghost)' }}>{rec.title}</div> : null}
      </Td>
      <Td><Tag tone={meta.tone} size="sm">{meta.label}</Tag></Td>
      <Td title={overdue ? `Overdue · due ${rec.due || DASH}` : `Due ${rec.due || DASH}`}>
        <Tag tone={rec.kind === 'replacement' ? 'warning' : 'neutral'} size="sm">{kindLabel(rec.kind)}</Tag>
      </Td>
      <Td><StatusTag status={rec.status} /></Td>
      <Td align="center" style={{ width: 96, whiteSpace: 'nowrap' }}>
        {status ? <RowStatus st={status} /> : (
          <span onClick={stop} style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
            <IconBtn size="xs" ghost icon={<I.search />} title={active ? 'Currently open' : 'Review this bounce'} active={active} onClick={() => onOpen(rec.id)} />
            <IconBtn size="xs" ghost icon={<I.check />} title="Mark replaced (completes the task)" disabled={busy} onClick={() => onStatus([rec.id], 'complete')} />
            <IconBtn size="xs" ghost icon={<I.arch />} title="Archive (completes the task)" disabled={busy} onClick={() => onStatus([rec.id], 'archived')} />
          </span>
        )}
      </Td>
    </tr>
  );
}

/* ── app ──────────────────────────────────────────────────────── */
export function ReplacementContacts({
  onClosed,
  draggable = false,
  taskSnapshot = [],
  taskStatus = 'ready',
  onRefresh,
}) {
  const [hydrated, setHydrated] = useState({});      // contactId → { email, jobTitle } | { error }
  const [hydrating, setHydrating] = useState(0);     // contacts still to resolve
  const [states, setStates] = useState({});          // taskId → { status, replacement… }
  const [statesLoaded, setStatesLoaded] = useState(false);
  const [rowStatus, setRowStatus] = useState({});    // taskId → { phase, label, detail }
  const [busy, setBusy] = useState(false);

  const [sort, setSort] = useState('queue');
  const [selected, setSelected] = useState(new Set());
  const [reviewId, setReviewId] = useState(null);

  const anchorRef = useRef(null);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  /* Task List already paid for the large Page=349 request. Reuse that complete
     snapshot and only select the bounce rows here; Refresh delegates to the
     parent so both workspaces stay on one source of truth. */
  const tasks = useMemo(() => selectReplacementTasks(taskSnapshot), [taskSnapshot]);
  const loadState = taskStatus === 'error'
    ? 'error'
    : (taskStatus === 'loading' && !taskSnapshot.length ? 'loading' : 'ready');

  useEffect(() => { loadStates().then((s) => { setStates(s); setStatesLoaded(true); }); }, []);

  /* Annotations for tasks that have left the CRM are pruned once both halves
     have landed — pruning against a not-yet-loaded bag would be a no-op, and
     pruning before the queue arrives would drop every annotation. */
  useEffect(() => {
    if (!statesLoaded || loadState !== 'ready') return;
    const live = tasks.map((t) => String(t.id));
    setStates((cur) => {
      const next = pruneReplacementStates(cur, live);
      if (Object.keys(next).length === Object.keys(cur).length) return cur;
      saveStates(next);
      return next;
    });
  }, [statesLoaded, loadState, tasks]);

  /* ── hydrate ───────────────────────────────────────────────────
     The bounced address lives on the contact, not the task row. Resolve them a
     few at a time in queue order; each landing updates its row in place. */
  useEffect(() => {
    const pending = [...new Set(
      tasks.map((t) => contactIdFromUrl(t.contactUrl)).filter((id) => id && !hydrated[id]),
    )];
    if (!pending.length) { setHydrating(0); return undefined; }
    let cancelled = false;
    let cursor = 0;
    setHydrating(pending.length);

    const worker = async () => {
      while (!cancelled) {
        const contactId = pending[cursor++];
        if (!contactId) return;
        let result;
        try {
          result = await loadContactSummary(contactId);
        } catch (e) {
          result = { error: e?.message || 'lookup failed' };
        }
        if (cancelled) return;
        setHydrated((cur) => ({ ...cur, [contactId]: result }));
        setHydrating((n) => Math.max(0, n - 1));
      }
    };
    for (let i = 0; i < HYDRATE_CONCURRENCY; i += 1) worker();
    return () => { cancelled = true; };
    // `hydrated` is deliberately not a dependency: it changes on every resolved
    // contact, and re-running the sweep per row would restart it constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  /* ── records ─────────────────────────────────────────────────── */
  const records = useMemo(
    () => buildReplacementRecords(tasks, { hydrated, states, today }),
    [tasks, hydrated, states, today],
  );
  const visible = useMemo(
    () => sortReplacementRecords(filterReplacementRecords(records, { status: 'open' }), sort),
    [records, sort],
  );
  const k = useMemo(() => replacementKpis(records), [records]);
  const selectedRecs = useMemo(() => visible.filter((rec) => selected.has(rec.id)), [visible, selected]);
  const reviewRecord = useMemo(() => records.find((rec) => rec.id === reviewId) || null, [records, reviewId]);

  /* ── selection ───────────────────────────────────────────────── */
  const toggleRow = (index, shiftKey) => setSelected((cur) => {
    const next = new Set(cur);
    if (shiftKey && anchorRef.current != null) {
      const [a, b] = index < anchorRef.current ? [index, anchorRef.current] : [anchorRef.current, index];
      for (let i = a; i <= b; i += 1) { const r = visible[i]; if (r) next.add(r.id); }
    } else {
      const id = visible[index]?.id;
      if (id) { next.has(id) ? next.delete(id) : next.add(id); }
      anchorRef.current = index;
    }
    return next;
  });
  const allSelected = visible.length > 0 && visible.every((rec) => selected.has(rec.id));
  const toggleAll = () => setSelected((cur) => {
    const next = new Set(cur);
    if (allSelected) visible.forEach((rec) => next.delete(rec.id));
    else visible.forEach((rec) => next.add(rec.id));
    return next;
  });

  /* ── status writes ─────────────────────────────────────────────
     A closing status completes the CRM task FIRST and only records itself if
     that write lands: a row that says "Replaced" while its bounce task is
     still open would send the rep back here tomorrow. */
  const persist = useCallback((patch) => {
    setStates((cur) => {
      const next = { ...cur };
      for (const [taskId, state] of Object.entries(patch)) {
        next[taskId] = { ...(next[taskId] || {}), ...state, updatedAt: Date.now() };
      }
      saveStates(next);
      return next;
    });
  }, []);

  const applyStatus = useCallback(async (ids, nextStatus, extra = {}) => {
    if (!ids.length) { gbToast('Select a row first', 'info'); return; }
    // A working note is local only — nothing to write, and the selection stays
    // put so the rep can keep acting on the same rows.
    if (!isClosingStatus(nextStatus)) {
      persist(Object.fromEntries(ids.map((id) => [id, { status: nextStatus, ...extra }])));
      return;
    }
    setBusy(true);
    // The row only takes the closing status if its CRM task actually
    // completed — closeReplacementTasks owns that rule (and is tested on it).
    const { done, failed } = await closeReplacementTasks(ids, {
      complete: completeTaskById,
      onRow: (id, patch) => setRowStatus((m) => ({ ...m, [id]: patch })),
    });
    setBusy(false);
    if (done.length) {
      persist(Object.fromEntries(done.map((id) => [id, { status: nextStatus, ...extra }])));
      setSelected((cur) => { const n = new Set(cur); done.forEach((id) => n.delete(id)); return n; });
      const label = (RC_STATUSES[nextStatus] || {}).label || nextStatus;
      gbToast(`${done.length} row${done.length === 1 ? '' : 's'} set to ${label} · bounce task${done.length === 1 ? '' : 's'} completed`, 'success');
    }
    if (failed.length) {
      gbToast(`${failed.length} task${failed.length === 1 ? '' : 's'} could not be completed — those rows are unchanged`, 'error');
    }
    // Let the ✓ linger, then hand the row buttons back (errors stay visible).
    setTimeout(() => setRowStatus((m) => {
      const n = {};
      for (const [id, st] of Object.entries(m)) if (st?.phase === 'error') n[id] = st;
      return n;
    }), 2400);
  }, [persist]);

  const useReplacement = useCallback((id, replacement) => {
    applyStatus([id], 'complete', { replacement });
  }, [applyStatus]);

  const openRecord = useCallback((id) => setReviewId(id), []);

  const selCount = selectedRecs.length;

  return (
    <>
      <FloatingPanel
        width={1160}
        height={720}
        backdrop
        draggable={draggable}
        closeOnEscape={!reviewId}
        onClose={onClosed}
        cardClassName="gb-replacement-contacts-modal"
        cardStyle={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        <ModalHeader
          icon={<I.mail />}
          title="Replacement Contacts"
          subtitle="Bounced-email queue · closing a row completes its CRM task"
          right={<Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={onRefresh} disabled={!onRefresh || loadState === 'loading'}>Refresh</Btn>}
        />
        <div style={{ flex: 1, minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Header + stat rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 2px' }}>
              <Tag size="sm" tone="error" icon={<I.mail />}>{k.open} open</Tag>
              <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Work company domains first — those are the contacts most likely to have a replacement.
              </span>
              {hydrating > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                  resolving {hydrating} address{hydrating === 1 ? '' : 'es'}
                </span>
              )}
            </div>

            <StatCardGrid cells={[
              { label: 'Open queue', value: k.open, sub: `${k.working} in progress`, tone: k.open ? 'error' : undefined, mono: true },
              { label: 'Company domains', value: k.searchable, sub: 'replacement findable', tone: 'success', mono: true },
              { label: 'Dead ends', value: k.deadEnd, sub: 'personal / marketplace', mono: true },
              { label: 'Overdue', value: k.overdue, sub: 'past task due date', tone: k.overdue ? 'warning' : undefined, mono: true },
              { label: 'Replaced', value: k.replaced, sub: 'tasks completed', tone: 'success', mono: true },
              { label: 'Archived', value: k.archived + k.norep, sub: 'closed without a swap', mono: true },
            ]} />

            {selCount > 0 && (
              <Card padding={0} style={{ border: '1px solid var(--gb-brand-tint-border)', background: 'var(--gb-brand-tint-soft)' }}>
                <div style={{ minHeight: 44, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)' }}>
                      <strong style={{ color: 'var(--gb-brand-label)', fontWeight: 700 }}>{selCount} selected</strong>
                      {' '}of {visible.length} row{visible.length === 1 ? '' : 's'}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--gb-text-muted)' }}>Set</span>
                    <Btn size="xs" variant="ghost" disabled={busy} onClick={() => applyStatus(selectedRecs.map((r) => r.id), 'working')}>Working it</Btn>
                    <Btn size="xs" variant="ghost" disabled={busy} onClick={() => applyStatus(selectedRecs.map((r) => r.id), 'called')}>Called</Btn>
                    <div style={{ flex: 1 }} />
                    {/* Each closing button says, on hover, that it completes the
                        CRM task — the one consequence a rep must not discover
                        after the fact. Wording comes from the model so the
                        button, the modal and the toast can't drift apart. */}
                    <Btn size="sm" variant="ghost" icon={<I.check />} disabled={busy}
                      title={closingSummary('complete', selCount)}
                      onClick={() => applyStatus(selectedRecs.map((r) => r.id), 'complete')}>Mark replaced</Btn>
                    <Btn size="sm" variant="ghost" icon={<I.ban />} disabled={busy}
                      title={closingSummary('norep', selCount)}
                      onClick={() => applyStatus(selectedRecs.map((r) => r.id), 'norep')}>No replacement</Btn>
                    <Btn size="sm" variant="ghost" icon={<I.arch />} disabled={busy}
                      title={closingSummary('archived', selCount)}
                      onClick={() => applyStatus(selectedRecs.map((r) => r.id), 'archived')}>Archive</Btn>
                </div>
              </Card>
            )}
          </div>

          {/* Queue */}
          <Card padding={0} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <SectionTitle
              icon={<I.mail />} title="Bounced contacts"
              count={loadState === 'ready' ? `${visible.length}${visible.length !== records.length ? ' of ' + records.length : ''}` : ''}
              sub={loadState === 'error' ? 'Could not load the task list' : undefined}
              right={<SortPicker sort={sort} setSort={setSort} />}
            />
            {loadState === 'loading' ? (
              <QueueSpinner label="Loading the bounce queue…" />
            ) : loadState === 'error' ? (
              <div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
                The CRM task list is unavailable — the queue is built from it.{' '}
                <button onClick={onRefresh} disabled={!onRefresh} style={{ background: 'none', border: 0, color: 'var(--gb-brand-label)', cursor: onRefresh ? 'pointer' : 'default', fontWeight: 600 }}>Retry</button>
              </div>
            ) : !records.length ? (
              <div style={{ padding: '52px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-secondary)' }}>Queue is clear</div>
                <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 5 }}>
                  The CRM has no open bounce tasks — nothing has been handed to this queue.
                </div>
              </div>
            ) : !visible.length ? (
              <div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
                The open replacement queue is clear.
              </div>
            ) : (
              <div className="gb-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <table style={tableStyle}>
                  <thead><tr>
                    <Th align="center" style={{ width: 38, padding: '6px 8px' }}>
                      <TaskCheckbox done={allSelected} onClick={toggleAll} title={allSelected ? 'Deselect all' : 'Select all'} />
                    </Th>
                    <Th>Contact</Th>
                    <Th>Bounced email</Th>
                    <Th>Domain</Th>
                    <Th>Bounce task</Th>
                    <Th>Status</Th>
                    <Th align="center">Actions</Th>
                  </tr></thead>
                  <tbody>
                    {visible.map((rec, i) => (
                      <ContactRow key={rec.id} rec={rec} index={i} selected={selected.has(rec.id)} active={reviewId === rec.id}
                        onToggle={toggleRow} onOpen={openRecord} onStatus={applyStatus}
                        status={rowStatus[rec.id]} busy={busy} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </FloatingPanel>
      {reviewRecord && (
        <AnalyzeModal
          rec={reviewRecord}
          onStatus={applyStatus}
          onUseReplacement={useReplacement}
          onClosed={() => setReviewId(null)}
        />
      )}
    </>
  );
}

function SortPicker({ sort, setSort }) {
  return (
    <Dropdown size="sm" value={sort} onChange={setSort} style={{ width: 152 }} options={[
      { id: 'queue', label: 'Queue order' },
      { id: 'due', label: 'Due date' },
      { id: 'contact', label: 'Contact' },
      { id: 'account', label: 'Account' },
      { id: 'email', label: 'Email' },
      { id: 'domain', label: 'Domain type' },
      { id: 'status', label: 'Status' },
    ]} />
  );
}
