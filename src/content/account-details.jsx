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
import { Btn, ContactPill, Card, DASH, DataCtx, DetailErrorBoundary, EmailsPanel, EmptyRow, I, KV, LazySection, OrdersPanel, ScrollArea, SectionTitle, StatsStrip, SystemCard, Tag, Td, Th, fmtDate, goUrl, isEmpty, readBackTo, tableStyle, trStyle, txt, useD } from '../lib/detail-shared.jsx';
import { ActivityPanel, AddNoteModal, AltLookupsCard, BackChip, Breadcrumb, DetailPageFrame, FormField, HeroAvatar, HeroPillStrip, HeroShell, HeroTitleRow, MailerCard, ModalCtx, ModalShell, OpportunitiesPanel, PatchCtx, ProofsPanel, QuickLogCard, TArea, TInput, TasksPanel, TopBar, crmUpdateAccount, gbToast, useDetailData, useModal, useModalHost, usePatch } from '../lib/crm-detail-shared.jsx';

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
        <Btn variant="primary" icon={<I.edit />} full onClick={() => openModal(<AccountEditModal />)}>Edit Account</Btn>
        <Btn variant="tinted" status="info" icon={<I.phone />} full onClick={() => { try { window.__gbShowCallLogModal && window.__gbShowCallLogModal(); } catch (e) {} }}>Log Call</Btn>
        <Btn variant="secondary" icon={<I.note />} full onClick={() => openModal(<AddNoteModal />)}>Add Note</Btn>
      </>}>
      <HeroTitleRow title={txt(a.name) || 'Account'} id={D.ids.account} tags={<>
        {territory && <Tag tone="brand" size="md" icon={<I.briefcase />}>{territory}{a.salesRep ? ' · ' + a.salesRep : ''}</Tag>}
        {a.industry && <Tag tone="info" size="md">{a.industry}</Tag>}
        <Tag tone="neutral" size="md">Account</Tag>
      </>} />

      {/* Web address link */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        fontSize: 13, color: 'var(--gb-text-tertiary)', fontWeight: 400, flexWrap: 'wrap',
      }}>
        <I.ext size={13} style={{ color: 'var(--gb-text-muted)' }} />
        {web
          ? <a href={a.webAddress} target="_blank" rel="noreferrer" style={{ color: 'var(--gb-brand-label)', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{web}<I.ext size={11} /></a>
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

function AccountEditModal() {
  const { closeModal } = useModal();
  const patch = usePatch();
  const a = useD().account;
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    Name: a.name || '',
    AccountWebAddress: a.webAddress || '',
    MainAddress: a.mainAddress || '',
    MainCity: a.city || '',
    MainState: a.state || '',
    MainPostal: a.postal || '',
    LinkedInURL: a.linkedInUrl || '',
    Context: a.contextNotes || '',
  });
  const set = (key) => (e) => setF((current) => ({ ...current, [key]: e.target.value }));
  const save = async () => {
    if (busy || !f.Name.trim()) return;
    setBusy(true);
    try {
      await crmUpdateAccount(f);
      patch((D) => ({
        ...D,
        account: {
          ...D.account,
          name: f.Name,
          webAddress: f.AccountWebAddress,
          mainAddress: f.MainAddress,
          city: f.MainCity,
          state: f.MainState,
          postal: f.MainPostal,
          linkedInUrl: f.LinkedInURL,
          contextNotes: f.Context,
        },
      }));
      gbToast('Account updated', 'success');
      closeModal();
    } catch (e) {
      gbToast(e?.message || 'Could not update account', 'error');
      setBusy(false);
    }
  };
  return (
    <ModalShell title="Edit Account" icon={<I.briefcase />} width={580} footer={<>
      <Btn variant="ghost" size="sm" onClick={closeModal} disabled={busy}>Cancel</Btn>
      <Btn variant="primary" size="sm" icon={<I.check />} onClick={save} disabled={busy || !f.Name.trim()}>{busy ? 'Saving…' : 'Save'}</Btn>
    </>}>
      <FormField label="Account name"><TInput autoFocus value={f.Name} onChange={set('Name')} /></FormField>
      <FormField label="Web address"><TInput value={f.AccountWebAddress} onChange={set('AccountWebAddress')} placeholder="https://…" /></FormField>
      <FormField label="Main address"><TInput value={f.MainAddress} onChange={set('MainAddress')} /></FormField>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 90px 110px', gap: 12 }}>
        <FormField label="City"><TInput value={f.MainCity} onChange={set('MainCity')} /></FormField>
        <FormField label="State"><TInput value={f.MainState} onChange={set('MainState')} maxLength={30} /></FormField>
        <FormField label="Postal code"><TInput value={f.MainPostal} onChange={set('MainPostal')} /></FormField>
      </div>
      <FormField label="LinkedIn URL"><TInput value={f.LinkedInURL} onChange={set('LinkedInURL')} placeholder="https://linkedin.com/company/…" /></FormField>
      <FormField label="Context"><TArea value={f.Context} onChange={set('Context')} rows={4} placeholder="Internal account context…" /></FormField>
    </ModalShell>
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
                      ? <a href={c.detailUrl} onClick={(e) => { e.preventDefault(); goUrl(c.detailUrl); }} style={{ color: 'var(--gb-brand-label)', fontWeight: 500, textDecoration: 'none' }}>{name || DASH}</a>
                      : <span style={{ fontWeight: 500, color: 'var(--gb-text-secondary)' }}>{name || DASH}</span>}
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

/* — Account Info — read-only summary; editing lives in the hero modal. */
function AccountInfoCard() {
  const D = useD();
  const a = D.account;
  return (
    <Card>
      <SectionTitle
        icon={<I.briefcase />} title="Account Information"
        sub={`#${D.ids.account || DASH} · ${txt(a.name) || DASH}`}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px', padding: '8px 18px 14px' }}>
        <div>
          <KV label="Account Name">{txt(a.name)}</KV>
          <KV label="Account ID" mono copyable>{txt(D.ids.account)}</KV>
          <KV label="Industry">{txt(a.industry)}</KV>
          <KV label="Web Address">{txt(a.webAddress)}</KV>
          <KV label="Main Address">{txt(a.mainAddress)}</KV>
          <KV label="City">{txt(a.city)}</KV>
          <KV label="State">{txt(a.state)}</KV>
          <KV label="Postal Code" mono>{txt(a.postal)}</KV>
          <KV label="Context">{txt(a.contextNotes)}</KV>
        </div>
        <div>
          <KV label="Territory">
            {a.territoryName ? <Tag tone="brand" size="sm">{a.territoryName}</Tag> : DASH}
            {a.salesRep && <span style={{ marginLeft: 6, color: 'var(--gb-text-tertiary)' }}>{a.salesRep}</span>}
          </KV>
          <KV label="User Type">{txt(a.userType)}</KV>
          <KV label="Tax Exempt">{a.taxExempt ? 'Yes' : 'No'}</KV>
          <KV label="Credit Approved">{fmtDate(a.creditApproved) === DASH ? null : fmtDate(a.creditApproved)}</KV>
          <KV label="LinkedIn URL">{txt(a.linkedInUrl)}</KV>
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
export function AccountDetailsApp({ store }) {
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

        <div className="gbcp-page-grid">
          {/* One stacked screen, each section a capped custom-scroll area.
              Below-the-fold panels defer paint via LazySection; ActivityPanel
              stays unwrapped so its filter popover can overflow the card. */}
          <div className="gbcp-stack">
            <ContactsPanel />
            <ActivityPanel onAddNote={() => modalHost.openModal(<AddNoteModal />)} />
            <LazySection><EmailsPanel /></LazySection>
            <LazySection><OpportunitiesPanel canCreate={false} /></LazySection>
            <LazySection minHeight={860}><OrdersPanel /></LazySection>
            <LazySection minHeight={300}><ProofsPanel /></LazySection>
            <LazySection minHeight={700}><TasksPanel canCreate={false} /></LazySection>
          </div>

          <div className="gbcp-aside">
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
      root.render(<DetailErrorBoundary label="Account page"><AccountDetailsApp store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
