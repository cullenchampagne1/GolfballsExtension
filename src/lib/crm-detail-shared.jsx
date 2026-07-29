/**
 * Shared stateful CRM detail behavior — used by ALL THREE detail pages
 * (contact, account, opportunity).
 *
 * Owns the page frame (DetailPageFrame + TopBar/Breadcrumb), the modal host,
 * the live-store adapter hooks, and every cross-page panel (activity, tasks,
 * quick log, opportunities, lookups, mailer) plus the CRM write transports.
 * Stateless visual primitives live in detail-shared.jsx; page entries should
 * only compose these pieces.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Field as UIField } from '../ui/components/Field.jsx';
import { Input as UIInput } from '../ui/components/Input.jsx';
import { Textarea as UITextarea } from '../ui/components/Textarea.jsx';
import { ModalHeader } from '../ui/components/ModalHeader.jsx';
import { ModalFooter } from '../ui/components/ModalFooter.jsx';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { completeTaskById } from './crmTasks.js';
import { buildAccountPayload, accountUpdateUrl, checkAccountResponse } from './accountUpdate.js';
import { CONTACT_COUNTRY_OPTS, CONTACT_USER_TYPE_OPTS, mergeContactCustomData } from './crmContact.js';
import { opportunityStageTone } from './customPageLayout.js';
import { TASK_CATEGORY_OPTIONS } from './taskCategories.js';
import { buildCustomTaskTemplate, loadTaskTemplates } from './quickTask.js';
import { submitQuickTask, readTaskContext } from './submitQuickTask.js';
import { submitCallLog } from './submitCallLog.js';
import { loadCallTemplates } from './callLog.js';
import { chatTranscriptSummary, isChatTranscript, parseChat, safeChatTranscriptUrl } from './parseChat.js';
import { ARMOR, AVATAR_COLOR, ActivityFilter, Btn, CRM_CHILD_PAGE, Card, ContactPill, DASH, Dot, EmptyRow, I, IconBtn, InlineSearch, KV, NAV, PAGE_ZOOM, QuickAddInput, TOP_PAGE, ProofCard, ScrollArea, SectionTitle, Spinner, Tag, TaskCheckbox, Td, Th, ThemeSelector, UI_CSS, accountHref, activityType, crmGo, crmHref, fmt$, fmtDate, fmtDateTime, fullName, goUrl, initials, isEmpty, num, oppHref, priTone, recordBackTo, tableStyle, trStyle, txt, useD, yearsSince } from './detail-shared.jsx';

export const PatchCtx = React.createContext(() => {});

export const usePatch = () => React.useContext(PatchCtx);

export const ModalCtx = React.createContext({ openModal: () => {}, closeModal: () => {} });

export const useModal = () => React.useContext(ModalCtx);

export function adapt(data) {
  const d = data || {};
  const tasks = d.tasks || {};
  return {
    ready: !!data,
    ids: d.ids || {},
    contact: d.contact || {},
    account: d.account || {},
    stats: d.stats || {},
    orders: Array.isArray(d.orders) ? d.orders : [],
    items: Array.isArray(d.items) ? d.items : [],
    openTasks: Array.isArray(tasks.open) ? tasks.open : [],
    doneTasks: Array.isArray(tasks.done) ? tasks.done : [],
    opportunities: Array.isArray(d.opportunities) ? d.opportunities : [],
    activities: Array.isArray(d.activities) ? d.activities : [],
    emails: Array.isArray(d.emails) ? d.emails : [],
    proofs: Array.isArray(d.proofs) ? d.proofs : [],
    contacts: Array.isArray(d.contacts) ? d.contacts : [],   // account → related contacts
    lookups: Array.isArray(d.lookups) ? d.lookups : [],
  };
}

/* UI_CSS moved to detail-shared.jsx (injected by DetailPageFrame). */
export { UI_CSS } from './detail-shared.jsx';

/**
 * The page-data hook every detail page uses: live schema-engine data +
 * optimistic patch queue. The store only notifies when an extract actually
 * changed (custom-pages.js diffs), so D stays reference-stable between real
 * changes. Patches are capped so a long session can't grow the per-render
 * reduce without bound — beyond 200 the oldest 50 are folded away (their
 * effect is almost always reflected in a later extract by then).
 */
export function useDetailData(store, adaptFn) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const [patches, setPatches] = useState([]);
  const patch = useCallback((fn) => setPatches((p) => (p.length >= 200 ? [...p.slice(50), fn] : [...p, fn])), []);
  const D = useMemo(
    () => patches.reduce((acc, fn) => { try { return fn(acc) || acc; } catch (e) { return acc; } }, (adaptFn || adapt)(data)),
    [data, patches, adaptFn],
  );
  return [D, patch];
}

/* Modal open/close state machine (the 190ms close matches gb-pop-out). The
   returned object is also a valid ModalCtx value. */
export function useModalHost() {
  const [modal, setModal] = useState(null);
  const [closing, setClosing] = useState(false);
  const openModal = useCallback((node) => { setClosing(false); setModal(node); }, []);
  const closeModal = useCallback(() => { setClosing(true); setTimeout(() => { setModal(null); setClosing(false); }, 190); }, []);
  return useMemo(() => ({ modal, closing, openModal, closeModal }), [modal, closing, openModal, closeModal]);
}

export function crmOrigin() {
  try { if (/(^|\.)golfballs\.com$/i.test(location.hostname)) return location.origin; } catch (e) {}
  return 'https://api.golfballs.com';
}

export function gbToast(msg, tone = 'info') {
  try { const t = window.__gbToast; (t && (t[tone] || t.info) || function () {})(msg); } catch (e) {}
}

/* Read a host <select>'s options as [{value,label}] — lets our modals reuse
   the CRM's own live employee/assignment lists instead of a hardcoded copy
   that would drift as staff change. The host page still lives (hidden) under
   the takeover, so its selects are present in the document. */
export function readHostSelectOptions(id, fallback) {
  try {
    const el = document.getElementById(id);
    if (el && el.options && el.options.length) {
      return Array.prototype.map.call(el.options, (o) => ({ value: String(o.value), label: (o.text || '').trim() }));
    }
  } catch (e) {}
  return fallback || [];
}

/* Resolve an id to its label via a host <select>'s options (e.g. an employee
   or source id → display name from the CRM's own dropdown). */
export function hostSelectLabel(selectId, value, fallback = '') {
  const v = String(value == null ? '' : value);
  const hit = readHostSelectOptions(selectId, []).find((o) => o.value === v);
  return hit ? hit.label : fallback;
}

/* Read a host <input>'s current value (fields the CRM renders but doesn't
   expose via an .ajax Get, e.g. LastModifiedDate). */
export function hostInputValue(id, fallback = '') {
  try { const el = document.getElementById(id); if (el && el.value != null) return String(el.value).trim() || fallback; } catch (e) {}
  return fallback;
}

/* Create a real CRM "Lead Note" activity on the contact — the native
   ActivityNoteModal's endpoint (captured from generate_proposal.har). The
   note lands in crm.TblActivities and shows up in the activity feed on the
   next extract; the response is the rendered <tr>, not JSON, so a 200 is
   success. Replaces the old chrome.storage local-only note layer. */
export async function crmSaveLeadNote(contactId, note) {
  const base = crmOrigin();
  const payload = { ActivityCustomerID: Number(contactId), ActivityNote: String(note) };
  const r = await fetch(`${base}/golfballs/crm/Admin/Activity/SaveLeadNote.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('note failed');
  return true;
}

async function crmSetDnc(customerID, add) {
  const base = crmOrigin();
  const action = add ? 'AddToDoNotCallList' : 'RemoveFromDoNotCallList';
  const r = await fetch(`${base}/golfballs/crm/Admin/Contact/${action}.ajax?${customerID}`, { credentials: 'include' });
  if (!r.ok) throw new Error('dnc failed');
}

/* Fetch + normalize a contact, parsing the CustomData JSON blob (which holds
   LinkedInURL / Archived / Context alongside server-managed dates). Returns
   the raw record plus a parsed `customData` object for the edit modal. */
export async function crmGetContact(customerId) {
  const res = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`, { credentials: 'include' });
  const cur = JSON.parse(await res.text());
  let customData = {};
  try { customData = cur.CustomData ? (typeof cur.CustomData === 'string' ? JSON.parse(cur.CustomData) : cur.CustomData) : {}; } catch (e) { customData = {}; }
  return { ...cur, customData };
}

export async function crmUpdateContact(customerId, edits) {
  const base = crmOrigin();
  const res = await fetch(`${base}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`, { credentials: 'include' });
  const cur = JSON.parse(await res.text());
  const has = (k) => Object.prototype.hasOwnProperty.call(edits, k);
  const pick = (k, src) => (has(k) ? edits[k] : (src == null ? '' : src));
  const payload = {
    customerId: String(customerId),
    firstName: pick('firstName', cur.firstName),
    middleInit: pick('middleInit', cur.middleInit),
    lastName: pick('lastName', cur.lastName),
    companyName: pick('companyName', cur.companyName),
    jobTitle: pick('jobTitle', cur.jobTitle),
    email: pick('email', cur.email),
    phoneNumber: pick('phoneNumber', cur.phoneNumber),
    zipCode: pick('zipCode', cur.zipCode),
    UserType: String(has('UserType') ? edits.UserType : (cur.userType == null ? 1 : cur.userType)),
    userCountry: pick('userCountry', cur.userCountry) || 'US',
    CustomData: mergeContactCustomData(cur.CustomData, edits),
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
}

/**
 * Persist account edits via the CRM's own Account/UpdateFromContactPage
 * endpoint. `edits` is a partial map keyed by DTO name (e.g.
 * { Name, AccountWebAddress, MainCity }); every unedited field is read
 * back from the live host form so the full payload matches what the
 * native Save would send — no field is blanked (Account/Get.ajax errors
 * on this CRM, so the host form is the source of truth). Throws with the
 * CRM's own ErrorMessage (+ ErrorFields) when the server rejects the
 * write, so the caller can toast it. Runs in the content-script world,
 * which shares the host page DOM, so the account inputs are reachable.
 * Payload/response contract lives in accountUpdate.js (unit-tested).
 */
export async function crmUpdateAccount(edits = {}) {
  const doc = (typeof document !== 'undefined') ? document : null;
  if (!doc) throw new Error('Account update needs a page context');
  const readEl = (id) => {
    const el = doc.getElementById(id) || doc.querySelector(`[name="${id}"]`);
    if (!el) return '';
    return (el.value != null ? el.value : (el.textContent || '')).toString();
  };
  const payload = buildAccountPayload(edits, readEl);
  /* Safety net: this is a FULL-replacement write sourced from the live
     form. If the native account form isn't present/loaded, the fields
     read empty and we'd blank the account. A real account always has an
     AccountID and a Name, so their absence means "form not there" — abort
     rather than post an empty payload. (The server's own required-field
     validation is only a partial backstop; not every field is required.) */
  if (!payload.AccountID || !payload.Name) {
    throw new Error('Account form not loaded — reload the page and try again');
  }

  const base = crmOrigin();
  const resp = await fetch(accountUpdateUrl(base, payload), { credentials: 'include' });
  if (!resp.ok) throw new Error(`CRM returned HTTP ${resp.status}`);
  return checkAccountResponse(await resp.text());
}


async function crmGetTask(taskId) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Task/Get.ajax?${taskId}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}

async function crmUpdateTaskFull(taskId, e) {
  const base = crmOrigin();
  const obj = await crmGetTask(taskId);
  const has = (k) => e[k] != null;
  const task = {
    TaskId: taskId,
    Subject: encodeURIComponent(has('Subject') ? e.Subject : (obj.Subject || '')),
    Description: encodeURIComponent(has('Description') ? e.Description : (obj.Description || '')),
    LiveDate: has('LiveDate') ? e.LiveDate : obj.LiveDate,
    DueDate: has('DueDate') ? e.DueDate : obj.DueDate,
    // taskCategoryID is the CRM enum wire value (see taskCategories.js) —
    // send the edited id when the modal changed it, else preserve.
    taskCategoryID: has('Category') ? Number(e.Category) : obj.taskCategoryID,
    taskStatusID: obj.taskStatusID,
    contactID: obj.contactID,
    employeeID: obj.employeeID,
    Priority: has('Priority') ? Number(e.Priority) : obj.Priority,
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Task/Update.ajax?${encodeURIComponent(JSON.stringify(task))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
}

export function toDateInput(s) {
  if (!s) return '';
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

export function fromDateInput(v) {
  const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : v;
}

export function priLabel(p) { return { 1: 'High', 2: 'Med', 3: 'Low' }[Number(p)] || String(p || ''); }

export function currentEmployeeId() {
  try {
    const memoryId = String(window.__gbEmployeeId || '').trim();
    if (/^\d{1,12}$/.test(memoryId) && Number(memoryId) > 0) return memoryId;
    const field = document.querySelector('#employeeID, #EmployeeID, #employeeId, #EmployeeId, [name="employeeID"], [name="EmployeeID"]');
    const fieldId = String(field?.value || field?.textContent || '').trim();
    if (/^\d{1,12}$/.test(fieldId) && Number(fieldId) > 0) return fieldId;
    for (const s of Array.from(document.scripts || [])) {
      const m = (s.textContent || '').match(/\b(?:employeeID|employeeId|adminUserID)\b\s*[:=]\s*["']?(\d{1,12})/i);
      if (m) return m[1];
    }
  } catch (e) {}
  return '0';
}

export function todayMDY() {
  try { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; } catch (e) { return ''; }
}

let __gbTaskTmp = 0;

/**
 * Allocate a page-local identifier for an optimistic task row.
 *
 * The counter stays private to this module so consumers cannot mutate an
 * imported ES-module binding. Server-issued task IDs replace these temporary
 * values as soon as a task is persisted.
 */
export function nextTaskTempId() {
  __gbTaskTmp += 1;
  return __gbTaskTmp;
}

export const OPP_STAGES = [
  { value: '1', label: 'Open' }, { value: '2', label: 'Proposed' }, { value: '3', label: 'Ordered' },
  { value: '4', label: 'Closed - Won' }, { value: '5', label: 'Closed - Lost' }, { value: '6', label: 'Automation' },
  { value: '7', label: 'Prospect' }, { value: '8', label: 'Qualified' },
];

export function toDateInputAny(s) {
  if (!s) return '';
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

export function toOppDate(v) { const m = (v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[2]}-${m[3]}-${m[1]}` : v; }

export async function crmGetOpportunity(id) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Opportunity/Get.ajax?${id}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}

async function crmSaveOpportunity(contactId, o) {
  const base = crmOrigin();
  const payload = {
    opportunityId: o.opportunityId || '',
    Subject: o.Subject || '',
    Description: o.Description || '',
    EstimatedClosedDate: o.EstimatedClosedDate || '',
    EstimatedValue: o.EstimatedValue || '0',
    OpportunityStageId: String(o.OpportunityStageId || '1'),
    empAssignedId: String(o.empAssignedId || '0'),
    contactId: Number(contactId),
    LeadID: null,
  };
  const action = payload.opportunityId ? 'Update' : 'Create';
  const r = await fetch(`${base}/golfballs/crm/Admin/Opportunity/${action}.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('opp save failed');
  let resp = {}; try { resp = JSON.parse(await r.text()); } catch (x) {}
  return { payload, resp };
}

async function crmSnooze(customerID, weeks) {
  const base = crmOrigin();
  const obj = { customerID: Number(customerID), snoozePoints: Number(weeks) || 0 };
  const r = await fetch(`${base}/golfballs/crm/Admin/Mailer/UpdateSnoozeTime.ajax?${encodeURIComponent(JSON.stringify(obj))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('snooze failed');
}

async function crmGetSnoozeWeeks(customerID) {
  try {
    const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Mailer/GetSnoozePoints.ajax?${customerID}`, { credentials: 'include' });
    const pts = Number(await r.text());
    return Number.isFinite(pts) ? Math.round(pts / 3) : '';
  } catch (e) { return ''; }
}

async function crmGetActivity(id) {
  const r = await fetch(`${crmOrigin()}/golfballs/crm/Admin/Activity/Get.ajax?${id}`, { credentials: 'include' });
  return JSON.parse(await r.text());
}

async function crmCreateLookup(contactId, lookupTypeId, content) {
  const base = crmOrigin();
  const obj = { lookupTypeId: Number(lookupTypeId), content: String(content), contactId: Number(contactId) };
  const r = await fetch(`${base}/golfballs/crm/Admin/Lookup/Create.ajax?${encodeURIComponent(JSON.stringify(obj))}`, { credentials: 'include' });
  if (!r.ok) throw new Error('lookup failed');
}

/* ── Hero layout, shared by every detail page ─────────────────
   HeroShell owns the card grid: [avatar column] | info | actions.
   Pass avatar=null for heroes without the 160px avatar column (opportunity).
   HeroAvatar is the standard round initials avatar with a corner badge. */
export function HeroShell({ avatar, actions, minActionsWidth = 200, children }) {
  return (
    <Card pad={0}>
      <div className="gbcp-hero-grid" style={{ display: 'grid', gridTemplateColumns: avatar ? '132px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', gap: 0 }}>
        {avatar && (
          <div className="gbcp-hero-avatar-cell" style={{
            padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRight: '1px solid var(--gb-border-subtle)',
            background: 'var(--gb-fill-faint)',
            position: 'relative',
          }}>{avatar}</div>
        )}
        <div style={{ padding: '15px 18px 0', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {children}
        </div>
        <div className="gbcp-hero-actions" style={{
          padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
          borderLeft: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-fill-faint)',
          minWidth: minActionsWidth,
        }}>
          {actions}
        </div>
      </div>
    </Card>
  );
}

export function HeroAvatar({ text, badge }) {
  return (
    <div style={{
      width: 76, height: 76, borderRadius: '50%',
      background: `linear-gradient(135deg, ${AVATAR_COLOR}, color-mix(in srgb, ${AVATAR_COLOR} 60%, black))`,
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 24, fontWeight: 600, letterSpacing: -.35,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 0 0 3px var(--gb-surface-1), 0 0 0 4px var(--gb-border-subtle)',
      position: 'relative',
    }}>
      {text}
      {badge}
    </div>
  );
}

/* The hero title row: h1 + tags, id pinned right. */
export function HeroTitleRow({ title, tags, id }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <h1 style={{
        margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: -.2,
        color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontFamily: 'var(--gb-font-sans)',
      }}>{title}</h1>
      {tags}
      {id && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-muted)', marginLeft: 'auto' }}>#{id}</span>}
    </div>
  );
}

/* The metadata strip under a hero's title/link rows. Contact pages use the
   inset treatment; account pages retain the edge-attached third row. */
export function HeroPillStrip({ children, inset = false }) {
  return (
    <div className="gbcp-hero-meta-strip" style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
      alignItems: 'stretch', gap: 0,
      minHeight: 48,
      margin: inset ? 'auto 0' : 'auto -18px 0',
      padding: inset ? '7px 8px' : '5px 18px 7px',
      background: 'var(--gb-surface-2)',
      border: inset ? '1px solid var(--gb-border-default)' : 0,
      borderTop: '1px solid var(--gb-border-default)',
      borderRadius: inset ? 'var(--gb-r-md)' : 0,
    }}>{children}</div>
  );
}

export function Hero({ onSendEmail }) {
  const D = useD();
  const { openModal } = useModal();
  const c = D.contact, a = D.account;
  // "City, ST 71801" — city/state comma-joined, zip space-appended.
  const cityState = [a.city, c.state].filter(Boolean).join(', ');
  const loc = [cityState, c.zipCode].filter(Boolean).join(' ').trim();
  const years = yearsSince(a.createdDate);
  const territory = txt(a.territoryName);
  return (
    <HeroShell
      avatar={<HeroAvatar text={initials(c.firstName, c.lastName)} badge={
        <div style={{
          position: 'absolute', bottom: 2, right: 2,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--gb-success)',
          border: '3px solid var(--gb-surface-1)',
          boxShadow: '0 0 6px var(--gb-success)',
        }} />
      } />}
      actions={<>
        <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<ContactEditModal />)}>Edit Contact</Btn>
        <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
        <Btn variant="tinted" status="info" icon={<I.send />} full onClick={() => {
          if (onSendEmail) onSendEmail();
          else { try { window.__gbOpenTemplate && window.__gbOpenTemplate(); } catch (e) {} }
        }}>Send Email</Btn>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <DncButton />
          <IconBtn size="sm" icon={<I.more />} />
        </div>
      </>}>
      <HeroTitleRow title={fullName(c) || 'Unknown Contact'} id={D.ids.contact} tags={<>
        {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
        {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
        {years != null && <Tag tone="neutral" size="md">Active · {years}y</Tag>}
      </>} />

      {/* Account link */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 13, color: 'var(--gb-text-tertiary)', fontWeight: 400, flexWrap: 'wrap',
      }}>
        <I.briefcase size={13} style={{ color: 'var(--gb-text-muted)' }} />
        <span>Works at</span>
        <a href={D.ids.account ? accountHref(D.ids.account) : '#'}
          onClick={(e) => { e.preventDefault(); if (D.ids.account) { recordBackTo((fullName(c) || 'Contact') + ' · #' + (D.ids.contact || '')); goUrl(accountHref(D.ids.account)); } }}
          style={{
            color: 'var(--gb-brand-label)', fontWeight: 500, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 4,
            cursor: D.ids.account ? 'pointer' : 'default',
          }}>
          {txt(a.name) || 'Account'}
          <I.ext size={11} />
        </a>
        {c.jobTitle && (<><span style={{ color: 'var(--gb-text-ghost)' }}>·</span><span>{c.jobTitle}</span></>)}
      </div>

      <HeroPillStrip inset>
        <ContactPill icon={<I.mail />}  label="Email" value={txt(c.email) || DASH} muted={isEmpty(c.email)} />
        <ContactPill icon={<I.phone />} label="Phone" value={txt(c.phone) || DASH} muted={isEmpty(c.phone)} />
        <ContactPill icon={<I.pin />}   label="Location" value={loc || DASH} muted={!loc} />
        <ContactPill icon={<I.linkedin />} label="LinkedIn" value={c.linkedInUrl ? 'Profile' : 'Add link'} muted={!c.linkedInUrl} />
      </HeroPillStrip>
    </HeroShell>
  );
}

export function EKV({ label, value, editing, mono, field, onEdit, copyable }) {
  if (!editing) return <KV label={label} mono={mono} copyable={copyable}>{value}</KV>;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '128px 1fr', gap: 12,
      padding: '5px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
      alignItems: 'center', minHeight: 28,
    }}>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>{label}</span>
      <input defaultValue={(value === 0 || value) ? String(value) : ''}
        readOnly={!(field && onEdit)}
        onChange={field && onEdit ? (e) => onEdit(field, e.target.value) : undefined}
        style={{
          width: '100%', height: 26, padding: '0 8px', boxSizing: 'border-box',
          background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-detail-text-primary, var(--gb-text-primary))',
          opacity: (field && onEdit) ? 1 : 0.55,
          fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
        }} />
    </div>
  );
}

export function EditToggle({ editing, setEditing, onSave }) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!onSave) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(); setEditing(false); } catch (e) { /* toast handled in onSave */ } finally { setBusy(false); }
  };
  return (
    <div key={editing ? 'editing' : 'viewing'} className="gbcp-edit-controls" style={{ display: 'flex', gap: 6 }}>
      {editing ? (
        <>
          <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</Btn>
          <Btn variant="primary" size="sm" icon={<I.check />} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
        </>
      ) : (
        <Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => setEditing(true)}>Edit</Btn>
      )}
    </div>
  );
}

export function ProofsPanel() {
  const D = useD();
  const rows = D.proofs;
  if (rows.length === 0) return null;   // only show when there are proofs
  return (
    <Card>
      <SectionTitle icon={<I.camera />} title="Logo Proofs" count={rows.length} sub="Artwork proofs & mockups" />
      {/* horizontal strip of proof cards (SubmitProof-style), custom scrollbar */}
      <div className="gb-scroll" style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 14, overflowX: 'auto', overflowY: 'hidden' }}>
        {rows.map((p, i) => <ProofCard key={i} p={p} />)}
      </div>
    </Card>
  );
}

export const inputStyle = {
  width: '100%', height: 30, padding: '0 9px', boxSizing: 'border-box',
  background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)',
  borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-detail-text-primary, var(--gb-text-primary))',
  fontFamily: 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
  colorScheme: 'dark',   // theme the native date/number pickers to the dark UI
};

export function FormField({ label, children, style }) {
  return <UIField label={label} style={style}>{children}</UIField>;
}

export function TInput({ onChange, ...rest }) {
  return <UIInput {...rest} onChange={(v) => onChange && onChange({ target: { value: v } })} />;
}

export function TArea({ onChange, ...rest }) {
  return <UITextarea resize="vertical" {...rest} onChange={(v) => onChange && onChange({ target: { value: v } })} />;
}

export function MiniSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { const p = (e.composedPath && e.composedPath()) || []; if (ref.current && p.indexOf(ref.current) === -1) setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [open]);
  const cur = options.find((o) => String(o.value) === String(value)) || options[0];
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
        <span>{cur ? cur.label : ''}</span>
        <I.chevd size={12} style={{ transition: 'transform var(--gb-anim)', transform: open ? 'rotate(180deg)' : 'none', color: 'var(--gb-text-muted)' }} />
      </button>
      {open && (
        <div className="gb-scroll" style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          maxHeight: 220, overflowY: 'auto',
          padding: 4, background: 'var(--gb-surface-modal)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)', boxShadow: 'var(--gb-shadow-popover)',
          display: 'flex', flexDirection: 'column', gap: 1, animation: 'gb-fade-slide var(--gb-anim) both',
        }}>
          {options.map((o) => {
            const sel = String(o.value) === String(value);
            return (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', border: 0, borderRadius: 'var(--gb-r-sm)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--gb-font-sans)', fontSize: 12, fontWeight: sel ? 700 : 500, background: sel ? 'var(--gb-brand-tint-soft)' : 'transparent', color: sel ? 'var(--gb-brand-label)' : 'var(--gb-text-secondary)' }}>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const PRIORITY_OPTS = [{ value: '1', label: 'High' }, { value: '2', label: 'Med' }, { value: '3', label: 'Low' }];

export function ModalShell({ title, icon, subtitle, children, footer, width = 460 }) {
  const { closeModal, closing } = useModal();
  return (
    <div onMouseDown={(e) => e.stopPropagation()} className="gb-modal"
      style={{
        width, maxWidth: '92%', display: 'flex', flexDirection: 'column',
        // Skin seam: --gb-modal-* (shared with FloatingPanel) reskin the shell.
        background: 'var(--gb-modal-bg, var(--gb-surface-1))',
        backdropFilter: 'var(--gb-modal-blur, none)', WebkitBackdropFilter: 'var(--gb-modal-blur, none)',
        border: 'var(--gb-modal-border, 1px solid var(--gb-border-default))',
        borderRadius: 'var(--gb-modal-radius, var(--gb-r-lg))', boxShadow: 'var(--gb-modal-shadow, var(--gb-shadow-modal, 0 24px 64px rgba(0,0,0,.5)))',
        // scale the modal to match the page (the takeover renders at PAGE_ZOOM;
        // the overlay is a 1x sibling, so without this the modal looks tiny).
        // overflow visible so a MiniSelect popover floats IN FRONT of the modal
        // instead of being clipped; header/footer wrappers keep rounded corners.
        zoom: PAGE_ZOOM, overflow: 'visible',
        animation: closing ? 'gb-pop-out .19s ease both' : 'gb-pop-in .22s cubic-bezier(.34,1.4,.64,1) both',
      }}>
      <div style={{ borderRadius: 'var(--gb-r-lg) var(--gb-r-lg) 0 0', overflow: 'hidden' }}>
        <ModalHeader icon={icon} title={title} subtitle={subtitle} onClose={closeModal} />
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      {footer && <div style={{ borderRadius: '0 0 var(--gb-r-lg) var(--gb-r-lg)', overflow: 'hidden' }}><ModalFooter>{footer}</ModalFooter></div>}
    </div>
  );
}

/* Task-category picker options for the modal (skip the '0' / "Select"
   placeholder — a real task always has a category, and the payload wants a
   concrete id). */
export const TASK_CATEGORY_SELECT = TASK_CATEGORY_OPTIONS.filter((o) => o.id !== '0').map((o) => ({ value: o.id, label: o.label }));

export function EditTaskModal({ taskId }) {
  const { closeModal } = useModal();
  const patch = usePatch();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ Subject: '', Description: '', DueDate: '', LiveDate: '', Category: '1', Priority: '2' });
  useEffect(() => {
    let live = true;
    crmGetTask(taskId)
      .then((o) => { if (live) {
        setT({
          Subject: o.Subject || '',
          Description: o.Description || '',
          DueDate: o.DueDate || '',
          LiveDate: o.LiveDate || '',
          Category: String(o.taskCategoryID || o.TaskCategoryID || '1'),
          Priority: String(o.Priority || 2),
        });
        setLoading(false);
      } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [taskId]);
  const save = async () => {
    setBusy(true);
    try {
      await crmUpdateTaskFull(taskId, t);
      const catLabel = (TASK_CATEGORY_SELECT.find((o) => o.value === String(t.Category)) || {}).label || '';
      patch((D) => ({ ...D, openTasks: (D.openTasks || []).map((x) => x.id === taskId ? { ...x, subject: t.Subject, dueDate: t.DueDate, liveDate: t.LiveDate, category: catLabel, priority: priLabel(t.Priority) } : x) }));
      closeModal();
    } catch (e) { gbToast('Could not update task', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Edit Task" icon={<I.task />} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || loading}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      {loading
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <FormField label="Subject"><TInput value={t.Subject} onChange={(e) => setT({ ...t, Subject: e.target.value })} /></FormField>
          <FormField label="Description"><TArea value={t.Description} onChange={(e) => setT({ ...t, Description: e.target.value })} rows={4} /></FormField>
          <FormField label="Category"><MiniSelect value={t.Category} options={TASK_CATEGORY_SELECT} onChange={(v) => setT({ ...t, Category: v })} /></FormField>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Live date" style={{ flex: 1 }}><DatePicker includeTime={false} value={toDateInput(t.LiveDate)} onChange={(v) => setT({ ...t, LiveDate: v ? fromDateInput(String(v).slice(0,10)) : "" })} /></FormField>
            <FormField label="Due date" style={{ flex: 1 }}><DatePicker includeTime={false} value={toDateInput(t.DueDate)} onChange={(v) => setT({ ...t, DueDate: v ? fromDateInput(String(v).slice(0,10)) : "" })} /></FormField>
            <FormField label="Priority" style={{ width: 120 }}>
              <MiniSelect value={t.Priority} options={PRIORITY_OPTS} onChange={(v) => setT({ ...t, Priority: v })} />
            </FormField>
          </div>
        </>}
    </ModalShell>
  );
}

export function OpportunityModal({ opportunityId }) {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const editing = !!opportunityId;
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [o, setO] = useState({ opportunityId: opportunityId || '', Subject: '', Description: '', EstimatedValue: '', EstimatedClosedDate: '', OpportunityStageId: '1', empAssignedId: '0' });
  // Assigned-to list comes straight from the CRM's own OpportunityModal
  // employee <select>, so it never drifts as staff change.
  const empOpts = useMemo(() => readHostSelectOptions('empAssignedId', [{ value: '0', label: 'Account Owner' }]), []);
  useEffect(() => {
    if (!editing) return;
    let live = true;
    crmGetOpportunity(opportunityId).then((g) => {
      if (!live) return;
      setO({
        opportunityId: String(opportunityId),
        Subject: g.Subject || '', Description: g.Description || '',
        EstimatedValue: g.EstimatedValue != null ? String(g.EstimatedValue) : '',
        EstimatedClosedDate: g.EstimatedClosedDate || g.EstimatedCloseDate || '',
        OpportunityStageId: String(g.OpportunityStageId || g.opportunityStageId || '1'),
        empAssignedId: String(g.empAssignedId || '0'),
      });
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { live = false; };
  }, [opportunityId]);
  const save = async () => {
    if (!o.Subject.trim() || busy) return;
    setBusy(true);
    try {
      const { payload, resp } = await crmSaveOpportunity(D.ids.contact, o);
      const id = payload.opportunityId || resp.opportunityId || `new-${nextTaskTempId()}`;
      const stageLabel = (OPP_STAGES.find((s) => s.value === payload.OpportunityStageId) || {}).label || '';
      const ownerLabel = (empOpts.find((option) => String(option.value) === String(payload.empAssignedId)) || {}).label || 'Account Owner';
      patch((Dd) => {
        const row = { id: String(id), subject: payload.Subject, owner: ownerLabel, stage: stageLabel, estimatedValue: Number(payload.EstimatedValue) || 0, estimatedCloseDate: payload.EstimatedClosedDate };
        const list = Dd.opportunities || [];
        const exists = list.some((x) => String(x.id) === String(id));
        return { ...Dd, opportunities: exists ? list.map((x) => String(x.id) === String(id) ? { ...x, ...row } : x) : [row, ...list] };
      });
      closeModal();
    } catch (e) { gbToast('Could not save opportunity', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title={editing ? 'Edit Opportunity' : 'New Opportunity'} icon={<I.target />} width={520} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || loading || !o.Subject.trim()}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      {loading
        ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <FormField label="Subject"><TInput autoFocus value={o.Subject} onChange={(e) => setO({ ...o, Subject: e.target.value })} /></FormField>
          <FormField label="Description"><TArea value={o.Description} onChange={(e) => setO({ ...o, Description: e.target.value })} rows={3} /></FormField>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Est. value" style={{ flex: 1 }}><TInput value={o.EstimatedValue} onChange={(e) => setO({ ...o, EstimatedValue: e.target.value })} placeholder="0" /></FormField>
            <FormField label="Est. close" style={{ flex: 1 }}><DatePicker includeTime={false} value={toDateInputAny(o.EstimatedClosedDate)} onChange={(v) => setO({ ...o, EstimatedClosedDate: v ? toOppDate(String(v).slice(0,10)) : "" })} /></FormField>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Stage" style={{ flex: 1 }}><MiniSelect value={o.OpportunityStageId} options={OPP_STAGES} onChange={(v) => setO({ ...o, OpportunityStageId: v })} /></FormField>
            <FormField label="Assigned to" style={{ flex: 1 }}><MiniSelect value={o.empAssignedId} options={empOpts} onChange={(v) => setO({ ...o, empAssignedId: v })} /></FormField>
          </div>
        </>}
    </ModalShell>
  );
}

/* Shared "Add note" modal — writes a REAL CRM Lead Note (crmSaveLeadNote) and
   optimistically prepends it to the activity feed. Used by the contact and
   account pages; replaces the old local-only note annotation layer. */
export function AddNoteModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (!D.ids.contact) { gbToast('No contact on this record to note', 'error'); return; }
    setBusy(true);
    try {
      await crmSaveLeadNote(D.ids.contact, t);
      patch((Dd) => ({ ...Dd, activities: [{ id: '', employee: 'You', category: 'Lead Note', subject: t, date: new Date().toLocaleString() }, ...(Dd.activities || [])] }));
      gbToast('Note added', 'success');
      closeModal();
    } catch (e) { gbToast('Could not add note', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Add Note" icon={<I.note />} subtitle="Saved to this contact's CRM activity feed" width={480} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Add note'}</Btn>
    </>}>
      <FormField label="Note"><TArea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Type a note about this contact…" /></FormField>
    </ModalShell>
  );
}

export function SnoozeModal() {
  const { closeModal } = useModal();
  const D = useD();
  const [weeks, setWeeks] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; crmGetSnoozeWeeks(D.ids.contact).then((w) => { if (live && w !== '') setWeeks(String(w)); }); return () => { live = false; }; }, []);
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try { await crmSnooze(D.ids.contact, weeks); closeModal(); }
    catch (e) { gbToast('Could not snooze mailer', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Snooze Mailer" icon={<I.send />} width={380} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Snooze'}</Btn>
    </>}>
      <FormField label="Weeks to snooze"><TInput type="number" min="0" autoFocus value={weeks} onChange={(e) => setWeeks(e.target.value)} placeholder="Enter number of weeks…" /></FormField>
    </ModalShell>
  );
}

export function ContactEditModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const c = D.contact;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  // Seed from the schema-extracted contact so the form paints instantly,
  // then reconcile with the authoritative Contact/Get (adds middle initial,
  // company, user type, and the CustomData fields the schema doesn't carry).
  const [f, setF] = useState({
    firstName: c.firstName || '', middleInit: '', lastName: c.lastName || '', companyName: '',
    jobTitle: c.jobTitle || '', email: c.email || '', phoneNumber: c.phone || '',
    zipCode: c.zipCode || '', userCountry: c.country || 'US', UserType: '1',
    LinkedInURL: '', Archived: false, Context: '',
  });
  useEffect(() => {
    let live = true;
    crmGetContact(D.ids.contact)
      .then((g) => { if (!live) return;
        const cd = g.customData || {};
        setF({
          firstName: g.firstName || '', middleInit: g.middleInit || '', lastName: g.lastName || '',
          companyName: g.companyName || '', jobTitle: g.jobTitle || '', email: g.email || '',
          phoneNumber: g.phoneNumber || '', zipCode: g.zipCode || '',
          userCountry: g.userCountry || 'US', UserType: String(g.userType == null ? 1 : g.userType),
          LinkedInURL: cd.LinkedInURL || '', Archived: !!cd.Archived, Context: cd.Context || '',
        });
        setLoading(false);
      })
      .catch(() => { if (live) setLoading(false); });   // keep the seeded values
    return () => { live = false; };
  }, [D.ids.contact]);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await crmUpdateContact(D.ids.contact, f);
      patch((Dd) => ({ ...Dd,
        contact: { ...Dd.contact, firstName: f.firstName, lastName: f.lastName, jobTitle: f.jobTitle, email: f.email, phone: f.phoneNumber, zipCode: f.zipCode, country: f.userCountry, linkedInUrl: f.LinkedInURL, archived: f.Archived },
        account: { ...Dd.account, name: f.companyName || Dd.account.name, contextNotes: f.Context, linkedInUrl: f.LinkedInURL },
      }));
      closeModal();
    } catch (e) { gbToast('Could not save contact', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Edit Contact" icon={<I.user />} width={560} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="First name" style={{ flex: 1 }}><TInput autoFocus value={f.firstName} onChange={set('firstName')} /></FormField>
        <FormField label="MI" style={{ width: 64 }}><TInput value={f.middleInit} onChange={set('middleInit')} maxLength={4} /></FormField>
        <FormField label="Last name" style={{ flex: 1 }}><TInput value={f.lastName} onChange={set('lastName')} /></FormField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Company" style={{ flex: 1 }}><TInput value={f.companyName} onChange={set('companyName')} /></FormField>
        <FormField label="Job title" style={{ flex: 1 }}><TInput value={f.jobTitle} onChange={set('jobTitle')} /></FormField>
      </div>
      <FormField label="Email"><TInput value={f.email} onChange={set('email')} /></FormField>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Phone" style={{ flex: 1 }}><TInput value={f.phoneNumber} onChange={set('phoneNumber')} /></FormField>
        <FormField label="Zip" style={{ width: 110 }}><TInput value={f.zipCode} onChange={set('zipCode')} /></FormField>
        <FormField label="Country" style={{ width: 150 }}><MiniSelect value={f.userCountry} options={CONTACT_COUNTRY_OPTS} onChange={(v) => setF((p) => ({ ...p, userCountry: v }))} /></FormField>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="User type" style={{ flex: 1 }}><MiniSelect value={f.UserType} options={CONTACT_USER_TYPE_OPTS} onChange={(v) => setF((p) => ({ ...p, UserType: v }))} /></FormField>
        <FormField label="LinkedIn URL" style={{ flex: 1 }}><TInput value={f.LinkedInURL} onChange={set('LinkedInURL')} placeholder="https://linkedin.com/in/…" /></FormField>
      </div>
      <FormField label="Context"><TArea value={f.Context} onChange={set('Context')} rows={3} placeholder="Internal context notes…" /></FormField>
      <div onClick={() => setF((p) => ({ ...p, Archived: !p.Archived }))}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 'var(--gb-r-md)', border: '1px solid ' + (f.Archived ? 'var(--gb-warning-tint-border)' : 'var(--gb-border-subtle)'), background: f.Archived ? 'var(--gb-warning-tint-soft)' : 'var(--gb-fill-faint)', cursor: 'pointer', transition: 'all var(--gb-anim)' }}>
        {/* themed toggle switch */}
        <span style={{ width: 34, height: 19, borderRadius: 99, flexShrink: 0, padding: 2, background: f.Archived ? 'var(--gb-warning-fg)' : 'var(--gb-border-strong)', display: 'flex', alignItems: 'center', justifyContent: f.Archived ? 'flex-end' : 'flex-start', transition: 'background var(--gb-anim)' }}>
          <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.35)', transition: 'all var(--gb-anim)' }} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: f.Archived ? 'var(--gb-warning-fg)' : 'var(--gb-text-secondary)' }}>Archived</div>
          <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)' }}>{f.Archived ? 'This contact is archived (hidden from active lists).' : 'Active contact.'}</div>
        </div>
        <I.arch size={14} style={{ color: f.Archived ? 'var(--gb-warning-fg)' : 'var(--gb-text-ghost)', flexShrink: 0 }} />
      </div>
    </ModalShell>
  );
}

export function LookupModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const D = useD();
  const [type, setType] = useState('2');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      await crmCreateLookup(D.ids.contact, type, value.trim());
      patch((Dd) => ({ ...Dd, lookups: [{ type: type === '1' ? 'Email' : 'Phone', value: value.trim() }, ...(Dd.lookups || [])] }));
      closeModal();
    } catch (e) { gbToast('Could not add lookup', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Add Lookup" icon={<I.plus />} width={400} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !value.trim()}>{busy ? 'Adding…' : 'Add'}</Btn>
    </>}>
      <FormField label="Type"><MiniSelect value={type} options={[{ value: '2', label: 'Phone' }, { value: '1', label: 'Email' }]} onChange={setType} /></FormField>
      <FormField label="Value"><TInput autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); }} /></FormField>
    </ModalShell>
  );
}

export function ActivityDetailModal({ activityId }) {
  const { closeModal } = useModal();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    crmGetActivity(activityId).then((d) => { if (live) setA(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [activityId]);
  let meta = {};
  try { if (a && a.MetaData) meta = JSON.parse(a.MetaData); } catch (e) {}
  const description = a && (a.ActivityDescription || a.Description || '');
  const subject = a && (a.ActivitySubject || a.Subject || '');
  const transcriptSource = isChatTranscript(description) ? description : (isChatTranscript(subject) ? subject : '');
  const transcript = transcriptSource ? parseChat(transcriptSource).messages : [];
  const row = (label, val) => (val === 0 || val) ? (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px dashed var(--gb-border-subtle)' }}>
      <span style={{ width: 112, fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--gb-text-secondary)' }}>{String(val)}</span>
    </div>
  ) : null;
  return (
    <ModalShell title={transcript.length ? 'Live Chat Transcript' : 'Activity Detail'} icon={transcript.length ? <I.chat /> : <I.history />} width={transcript.length ? 720 : 480} footer={<Btn variant="ghost" size="sm" onClick={closeModal}>Close</Btn>}>
      {err
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Couldn’t load activity.</div>
        : !a
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))' }}>{transcript.length ? 'Customer conversation' : (subject || 'Activity')}</div>
          {transcript.length ? <ChatTranscript messages={transcript} /> : description && <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.5, padding: '9px 11px', background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-sm)', whiteSpace: 'pre-wrap' }}>{description}</div>}
          <div>
            {row('Direction', a.Direction)}
            {row('Employee', a.Employee)}
            {row('Date', a.CreatedDate)}
            {row('Name', [meta.FirstName, meta.LastName].filter(Boolean).join(' '))}
            {row('Phone', meta.PhoneNumber)}
            {row('Email', meta.Email)}
            {meta.Duration ? row('Duration', `${meta.Duration}s`) : null}
            {meta.LeftVoicemail != null ? row('Left voicemail', meta.LeftVoicemail ? 'Yes' : 'No') : null}
          </div>
        </>}
    </ModalShell>
  );
}

function ChatTranscript({ messages }) {
  return (
    <div className="gb-scroll" style={{ maxHeight: 'min(560px, 65vh)', overflowY: 'auto', padding: '12px 14px', background: 'var(--gb-surface-canvas)', border: '1px solid var(--gb-border-subtle)', borderRadius: 'var(--gb-r-md)', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {messages.map((message, index) => {
        if (message.kind === 'link') {
          const href = safeChatTranscriptUrl(message.body);
          return href ? <a key={index} href={href} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 3, padding: '6px 10px', borderRadius: 'var(--gb-r-pill)', border: '1px solid var(--gb-border-default)', background: 'var(--gb-fill-subtle)', color: 'var(--gb-brand-label)', textDecoration: 'none', fontSize: 10.5, fontWeight: 650 }}><I.ext size={10} />Open original SnapEngage transcript</a> : null;
        }
        if (message.kind === 'system') return <div key={index} style={{ alignSelf: 'center', maxWidth: '80%', padding: '4px 9px', borderRadius: 'var(--gb-r-pill)', background: 'var(--gb-fill-subtle)', color: 'var(--gb-text-muted)', fontSize: 10.5, textAlign: 'center' }}>{message.time && <span style={{ fontFamily: 'var(--gb-font-mono)', marginRight: 6 }}>{message.time}</span>}{message.body}</div>;
        if (message.kind === 'note') return <div key={index} style={{ alignSelf: 'center', maxWidth: '90%', padding: '7px 10px', borderLeft: '2px solid var(--gb-border-strong)', color: 'var(--gb-text-muted)', fontSize: 11.5 }}>{message.body}</div>;
        const visitor = message.kind === 'visitor';
        const bot = /\bbot\b/i.test(message.name || '');
        return (
          <div key={index} style={{ alignSelf: visitor ? 'flex-start' : 'flex-end', width: 'min(78%, 520px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: visitor ? 'flex-start' : 'flex-end', gap: 7, margin: '0 3px 3px', fontSize: 9.5, color: 'var(--gb-text-muted)' }}>
              <span style={{ fontWeight: 750, color: bot ? 'var(--gb-text-muted)' : visitor ? 'var(--gb-success-fg)' : 'var(--gb-brand-label)' }}>{message.name || (visitor ? 'Visitor' : 'Agent')}</span>
              <span style={{ fontFamily: 'var(--gb-font-mono)' }}>{message.time}</span>
            </div>
            <div style={{ padding: '8px 11px', borderRadius: visitor ? '4px 12px 12px 12px' : '12px 4px 12px 12px', border: `1px solid ${bot ? 'var(--gb-border-default)' : visitor ? 'var(--gb-success-tint-border)' : 'var(--gb-brand-tint-border)'}`, background: bot ? 'var(--gb-fill-subtle)' : visitor ? 'var(--gb-success-tint-soft)' : 'var(--gb-brand-tint-soft)', color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</div>
          </div>
        );
      })}
    </div>
  );
}

export const QT_KEY = 'gbCpQuickTasks';

export const QL_KEY = 'gbCpQuickLogs';

export function loadTpls(key) {
  return new Promise((res) => {
    try { chrome.storage.local.get(key, (d) => res(Array.isArray(d && d[key]) ? d[key] : [])); }
    catch (e) { res([]); }
  });
}

export function useTemplates(key) {
  const [list, setList] = useState([]);
  useEffect(() => {
    let live = true;
    loadTpls(key).then((l) => { if (live) setList(l); });
    const onCh = (ch, area) => { if (area === 'local' && ch[key]) setList(Array.isArray(ch[key].newValue) ? ch[key].newValue : []); };
    try { chrome.storage.onChanged.addListener(onCh); } catch (e) {}
    return () => { live = false; try { chrome.storage.onChanged.removeListener(onCh); } catch (e) {} };
  }, [key]);
  const persist = (next) => { setList(next); try { chrome.storage.local.set({ [key]: next }); } catch (e) {} };
  return {
    list,
    add: (tpl) => persist([...list, { ...tpl, id: `q${Date.now()}${Math.floor(Math.random() * 1e4)}` }]),
    update: (id, tpl) => persist(list.map((x) => (x.id === id ? { ...x, ...tpl } : x))),
    remove: (id) => persist(list.filter((x) => x.id !== id)),
  };
}

export function loadExisting(kind) { return kind === 'call' ? loadCallTemplates() : loadTaskTemplates(); }

export function TemplateModal({ kind, initial, onSave, onDelete }) {
  const { closeModal } = useModal();
  const isCall = kind === 'call';
  const [f, setF] = useState(initial || { label: '', templateId: '' });
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    let live = true;
    loadExisting(kind).then((l) => { if (live) setOpts((l || []).map((t) => ({ value: String(t.id), label: t.name || t.subject || String(t.id) }))); });
    return () => { live = false; };
  }, [kind]);
  const save = () => {
    if (!f.label.trim() || !f.templateId) return;
    const opt = (opts || []).find((o) => o.value === String(f.templateId));
    onSave({ label: f.label.trim(), templateId: String(f.templateId), templateName: opt ? opt.label : '' });
    closeModal();
  };
  return (
    <ModalShell width={440} icon={isCall ? <I.phone /> : <I.task />}
      title={initial ? 'Edit Button' : isCall ? 'New Quick Log' : 'New Quick Task'}
      footer={<>
        {initial && onDelete && <Btn variant="danger" size="sm" onClick={() => { onDelete(); closeModal(); }}>Delete</Btn>}
        <div style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" onClick={closeModal}>Cancel</Btn>
        <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={!f.label.trim() || !f.templateId}>Save</Btn>
      </>}>
      <FormField label="Button label"><TInput value={f.label} autoFocus placeholder={isCall ? 'e.g. Promo VM' : 'e.g. F-UP'} onChange={(e) => setF({ ...f, label: e.target.value })} /></FormField>
      <FormField label={isCall ? 'Call template' : 'Task template'}>
        {opts === null
          ? <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '6px 0' }}>Loading…</div>
          : opts.length
          ? <MiniSelect value={f.templateId} options={[{ value: '', label: 'Select a template…' }, ...opts]} onChange={(v) => setF({ ...f, templateId: v })} />
          : <div style={{ fontSize: 11.5, color: 'var(--gb-text-muted)', padding: '6px 0' }}>No saved {isCall ? 'call' : 'task'} templates yet — create them in the {isCall ? 'Call Log' : 'Quick Task'} editor first.</div>}
      </FormField>
    </ModalShell>
  );
}

export function DncButton({ full = false }) {
  const D = useD();
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  const onClick = async () => {
    const id = D.ids.contact;
    if (!id || busy || removed) return;
    setBusy(true);
    try { await crmSetDnc(id, false); setRemoved(true); }   // button shows "Removed" (no toast)
    catch (e) { gbToast('Could not update Do-Not-Call', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Btn variant="secondary" size="sm" icon={<I.ban />} full={full} disabled={busy || removed} onClick={onClick}>
      {removed ? 'Removed from DNC' : busy ? 'Removing…' : 'Remove from DNC'}
    </Btn>
  );
}

export function OpportunitiesPanel({ canCreate = true }) {
  const D = useD();
  const { openModal } = useModal();
  // Default sort: active pipeline first — open/proposed stages at the top,
  // everything else (won/lost/closed) below, keeping original order within.
  const opps = [...(D.opportunities || [])].sort(
    (a, b) => (/open|propos/i.test(String(a?.stage || '')) ? 0 : 1) - (/open|propos/i.test(String(b?.stage || '')) ? 0 : 1),
  );
  return (
    <Card>
      <SectionTitle
        icon={<I.target />} title="Opportunities" count={D.opportunities.length}
        sub={canCreate ? 'Pipeline for this contact' : 'Pipeline for this account'}
        right={canCreate ? <Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => openModal(<OpportunityModal />)}>New opportunity</Btn> : null}
      />
      <ScrollArea max={420}>
      <table style={tableStyle}>
        <thead><tr>
          <Th>ID</Th>
          <Th>Subject</Th>
          <Th>Owner</Th>
          <Th align="right">Est. Value</Th>
          <Th align="right">Est. Close</Th>
          <Th align="center">Stage</Th>
          <Th align="right">Actions</Th>
        </tr></thead>
        <tbody>
          {opps.map((o, i) => (
            <tr key={i} style={trStyle}>
              <Td><span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', fontWeight: 600 }}>{o.id}</span></Td>
              <Td><span style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontWeight: 400 }}>{o.subject}</span></Td>
              <Td muted>{txt(o.owner) || DASH}</Td>
              <Td align="right"><span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 600, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))' }}>{fmt$(o.estimatedValue)}</span></Td>
              <Td align="right" mono muted>{fmtDate(o.estimatedCloseDate)}</Td>
              <Td align="center">{o.stage ? <Tag tone={opportunityStageTone(o.stage)} size="xs">{o.stage}</Tag> : DASH}</Td>
              <Td align="right">
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" size="xs" iconRight={<I.ext />} onClick={() => { if (o.id) goUrl(oppHref(o.id)); }}>Open</Btn>
                  <Btn variant="tinted" size="xs" icon={<I.edit />} onClick={() => openModal(<OpportunityModal opportunityId={o.id} />)}>Edit</Btn>
                </div>
              </Td>
            </tr>
          ))}
          {D.opportunities.length === 0 && <EmptyRow colSpan={7} label="No opportunities." />}
        </tbody>
      </table>
      </ScrollArea>
    </Card>
  );
}

export function AccountInfoCard() {
  const D = useD();
  const a = D.account;
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <SectionTitle
        icon={<I.briefcase />} title="Account Information"
        sub={`#${D.ids.account || DASH} · ${txt(a.name) || DASH}`}
        right={<EditToggle editing={editing} setEditing={setEditing} />}
      />
      <div key={editing ? 'edit' : 'view'} className="gbcp-edit-body" style={{ padding: '8px 18px 14px' }}>
        <EKV label="Account Name" value={txt(a.name)} editing={editing} />
        <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
        <EKV label="Industry" value={txt(a.industry)} editing={editing} />
        <EKV label="Web Address" value={txt(a.webAddress)} editing={editing} />
        <EKV label="City" value={txt(a.city)} editing={editing} />
        <EKV label="State" value={txt(a.state)} editing={editing} />
        {editing
          ? <EKV label="Territory" value={txt(a.territoryName)} editing />
          : (
            <KV label="Territory">
              {a.territoryName ? <Tag tone="brand" size="sm">{a.territoryName}</Tag> : DASH}
              {a.salesRep && <span style={{ marginLeft: 6, color: 'var(--gb-text-tertiary)' }}>{a.salesRep}</span>}
            </KV>
          )}
        <EKV label="User Type" value={txt(a.userType)} editing={editing} />
        <EKV label="Tax Exempt" value={a.taxExempt ? 'Yes' : 'No'} editing={editing} />
        <EKV label="Credit Approved" value={fmtDate(a.creditApproved) === DASH ? '' : fmtDate(a.creditApproved)} editing={editing} />
        <EKV label="LinkedIn URL" value={txt(a.linkedInUrl)} editing={editing} />
        <EKV label="Context" value={txt(a.contextNotes)} editing={editing} />
      </div>
    </Card>
  );
}

export function ContactInfoCard() {
  const D = useD();
  const patch = usePatch();
  const c = D.contact, a = D.account;
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(0);   // bump → confirmation pulse
  const draft = useRef({});
  const onEdit = (f, v) => { draft.current[f] = v; };
  const save = async () => {
    const id = D.ids.contact;
    if (!id) { gbToast('No contact id', 'error'); throw new Error('no id'); }
    const e = draft.current;
    try {
      await crmUpdateContact(id, e);
      // Optimistically reflect the saved values everywhere (card + Hero name).
      patch((prev) => ({ ...prev, contact: { ...prev.contact,
        ...(e.firstName != null && { firstName: e.firstName }),
        ...(e.lastName != null && { lastName: e.lastName }),
        ...(e.jobTitle != null && { jobTitle: e.jobTitle }),
        ...(e.email != null && { email: e.email }),
        ...(e.phoneNumber != null && { phone: e.phoneNumber }),
        ...(e.zipCode != null && { zipCode: e.zipCode }),
        ...(e.userCountry != null && { country: e.userCountry }),
      } }));
      draft.current = {};
      setSaved((n) => n + 1);   // confirmation pulse on the card (no toast)
    } catch (err) { gbToast('Could not save contact', 'error'); throw err; }
  };
  return (
    <Card key={`cic${saved}`} className={saved ? 'gb-saved' : undefined}>
      <SectionTitle
        icon={<I.user />} title="Contact Information"
        sub={`#${D.ids.contact || DASH}`}
        right={<EditToggle editing={editing} setEditing={setEditing} onSave={save} />}
      />
      <div key={editing ? 'edit' : 'view'} className="gbcp-edit-body" style={{ padding: '8px 18px 14px' }}>
        <EKV label="First Name" value={txt(c.firstName)} editing={editing} field="firstName" onEdit={onEdit} />
        <EKV label="Last Name" value={txt(c.lastName)} editing={editing} field="lastName" onEdit={onEdit} />
        <EKV label="Job Title" value={txt(c.jobTitle)} editing={editing} field="jobTitle" onEdit={onEdit} />
        <EKV label="Email" value={txt(c.email)} editing={editing} field="email" onEdit={onEdit} copyable />
        <EKV label="Phone" value={txt(c.phone)} editing={editing} field="phoneNumber" onEdit={onEdit} copyable />
        {/* State lives on the account, not the contact Update payload — read-only here */}
        <EKV label="State" value={txt(c.state)} editing={editing} />
        <EKV label="Zip" value={txt(c.zipCode)} editing={editing} mono field="zipCode" onEdit={onEdit} />
        <EKV label="Country" value={txt(c.country)} editing={editing} field="userCountry" onEdit={onEdit} />
        <KV label="Created By">{txt(a.createdBy)}</KV>
        <KV label="Created On" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        <KV label="Last Modified" mono>{fmtDateTime(a.modifiedDate) === DASH ? null : fmtDateTime(a.modifiedDate)}</KV>
        <EKV label="Archived" value={c.archived ? 'Yes' : 'No'} editing={editing} />
      </div>
    </Card>
  );
}

export function AltLookupsCard() {
  const D = useD();
  const { openModal } = useModal();
  const lookups = [];
  if (D.contact.phone) lookups.push({ type: 'Phone', value: D.contact.phone, primary: true });
  if (D.contact.email) lookups.push({ type: 'Email', value: D.contact.email, primary: true });
  (D.lookups || []).forEach((l) => lookups.push({ type: l.type || 'Lookup', value: l.value || l.content }));
  return (
    <Card>
      <SectionTitle
        icon={<I.search />} title="Alternate Lookups" count={lookups.length}
        right={<IconBtn size="xs" ghost icon={<I.plus />} title="Add lookup" onClick={() => openModal(<LookupModal />)} />}
      />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {lookups.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '8px 10px',
            background: 'var(--gb-fill-faint)',
            border: '1px solid var(--gb-border-subtle)',
            borderRadius: 'var(--gb-r-sm)',
          }}>
            {l.type === 'Phone' ? <I.phone size={12} style={{ color: 'var(--gb-text-muted)' }}/> : <I.mail size={12} style={{ color: 'var(--gb-text-muted)' }}/>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, color: 'var(--gb-text-muted)', textTransform: 'uppercase', letterSpacing: .7, fontWeight: 700 }}>{l.type}</div>
              <div style={{ fontSize: 11.5, color: 'var(--gb-text-secondary)', fontWeight: 500, fontFamily: 'var(--gb-font-mono)' }}>{l.value}</div>
            </div>
            {l.primary && <Tag tone="brand" size="xs">Primary</Tag>}
          </div>
        ))}
        {lookups.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>No lookups.</div>
        )}
      </div>
    </Card>
  );
}

export function MailerCard() {
  const D = useD();
  const { openModal } = useModal();
  const s = D.stats;
  const removed = num(s.mailerRemoved) ? true : false;
  return (
    <Card>
      <SectionTitle
        icon={<I.send />} title="Mailer"
        sub="Subscription & engagement"
        right={<IconBtn size="xs" ghost icon={<I.cog />} />}
      />
      <div style={{ padding: '4px 18px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>Status</div>
            <div style={{ fontSize: 13, color: removed ? 'var(--gb-text-tertiary)' : 'var(--gb-success-fg)', fontWeight: 700, marginTop: 1 }}>
              {removed ? 'Removed' : 'Subscribed'}
            </div>
          </div>
          <Tag tone={removed ? 'neutral' : 'success'} size="md" icon={<Dot tone={removed ? 'muted' : 'success'} glow={!removed} />}>{removed ? 'Inactive' : 'Active'}</Tag>
        </div>
        <KV label="Mailer Points" mono>{txt(num(s.mailerPoints) ?? 0)}</KV>
        <KV label="Removed">{removed ? 'Yes' : 'No'}</KV>
        <KV label="Last Touch" mono>{fmtDate(s.mailerTouchDate) === DASH ? null : fmtDate(s.mailerTouchDate)}</KV>
        <KV label="Last Bounce" mono>{txt(s.lastBounceCode)}</KV>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 12 }}>
          <Btn variant="tinted" status="warning" size="sm" full onClick={() => openModal(<SnoozeModal />)}>Snooze</Btn>
          <Btn variant="tinted" status="error" size="sm" full>Remove</Btn>
        </div>
      </div>
    </Card>
  );
}

export function OpenTaskRow({ t }) {
  const patch = usePatch();
  const { openModal } = useModal();
  const [state, setState] = useState('idle'); // idle | busy | done
  const complete = async () => {
    if (!t.id || state !== 'idle') return;
    setState('busy');
    try {
      await completeTaskById(t.id);
      setState('done');                                       // check fills + strike (no toast)
      setTimeout(() => setState('leaving'), 280);             // then fade/slide out
      setTimeout(() => patch((D) => ({
        ...D,
        openTasks: (D.openTasks || []).filter((x) => x.id !== t.id),
        doneTasks: [{ ...t, status: 'Complete' }, ...(D.doneTasks || [])],   // appears in Completed
      })), 660);
    } catch (e) { setState('idle'); gbToast('Could not complete task', 'error'); }
  };
  const done = state === 'done' || state === 'leaving';
  const leaving = state === 'leaving';
  const priorityTone = priTone(t.priority);
  const due = toDateInputAny(t.dueDate);
  const dueTime = due ? new Date(`${due}T12:00:00`).getTime() : NaN;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dueColor = Number.isFinite(dueTime) && dueTime < today.getTime()
    ? 'var(--gb-error-fg)'
    : Number.isFinite(dueTime) && dueTime < today.getTime() + (7 * 86400000)
      ? 'var(--gb-warning-fg)'
      : 'var(--gb-text-secondary)';
  return (
    <tr style={{
      ...trStyle,
      opacity: leaving ? 0 : (done ? 0.75 : 1),
      transform: leaving ? 'translateX(12px)' : 'none',
      transition: 'opacity .4s ease, transform .4s ease',
    }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <TaskCheckbox tone="success" done={done} disabled={state !== 'idle'} onClick={complete} title="Complete task" />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontWeight: 500, lineHeight: 1.3, textDecoration: done ? 'line-through' : 'none' }}>{t.subject}</div>
            {t.id && <div style={{ marginTop: 2, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', fontSize: 9.5 }}>#{t.id}</div>}
          </div>
        </div>
      </Td>
      <Td muted>{txt(t.owner) || DASH}</Td>
      <Td muted>{t.category || DASH}</Td>
      <Td><Tag tone={priorityTone} size="xs">{t.priority || DASH}</Tag></Td>
      <Td align="right" mono muted>{fmtDate(t.liveDate)}</Td>
      <Td align="right" mono><span style={{ color: dueColor }}>{fmtDate(t.dueDate)}</span></Td>
      <Td align="right">
        <IconBtn ghost size="xs" icon={<I.edit />} title="Edit task" disabled={state !== 'idle'} onClick={() => openModal(<EditTaskModal taskId={t.id} />)} />
      </Td>
    </tr>
  );
}

export function Sidebar({ collapsed, setCollapsed, currentLabel, currentPage }) {
  const D = useD();
  const [openIds, setOpenIds] = useState(['crm']);
  const toggle = (id) => setOpenIds((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const repName = txt(D.account && D.account.salesRep) || 'Sales workspace';
  const territory = txt(D.account && D.account.territoryName) || 'Golfballs Admin';
  const repMark = repName === 'Sales workspace'
    ? 'GB'
    : repName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <aside className="gb-sidebar gb-chrome" style={{
      ...ARMOR,
      fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-tertiary)',
      width: collapsed ? 56 : 232, flexShrink: 0,
      // Skin seam: --gb-chrome-* frost the sidebar to match the header.
      background: 'var(--gb-chrome-bg, var(--gb-surface-canvas))',
      backdropFilter: 'var(--gb-chrome-blur, none)',
      WebkitBackdropFilter: 'var(--gb-chrome-blur, none)',
      borderRight: '1px solid var(--gb-chrome-border, var(--gb-border-subtle))',
      // Fill the flex row's height (the viewport) — NOT 100vh, which the
      // page zoom would inflate past the screen. The nav scrolls inside.
      height: '100%', alignSelf: 'stretch',
      display: 'flex', flexDirection: 'column',
      /* clearly-visible open/close slide; overflow:hidden clips content
         as the width animates so it slides rather than reflowing abruptly */
      transition: 'width 0.28s cubic-bezier(.4,0,.2,1)',
      willChange: 'width',
      overflow: 'hidden',
    }}>
      {/* Brand + collapse/expand toggle. When collapsed, the brand row
          becomes a single centered expand button so the sidebar can always
          be reopened. */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0' : '0 14px',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8, borderBottom: '1px solid var(--gb-border-subtle)', flexShrink: 0,
      }}>
        {collapsed ? (
          <IconBtn size="sm" icon={<I.chevr />} onClick={() => setCollapsed(false)} title="Expand sidebar" />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 7,
                background: 'linear-gradient(135deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--gb-text-on-brand)',
                boxShadow: '0 0 0 1px var(--gb-brand-border)', flexShrink: 0,
              }}>GB</div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', letterSpacing: -.05, whiteSpace: 'nowrap' }}>Golfballs Admin</span>
            </div>
            <IconBtn size="xs" ghost icon={<I.chevr style={{ transform: 'scaleX(-1)' }} />} onClick={() => setCollapsed(true)} title="Collapse sidebar" />
          </>
        )}
      </div>

      {/* Nav — scrolls inside the fixed-height sidebar */}
      <nav className="gb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
        {NAV.map((g) => {
          const isOpen = openIds.includes(g.id);
          const hasChildren = Array.isArray(g.children) && g.children.length > 0;
          return (
            <div key={g.id} style={{ marginBottom: 1 }}>
              <button onClick={() => { if (hasChildren && !collapsed) toggle(g.id); else if (TOP_PAGE[g.id]) crmGo(TOP_PAGE[g.id]); }}
                title={collapsed ? g.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 10, padding: collapsed ? '8px 0' : '7px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: g.active ? 'var(--gb-brand-tint-soft)' : 'transparent',
                  border: '1px solid ' + (g.active ? 'var(--gb-brand-tint-border)' : 'transparent'),
                  borderRadius: 'var(--gb-r-sm)',
                  cursor: 'pointer', textAlign: 'left',
                  color: g.active ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)',
                  fontFamily: 'var(--gb-font-sans)',
                  fontSize: 12, fontWeight: g.active ? 600 : 500, letterSpacing: -.05,
                  transition: 'all var(--gb-anim)',
                }}
                onMouseEnter={(e) => { if (!g.active) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; e.currentTarget.style.color = 'var(--gb-detail-text-primary, var(--gb-text-primary))'; }}
                onMouseLeave={(e) => { if (!g.active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--gb-text-tertiary)'; } }}
              >
                {React.cloneElement(g.icon, { size: 14 })}
                {!collapsed && <span style={{ flex: 1 }}>{g.label}</span>}
                {!collapsed && hasChildren && (
                  <I.chevd size={10} style={{
                    transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)',
                    transition: 'transform var(--gb-anim)',
                    opacity: .6,
                  }} />
                )}
              </button>
              {/* Children — animated open/close (max-height + opacity)
                  instead of an instant pop. */}
              {!collapsed && hasChildren && (
                <div style={{
                  overflow: 'hidden',
                  maxHeight: isOpen ? 800 : 0,
                  opacity: isOpen ? 1 : 0,
                  transition: 'max-height .28s cubic-bezier(.4,0,.2,1), opacity .2s ease',
                }}>
                <div style={{ padding: '2px 0 6px 22px', display: 'flex', flexDirection: 'column' }}>
                  {g.children.map((c, i) => {
                    const obj = typeof c === 'string' ? { label: c } : c;
                    // When highlighting an EXISTING child (currentPage, e.g. the
                    // search page → "Search"), drop the "__CURRENT__" record
                    // placeholder so we don't add a phantom nav item.
                    if (obj.current && (currentPage || !currentLabel)) return null;
                    const isCurrent = obj.current || (!!currentPage && obj.label === currentPage);
                    const label = obj.current ? currentLabel : obj.label;
                    const page = (!isCurrent && CRM_CHILD_PAGE[obj.label]) || null;
                    const href = page ? crmHref(page) : '#';
                    return (
                      <a key={i} href={href}
                        onClick={(e) => { e.preventDefault(); if (page) crmGo(page); }}
                        style={{
                          display: 'block', position: 'relative',
                          padding: '5px 10px 5px 14px',
                          fontSize: 11.5, color: isCurrent ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                          textDecoration: 'none', fontWeight: isCurrent ? 600 : 400,
                          borderLeft: '1px solid var(--gb-border-subtle)',
                          background: isCurrent ? 'var(--gb-brand-tint-soft)' : 'transparent',
                          borderRadius: '0 4px 4px 0',
                          transition: 'all var(--gb-anim)',
                        }}
                        onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.color = 'var(--gb-detail-text-primary, var(--gb-text-primary))'; }}
                        onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.color = 'var(--gb-text-muted)'; }}
                      >
                        {isCurrent && (
                          <span style={{
                            position: 'absolute', left: -1, top: 4, bottom: 4, width: 2,
                            background: 'var(--gb-brand-label)', borderRadius: 2,
                          }} />
                        )}
                        {label}
                      </a>
                    );
                  })}
                </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: 10, borderTop: '1px solid var(--gb-border-subtle)',
        display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--gb-brand), var(--gb-brand-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10.5, fontWeight: 700, color: 'var(--gb-text-on-brand)', flexShrink: 0,
        }}>{repMark}</span>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repName}</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{territory}</div>
          </div>
        )}
        {!collapsed && <IconBtn size="xs" ghost icon={<I.cog />} />}
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════
   PAGE FRAME — TopBar / Breadcrumb / BackChip / DetailPageFrame
════════════════════════════════════════════════════════════ */

/* The 48px sticky top bar. Children fill the left side (BackChip and/or
   Breadcrumb); search + theme picker are always pinned right. */
export function TopBar({ children }) {
  return (
    <div className="gb-topbar gb-chrome" style={{
      height: 48, flexShrink: 0,
      // Skin seam: --gb-chrome-* frost the page chrome (header + sidebar). The
      // header floats over the app background, so it needs a stronger frosted
      // fill than the faint page surface — hence its own token, defaulting to
      // the stock surface + no blur.
      background: 'var(--gb-chrome-bg, var(--gb-surface-canvas))',
      backdropFilter: 'var(--gb-chrome-blur, none)',
      WebkitBackdropFilter: 'var(--gb-chrome-blur, none)',
      borderBottom: '1px solid var(--gb-chrome-border, var(--gb-border-subtle))',
      display: 'flex', alignItems: 'center',
      padding: '0 18px', gap: 14, position: 'sticky', top: 0, zIndex: 10,
    }}>
      {children}
      <div style={{ flex: 1 }} />
      <InlineSearch />
      <ThemeSelector />
    </div>
  );
}

/* items: [{ label, page }] CRM page links; current: the trailing label. */
export function Breadcrumb({ items = [], current, id }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500, minWidth: 0 }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <a href={crmHref(it.page)} onClick={(e) => { e.preventDefault(); crmGo(it.page); }} style={{ color: 'inherit', textDecoration: 'none' }}>{it.label}</a>
          <I.chevr size={10} />
        </React.Fragment>
      ))}
      <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{current}</span>
      {id && <span style={{ marginLeft: 6, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)', fontSize: 10.5 }}>#{id}</span>}
    </div>
  );
}

/* Pill link back to the record this page was opened from. */
export function BackChip({ href, label, title }) {
  if (!href) return null;
  return (
    <a href={href} onClick={(e) => { e.preventDefault(); goUrl(href); }} title={title || label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 26, padding: '0 11px 0 8px', borderRadius: 'var(--gb-r-pill)',
        background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
        color: 'var(--gb-brand-label)', textDecoration: 'none', fontSize: 11.5, fontWeight: 600, flexShrink: 0,
      }}>
      <I.chevr size={12} style={{ transform: 'scaleX(-1)' }} />{label}
    </a>
  );
}

/**
 * THE page shell every custom detail page renders through: zoomed root,
 * shared stylesheet, sidebar, scrolling content column, sticky top bar,
 * loading spinner, centered content wrapper, and (optionally) the modal
 * backdrop from useModalHost. A new page is:
 *
 *   <DetailPageFrame currentLabel="…" topBar={<TopBar>…</TopBar>}
 *     ready={D.ready} modalHost={modalHost}>{sections}</DetailPageFrame>
 */
export function DetailPageFrame({
  currentLabel,
  currentPage,
  topBar,
  ready = true,
  modalHost,
  onContentScroll,
  // Hide the page scroller's scrollbar (scrolling still works) — the
  // search/task list pages use this for a cleaner full-page canvas.
  hideScrollbar = false,
  children,
}) {
  const [sideCollapsed, setSideCollapsed] = useState(false);
  return (
    <>
      {/* data-gb-scale="custom-page" is intentionally NOT one of
          scales.js's SCALE_CATEGORIES, so applyScales() emits no zoom rule
          for it — the takeover renders at the host website's own scale,
          unaffected by the extension's UI-scale sliders. The bare
          [data-gb-scale] selector still applies the host-CSS reset
          (box-sizing / line-height / font). height:100% + own scroll so it
          fills the fixed root the engine mounts. */}
      <div data-gb-scale="custom-page" className="gbcp-root gb-app" style={{
        ...ARMOR,
        zoom: PAGE_ZOOM,                 // fixed scale — not slider-driven
        // No PAGE scroll — the sidebar and content column each scroll
        // themselves. This also kills the page-scrollbar appear/disappear
        // that was flickering a scrollbar onto the quick-actions menu.
        height: '100%', overflow: 'hidden',
        // Skin seam: --gb-app-bg lets a theme paint a gradient behind the whole
        // custom page (default keeps the stock deep surface).
        background: 'var(--gb-app-bg, var(--gb-surface-deep))',
        color: 'var(--gb-text-secondary)',
        fontFamily: 'var(--gb-font-sans)',
        display: 'flex', alignItems: 'stretch',
      }}>
        <style>{UI_CSS}</style>
        <Sidebar currentLabel={currentLabel} currentPage={currentPage} collapsed={sideCollapsed} setCollapsed={setSideCollapsed} />
        <div
          className={hideScrollbar ? 'gb-scroll gbcp-no-scrollbar' : 'gb-scroll'}
          onScroll={onContentScroll}
          style={{ flex: 1, minWidth: 0, height: '100%', overflowY: 'auto' }}
        >
          {topBar}
          {!ready && <Spinner />}
          <div className="gbcp-content" style={{
            maxWidth: 2200, margin: '0 auto',
            padding: '14px 18px 44px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {children}
          </div>
        </div>
      </div>
      {modalHost && modalHost.modal && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) modalHost.closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,.55)', padding: 20,
            animation: modalHost.closing ? 'gb-backdrop-out .19s ease both' : 'gb-fade-slide var(--gb-anim) both',
          }}>
          {modalHost.modal}
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   ACTIVITY FEED (shared by all three pages)
════════════════════════════════════════════════════════════ */
export function ActivityRow({ a, last, onDelete }) {
  const { openModal } = useModal();
  const meta = activityType(a);
  const chat = meta.key === 'chat' ? chatTranscriptSummary(a.subject || a.description || '') : null;
  const isNote = !!a.localNote;
  const clickable = !!a.id && !isNote;
  const typeTone = {
    brand: { fg: 'var(--gb-brand-label)', bg: 'var(--gb-brand-tint-soft)', border: 'var(--gb-brand-tint-border)' },
    error: { fg: 'var(--gb-error-fg)', bg: 'var(--gb-error-tint-soft)', border: 'var(--gb-error-tint-border)' },
    warning: { fg: 'var(--gb-warning-fg)', bg: 'var(--gb-warning-tint-soft)', border: 'var(--gb-warning-tint-border)' },
    success: { fg: 'var(--gb-success-fg)', bg: 'var(--gb-success-tint-soft)', border: 'var(--gb-success-tint-border)' },
    info: { fg: 'var(--gb-info-fg)', bg: 'var(--gb-info-tint-soft)', border: 'var(--gb-info-tint-border)' },
  }[meta.tone];
  return (
    <div
      className={`gbcp-activity-row ${isNote ? 'gb-actrow-note' : 'gb-actrow'}`}
      onClick={clickable ? () => openModal(<ActivityDetailModal activityId={a.id} />) : undefined}
      title={clickable ? 'View activity detail' : (isNote ? 'Personal note (local)' : undefined)}
      style={{
        padding: '7px 12px',
        cursor: clickable ? 'pointer' : 'default',
        borderBottom: last ? 'none' : '1px solid var(--gb-border-subtle)',
        borderLeft: isNote ? '2px solid var(--gb-warning-fg)' : '2px solid transparent',
        background: isNote ? 'var(--gb-warning-tint-soft)' : 'transparent',
        transition: 'background var(--gb-anim)',
      }}>
      <div style={{ minWidth: 0 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%',
          padding: '2px 6px', borderRadius: 4,
          color: typeTone.fg,
          background: typeTone.bg,
          border: `1px solid ${typeTone.border}`,
          fontSize: 9.5, fontWeight: 500, lineHeight: 1.35,
        }}>
          <Dot tone={meta.tone} size={4} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.category || meta.key}</span>
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', fontWeight: 400, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {chat ? (
            <>
              <span style={{ fontWeight: 500 }}>Live Chat</span>
              <span style={{ color: 'var(--gb-text-muted)' }}> · {chat.count} message{chat.count === 1 ? '' : 's'} · {chat.last.name}: {chat.last.body}</span>
            </>
          ) : (a.subject || <span style={{ color: 'var(--gb-text-ghost)' }}>—</span>)}
        </div>
        <div className="gbcp-activity-mobile-meta" style={{ alignItems: 'center', gap: 5, marginTop: 3, color: 'var(--gb-text-muted)', fontSize: 9.5 }}>
          {a.employee && <span>{a.employee}</span>}
          {a.employee && a.direction && <span>·</span>}
          {a.direction && <span>{a.direction}</span>}
        </div>
      </div>
      <div className="gbcp-activity-owner" style={{ minWidth: 0, color: 'var(--gb-text-muted)', fontSize: 10.5 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--gb-text-tertiary)', fontWeight: 400 }}>{a.employee || DASH}</div>
        {a.direction && <div style={{ marginTop: 2, fontSize: 9.5 }}>{a.direction}</div>}
      </div>
      <div className="gbcp-activity-date" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--gb-text-muted)', fontFamily: 'var(--gb-font-mono)', whiteSpace: 'nowrap' }}>{fmtDateTime(a.date)}</span>
        {isNote && onDelete && (
          <button className="gb-actrow-del" onClick={(e) => { e.stopPropagation(); onDelete(a.noteId); }} title="Delete note"
            style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid var(--gb-border-default)', background: 'var(--gb-surface-1)', color: 'var(--gb-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: 1 }}>×</button>
        )}
      </div>
    </div>
  );
}

/* extraRows ride at the top of the feed (e.g. the contact page's local
   notes); onAddNote renders the "Add note" button; onDeleteNote enables the
   per-note delete control. */
export function ActivityPanel({ extraRows = [], onAddNote, onDeleteNote }) {
  const D = useD();
  const rows = useMemo(() => [...extraRows, ...D.activities], [extraRows, D.activities]);
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
            {onAddNote && <Btn variant="tinted" size="sm" icon={<I.note />} onClick={onAddNote}>Add note</Btn>}
          </div>
        }
      />
      <div className="gbcp-list-head" aria-hidden="true">
        <span>Type</span><span>Activity</span><span>Owner</span><span style={{ textAlign: 'right' }}>Date</span>
      </div>
      <ScrollArea max={460}>
        {/* key by filter → the list fades/slides in on each filter change */}
        <div key={filter} style={{ animation: 'gb-fade-slide var(--gb-anim) both' }}>
          {filtered.map((a, idx) => <ActivityRow key={a.noteId || idx} a={a} last={idx === filtered.length - 1} onDelete={onDeleteNote} />)}
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

/* ════════════════════════════════════════════════════════════
   TASKS + QUICK LOG (shared by all three pages)
════════════════════════════════════════════════════════════ */

/**
 * Resolve the authenticated task/call context from storage and the current
 * CRM page. The schema contact ID is used only when the native page context
 * does not expose one.
 */
export async function taskContext(fallbackContactId, extra = {}) {
  let ctx = {};
  try { ctx = await readTaskContext(); } catch (e) {}
  if (!ctx.employeeId || ctx.employeeId === '0') { const fb = currentEmployeeId(); if (fb && fb !== '0') ctx.employeeId = fb; }
  /* Account pages have no current contact, so the native page context
     hands back contactId '0' (from #tbContactId=0). '0' is a truthy
     string, so a bare `!ctx.contactId` check would keep it and every
     task would be created against contact 0 (silent failure). Treat
     0/'0'/'' as absent and fall back to the schema's representative
     contact — the reason opp/task creation "only worked for contacts". */
  const missingContact = !ctx.contactId || ctx.contactId === '0' || ctx.contactId === 0;
  if (missingContact && fallbackContactId) ctx.contactId = String(fallbackContactId);
  return { ...ctx, ...extra };
}

export function TasksPanel({ canCreate = true }) {
  const D = useD();
  const patch = usePatch();
  const { openModal } = useModal();
  // Default sort: soonest due date first; undated tasks sink to the bottom.
  const openTasks = [...(D.openTasks || [])].sort((a, b) => {
    const ta = Date.parse(a?.dueDate || a?.due); const tb = Date.parse(b?.dueDate || b?.due);
    return (Number.isNaN(ta) ? Infinity : ta) - (Number.isNaN(tb) ? Infinity : tb);
  });
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
  const openComposer = async () => {
    try {
      /* Resolve the contact through taskContext so the account-page
         '0' → representative-contact fallback applies; pass it as an
         override so the composer uses it instead of the native page
         context (which is contactId '0' on account pages). */
      const ctx = await taskContext(D.ids.contact);
      window.__gbShowQuickTaskModal && window.__gbShowQuickTaskModal({
        contactId: ctx.contactId,
        employeeId: ctx.employeeId,
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
    <div className="gbcp-stack">
      <Card>
        <SectionTitle
          icon={<I.task />} title="Open Tasks" count={D.openTasks.length}
          right={canCreate ? <Btn variant="tinted" size="sm" icon={<I.plus />} onClick={openComposer}>New task</Btn> : null}
        />
        {canCreate && <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--gb-border-subtle)', background: 'var(--gb-fill-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: .7, textTransform: 'uppercase', color: 'var(--gb-text-muted)', flex: 1 }}>
              {manage ? 'Manage quick actions' : 'Quick create'}
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
          </div>
          <QuickAddInput value={quickTask} onChange={setQuickTask} onSubmit={() => quickCreate(quickTask)} disabled={adding} />
        </div>}
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Task</Th>
            <Th>Owner</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th align="right">Live</Th>
            <Th align="right">Due</Th>
            <Th></Th>
          </tr></thead>
          <tbody>
            {openTasks.map((t, i) => <OpenTaskRow key={t.id || i} t={t} />)}
            {openTasks.length === 0 && <EmptyRow colSpan={7} label="No open tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>

      <Card>
        <SectionTitle icon={<I.check />} title="Completed Tasks" count={D.doneTasks.length} />
        <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Task</Th>
            <Th>Owner</Th>
            <Th>Category</Th>
            <Th>Priority</Th>
            <Th align="right">Live</Th>
            <Th align="right">Due</Th>
          </tr></thead>
          <tbody>
            {D.doneTasks.map((t, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TaskCheckbox done />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--gb-text-muted)', textDecoration: 'line-through', fontWeight: 400 }}>{t.subject}</div>
                      {t.id && <div style={{ marginTop: 2, color: 'var(--gb-text-ghost)', fontFamily: 'var(--gb-font-mono)', fontSize: 9.5 }}>#{t.id}</div>}
                    </div>
                  </div>
                </Td>
                <Td muted>{txt(t.owner) || DASH}</Td>
                <Td muted>{t.category}</Td>
                <Td><Tag tone={priTone(t.priority)} size="xs">{t.priority || DASH}</Tag></Td>
                <Td align="right" mono muted>{fmtDate(t.liveDate)}</Td>
                <Td align="right" mono muted>{fmtDate(t.dueDate)}</Td>
              </tr>
            ))}
            {D.doneTasks.length === 0 && <EmptyRow colSpan={6} label="No completed tasks." />}
          </tbody>
        </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

export function QuickLogCard() {
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
            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--gb-detail-text-primary, var(--gb-text-primary))', lineHeight: 1.3, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.label}</span>
            <span style={{ fontSize: 9, letterSpacing: .5, fontWeight: 500, color: 'var(--gb-text-muted)', lineHeight: 1.3, overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%' }}>{t.templateName || ''}</span>
          </button>
        ))}
        {ql.list.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 14, textAlign: 'center', fontSize: 11.5, color: 'var(--gb-text-muted)' }}>Add a quick-log button with +</div>}
      </div>
    </Card>
  );
}
