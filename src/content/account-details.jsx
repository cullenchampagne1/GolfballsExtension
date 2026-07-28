/* eslint-disable */
/**
 * Account-details custom page (CRM Page 271).
 *
 * Owns account-specific composition only: the account hero, the 2-column
 * account info card, and the related-contacts table. Every panel, modal, and
 * layout piece comes from the shared detail modules so the three detail
 * surfaces cannot drift.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { Btn, ContactPill, Card, DASH, DataCtx, DetailErrorBoundary, EmailsPanel, EmptyRow, I, IconBtn, KV, LazySection, OrdersPanel, ScrollArea, SectionTitle, StatsStrip, SystemCard, Tag, Td, Th, fmtDate, goUrl, isEmpty, readBackTo, tableStyle, trStyle, txt, useD } from '../lib/detail-shared.jsx';
import { ActivityPanel, AddNoteModal, AltLookupsCard, BackChip, Breadcrumb, ContactInfoCard, DetailPageFrame, EKV, EditToggle, HeroAvatar, HeroPillStrip, HeroShell, HeroTitleRow, MailerCard, ModalCtx, OpportunitiesPanel, OpportunityModal, PatchCtx, ProofsPanel, QuickLogCard, TasksPanel, TopBar, useDetailData, useModal, useModalHost } from '../lib/crm-detail-shared.jsx';

/* ════════════════════════════════════════════════════════════
   HERO / PROFILE CARD
════════════════════════════════════════════════════════════ */
function Hero() {
  const D = useD();
  const a = D.account;
  const { openModal } = useModal();
  const aInit = (txt(a.name) || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const loc = [a.city, a.state].filter(Boolean).join(', ');
  const territory = txt(a.territoryName);
  const web = a.webAddress ? String(a.webAddress).replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
  return (
    <HeroShell
      avatar={<HeroAvatar text={aInit} badge={
        <div style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 24, height: 24, borderRadius: 8,
          background: 'var(--gb-surface-1)', border: '1px solid var(--gb-border-default)',
          color: 'var(--gb-brand-label)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><I.briefcase size={12} /></div>
      } />}
      actions={<>
        <Btn variant="primary" icon={<I.target />} full onClick={() => openModal(<OpportunityModal />)}>New Opportunity</Btn>
        <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <Btn variant="ghost" size="sm" icon={<I.note />} onClick={() => openModal(<AddNoteModal />)}>Add note</Btn>
          <IconBtn size="sm" icon={<I.more />} />
        </div>
      </>}>
      <HeroTitleRow title={txt(a.name) || 'Account'} id={D.ids.account} tags={<>
        {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
        {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
        <Tag tone="neutral" size="md">Account</Tag>
      </>} />

      {/* Web address link */}
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

      <HeroPillStrip>
        <ContactPill icon={<I.briefcase />} label="Industry" value={txt(a.industry) || DASH} muted={isEmpty(a.industry)} />
        <ContactPill icon={<I.pin />}   label="Location" value={loc || DASH} muted={!loc} />
        <ContactPill icon={<I.user />} label="Territory" value={txt(a.territoryName) || DASH} muted={!a.territoryName} />
        <ContactPill icon={<I.shield />} label="Tax Exempt" value={a.taxExempt ? 'Yes' : 'No'} />
      </HeroPillStrip>
    </HeroShell>
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

/* — Account Info — full-width, two columns of shared EKV/KV rows. There is
   no account Update transport yet, so EditToggle only flips the row styling. */
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

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
function App({ store }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();
  const name = txt(D.account.name) || 'Account';
  const back = readBackTo();   // came from a contact page? offer a way back

  return (
    <DataCtx.Provider value={D}>
    <PatchCtx.Provider value={patch}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentLabel={'Account · #' + (D.ids.account || '')}
        ready={D.ready}
        modalHost={modalHost}
        topBar={
          <TopBar>
            {/* Came-from chip: jump back to the contact we opened this account from */}
            {back && <BackChip href={back.href} label={back.label || 'Back'} title={'Back to ' + (back.label || 'contact')} />}
            <Breadcrumb items={[{ label: 'CRM', page: 261 }, { label: 'Accounts', page: 360 }]} current={name} id={D.ids.account} />
          </TopBar>
        }>
        <Hero />

        {/* Account information — full width */}
        <AccountInfoCard />

        <StatsStrip />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'flex-start' }}>
          {/* One stacked screen, each section a capped custom-scroll area.
              Below-the-fold panels defer paint via LazySection; ActivityPanel
              stays unwrapped so its filter popover can overflow the card. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <ContactsPanel />
            <ActivityPanel onAddNote={() => modalHost.openModal(<AddNoteModal />)} />
            <LazySection><EmailsPanel /></LazySection>
            <LazySection><OpportunitiesPanel /></LazySection>
            <LazySection minHeight={860}><OrdersPanel /></LazySection>
            <LazySection minHeight={300}><ProofsPanel /></LazySection>
            <LazySection minHeight={700}><TasksPanel /></LazySection>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 64 }}>
            <QuickLogCard />
            <AltLookupsCard />
            <MailerCard />
            <SystemCard />
          </div>
        </div>
      </DetailPageFrame>
    </ModalCtx.Provider>
    </PatchCtx.Provider>
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
