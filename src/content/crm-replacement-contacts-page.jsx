/* eslint-disable */
/**
 * Replacement Contacts custom page (CRM Page 294).
 *
 * Page 294 is the host CRM's "Adjust Leader Board", which nobody uses — the
 * takeover claims the route and its sidebar slot (see custom-pages.js and the
 * replica NAV in detail-shared.jsx).
 *
 * The queue is the CRM's own automated bounce tasks ("Investigate bounced
 * contact" / "Replacement contact needed"), lifted out of the Task List modal
 * and page so they stop crowding rep work and get the one view that actually
 * fits them: triaged by what the bounced ADDRESS is, because that decides
 * whether a replacement can be found at all. What a record is and what the
 * queue says lives in src/lib/replacementContacts.js, where it is testable.
 *
 * Two things are worth knowing about the data:
 *   • Tasks come from Page=349 (this page is not on it, so it is fetched).
 *   • The bounced ADDRESS is not on the task row — it is on the contact. Rows
 *     hydrate progressively through Contact/Get, and a row says whether its
 *     address is still loading rather than pretending the contact has none.
 *
 * Closing a row (Replaced / No replacement / Archive) COMPLETES the underlying
 * CRM task — that is the point of the page. Every other status is the rep's
 * own working note and lives in chrome.storage.
 */

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import {
  TASKS_ENDPOINT, looksLikeLoginShell, parseTasksFromHtml,
} from '../lib/taskListModel.js';
import { completeTaskById } from '../lib/crmTasks.js';
import {
  DOMAIN_META, RC_SETTABLE, RC_STATE_KEY, RC_STATUSES, REPLACEMENT_SUBJECTS,
  buildReplacementRecords, closeReplacementTasks, closingSummary, contactIdFromUrl,
  filterReplacementRecords, isClosingStatus, kindLabel, normalizeReplacementStates,
  pruneReplacementStates, replacementKpis, selectReplacementTasks, sortReplacementRecords,
} from '../lib/replacementContacts.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { FULL_HEIGHT_LIST_PAGE_CSS } from '../lib/customPageLayout.js';
import {
  Btn, Card, DASH, DataCtx, DetailErrorBoundary, I, IconBtn, SectionTitle, Spinner,
  StatCardGrid, Tag, TaskCheckbox, Td, Th, tableStyle, trStyle, txt,
} from '../lib/detail-shared.jsx';
import {
  Breadcrumb, DetailPageFrame, MiniSelect, ModalCtx, ModalShell, TopBar,
  crmGetContact, gbToast, useDetailData, useModal, useModalHost,
} from '../lib/crm-detail-shared.jsx';

const BLACKLIST_URL = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=262';
const LINK_STYLE = { color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' };

/* How many contact lookups are in flight at once. The CRM is a shared admin
   box; four keeps a 300-row queue resolving in seconds without hammering it. */
const HYDRATE_CONCURRENCY = 4;

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
function AnalyzeModal({ rec, onStatus, onUseReplacement }) {
  const { closeModal } = useModal();
  const meta = DOMAIN_META[rec.dtype] || DOMAIN_META.unknown;
  const label = { fontSize: 9.5, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--gb-text-muted)' };
  const facts = [
    ['Account', rec.account || DASH],
    ['Task', `${kindLabel(rec.kind)} · due ${rec.due || DASH}`],
    ['Title', rec.title || DASH],
  ];
  return (
    <ModalShell
      title="Bounced contact" icon={<I.mail />} width={560}
      subtitle={`${rec.contact || 'Unknown contact'} · ${rec.account || 'no account'}`}
      footer={<>
        <MiniSelect
          value={rec.status}
          options={RC_SETTABLE.map((key) => ({ value: key, label: RC_STATUSES[key].label }))}
          onChange={(next) => { onStatus([rec.id], next); if (isClosingStatus(next)) closeModal(); }}
        />
        <div style={{ flex: 1 }} />
        <Btn size="md" variant="ghost" onClick={closeModal}>Close</Btn>
        {rec.contactUrl && (
          <Btn size="md" variant="secondary" icon={<I.ext />}
            onClick={() => { try { window.open(rec.contactUrl, '_blank', 'noopener'); } catch {} }}>
            Open contact
          </Btn>
        )}
      </>}
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '10px 12px' }}>
            <div style={label}>Bounced address</div>
            <div style={{ marginTop: 5 }}><BouncedEmail rec={rec} /></div>
            <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              <Tag size="sm" tone="error" icon={<I.mail />}>{kindLabel(rec.kind)}</Tag>
              <Mono size={9.5} color="var(--gb-text-ghost)">task #{rec.taskId}</Mono>
            </div>
          </div>
          <div style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '10px 12px' }}>
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

        <AutoLinkPanel rec={rec} onUse={(replacement) => { onUseReplacement(rec.id, replacement); closeModal(); }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {facts.map(([l, v]) => (
            <div key={l} style={{ background: 'var(--gb-fill-faint)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', padding: '8px 10px' }}>
              <div style={{ ...label, fontSize: 9 }}>{l}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

/* ── row ──────────────────────────────────────────────────────── */
function ContactRow({ rec, index, selected, onToggle, onOpen, onStatus, status, busy }) {
  const stop = (e) => e.stopPropagation();
  const meta = DOMAIN_META[rec.dtype] || DOMAIN_META.unknown;
  const overdue = rec.dueBucket === 'overdue';
  const rowStyle = {
    ...trStyle,
    cursor: 'pointer',
    ...(overdue ? { boxShadow: 'inset 3px 0 0 var(--gb-error)' } : null),
    ...(selected ? { background: 'var(--gb-brand-tint-soft)', boxShadow: 'inset 3px 0 0 var(--gb-brand-label)' } : null),
    ...(isClosingStatus(rec.status) ? { opacity: .55 } : null),
    transition: 'background-color var(--gb-anim), box-shadow var(--gb-anim), opacity var(--gb-anim)',
  };
  return (
    <tr className="gb-actrow" style={rowStyle} onClick={() => onOpen(rec.id)}>
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
      <Td>
        <Tag tone={rec.kind === 'replacement' ? 'warning' : 'neutral'} size="sm">{kindLabel(rec.kind)}</Tag>
        <div style={{ fontSize: 9.5, marginTop: 3, fontFamily: 'var(--gb-font-mono)', color: overdue ? 'var(--gb-error-fg)' : 'var(--gb-text-ghost)' }}>
          {overdue ? `overdue · ${rec.due || DASH}` : `due ${rec.due || DASH}`}
        </div>
      </Td>
      <Td><StatusTag status={rec.status} /></Td>
      <Td align="center" style={{ width: 96, whiteSpace: 'nowrap' }}>
        {status ? <RowStatus st={status} /> : (
          <span onClick={stop} style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
            <IconBtn size="xs" ghost icon={<I.search />} title="Review this bounce" onClick={() => onOpen(rec.id)} />
            <IconBtn size="xs" ghost icon={<I.check />} title="Mark replaced (completes the task)" disabled={busy} onClick={() => onStatus([rec.id], 'complete')} />
            <IconBtn size="xs" ghost icon={<I.arch />} title="Archive (completes the task)" disabled={busy} onClick={() => onStatus([rec.id], 'archived')} />
          </span>
        )}
      </Td>
    </tr>
  );
}

/* ── app ──────────────────────────────────────────────────────── */
function ReplacementContactsApp({ store }) {
  const [D] = useDetailData(store);
  const modalHost = useModalHost();

  const [tasks, setTasks] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [hydrated, setHydrated] = useState({});      // contactId → { email, jobTitle } | { error }
  const [hydrating, setHydrating] = useState(0);     // contacts still to resolve
  const [states, setStates] = useState({});          // taskId → { status, replacement… }
  const [statesLoaded, setStatesLoaded] = useState(false);
  const [rowStatus, setRowStatus] = useState({});    // taskId → { phase, label, detail }
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [dtype, setDtype] = useState('all');
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState('queue');
  const [selected, setSelected] = useState(new Set());
  const [focused, setFocused] = useState(false);

  const gen = useRef(0);
  const anchorRef = useRef(null);
  const inputRef = useRef(null);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  /* ── load ──────────────────────────────────────────────────────
     Page 294 has no task table of its own, so the queue is fetched from the
     native task list and filtered down to the automated bounce subjects. */
  const load = useCallback(async () => {
    const g = ++gen.current;
    setLoadState('loading');
    try {
      const res = await fetch(TASKS_ENDPOINT, { credentials: 'include' });
      const html = await res.text();
      if (g !== gen.current) return;
      if (!res.ok || looksLikeLoginShell(html)) { setLoadState('error'); return; }
      setTasks(selectReplacementTasks(parseTasksFromHtml(html)));
      setLoadState('ready');
    } catch {
      if (g === gen.current) setLoadState('error');
    }
  }, []);

  useEffect(() => { loadStates().then((s) => { setStates(s); setStatesLoaded(true); }); }, []);
  useEffect(() => { load(); }, [load]);

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
    const g = gen.current;
    let cancelled = false;
    let cursor = 0;
    setHydrating(pending.length);

    const worker = async () => {
      while (!cancelled) {
        const contactId = pending[cursor++];
        if (!contactId) return;
        let result;
        try {
          const contact = await crmGetContact(contactId);
          result = { email: String(contact?.email || '').trim(), jobTitle: String(contact?.jobTitle || '').trim() };
        } catch (e) {
          result = { error: e?.message || 'lookup failed' };
        }
        if (cancelled || g !== gen.current) return;
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
    () => sortReplacementRecords(filterReplacementRecords(records, { query, dtype, status, kind }), sort),
    [records, query, dtype, status, kind, sort],
  );
  const k = useMemo(() => replacementKpis(records), [records]);
  const selectedRecs = useMemo(() => visible.filter((rec) => selected.has(rec.id)), [visible, selected]);

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

  /* The open modal has to stay live: its row is usually still resolving its
     address when it opens. It can't just take `rec` as a prop — modalHost
     stores the ELEMENT, and React bails out of re-rendering a subtree whose
     element is referentially identical, so a prop captured at open time would
     freeze. Hand it a tiny store it can subscribe to instead. */
  const live = useRef({ records, listeners: new Set() }).current;
  live.records = records;
  useEffect(() => { live.listeners.forEach((notify) => { try { notify(); } catch {} }); }, [records, live]);

  const openRecord = useCallback((id) => {
    modalHost.openModal(
      <AnalyzeRecord id={id} live={live} onStatus={applyStatus} onUseReplacement={useReplacement} />,
    );
  }, [modalHost, live, applyStatus, useReplacement]);

  const exportCsv = () => {
    const rows = selectedRecs.length ? selectedRecs : visible;
    if (!rows.length) { gbToast('Nothing to export', 'info'); return; }
    const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const head = ['Contact', 'Account', 'Bounced email', 'Domain type', 'Task', 'Due', 'Status', 'Replacement'];
    const lines = [head.join(',')].concat(rows.map((r) => [
      r.contact, r.account, r.email, DOMAIN_META[r.dtype]?.label, kindLabel(r.kind), r.due,
      RC_STATUSES[r.status]?.label, r.replacement ? `${r.replacement.name} <${r.replacement.email}>` : '',
    ].map(esc).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `replacement-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const selCount = selectedRecs.length;
  const cycle = (cur, setter, value) => setter(cur === value ? 'all' : value);

  return (
    <DataCtx.Provider value={D}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentPage="Replacement Contacts" ready modalHost={modalHost} hideScrollbar
        topBar={<TopBar><Breadcrumb items={[{ label: 'CRM', page: 261 }]} current="Replacement Contacts" /></TopBar>}
      >
        <style>{FULL_HEIGHT_LIST_PAGE_CSS}</style>
        <div className="gbcp-stack gbcp-fill-grid" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

          {/* Header + stat rail */}
          <div className="gbcp-fill-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Card>
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: -.3, color: 'var(--gb-text-primary)' }}>
                      Replacement Contacts
                    </h1>
                    <Tag size="sm" tone="error" icon={<I.mail />}>{k.open} open</Tag>
                    {hydrating > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'var(--gb-text-muted)' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--gb-border-default)', borderTopColor: 'var(--gb-brand-label)', animation: 'gb-spin .7s linear infinite' }} />
                        resolving {hydrating} address{hydrating === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    Contacts whose email bounced, taken off the task list and queued here. Work the company
                    domains first — those are the ones a replacement can be found for. Closing a row completes its CRM task.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <Btn size="sm" variant="ghost" icon={<I.ban />}
                    onClick={() => { try { window.open(BLACKLIST_URL, '_blank', 'noopener'); } catch {} }}>Blacklist</Btn>
                  <Btn size="sm" variant="ghost" icon={<I.download />} onClick={exportCsv}>Export CSV</Btn>
                  <Btn size="sm" variant="secondary" icon={<I.refresh />} onClick={load}>Refresh</Btn>
                </div>
              </div>
            </Card>

            <StatCardGrid cells={[
              { label: 'Open queue', value: k.open, sub: `${k.working} in progress`, tone: k.open ? 'error' : undefined, mono: true, active: status === 'open', onClick: () => setStatus('open') },
              { label: 'Company domains', value: k.searchable, sub: 'replacement findable', tone: 'success', mono: true, active: dtype === 'business', onClick: () => cycle(dtype, setDtype, 'business') },
              { label: 'Dead ends', value: k.deadEnd, sub: 'personal / marketplace', mono: true, active: dtype === 'personal', onClick: () => cycle(dtype, setDtype, 'personal') },
              { label: 'Overdue', value: k.overdue, sub: 'past task due date', tone: k.overdue ? 'warning' : undefined, mono: true },
              { label: 'Replaced', value: k.replaced, sub: 'tasks completed', tone: 'success', mono: true, active: status === 'complete', onClick: () => setStatus(status === 'complete' ? 'open' : 'complete') },
              { label: 'Archived', value: k.archived + k.norep, sub: 'closed without a swap', mono: true, active: status === 'archived', onClick: () => setStatus(status === 'archived' ? 'open' : 'archived') },
            ]} />

            {/* Filters + the selection rail (same treatment as the Task List page) */}
            <Card style={{ border: '1px solid color-mix(in srgb, var(--gb-border-strong) 72%, transparent)', background: 'var(--gb-surface-1)' }}>
              <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <div style={{
                  flex: 1, minWidth: 230, display: 'flex', alignItems: 'center', gap: 9, height: 34, padding: '0 11px',
                  background: 'var(--gb-fill-inverse-medium)',
                  border: '1px solid ' + (focused ? 'var(--gb-border-focus)' : 'var(--gb-border-default)'),
                  borderRadius: 12,
                  boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--gb-brand-label) 18%, transparent)' : 'none',
                  transition: 'box-shadow var(--gb-anim), border-color var(--gb-anim)',
                }}>
                  <I.search size={14} style={{ color: 'var(--gb-text-muted)', flexShrink: 0 }} />
                  <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                    placeholder="Email, contact, account, domain…"
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)', fontSize: 12.5 }} />
                  {query && <IconBtn size="xs" ghost icon={<I.close />} title="Clear"
                    onClick={() => { setQuery(''); try { inputRef.current.focus(); } catch {} }} />}
                </div>
                <MiniSelect value={dtype} onChange={setDtype}
                  options={[{ value: 'all', label: 'Any domain type' }, ...Object.entries(DOMAIN_META).map(([v, m]) => ({ value: v, label: m.label }))]} />
                <MiniSelect value={kind} onChange={setKind}
                  options={[{ value: 'all', label: 'Both task types' }, ...REPLACEMENT_SUBJECTS.map((r) => ({ value: r.kind, label: r.label }))]} />
                <MiniSelect value={status} onChange={setStatus}
                  options={[{ value: 'open', label: 'Open queue' }, ...RC_SETTABLE.map((v) => ({ value: v, label: RC_STATUSES[v].label })), { value: 'all', label: 'Everything' }]} />
              </div>

              <div style={{
                display: 'grid',
                gridTemplateRows: selCount > 0 ? '1fr' : '0fr',
                opacity: selCount > 0 ? 1 : 0,
                transition: 'grid-template-rows .24s cubic-bezier(.4,0,.2,1), opacity .16s ease',
              }}>
                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                  <div style={{
                    minHeight: 42, padding: '7px 14px', borderTop: '1px solid var(--gb-border-subtle)',
                    background: 'color-mix(in srgb, var(--gb-brand-tint-soft) 72%, transparent)',
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  }}>
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
                </div>
              </div>
            </Card>
          </div>

          {/* Queue */}
          <Card className="gbcp-fill-results">
            <SectionTitle
              icon={<I.mail />} title="Bounced contacts"
              count={loadState === 'ready' ? `${visible.length}${visible.length !== records.length ? ' of ' + records.length : ''}` : ''}
              sub={loadState === 'error' ? 'Could not load the task list' : undefined}
              right={<SortPicker sort={sort} setSort={setSort} />}
            />
            {loadState === 'loading' ? (
              <Spinner label="Loading the bounce queue…" />
            ) : loadState === 'error' ? (
              <div style={{ padding: '44px 0', textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12.5 }}>
                The CRM task list is unavailable — the queue is built from it.{' '}
                <button onClick={load} style={{ background: 'none', border: 0, color: 'var(--gb-brand-label)', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
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
                No bounced contacts match these filters.
              </div>
            ) : (
              <div className="gb-scroll gbcp-fill-table">
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
                      <ContactRow key={rec.id} rec={rec} index={i} selected={selected.has(rec.id)}
                        onToggle={toggleRow} onOpen={openRecord} onStatus={applyStatus}
                        status={rowStatus[rec.id]} busy={busy} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </DataCtx.Provider>
  );
}

/* Keeps the open modal live as its row hydrates or its status changes. */
function AnalyzeRecord({ id, live, onStatus, onUseReplacement }) {
  const { closeModal } = useModal();
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    live.listeners.add(bump);
    return () => { live.listeners.delete(bump); };
  }, [live]);
  const rec = (live.records || []).find((r) => r.id === id);
  // The row left the queue underneath us (task completed elsewhere, reload).
  useEffect(() => { if (!rec) closeModal(); }, [rec, closeModal]);
  if (!rec) return null;
  return <AnalyzeModal rec={rec} onStatus={onStatus} onUseReplacement={onUseReplacement} />;
}

function SortPicker({ sort, setSort }) {
  return (
    <MiniSelect value={sort} onChange={setSort} options={[
      { value: 'queue', label: 'Queue order' },
      { value: 'due', label: 'Due date' },
      { value: 'contact', label: 'Contact' },
      { value: 'account', label: 'Account' },
      { value: 'email', label: 'Email' },
      { value: 'domain', label: 'Domain type' },
      { value: 'status', label: 'Status' },
    ]} />
  );
}

/* ── Register with the custom-pages engine (Page 294 → replacement_contacts) ── */
if (!window.__gbReplacementContactsPageRegistered) {
  window.__gbReplacementContactsPageRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.replacement_contacts = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(
        <ToastHost installGlobal={false}>
          <DetailErrorBoundary label="Replacement Contacts page">
            <ReplacementContactsApp store={ctx.store} />
          </DetailErrorBoundary>
        </ToastHost>,
      );
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
