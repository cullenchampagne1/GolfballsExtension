/**
 * Replacement Contacts — the bounced-email work queue, as data.
 *
 * The CRM raises two automated tasks when an email bounces: "Investigate
 * bounced contact" and "Replacement contact needed". They are not work a rep
 * does from the task list — they are a queue with its own shape (whose domain
 * is worth searching, which are dead ends), so they are lifted OUT of the task
 * surfaces here and given their own page.
 *
 * This module owns three things, all pure so they are testable in node:
 *   1. what counts as a replacement task (one definition, used to both select
 *      them here and exclude them from the Task List modal + page),
 *   2. what a bounced address IS — the domain classification that decides
 *      whether a replacement can be found at all,
 *   3. the record/filter/KPI shape the page renders.
 *
 * Everything the CRM does not give us is absent rather than invented: a record
 * carries what the task row and the contact record actually contain.
 */

import { dueBucket } from './taskListModel.js';

/* ── which tasks are ours ──────────────────────────────────────────
   Matched on the normalized subject PREFIX: the CRM appends the address or a
   run id to some of these ("Replacement contact needed - jdoe@acme.com"), and
   a rep editing a subject usually adds to the end rather than the front. */
export const REPLACEMENT_SUBJECTS = Object.freeze([
  { kind: 'investigate', prefix: 'investigate bounced contact', label: 'Bounce investigation' },
  { kind: 'replacement', prefix: 'replacement contact needed', label: 'Replacement needed' },
]);

const normalizeSubject = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[\s ]+/g, ' ')
  .replace(/^[\s\-–—:]+/, '')
  .trim();

/** Which replacement kind a task is, or '' when it is ordinary rep work. */
export function replacementKind(task) {
  const subject = normalizeSubject(task?.subject);
  if (!subject) return '';
  const hit = REPLACEMENT_SUBJECTS.find((row) => subject.startsWith(row.prefix));
  return hit ? hit.kind : '';
}

export function isReplacementTask(task) {
  return replacementKind(task) !== '';
}

/** The automated bounce tasks — the input to this page. */
export function selectReplacementTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter(isReplacementTask);
}

/** Everything else — what the Task List modal and page should show. */
export function excludeReplacementTasks(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => !isReplacementTask(task));
}

/** Numeric CRM contact id out of a native contact link. */
export function contactIdFromUrl(url) {
  const match = String(url || '').match(/[?&](?:customerID|customerId|contactID|contactId)=(\d+)/i);
  return match ? match[1] : '';
}

/* ── what the bounced address tells us ─────────────────────────────
   The whole queue triages on this. A bounced address at a company domain has
   a findable replacement (someone else works there); a bounced Gmail has no
   company to search, so no amount of work will produce one. */
export const FREE_EMAIL_DOMAINS = Object.freeze([
  'gmail.com', 'yahoo.com', 'ymail.com', 'hotmail.com', 'live.com', 'msn.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com', 'outlook.com', 'protonmail.com',
  'proton.me', 'att.net', 'sbcglobal.net', 'bellsouth.net', 'cox.net',
  'comcast.net', 'charter.net', 'centurytel.net', 'earthlink.net', 'juno.com',
  'verizon.net', 'roadrunner.com', 'suddenlink.net', 'eatel.net',
]);

/* Relay addresses — the buyer is reachable only through the marketplace, so
   there is no mailbox to replace. */
export const MARKETPLACE_DOMAINS = Object.freeze([
  'marketplace.amazon.com', 'ebay.com', 'walmart.com', 'relay.amazon.com',
]);

/* A shared mailbox at a company domain: the address still works as a target,
   so these are worth a call rather than a person-search. */
export const ROLE_LOCAL_PARTS = Object.freeze([
  'info', 'sales', 'orders', 'order', 'admin', 'office', 'purchasing',
  'accounting', 'ap', 'proshop', 'pro-shop', 'events', 'contact', 'support',
  'billing', 'golf', 'shop', 'team', 'hello', 'mail',
]);

export const DOMAIN_META = Object.freeze({
  business: { label: 'Business', tone: 'success', hint: 'Company domain — a replacement is findable.' },
  role: { label: 'Role inbox', tone: 'info', hint: 'Shared mailbox at a company domain — call the account.' },
  personal: { label: 'Personal', tone: 'neutral', hint: 'Consumer mailbox — there is no company to search.' },
  marketplace: { label: 'Marketplace', tone: 'warning', hint: 'Marketplace relay address — not a reachable mailbox.' },
  unknown: { label: 'No email', tone: 'neutral', hint: 'No address on the contact record to classify.' },
});

/** Domain types whose bounce can actually be worked into a replacement. */
export const SEARCHABLE_TYPES = Object.freeze(['business', 'role']);

export function isSearchableType(dtype) {
  return SEARCHABLE_TYPES.includes(dtype);
}

/** 'business' | 'role' | 'personal' | 'marketplace' | 'unknown'. */
export function classifyEmailDomain(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return 'unknown';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!domain.includes('.')) return 'unknown';
  if (MARKETPLACE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return 'marketplace';
  if (FREE_EMAIL_DOMAINS.includes(domain)) return 'personal';
  // Strip the +tag and any trailing digits a CRM export tends to add.
  if (ROLE_LOCAL_PARTS.includes(local.split('+')[0].replace(/\d+$/, ''))) return 'role';
  return 'business';
}

export function emailDomain(email) {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  return at > 0 ? value.slice(at + 1) : '';
}

/* ── status ────────────────────────────────────────────────────────
   `pending` is the absence of a rep opinion, so it is never stored. The two
   CLOSING statuses complete the underlying CRM task — that is the whole point
   of the page: working the queue has to clear the tasks that created it. */
export const RC_STATUSES = Object.freeze({
  pending: { label: 'Needs review', tone: 'warning' },
  working: { label: 'Working it', tone: 'info' },
  called: { label: 'Called account', tone: 'info' },
  analyzed: { label: 'Candidates found', tone: 'brand' },
  complete: { label: 'Replaced', tone: 'success' },
  norep: { label: 'No replacement', tone: 'error' },
  archived: { label: 'Archived', tone: 'neutral' },
});

/** Statuses a rep can set by hand, in the order the picker lists them. */
export const RC_SETTABLE = Object.freeze(['pending', 'working', 'called', 'analyzed', 'complete', 'norep', 'archived']);

/** Statuses that close the row — and complete the CRM task behind it. */
export const RC_CLOSING = Object.freeze(['complete', 'archived', 'norep']);

export function isClosingStatus(status) {
  return RC_CLOSING.includes(status);
}

export function isOpenStatus(status) {
  return !isClosingStatus(status);
}

/* ── local annotations ─────────────────────────────────────────────
   Only `complete`/`archived`/`norep` exist in the CRM (as a completed task).
   The in-between statuses are the rep's own working notes, so they live in
   chrome.storage keyed by task id. */
export const RC_STATE_KEY = 'gbReplacementContacts';

export function normalizeReplacementState(value) {
  const state = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const status = RC_SETTABLE.includes(state.status) ? state.status : 'pending';
  const out = { status };
  if (state.note) out.note = String(state.note).slice(0, 2_000);
  if (Number.isFinite(Number(state.updatedAt))) out.updatedAt = Number(state.updatedAt);
  if (state.replacement && typeof state.replacement === 'object') {
    const { name, email, title, source } = state.replacement;
    out.replacement = {
      name: String(name || '').slice(0, 200),
      email: String(email || '').slice(0, 320),
      ...(title ? { title: String(title).slice(0, 200) } : {}),
      ...(source ? { source: String(source).slice(0, 80) } : {}),
    };
  }
  return out;
}

export function normalizeReplacementStates(value) {
  const bag = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  for (const [taskId, state] of Object.entries(bag)) {
    if (!/^\d{1,12}$/.test(String(taskId))) continue;
    out[String(taskId)] = normalizeReplacementState(state);
  }
  return out;
}

/**
 * Drop annotations for tasks that are gone.
 *
 * A completed task leaves the CRM's open list, so its annotation would sit in
 * storage forever. Keeping it for a grace period means a row that reappears
 * (task reopened, list still loading) keeps its history instead of silently
 * resetting to "Needs review".
 */
export function pruneReplacementStates(states, liveTaskIds, { now = Date.now(), keepDays = 45 } = {}) {
  const live = new Set((liveTaskIds || []).map(String));
  const cutoff = now - keepDays * 86_400_000;
  const out = {};
  for (const [taskId, state] of Object.entries(normalizeReplacementStates(states))) {
    if (live.has(taskId)) { out[taskId] = state; continue; }
    if (Number.isFinite(state.updatedAt) && state.updatedAt >= cutoff) out[taskId] = state;
  }
  return out;
}

/* ── records ───────────────────────────────────────────────────────
   One row per automated task, joined with whatever the contact lookup has
   returned so far. Hydration is progressive, so `hydrated` is normally partial
   — a record says so (`emailState`) rather than pretending the contact has no
   address. */
export function buildReplacementRecords(tasks, { hydrated = {}, states = {}, today = new Date() } = {}) {
  const byTask = normalizeReplacementStates(states);
  return selectReplacementTasks(tasks).map((task) => {
    const taskId = String(task.id);
    const contactId = contactIdFromUrl(task.contactUrl);
    const info = contactId ? (hydrated[contactId] || null) : null;
    const state = byTask[taskId] || { status: 'pending' };
    const email = String(info?.email || '').trim();
    /* 'pending' means a lookup is coming. A task with no contact link has
       nothing to look up, so it must not sit on a spinner forever. */
    const emailState = !contactId ? 'none'
      : !info ? 'pending'
        : info.error ? 'error'
          : email ? 'ready' : 'none';
    const dtype = email ? classifyEmailDomain(email) : 'unknown';
    return {
      id: taskId,
      taskId,
      kind: replacementKind(task),
      subject: task.subject || '',
      contactId,
      contact: task.contact || '',
      contactUrl: task.contactUrl || '',
      account: task.account || '',
      accountUrl: task.accountUrl || '',
      title: String(info?.jobTitle || '').trim(),
      email,
      emailState,
      domain: emailDomain(email),
      dtype,
      searchable: isSearchableType(dtype),
      due: task.due || '',
      dueDate: task.dueDate || null,
      dueBucket: dueBucket(task.dueDate, today),
      category: task.category || '',
      priority: task.priority || 2,
      status: state.status,
      replacement: state.replacement || null,
      note: state.note || '',
      updatedAt: state.updatedAt || 0,
    };
  });
}

const KIND_LABEL = Object.fromEntries(REPLACEMENT_SUBJECTS.map((row) => [row.kind, row.label]));
export function kindLabel(kind) {
  return KIND_LABEL[kind] || 'Bounce task';
}

/**
 * Filter the queue. `status` is a single value: 'open' (the working default),
 * 'all', or one concrete status. `dtype` and `kind` are 'all' or one value.
 */
export function filterReplacementRecords(records, {
  query = '', dtype = 'all', status = 'open', kind = 'all',
} = {}) {
  const q = String(query).trim().toLowerCase();
  return (records || []).filter((rec) => {
    if (status === 'open' && !isOpenStatus(rec.status)) return false;
    if (status !== 'open' && status !== 'all' && rec.status !== status) return false;
    if (dtype !== 'all' && rec.dtype !== dtype) return false;
    if (kind !== 'all' && rec.kind !== kind) return false;
    if (q) {
      const hay = `${rec.contact} ${rec.account} ${rec.email} ${rec.domain} ${rec.title}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* Sort keys the table header offers. `queue` is the default and is the whole
   argument of the page: searchable domains first (they can be worked), then
   the most overdue — so the top of the list is always the next useful call. */
const DUE_RANK = { overdue: 0, today: 1, week: 2, later: 3, none: 4 };
const SORTERS = {
  queue: (a, b) => (Number(b.searchable) - Number(a.searchable))
    || (DUE_RANK[a.dueBucket] - DUE_RANK[b.dueBucket])
    || dueTime(a) - dueTime(b),
  due: (a, b) => dueTime(a) - dueTime(b),
  contact: (a, b) => a.contact.localeCompare(b.contact),
  account: (a, b) => a.account.localeCompare(b.account),
  // Rows with no address sort last in either direction — an unknown address is
  // not an empty string that happens to collate first.
  email: (a, b) => (Number(!a.email) - Number(!b.email)) || a.email.localeCompare(b.email),
  domain: (a, b) => a.dtype.localeCompare(b.dtype) || a.domain.localeCompare(b.domain),
  status: (a, b) => a.status.localeCompare(b.status),
};

function dueTime(rec) {
  const time = rec?.dueDate?.getTime?.();
  return Number.isFinite(time) ? time : Infinity;
}

export function sortReplacementRecords(records, sort = 'queue') {
  const by = SORTERS[sort] || SORTERS.queue;
  // Decorate-sort-undecorate keeps ties in their original (task-list) order.
  return (records || []).map((rec, i) => [rec, i])
    .sort(([a, ia], [b, ib]) => by(a, b) || ia - ib)
    .map(([rec]) => rec);
}

/** The KPI rail. Counts are over the whole queue, not the filtered view. */
export function replacementKpis(records) {
  const rows = records || [];
  const open = rows.filter((rec) => isOpenStatus(rec.status));
  return {
    total: rows.length,
    open: open.length,
    searchable: open.filter((rec) => rec.searchable).length,
    deadEnd: open.filter((rec) => rec.dtype === 'personal' || rec.dtype === 'marketplace').length,
    unresolved: open.filter((rec) => rec.dtype === 'unknown').length,
    overdue: open.filter((rec) => rec.dueBucket === 'overdue').length,
    working: open.filter((rec) => rec.status === 'working' || rec.status === 'called').length,
    analyzed: open.filter((rec) => rec.status === 'analyzed').length,
    replaced: rows.filter((rec) => rec.status === 'complete').length,
    archived: rows.filter((rec) => rec.status === 'archived').length,
    norep: rows.filter((rec) => rec.status === 'norep').length,
  };
}

/**
 * Close rows by completing their CRM tasks.
 *
 * The rule this exists to enforce: a row only takes a closing status if its
 * task actually completed. A row reading "Replaced" over a still-open bounce
 * task sends the rep back here tomorrow to redo work they already did, and the
 * queue would quietly stop matching the CRM.
 *
 * Sequential on purpose — Task/Update.ajax is rate-limited, and a burst gets
 * some writes dropped, which is exactly the failure this guards against.
 * `complete` is injected so this is testable against a fake CRM; `onRow`
 * reports progress for the row indicators.
 */
export async function closeReplacementTasks(ids, { complete, onRow = () => {} } = {}) {
  const done = [];
  const failed = [];
  for (const id of ids || []) {
    onRow(id, { phase: 'running', label: 'Completing task…' });
    try {
      await complete(id);
      onRow(id, { phase: 'done', label: 'Task completed' });
      done.push(id);
    } catch (error) {
      onRow(id, { phase: 'error', label: 'Failed', detail: error?.message || 'Task update failed' });
      failed.push({ id, error: error?.message || 'Task update failed' });
    }
  }
  return { done, failed };
}

/**
 * The one-line summary under a closing action — what the rep is about to do to
 * the CRM, not just to this page. Named here so the page and its confirmation
 * cannot describe the same action differently.
 */
export function closingSummary(status, count) {
  const rows = `${count} contact${count === 1 ? '' : 's'}`;
  if (status === 'complete') return `Mark ${rows} replaced and complete the bounce task${count === 1 ? '' : 's'}.`;
  if (status === 'archived') return `Archive ${rows} and complete the bounce task${count === 1 ? '' : 's'}.`;
  if (status === 'norep') return `Close ${rows} as unreplaceable and complete the bounce task${count === 1 ? '' : 's'}.`;
  return `Update ${rows}.`;
}
