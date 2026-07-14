/* eslint-disable */
/**
 * Account-details custom page (CRM Page 271).
 *
 * Adapts the page-engine store to the account-specific layout. Shared CRM
 * navigation, activity panels, formatting, and primitives live in
 * detail-shared.jsx so the three detail surfaces cannot drift.
 */

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ARMOR, AVATAR_COLOR, ActivityFilter, Btn, Card, ContactPill, DASH, DataCtx, DetailErrorBoundary, Dot, EmailsPanel, EmptyRow, I, IconBtn, InlineSearch, KV, OrdersPanel, PAGE_ZOOM, ProofCard, QUICK_TASK, ScrollArea, SectionTitle, StatsStrip, SystemCard, Tag, Td, Th, ThemeSelector, activityType, crmGo, crmHref, fmt$, fmtDate, fmtDateTime, goUrl, isEmpty, num, oppHref, priTone, readBackTo, tableStyle, trStyle, txt, useD } from '../lib/detail-shared.jsx';
import { Sidebar } from '../lib/contact-detail-shared.jsx';

/* ════════════════════════════════════════════════════════════
   DATA — live, from the schema engine via ctx.store
════════════════════════════════════════════════════════════ */
function adapt(data) {
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
  };
}

/* Stat-card hover: a soft brand inner glow + faint inner ring, driven by
   real CSS :hover (not JS onMouseEnter state, which flickered on scroll as
   cards slid under the cursor). box-shadow isn't set inline on these cards,
   so the rule applies cleanly and animates via the card's `transition:all`.
   Rendered as a <style> inside the shadow tree. */
const UI_CSS =
  '.gbcp-stat:hover {' +
  '  box-shadow: inset 0 0 0 1px var(--gb-brand-tint-border),' +
  '              inset 0 0 28px -10px var(--gb-brand-label);' +
  '}' +
  /* Thin themed scrollbar for the capped-height panel scroll areas. */
  '.gb-scroll::-webkit-scrollbar { width: 9px; height: 9px; }' +
  '.gb-scroll::-webkit-scrollbar-track { background: transparent; }' +
  '.gb-scroll::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }' +
  '.gb-scroll::-webkit-scrollbar-thumb:hover { background: var(--gb-border-strong); background-clip: padding-box; }' +
  '.gb-scroll { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }';

/* ════════════════════════════════════════════════════════════
   TOP BAR
════════════════════════════════════════════════════════════ */
function TopBar() {
  const D = useD();
  const name = txt(D.account.name) || 'Account';
  const back = readBackTo();   // came from a contact page? offer a way back
  return (
    <div style={{
      height: 48, flexShrink: 0,
      background: 'var(--gb-surface-canvas)',
      borderBottom: '1px solid var(--gb-border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 18px', gap: 18, position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Came-from chip: jump back to the contact we opened this account from */}
      {back && (
        <a href={back.href} onClick={(e) => { e.preventDefault(); goUrl(back.href); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            height: 26, padding: '0 10px 0 8px', borderRadius: 'var(--gb-r-pill)',
            background: 'var(--gb-brand-tint-soft)', border: '1px solid var(--gb-brand-tint-border)',
            color: 'var(--gb-brand-label)', fontSize: 11, fontWeight: 600, textDecoration: 'none', flexShrink: 0,
          }} title={'Back to ' + back.label}>
          <I.chevr size={11} style={{ transform: 'scaleX(-1)' }} />
          {back.label || 'Back'}
        </a>
      )}
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--gb-text-muted)', fontWeight: 500 }}>
        <a href={crmHref(261)} onClick={(e) => { e.preventDefault(); crmGo(261); }} style={{ color: 'inherit', textDecoration: 'none' }}>CRM</a><I.chevr size={10} />
        <a href={crmHref(360)} onClick={(e) => { e.preventDefault(); crmGo(360); }} style={{ color: 'inherit', textDecoration: 'none' }}>Accounts</a><I.chevr size={10} />
        <span style={{ color: 'var(--gb-text-secondary)', fontWeight: 600 }}>{name}</span>
        {D.ids.account && <span style={{ marginLeft: 6, fontFamily: 'var(--gb-font-mono)', color: 'var(--gb-text-ghost)', fontSize: 10.5 }}>#{D.ids.account}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <InlineSearch />
      <ThemeSelector />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   HERO / PROFILE CARD
════════════════════════════════════════════════════════════ */

function Hero() {
  const D = useD();
  const c = D.contact, a = D.account;
  const aInit = (txt(a.name) || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const loc = [a.city, a.state].filter(Boolean).join(', ');
  const territory = txt(a.territoryName);
  const web = a.webAddress ? String(a.webAddress).replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
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
            {aInit}
            <div style={{
              position: 'absolute', bottom: -2, right: -2,
              width: 24, height: 24, borderRadius: 8,
              background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
              color: 'var(--gb-brand-label)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><I.briefcase size={12} /></div>
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -.4,
              color: 'var(--gb-text-primary)', fontFamily: 'var(--gb-font-sans)',
            }}>{txt(a.name) || 'Account'}</h1>
            {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
            {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
            <Tag tone="neutral" size="md">Account</Tag>
            {D.ids.account && <span style={{ fontFamily: 'var(--gb-font-mono)', fontSize: 11, color: 'var(--gb-text-muted)', marginLeft: 'auto' }}>#{D.ids.account}</span>}
          </div>

          {/* Account link */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 13, color: 'var(--gb-text-tertiary)', fontWeight: 500, flexWrap: 'wrap',
          }}>
            <I.ext size={13} style={{ color: 'var(--gb-text-muted)' }} />
            {web
              ? <a href={a.webAddress} target="_blank" rel="noreferrer" style={{ color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{web}<I.ext size={11} /></a>
              : <span style={{ color: 'var(--gb-text-ghost)' }}>No web address</span>}
            {a.createdBy && (<><span style={{ color: 'var(--gb-text-ghost)' }}>·</span><span>Created by {a.createdBy}</span></>)}
          </div>

          {/* Contact strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
            paddingTop: 6, borderTop: '1px dashed var(--gb-border-subtle)', marginTop: 2,
          }}>
            <ContactPill icon={<I.briefcase />} label="Industry" value={txt(a.industry) || DASH} muted={isEmpty(a.industry)} />
            <ContactPill icon={<I.pin />}   label="Location" value={loc || DASH} muted={!loc} />
            <ContactPill icon={<I.user />} label="Territory" value={txt(a.territoryName) || DASH} muted={!a.territoryName} />
            <ContactPill icon={<I.shield />} label="Tax Exempt" value={a.taxExempt ? 'Yes' : 'No'} />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          padding: 18, display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0,
          borderLeft: '1px solid var(--gb-border-subtle)',
          background: 'var(--gb-fill-faint)',
          minWidth: 200,
        }}>
          <Btn variant="primary" icon={<I.edit />} full>Edit Account</Btn>
          <Btn variant="tinted" status="info" icon={<I.plus />} full>Add Contact</Btn>
          <Btn variant="tinted" status="info" icon={<I.target />} full>New Opportunity</Btn>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <Btn variant="ghost" size="sm" icon={<I.note />}>Add note</Btn>
            <IconBtn size="sm" icon={<I.more />} />
          </div>
        </div>
      </div>
    </Card>
  );
}

/* Editable key-value row — value, or an input when `editing`. UI only. */
function EKV({ label, value, editing, mono }) {
  if (!editing) return <KV label={label} mono={mono}>{value}</KV>;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '128px 1fr', gap: 12,
      padding: '5px 0', borderBottom: '1px dashed var(--gb-border-subtle)',
      alignItems: 'center', minHeight: 28,
    }}>
      <span style={{ fontSize: 11, color: 'var(--gb-text-muted)', fontWeight: 500 }}>{label}</span>
      <input defaultValue={(value === 0 || value) ? String(value) : ''}
        style={{
          width: '100%', height: 26, padding: '0 8px', boxSizing: 'border-box',
          background: 'var(--gb-fill-inverse-medium)', border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-sm)', color: 'var(--gb-text-primary)',
          fontFamily: mono ? 'var(--gb-font-mono)' : 'var(--gb-font-sans)', fontSize: 12, outline: 'none',
        }} />
    </div>
  );
}

/* Card header edit control: Edit ↔ Save/Cancel (UI only). */
function EditToggle({ editing, setEditing }) {
  if (!editing) return <Btn variant="ghost" size="sm" icon={<I.edit />} onClick={() => setEditing(true)}>Edit</Btn>;
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Btn variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={() => setEditing(false)}>Save</Btn>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   TAB PANELS
════════════════════════════════════════════════════════════ */

function ActivityRow({ a, last }) {
  const [hover, setHover] = useState(false);
  const meta = activityType(a);
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '11px 18px',
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
    <Card style={{ overflow: 'visible', position: 'relative', zIndex: 2 }}>
      <SectionTitle
        icon={<I.history />}
        title="Activity Feed"
        count={filter === 'all' ? `${rows.length}` : `${filtered.length} of ${rows.length}`}
        sub="System, workflow, and human-logged events"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <ActivityFilter value={filter} onChange={setFilter} counts={counts} />
            <Btn variant="tinted" size="sm" icon={<I.plus />}>Add note</Btn>
          </div>
        }
      />
      <ScrollArea max={460}>
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

/* Logo proofs and mockups extracted by the page schema. */
function ProofsPanel() {
  const D = useD();
  const rows = D.proofs;
  if (rows.length === 0) return null;   // only show when there are proofs
  return (
    <Card>
      <SectionTitle icon={<I.camera />} title="Logo Proofs" count={rows.length} sub="Artwork proofs & mockups" />
      <div className="gb-scroll" style={{ display: 'flex', alignItems: 'stretch', gap: 12, padding: 14, overflowX: 'auto', overflowY: 'hidden' }}>
        {rows.map((p, i) => <ProofCard key={i} p={p} />)}
      </div>
    </Card>
  );
}

/* — Tasks — */


function TasksPanel() {
  const D = useD();
  const [quickTask, setQuickTask] = useState('');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <SectionTitle
          icon={<I.task />} title="Open Tasks" count={D.openTasks.length}
          right={<Btn variant="tinted" size="sm" icon={<I.plus />} onClick={() => { try { window.__gbShowQuickTaskModal && window.__gbShowQuickTaskModal(); } catch (e) {} }}>New task</Btn>}
        />
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--gb-border-subtle)' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: .7, textTransform: 'uppercase',
            color: 'var(--gb-text-muted)', marginBottom: 8,
          }}>Quick create</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {QUICK_TASK.map((q) => (<Btn key={q} variant="secondary" size="xs">{q}</Btn>))}
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
                placeholder="Quick add a task… (Enter to save)"
                style={{
                  flex: 1, border: 0, outline: 0, background: 'transparent',
                  fontFamily: 'var(--gb-font-sans)', fontSize: 11.5,
                  color: 'var(--gb-text-primary)',
                }} />
            </div>
            <IconBtn size="sm" icon={<I.task />} title="Complete all open tasks" />
            <Btn variant="primary" size="sm" icon={<I.check />}>Add</Btn>
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
            {D.openTasks.map((t, i) => (
              <tr key={i} style={trStyle}>
                <Td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--gb-border-strong)', flexShrink: 0 }} />
                    <span style={{ color: 'var(--gb-text-primary)', fontWeight: 500 }}>{t.subject}</span>
                  </div>
                </Td>
                <Td muted>{t.category}</Td>
                <Td align="center"><Tag tone={priTone(t.priority)} size="xs">{t.priority || DASH}</Tag></Td>
                <Td align="right" mono>
                  <span style={{ color: 'var(--gb-warning-fg)', fontWeight: 600 }}>{fmtDate(t.dueDate)}</span>
                </Td>
                <Td align="right"><Btn variant="ghost" size="xs" icon={<I.check />}>Complete</Btn></Td>
              </tr>
            ))}
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

/* — Opportunities (added; the design mock omitted this) — */
function OpportunitiesPanel() {
  const D = useD();
  return (
    <Card>
      <SectionTitle
        icon={<I.target />} title="Opportunities" count={D.opportunities.length}
        sub="Pipeline for this contact"
        right={<Btn variant="tinted" size="sm" icon={<I.plus />}>New opportunity</Btn>}
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
                  <Btn variant="tinted" size="xs" icon={<I.edit />}>Edit</Btn>
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

/* — Account Contacts (related people on this account) — */
function ContactsPanel() {
  const D = useD();
  const rows = D.contacts;
  return (
    <Card>
      <SectionTitle
        icon={<I.user />} title="Account Contacts" count={rows.length}
        sub="People linked to this account"
        right={<Btn variant="tinted" size="sm" icon={<I.plus />}>Add Contact</Btn>}
      />
      <ScrollArea max={320}>
        <table style={tableStyle}>
          <thead><tr>
            <Th>Contact</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th>Type</Th>
            <Th>Source / Campaign</Th>
          </tr></thead>
          <tbody>
            {rows.map((c, i) => {
              const name = c.fullName || [c.firstName, c.lastName].filter(Boolean).join(' ');
              return (
                <tr key={i} style={trStyle}>
                  <Td>
                    {c.detailUrl
                      ? <a href={c.detailUrl} onClick={(e) => { e.preventDefault(); goUrl(c.detailUrl); }} style={{ color: 'var(--gb-brand-label)', fontWeight: 600, textDecoration: 'none' }}>{name || DASH}</a>
                      : <span style={{ fontWeight: 600, color: 'var(--gb-text-secondary)' }}>{name || DASH}</span>}
                  </Td>
                  <Td muted>{txt(c.email) || DASH}</Td>
                  <Td mono muted>{txt(c.phone) || DASH}</Td>
                  <Td muted>{txt(c.contactType) || DASH}</Td>
                  <Td muted>{txt(c.partnerCampaign) || DASH}</Td>
                </tr>
              );
            })}
            {rows.length === 0 && <EmptyRow colSpan={5} label="No contacts linked to this account." />}
          </tbody>
        </table>
      </ScrollArea>
    </Card>
  );
}

/* — Account Info & Contact Info — */
function AccountInfoCard() {
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', padding: '8px 18px 14px' }}>
        <div>
          <EKV label="Account Name" value={txt(a.name)} editing={editing} />
          <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
          <EKV label="Industry" value={txt(a.industry)} editing={editing} />
          <EKV label="Web Address" value={txt(a.webAddress)} editing={editing} />
          <EKV label="City" value={txt(a.city)} editing={editing} />
          <EKV label="State" value={txt(a.state)} editing={editing} />
          <EKV label="Context" value={txt(a.contextNotes)} editing={editing} />
        </div>
        <div>
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
          <KV label="Created By">{txt(a.createdBy)}</KV>
          <KV label="Created On" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        </div>
      </div>
    </Card>
  );
}

function ContactInfoCard() {
  const D = useD();
  const c = D.contact, a = D.account;
  return (
    <Card>
      <SectionTitle
        icon={<I.user />} title="Contact Information"
        sub={`#${D.ids.contact || DASH}`}
        right={<Btn variant="ghost" size="sm" icon={<I.edit />}>Edit</Btn>}
      />
      <div style={{ padding: '8px 18px 14px' }}>
        <KV label="First Name">{txt(c.firstName)}</KV>
        <KV label="Last Name">{txt(c.lastName)}</KV>
        <KV label="Job Title">{txt(c.jobTitle)}</KV>
        <KV label="Email" copyable>{txt(c.email)}</KV>
        <KV label="Phone" copyable>{txt(c.phone)}</KV>
        <KV label="State">{txt(c.state)}</KV>
        <KV label="Zip" mono>{txt(c.zipCode)}</KV>
        <KV label="Country">{txt(c.country)}</KV>
        <KV label="Created By">{txt(a.createdBy)}</KV>
        <KV label="Created On" mono>{fmtDate(a.createdDate) === DASH ? null : fmtDate(a.createdDate)}</KV>
        <KV label="Last Modified" mono>{fmtDateTime(a.modifiedDate) === DASH ? null : fmtDateTime(a.modifiedDate)}</KV>
        <KV label="Archived">{c.archived ? 'Yes' : 'No'}</KV>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   RIGHT RAIL — Quick Log, Alt Lookups, Mailer, System
════════════════════════════════════════════════════════════ */
const QUICK_LOG = [
  { label: 'Promotion VM',  meta: 'OUT', icon: 'vm' },
  { label: 'Proposal VM',   meta: 'OUT', icon: 'vm' },
  { label: 'Promotion HU',  meta: 'OUT', icon: 'call' },
  { label: 'Promotion WP',  meta: 'OUT', icon: 'call' },
];
function QuickLogCard() {
  const [active, setActive] = useState(null);
  return (
    <Card>
      <SectionTitle icon={<I.zap />} title="Quick Log" sub="Log a touchpoint instantly" />
      <div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {QUICK_LOG.map((q, i) => (
          <button key={i}
            onMouseDown={() => setActive(i)}
            onMouseUp={() => setTimeout(() => setActive(null), 400)}
            onMouseLeave={() => setActive(null)}
            style={{
              background: active === i ? 'var(--gb-brand-tint-medium)' : 'var(--gb-fill-subtle)',
              border: '1px solid ' + (active === i ? 'var(--gb-brand-tint-border)' : 'var(--gb-border-default)'),
              borderRadius: 'var(--gb-r-md)',
              padding: '10px 9px',
              display: 'flex', flexDirection: 'column', gap: 4,
              alignItems: 'flex-start',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all var(--gb-anim)',
              fontFamily: 'var(--gb-font-sans)',
            }}>
            <span style={{ color: active === i ? 'var(--gb-brand-label)' : 'var(--gb-text-tertiary)', display: 'flex' }}>
              {q.icon === 'vm' ? <I.inbox size={13} /> : <I.phone size={13} />}
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--gb-text-primary)' }}>{q.label}</span>
            <span style={{
              fontSize: 9, letterSpacing: .8, fontWeight: 700,
              color: 'var(--gb-text-muted)', textTransform: 'uppercase',
              fontFamily: 'var(--gb-font-mono)',
            }}>{q.meta}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function AltLookupsCard() {
  const D = useD();
  const lookups = [];
  if (D.contact.phone) lookups.push({ type: 'Phone', value: D.contact.phone, primary: true });
  if (D.contact.email) lookups.push({ type: 'Email', value: D.contact.email, primary: true });
  return (
    <Card>
      <SectionTitle
        icon={<I.search />} title="Alternate Lookups" count={lookups.length}
        right={<IconBtn size="xs" ghost icon={<I.plus />} />}
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

function MailerCard() {
  const D = useD();
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
          <Btn variant="tinted" status="warning" size="sm" full>Snooze</Btn>
          <Btn variant="tinted" status="error" size="sm" full>Remove</Btn>
        </div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
function App({ store }) {
  const data = useSyncExternalStore(store.subscribe, store.get);
  const D = useMemo(() => adapt(data), [data]);

  // Theme is owned globally by the extension (theme.js / applyTheme writes
  // data-theme + the --gb-* tokens on <html> from the user's settings). We
  // inherit it — no per-page light/dark toggle.
  const [sideCollapsed, setSideCollapsed] = useState(false);

  return (
    <DataCtx.Provider value={D}>
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
        <Sidebar currentLabel={'Account · #' + (D.ids.account || '')} collapsed={sideCollapsed} setCollapsed={setSideCollapsed} />
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
            <Hero />

            {/* Account information — full width */}
            <AccountInfoCard />

            <StatsStrip />

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'flex-start' }}>
              {/* One stacked screen, each section a capped custom-scroll area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                <ContactsPanel />
                <ActivityPanel />
                <EmailsPanel />
                <OpportunitiesPanel />
                <OrdersPanel />
                <ProofsPanel />
                <TasksPanel />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 64 }}>
                <SystemCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </DataCtx.Provider>
  );
}

/* ════════════════════════════════════════════════════════════
   REGISTER with the Custom Pages engine (custom-pages.js)
════════════════════════════════════════════════════════════ */
if (!window.__gbAccountDetailsRegistered) {
  window.__gbAccountDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.account_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Account page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
