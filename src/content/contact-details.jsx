/* eslint-disable */
/**
 * Contact-detail custom page (CRM Page 240).
 *
 * This entry owns contact-specific glue only: the email composer modal.
 * Everything visual comes from the shared detail modules — the page is a thin
 * composition over DetailPageFrame. Notes now write real CRM Lead Notes via
 * the shared AddNoteModal (the old chrome.storage local-note layer is gone).
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { sendContactEmail } from '../lib/contactEmail.js';
import { readEmailConfig } from '../lib/emailSender.js';
import { accountEmailTemplates, evaluateAccountEmailTemplate, savedProposalPlaceholder } from '../lib/emailComposerCommands.js';
import { EmailComposer } from '../modals/EmailPreview.jsx';
import { CasesPanel, DataCtx, DetailErrorBoundary, EmailsPanel, I, LazySection, OrdersPanel, StatsStrip, SystemCard, fullName, useD } from '../lib/detail-shared.jsx';
import { AccountInfoCard, AddNoteModal, ActivityPanel, AltLookupsCard, Breadcrumb, ContactInfoCard, DetailPageFrame, Hero, MailerCard, ModalCtx, ModalShell, OpportunitiesPanel, PatchCtx, ProofsPanel, QuickLogCard, TasksPanel, TopBar, gbToast, useDetailData, useModal, useModalHost } from '../lib/crm-detail-shared.jsx';

function ContactEmailModal() {
  const D = useD();
  const { closeModal } = useModal();
  const [config, setConfig] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [sending, setSending] = useState(false);
  const to = String(D.contact.email || '').trim();
  const contactName = fullName(D.contact) || 'Contact';

  useEffect(() => {
    let live = true;
    readEmailConfig().then((next) => { if (live) setConfig(next); });
    try {
      chrome.storage.local.get('gbSavedProposals', (data) => {
        if (live) setProposals(Array.isArray(data?.gbSavedProposals) ? data.gbSavedProposals : []);
      });
    } catch (e) {}
    return () => { live = false; };
  }, []);

  const applyTemplate = async (template) => {
    try {
      const resolver = window.__gbResolveAllVarsAsync;
      const result = await evaluateAccountEmailTemplate(template, (vars, toField) => {
        if (typeof resolver !== 'function') throw new Error('Reload this page before using account templates');
        return resolver(vars, toField, document);
      });
      return { ok: true, htmlBody: result.htmlBody, subject: result.subject };
    } catch (error) {
      const message = error?.message || 'Could not evaluate that template';
      gbToast(message, 'error');
      return { ok: false, error: message };
    }
  };

  const send = async (draft) => {
    if (sending) return { ok: false };
    setSending(true);
    const result = await sendContactEmail({ ...draft, config: config || undefined });
    setSending(false);
    if (result.state === 'sent') {
      gbToast(`Email sent to ${contactName}`, 'success'); return { ok: true };
    }
    if (result.state === 'opened') {
      gbToast(`Opened email to ${contactName} in Outlook`, 'success'); return { ok: true };
    }
    gbToast(result.error || 'Could not send email', 'error');
    return { ok: false, error: result.error };
  };

  return (
    <ModalShell title="Send Email" icon={<I.send />} subtitle={`${contactName} · ${to}`} width={780}>
      <EmailComposer
        replyTo={to}
        subject=""
        onSend={send}
        sending={sending}
        accountTemplates={accountEmailTemplates(config?.templates || [])}
        onApplyAccountTemplate={applyTemplate}
        savedProposals={proposals}
        onApplySavedProposal={async (proposal) => ({ ok: true, mode: 'insert', text: savedProposalPlaceholder(proposal) })}
        initiallyExpanded
        editableSubject
        fill
        onDiscard={closeModal}
        transportLabel={config ? (config.paReady ? 'Power Automate' : 'Outlook') : 'Checking…'}
        placeholder="Write your email…  Type / for commands"
      />
    </ModalShell>
  );
}

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
export function ContactDetailsApp({ store }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();
  const name = fullName(D.contact) || 'Contact';

  // One compose entry used by both the hero "Send Email" and the Email
  // History "Compose" button.
  const openCompose = () => {
    if (!String(D.contact.email || '').trim()) { gbToast('This contact has no email address', 'error'); return; }
    modalHost.openModal(<ContactEmailModal />);
  };

  return (
    <DataCtx.Provider value={D}>
    <PatchCtx.Provider value={patch}>
    <ModalCtx.Provider value={modalHost}>
      <DetailPageFrame
        currentLabel={'Customer · #' + (D.ids.contact || '')}
        ready={D.ready}
        modalHost={modalHost}
        topBar={
          <TopBar>
            <Breadcrumb items={[{ label: 'CRM', page: 261 }, { label: 'Customers', page: 360 }]} current={name} id={D.ids.contact} />
          </TopBar>
        }>
        <Hero onSendEmail={openCompose} />

        {/* Account Info + Contact Info side-by-side, always visible */}
        <div className="gbcp-pair">
          <AccountInfoCard />
          <ContactInfoCard />
        </div>

        <StatsStrip />

        <div className="gbcp-page-grid">
          {/* No tabs — every section stacked on one screen, each capped to a
              custom-scroll area. Below-the-fold panels defer paint via
              LazySection; ActivityPanel stays unwrapped so its filter
              popover can overflow the card. */}
          <div className="gbcp-stack">
            <ActivityPanel onAddNote={() => modalHost.openModal(<AddNoteModal />)} />
            <LazySection><EmailsPanel onCompose={openCompose} /></LazySection>
            <LazySection><OpportunitiesPanel /></LazySection>
            <LazySection minHeight={860}><OrdersPanel /></LazySection>
            <LazySection minHeight={300}><ProofsPanel /></LazySection>
            <LazySection minHeight={700}><TasksPanel /></LazySection>
            <LazySection minHeight={160}><CasesPanel /></LazySection>
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
if (!window.__gbContactDetailsRegistered) {
  window.__gbContactDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.contact_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Contact page"><ContactDetailsApp store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
