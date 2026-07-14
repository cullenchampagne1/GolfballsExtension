/**
 * Shared contact-centric CRM detail behavior.
 *
 * Contact and opportunity pages both embed the same contact activity, task,
 * opportunity, lookup, mailer, and edit flows. Page-specific roots and proposal
 * behavior remain in their entry modules.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Field as UIField } from '../ui/components/Field.jsx';
import { Input as UIInput } from '../ui/components/Input.jsx';
import { Textarea as UITextarea } from '../ui/components/Textarea.jsx';
import { ModalHeader } from '../ui/components/ModalHeader.jsx';
import { ModalFooter } from '../ui/components/ModalFooter.jsx';
import { DatePicker } from '../ui/components/DatePicker.jsx';
import { completeTaskById } from './crmTasks.js';
import { loadTaskTemplates } from './quickTask.js';
import { loadCallTemplates } from './callLog.js';
import { ARMOR, AVATAR_COLOR, Btn, CRM_CHILD_PAGE, Card, ContactPill, DASH, Dot, EmptyRow, I, IconBtn, KV, NAV, PAGE_ZOOM, TOP_PAGE, ProofCard, ScrollArea, SectionTitle, Tag, Td, Th, accountHref, crmGo, crmHref, fmt$, fmtDate, fmtDateTime, fullName, goUrl, initials, isEmpty, num, oppHref, priTone, recordBackTo, tableStyle, trStyle, txt, useD, yearsSince } from './detail-shared.jsx';

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
  };
}

export const UI_CSS =
  '.gbcp-stat:hover {' +
  '  box-shadow: inset 0 0 0 1px var(--gb-brand-tint-border),' +
  '              inset 0 0 28px -10px var(--gb-brand-label);' +
  '}' +
  /* Thin themed scrollbar for the capped-height panel scroll areas. */
  '.gb-scroll::-webkit-scrollbar { width: 9px; height: 9px; }' +
  '.gb-scroll::-webkit-scrollbar-track { background: transparent; }' +
  '.gb-scroll::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }' +
  '.gb-scroll::-webkit-scrollbar-thumb:hover { background: var(--gb-border-strong); background-clip: padding-box; }' +
  '.gb-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }' +
  /* Confirmation pulse after an optimistic save — a brief brand ring/glow. */
  '@keyframes gb-saved-pulse {' +
  '  0% { box-shadow: 0 0 0 0 var(--gb-brand-tint-strong), inset 0 0 0 1px var(--gb-brand-tint-border); }' +
  '  100% { box-shadow: 0 0 0 0 transparent, inset 0 0 0 1px transparent; }' +
  '}' +
  '.gb-saved { animation: gb-saved-pulse .7s ease-out; }' +
  '@keyframes gb-pop-in { 0% { opacity: 0; transform: translateY(8px) scale(.985); } 100% { opacity: 1; transform: none; } }' +
  '@keyframes gb-pop-out { 0% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(6px) scale(.975); } }' +
  '@keyframes gb-backdrop-out { 0% { opacity: 1; } 100% { opacity: 0; } }' +
  /* strip the native number-spinner arrows (snooze "weeks", etc.) */
  'input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }' +
  'input[type=number] { -moz-appearance: textfield; }';

export function crmOrigin() {
  try { if (/(^|\.)golfballs\.com$/i.test(location.hostname)) return location.origin; } catch (e) {}
  return 'https://api.golfballs.com';
}

export function gbToast(msg, tone = 'info') {
  try { const t = window.__gbToast; (t && (t[tone] || t.info) || function () {})(msg); } catch (e) {}
}

async function crmSetDnc(customerID, add) {
  const base = crmOrigin();
  const action = add ? 'AddToDoNotCallList' : 'RemoveFromDoNotCallList';
  const r = await fetch(`${base}/golfballs/crm/Admin/Contact/${action}.ajax?${customerID}`, { credentials: 'include' });
  if (!r.ok) throw new Error('dnc failed');
}

async function crmUpdateContact(customerId, edits) {
  const base = crmOrigin();
  const res = await fetch(`${base}/golfballs/crm/Admin/Contact/Get.ajax?${customerId}`, { credentials: 'include' });
  const cur = JSON.parse(await res.text());
  const has = (k) => Object.prototype.hasOwnProperty.call(edits, k);
  const pick = (k, src) => (has(k) ? edits[k] : (src == null ? '' : src));
  const cd = cur.CustomData;
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
    CustomData: cd == null ? '' : (typeof cd === 'string' ? cd : JSON.stringify(cd)),
  };
  const up = await fetch(`${base}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`, { credentials: 'include' });
  if (!up.ok) throw new Error('update failed');
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
    LiveDate: obj.LiveDate,
    DueDate: has('DueDate') ? e.DueDate : obj.DueDate,
    taskCategoryID: obj.taskCategoryID,
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
    for (const s of Array.from(document.scripts || [])) {
      const m = (s.textContent || '').match(/employeeID\s*=\s*'(\d+)'/);
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

export function Hero() {
  const D = useD();
  const { openModal } = useModal();
  const c = D.contact, a = D.account;
  // "City, ST 71801" — city/state comma-joined, zip space-appended.
  const cityState = [a.city, c.state].filter(Boolean).join(', ');
  const loc = [cityState, c.zipCode].filter(Boolean).join(' ').trim();
  const years = yearsSince(a.createdDate);
  const territory = txt(a.territoryName);
  return (
    <Card pad={0}>
      <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 0 }}>
        {/* Avatar block */}
        <div style={{
          padding: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRight: '1px solid var(--gb-border-subtle)',
          background: 'radial-gradient(circle at 50% 40%, var(--gb-fill-soft), transparent 70%)',
          position: 'relative',
        }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: `linear-gradient(135deg, ${AVATAR_COLOR}, color-mix(in srgb, ${AVATAR_COLOR} 60%, black))`,
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, fontWeight: 700, letterSpacing: -.5,
            boxShadow: '0 1px 0 var(--gb-fill-soft), inset 0 1px 0 rgba(255,255,255,.15), 0 0 0 4px var(--gb-surface-1), 0 0 0 5px var(--gb-border-subtle)',
            position: 'relative',
          }}>
            {initials(c.firstName, c.lastName)}
            <div style={{
              position: 'absolute', bottom: 2, right: 2,
              width: 18, height: 18, borderRadius: '50%',
              background: 'var(--gb-success)',
              border: '3px solid var(--gb-surface-1)',
              boxShadow: '0 0 6px var(--gb-success)',
            }} />
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -.4,
              color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)',
            }}>{fullName(c) || 'Unknown Contact'}</h1>
            {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
            {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
            {years != null && <Tag tone="neutral" size="md">Active · {years}y</Tag>}
            {D.ids.contact && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-muted)', marginLeft: 'auto' }}>#{D.ids.contact}</span>}
          </div>

          {/* Account link */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 13, color: 'var(--gb-text-tertiary)', fontWeight: 500, flexWrap: 'wrap',
          }}>
            <I.briefcase size={13} style={{ color: 'var(--gb-text-muted)' }} />
            <span>Works at</span>
            <a href={D.ids.account ? accountHref(D.ids.account) : '#'}
              onClick={(e) => { e.preventDefault(); if (D.ids.account) { recordBackTo((fullName(c) || 'Contact') + ' · #' + (D.ids.contact || '')); goUrl(accountHref(D.ids.account)); } }}
              style={{
                color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                cursor: D.ids.account ? 'pointer' : 'default',
              }}>
              {txt(a.name) || 'Account'}
              <I.ext size={11} />
            </a>
            {c.jobTitle && (<><span style={{ color: 'var(--gb-text-ghost)' }}>·</span><span>{c.jobTitle}</span></>)}
          </div>

          {/* Contact strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            paddingTop: 6, borderTop: '1px dashed var(--gb-border-subtle)', marginTop: 2,
          }}>
            <ContactPill icon={<I.mail />}  label="Email" value={txt(c.email) || DASH} muted={isEmpty(c.email)} />
            <ContactPill icon={<I.phone />} label="Phone" value={txt(c.phone) || DASH} muted={isEmpty(c.phone)} />
            <ContactPill icon={<I.pin />}   label="Location" value={loc || DASH} muted={!loc} />
            <ContactPill icon={<I.linkedin />} label="LinkedIn" value={c.linkedInUrl ? 'Profile' : 'Add link'} muted={!c.linkedInUrl} />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: 18, display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0,
          borderLeft: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-fill-faint)',
          minWidth: 200,
        }}>
          <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<ContactEditModal />)}>Edit Contact</Btn>
          <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
          <Btn variant="tinted" status="info" icon={<I.send />} full onClick={() => { try { window.__gbOpenTemplate && window.__gbOpenTemplate(); } catch (e) {} }}>Send Email</Btn>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <DncButton />
            <IconBtn size="sm" icon={<I.more />} />
          </div>
        </div>
      </div>
    </Card>
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
          borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
          opacity: (field && onEdit) ? 1 : 0.55,
          fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
        }} />
    </div>
  );
}

export function EditToggle({ editing, setEditing, onSave }) {
  const [busy, setBusy] = useState(false);
  if (!editing) return <Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => setEditing(true)}>Edit</Btn>;
  const save = async () => {
    if (!onSave) { setEditing(false); return; }
    setBusy(true);
    try { await onSave(); setEditing(false); } catch (e) { /* toast handled in onSave */ } finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Btn variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn>
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
  borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
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
    <div onMouseDown={(e) => e.stopPropagation()}
      style={{
        width, maxWidth: '92%', display: 'flex', flexDirection: 'column',
        background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-lg)', boxShadow: 'var(--gb-shadow-modal, 0 24px 64px rgba(0,0,0,.5))',
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

export function EditTaskModal({ taskId }) {
  const { closeModal } = useModal();
  const patch = usePatch();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [t, setT] = useState({ Subject: '', Description: '', DueDate: '', Priority: '2' });
  useEffect(() => {
    let live = true;
    crmGetTask(taskId)
      .then((o) => { if (live) { setT({ Subject: o.Subject || '', Description: o.Description || '', DueDate: o.DueDate || '', Priority: String(o.Priority || 2) }); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [taskId]);
  const save = async () => {
    setBusy(true);
    try {
      await crmUpdateTaskFull(taskId, t);
      patch((D) => ({ ...D, openTasks: (D.openTasks || []).map((x) => x.id === taskId ? { ...x, subject: t.Subject, dueDate: t.DueDate, priority: priLabel(t.Priority) } : x) }));
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
          <div style={{ display: 'flex', gap: 12 }}>
            <FormField label="Due date" style={{ flex: 1 }}><DatePicker includeTime={false} value={toDateInput(t.DueDate)} onChange={(v) => setT({ ...t, DueDate: v ? fromDateInput(String(v).slice(0,10)) : "" })} /></FormField>
            <FormField label="Priority" style={{ width: 130 }}>
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
      patch((Dd) => {
        const row = { id: String(id), subject: payload.Subject, stage: stageLabel, estimatedValue: Number(payload.EstimatedValue) || 0, estimatedCloseDate: payload.EstimatedClosedDate };
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
          <FormField label="Stage"><MiniSelect value={o.OpportunityStageId} options={OPP_STAGES} onChange={(v) => setO({ ...o, OpportunityStageId: v })} /></FormField>
        </>}
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
  const [f, setF] = useState({
    firstName: c.firstName || '', lastName: c.lastName || '', jobTitle: c.jobTitle || '',
    email: c.email || '', phoneNumber: c.phone || '', zipCode: c.zipCode || '', userCountry: c.country || '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await crmUpdateContact(D.ids.contact, f);
      patch((Dd) => ({ ...Dd, contact: { ...Dd.contact, firstName: f.firstName, lastName: f.lastName, jobTitle: f.jobTitle, email: f.email, phone: f.phoneNumber, zipCode: f.zipCode, country: f.userCountry } }));
      closeModal();
    } catch (e) { gbToast('Could not save contact', 'error'); setBusy(false); }
  };
  return (
    <ModalShell title="Edit Contact" icon={<I.user />} width={520} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="First name" style={{ flex: 1 }}><TInput autoFocus value={f.firstName} onChange={set('firstName')} /></FormField>
        <FormField label="Last name" style={{ flex: 1 }}><TInput value={f.lastName} onChange={set('lastName')} /></FormField>
      </div>
      <FormField label="Job title"><TInput value={f.jobTitle} onChange={set('jobTitle')} /></FormField>
      <FormField label="Email"><TInput value={f.email} onChange={set('email')} /></FormField>
      <div style={{ display: 'flex', gap: 12 }}>
        <FormField label="Phone" style={{ flex: 1 }}><TInput value={f.phoneNumber} onChange={set('phoneNumber')} /></FormField>
        <FormField label="Zip" style={{ width: 110 }}><TInput value={f.zipCode} onChange={set('zipCode')} /></FormField>
        <FormField label="Country" style={{ width: 90 }}><TInput value={f.userCountry} onChange={set('userCountry')} /></FormField>
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
  const row = (label, val) => (val === 0 || val) ? (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px dashed var(--gb-border-subtle)' }}>
      <span style={{ width: 112, fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--gb-text-secondary)' }}>{String(val)}</span>
    </div>
  ) : null;
  return (
    <ModalShell title="Activity Detail" icon={<I.history />} width={480} footer={<Btn variant="ghost" size="sm" onClick={closeModal}>Close</Btn>}>
      {err
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Couldn’t load activity.</div>
        : !a
        ? <div style={{ padding: 18, textAlign: 'center', color: 'var(--gb-text-muted)', fontSize: 12 }}>Loading…</div>
        : <>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gb-text-primary)' }}>{a.ActivitySubject || 'Activity'}</div>
          {a.ActivityDescription && <div style={{ fontSize: 12.5, color: 'var(--gb-text-secondary)', lineHeight: 1.5, padding: '9px 11px', background: 'var(--gb-surface-2)', borderRadius: 'var(--gb-r-sm)' }}>{a.ActivityDescription}</div>}
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

export function DncButton() {
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
    <Btn variant="secondary" size="sm" icon={<I.ban />} disabled={busy || removed} onClick={onClick}>
      {removed ? 'Removed from DNC' : busy ? 'Removing…' : 'Remove from DNC'}
    </Btn>
  );
}

export function OpportunitiesPanel() {
  const D = useD();
  const { openModal } = useModal();
  return (
    <Card>
      <SectionTitle
        icon={<I.target />} title="Opportunities" count={D.opportunities.length}
        sub="Pipeline for this contact"
        right={<Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => openModal(<OpportunityModal />)}>New opportunity</Btn>}
      />
      <ScrollArea max={420}>
      <table style={tableStyle}>
        <thead><tr>
          <Th>ID</Th>
          <Th>Subject</Th>
          <Th align="right">Est. Value</Th>
          <Th align="right">Est. Close</Th>
          <Th align="center">Stage</Th>
          <Th align="right">Actions</Th>
        </tr></thead>
        <tbody>
          {D.opportunities.map((o, i) => (
            <tr key={i} style={trStyle}>
              <Td><span style={{ fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-brand-label)', fontWeight: 600 }}>{o.id}</span></Td>
              <Td><span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{o.subject}</span></Td>
              <Td align="right"><span style={{ fontFamily: 'var(--gb-font-mono)', fontWeight: 700, color: 'var(--gb-text-primary)' }}>{fmt$(o.estimatedValue)}</span></Td>
              <Td align="right" mono muted>{fmtDate(o.estimatedCloseDate)}</Td>
              <Td align="center">{o.stage ? <Tag tone="info" size="xs">{o.stage}</Tag> : DASH}</Td>
              <Td align="right">
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" size="xs" iconRight={<I.ext />} onClick={() => { if (o.id) goUrl(oppHref(o.id)); }}>Open</Btn>
                  <Btn variant="tinted" size="xs" icon={<I.edit />} onClick={() => openModal(<OpportunityModal opportunityId={o.id} />)}>Edit</Btn>
                </div>
              </Td>
            </tr>
          ))}
          {D.opportunities.length === 0 && <EmptyRow colSpan={6} label="No opportunities." />}
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
      <div style={{ padding: '8px 18px 14px' }}>
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
      <div style={{ padding: '8px 18px 14px' }}>
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
  return (
    <tr style={{
      ...trStyle,
      opacity: leaving ? 0 : (done ? 0.75 : 1),
      transform: leaving ? 'translateX(12px)' : 'none',
      transition: 'opacity .4s ease, transform .4s ease',
    }}>
      <Td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={complete} disabled={state !== 'idle'} title="Complete task"
            style={{
              width: 15, height: 15, borderRadius: 4, flexShrink: 0, padding: 0,
              border: '1.5px solid ' + (done ? 'var(--gb-success-fg)' : 'var(--gb-border-strong)'),
              background: done ? 'var(--gb-success-fg)' : 'transparent',
              cursor: state === 'idle' ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {done && <I.check size={10} style={{ color: 'var(--gb-text-on-brand)' }} />}
          </button>
          <span style={{ color: 'var(--gb-text-primary)', fontWeight: 500, textDecoration: done ? 'line-through' : 'none' }}>{t.subject}</span>
        </div>
      </Td>
      <Td muted>{t.category}</Td>
      <Td align="center"><Tag tone={priTone(t.priority)} size="xs">{t.priority || DASH}</Tag></Td>
      <Td align="right" mono><span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{fmtDate(t.dueDate)}</span></Td>
      <Td align="right">
        <Btn variant="ghost" size="xs" icon={<I.edit />} disabled={state !== 'idle'} onClick={() => openModal(<EditTaskModal taskId={t.id} />)}>Edit</Btn>
      </Td>
    </tr>
  );
}

export function Sidebar({ collapsed, setCollapsed, currentLabel }) {
  const D = useD();
  const [openIds, setOpenIds] = useState(['crm']);
  const toggle = (id) => setOpenIds((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const repName = txt(D.account && D.account.salesRep) || 'Sales workspace';
  const territory = txt(D.account && D.account.territoryName) || 'Golfballs Admin';
  const repMark = repName === 'Sales workspace'
    ? 'GB'
    : repName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  return (
    <aside style={{
      ...ARMOR,
      fontFamily: 'var(--gb-font-sans)', color: 'var(--gb-text-tertiary)',
      width: collapsed ? 56 : 232, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderRight: '1px solid var(--gb-border-subtle)',
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
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gb-text-primary)', letterSpacing: -.1, whiteSpace: 'nowrap' }}>Golfballs Admin</span>
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
                  fontSize: 12, fontWeight: g.active ? 700 : 600, letterSpacing: -.05,
                  transition: 'all var(--gb-anim)',
                }}
                onMouseEnter={(e) => { if (!g.active) e.currentTarget.style.background = 'var(--gb-fill-subtle)'; e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
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
                    const label = obj.current ? currentLabel : obj.label;
                    const page = (!obj.current && CRM_CHILD_PAGE[obj.label]) || null;
                    const href = page ? crmHref(page) : '#';
                    return (
                      <a key={i} href={href}
                        onClick={(e) => { e.preventDefault(); if (page) crmGo(page); }}
                        style={{
                          display: 'block', position: 'relative',
                          padding: '5px 10px 5px 14px',
                          fontSize: 11.5, color: obj.current ? 'var(--gb-brand-label)' : 'var(--gb-text-muted)',
                          textDecoration: 'none', fontWeight: obj.current ? 700 : 500,
                          borderLeft: '1px solid var(--gb-border-subtle)',
                          background: obj.current ? 'var(--gb-brand-tint-soft)' : 'transparent',
                          borderRadius: '0 4px 4px 0',
                          transition: 'all var(--gb-anim)',
                        }}
                        onMouseEnter={(e) => { if (!obj.current) e.currentTarget.style.color = 'var(--gb-text-primary)'; }}
                        onMouseLeave={(e) => { if (!obj.current) e.currentTarget.style.color = 'var(--gb-text-muted)'; }}
                      >
                        {obj.current && (
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
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gb-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{repName}</div>
            <div style={{ fontSize: 10, color: 'var(--gb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{territory}</div>
          </div>
        )}
        {!collapsed && <IconBtn size="xs" ghost icon={<I.cog />} />}
      </div>
    </aside>
  );
}
