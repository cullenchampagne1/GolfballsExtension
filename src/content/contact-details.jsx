/* eslint-disable */
/**
 * Contact-detail custom page (CRM Page 240).
 *
 * This entry owns contact-specific glue only: the email composer modal and
 * the local-note annotation layer. Everything visual comes from the shared
 * detail modules — the page is a thin composition over DetailPageFrame.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { sendContactEmail } from '../lib/contactEmail.js';
import { readEmailConfig } from '../lib/emailSender.js';
import { accountEmailTemplates, evaluateAccountEmailTemplate, savedProposalPlaceholder } from '../lib/emailComposerCommands.js';
import { EmailComposer } from '../modals/EmailPreview.jsx';
import { Btn, CasesPanel, DataCtx, DetailErrorBoundary, EmailsPanel, I, LazySection, OrdersPanel, StatsStrip, SystemCard, fullName, useD } from '../lib/detail-shared.jsx';
import { AccountInfoCard, ActivityPanel, AltLookupsCard, Breadcrumb, ContactInfoCard, DetailPageFrame, FormField, Hero, MailerCard, ModalCtx, ModalShell, OpportunitiesPanel, PatchCtx, ProofsPanel, QuickLogCard, TArea, TasksPanel, TopBar, gbToast, useDetailData, useModal, useModalHost } from '../lib/crm-detail-shared.jsx';

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
        accountTemplates={accountEmailTemplates(config?.templates)}
        onApplyAccountTemplate={applyTemplate}
        savedProposals={proposals}
        onApplySavedProposal={async (proposal) => ({ ok: true, mode: 'insert', text: savedProposalPlaceholder(proposal) })}
        initiallyExpanded
        editableSubject
        sticky={false}
        onDiscard={closeModal}
        transportLabel={config ? (config.paReady ? 'Power Automate' : 'Outlook') : 'Checking…'}
        placeholder="Write your email…  Type / for commands"
      />
    </ModalShell>
  );
}

/* Add a local note — stored in our storage (not the CRM); shows as a yellow
   row in the Activity Feed. */
function NoteModal({ onSave }) {
  const { closeModal } = useModal();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try { await onSave(t); closeModal(); } catch (e) { setBusy(false); }
  };
  return (
    <ModalShell title="Add note" icon={<I.note />} subtitle="Personal — stored locally, shown in the activity feed" width={460} footer={<>
      <Btn variant="ghost" onClick={closeModal}>Cancel</Btn>
      <Btn variant="primary" disabled={!text.trim() || busy} onClick={save}>Add note</Btn>
    </>}>
      <FormField label="Note">
        <TArea value={text} maxLength={LOCAL_NOTE_MAX_CHARS} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Type a note about this contact…" />
      </FormField>
    </ModalShell>
  );
}

/* ── Local notes — a personal annotation layer the CRM doesn't have. Stored in
   chrome.storage.local under gbLocalNotes, keyed by contact id, and merged into
   the Activity Feed as yellow-tinted rows. (Not synced to the CRM; the native
   Activity/SaveLeadNote endpoint exists if real CRM notes are wanted later.) */
const LOCAL_NOTES_KEY = 'gbLocalNotes';
const LOCAL_NOTE_MAX_CHARS = 4_000;
const LOCAL_NOTE_MAX_PER_CONTACT = 100;
function loadLocalNotesMap() {
  return new Promise((res) => {
    try {
      chrome.storage.local.get(LOCAL_NOTES_KEY, (d) => {
        const value = d && d[LOCAL_NOTES_KEY];
        res(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      });
    }
    catch (e) { res({}); }
  });
}
function localNoteContactKey(value) {
  const key = String(value == null ? '' : value).trim();
  return /^\d{1,12}$/.test(key) ? key : '';
}
function normalizeLocalNotes(value) {
  return (Array.isArray(value) ? value : [])
    .filter((note) => note && typeof note === 'object' && typeof note.text === 'string')
    .slice(0, LOCAL_NOTE_MAX_PER_CONTACT)
    .map((note) => ({
      id: String(note.id || '').slice(0, 64),
      text: note.text.slice(0, LOCAL_NOTE_MAX_CHARS),
      ts: Number.isFinite(Number(note.ts)) ? Number(note.ts) : Date.now(),
    }));
}
function useLocalNotes(key) {
  const safeKey = localNoteContactKey(key);
  const [notes, setNotes] = useState([]);
  useEffect(() => {
    if (!safeKey) { setNotes([]); return undefined; }
    let live = true;
    const read = () => loadLocalNotesMap().then((m) => { if (live) setNotes(normalizeLocalNotes(m[safeKey])); });
    read();
    const onChg = (ch, area) => { if (area === 'local' && ch[LOCAL_NOTES_KEY]) read(); };
    try { chrome.storage.onChanged.addListener(onChg); } catch (e) {}
    return () => { live = false; try { chrome.storage.onChanged.removeListener(onChg); } catch (e) {} };
  }, [safeKey]);
  const add = async (text) => {
    const t = String(text || '').trim().slice(0, LOCAL_NOTE_MAX_CHARS);
    if (!t || !safeKey) return;
    const m = await loadLocalNotesMap();
    const list = normalizeLocalNotes(m[safeKey]);
    m[safeKey] = [{ id: 'ln_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: t, ts: Date.now() }, ...list]
      .slice(0, LOCAL_NOTE_MAX_PER_CONTACT);
    try { chrome.storage.local.set({ [LOCAL_NOTES_KEY]: m }); } catch (e) {}
  };
  const remove = async (id) => {
    if (!safeKey) return;
    const m = await loadLocalNotesMap();
    m[safeKey] = normalizeLocalNotes(m[safeKey]).filter((n) => n.id !== String(id || ''));
    try { chrome.storage.local.set({ [LOCAL_NOTES_KEY]: m }); } catch (e) {}
  };
  return { notes, add, remove };
}

/* ════════════════════════════════════════════════════════════
   ROOT
════════════════════════════════════════════════════════════ */
function App({ store }) {
  const [D, patch] = useDetailData(store);
  const modalHost = useModalHost();
  const ln = useLocalNotes(D.ids.contact);
  // Local notes ride at the top of the feed (newest annotations first), then
  // the real CRM activity.
  const noteRows = useMemo(() => ln.notes.map((n) => ({ localNote: true, noteId: n.id, subject: n.text, category: 'Note', employee: 'You', date: new Date(n.ts).toLocaleString() })), [ln.notes]);
  const name = fullName(D.contact) || 'Contact';

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
        <Hero onSendEmail={() => {
          if (!String(D.contact.email || '').trim()) { gbToast('This contact has no email address', 'error'); return; }
          modalHost.openModal(<ContactEmailModal />);
        }} />

        {/* Account Info + Contact Info side-by-side, always visible */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <AccountInfoCard />
          <ContactInfoCard />
        </div>

        <StatsStrip />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 14, alignItems: 'flex-start' }}>
          {/* No tabs — every section stacked on one screen, each capped to a
              custom-scroll area. Below-the-fold panels defer paint via
              LazySection; ActivityPanel stays unwrapped so its filter
              popover can overflow the card. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <ActivityPanel
              extraRows={noteRows}
              onAddNote={() => modalHost.openModal(<NoteModal onSave={ln.add} />)}
              onDeleteNote={ln.remove}
            />
            <LazySection><EmailsPanel /></LazySection>
            <LazySection><OpportunitiesPanel /></LazySection>
            <LazySection minHeight={860}><OrdersPanel /></LazySection>
            <LazySection minHeight={300}><ProofsPanel /></LazySection>
            <LazySection minHeight={700}><TasksPanel /></LazySection>
            <LazySection minHeight={160}><CasesPanel /></LazySection>
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
if (!window.__gbContactDetailsRegistered) {
  window.__gbContactDetailsRegistered = true;
  ensureTheme();
  window.__gbCustomPages = window.__gbCustomPages || {};
  window.__gbCustomPages.contact_details = {
    render(rootEl, ctx) {
      const root = createRoot(rootEl);
      root.render(<DetailErrorBoundary label="Contact page"><App store={ctx.store} /></DetailErrorBoundary>);
      return () => { try { root.unmount(); } catch (e) {} };
    },
  };
}
