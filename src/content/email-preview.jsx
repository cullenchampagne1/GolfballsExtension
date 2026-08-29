import React, { useEffect, useState } from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost, useToast } from '../ui/components/ToastHost.jsx';
import { EmailPreview } from '../modals/EmailPreview.jsx';
import { parseEml, isFullHtmlPage, stripPageChrome, plainTextBody } from '../lib/emailParse.js';
import { filterCaseTemplates, pickBestCaseTemplate, recommendedFromTemplate, matchesCaseTpl } from '../lib/caseMatch.js';
import { pickFromAddress } from '../lib/sender.js';
import { sendEmail, readEmailConfig } from '../lib/emailSender.js';
import { bareEmail, replyRecipient, replySenderAccount, replySubject, sendThreadReply } from '../lib/emailReply.js';
import { accountEmailTemplates, evaluateAccountEmailTemplate, savedProposalPlaceholder } from '../lib/emailComposerCommands.js';
import { filterLocalEmailTemplates } from '../lib/emailTemplateCapabilities.js';
import { reportFeatureUsage } from '../lib/usageEvents.js';

/* ───────────────────────────────────────────────────────────────
   email-preview.jsx — content-script entry for the React Email
   Preview / Case modal. Replaces src/vanilla/modals/email-preview.js.

   Exposes the same globals the vanilla version did so main.js's
   wiring keeps working unchanged:

     window.__gbEmailPreviewScan()   — arm every inbox row that
       links to a Page=268 message (adds a click that opens the
       modal; the row's own anchor still works).
     window.__gbOpenEmailPreview(t)  — open directly for a target
       { messageId, messageGuid, meta:{from,to,subject,date} }.

   The EML is fetched lazily (background `fetchRaw`) once the modal
   is open; the modal shows a spinner until it lands. Category /
   junk updates reuse the legacy two-step Get.ajax → Update.ajax
   flow against the case on the current page.
─────────────────────────────────────────────────────────────── */

const ROW_LINK_SEL = 'a[href*="Page=268"][href*="MessageID="]';
const HOST_ID = '__gb-email-preview';

if (!window.__gbEmailPreviewLoaded) {
  window.__gbEmailPreviewLoaded = true;
  ensureTheme();

  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(resp);
      });
    } catch { resolve(null); }
  });

  // A relayed message may have only a plain-text preview; wrap it as HTML
  // without letting its own angle brackets become markup.
  const escapeHtml = (value) => String(value || '').replace(
    /[&<>"']/g,
    (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]),
  );

  const isCasePage = () => /[?&]caseID=/i.test(window.location.search);
  const currentCaseId = () => new URLSearchParams(window.location.search).get('caseID');

  async function getEmployeeId() {
    const el = document.getElementById('tbCurrentAdmin');
    if (el?.value?.trim()) return el.value.trim();
    if (window.Case?.ClosedBy) return String(window.Case.ClosedBy);
    if (window.__gbEmployeeId) return String(window.__gbEmployeeId);
    try {
      const data = await new Promise((res) => chrome.storage.local.get(['gbEmployeeId', 'featureFlags'], res));
      const id = data?.gbEmployeeId || data?.featureFlags?.gbEmployeeId;
      if (id) return String(id);
    } catch { /* ignore */ }
    return null;
  }

  /* Two-step case update: read the case JSON, then write it back
     with the new Category/Subcategory (or Junk). Status 3 closes
     the case — same contract the vanilla modal used. Returns
     { ok, error }. */
  async function updateCase({ category, subcategory, status = 3 }) {
    const caseId = currentCaseId();
    if (!caseId) return { ok: false, error: 'No caseID on this page' };
    const getResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Get.ajax?${caseId}` });
    let caseData = {};
    try { caseData = JSON.parse(getResp?.text || '{}'); } catch { /* ignore */ }
    if (!caseData.caseID) return { ok: false, error: 'Could not read case data' };

    const employeeId = await getEmployeeId();
    const payload = {
      Name:        caseData.Name      || '',
      Direction:   caseData.Direction || 'In',
      Channel:     caseData.Channel   || 'Email',
      Category:    category,
      Subcategory: subcategory || category,
      Owner:       String(caseData.OwnerID || '1'),
      caseID:      String(caseId),
      Department:  String(caseData.DepartmentID || '2'),
      Status:      status,
    };
    if (employeeId) payload.ClosedBy = String(employeeId);

    const upResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Update.ajax?${JSON.stringify(payload)}` });
    let result = {};
    try { result = JSON.parse(upResp?.text || '{}'); } catch { /* ignore */ }
    const ok = result.caseID === parseInt(caseId, 10) || /success|ok|closed/i.test(upResp?.text || '');
    if (!ok && upResp?.text && upResp.text.length < 200) return { ok: false, error: upResp.text };
    return { ok };
  }

  /* Stateful wrapper — owns the EML fetch + template match + the
     apply/junk lifecycle, feeding the presentational EmailPreview. */
  function EmailPreviewHost({ target, mountOnClosed, mountBindClose }) {
    const toast = useToast();
    const [email, setEmail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recommended, setRecommended] = useState([]);
    const [caseTemplates, setCaseTemplates] = useState([]);
    const [sendingTemplate, setSendingTemplate] = useState(false);
    const [sendingReply, setSendingReply] = useState(false);
    const [emailConfig, setEmailConfig] = useState(null);
    const [savedProposals, setSavedProposals] = useState([]);
    const [applyState, setApplyState] = useState(null); // 'saving' | { category, subcategory }

    useEffect(() => {
      let alive = true;
      (async () => {
        let parsed;
        if (target.relayId) {
          // Relay path: an email-relay notification names one cached message by
          // reference; the worker fetches it now, so the notification carries a
          // pointer rather than a copy of the mail. A relayed reply has no CRM
          // message id to fetch, so its stored body IS the email.
          const relayed = await send({
            action: 'relayMessage', ref: target.relayId,
          });
          if (!alive) return;
          const message = relayed?.ok ? relayed.message : null;
          if (!message) {
            toast?.error?.(
              'That email is no longer in the relay cache', { duration: 4000 },
            );
            mountOnClosed?.();
            return;
          }
          parsed = {
            from: message.contact_name
              ? `${message.contact_name} <${message.contact_email}>`
              : (message.contact_email || ''),
            to: '',
            subject: message.subject || '(no subject)',
            date: message.received_at || '',
            bodyHtml: message.body || (message.preview
              ? `<p>${escapeHtml(message.preview)}</p>` : ''),
          };
        } else if (target.email) {
          // Payload path (relayed Notifications email): render the supplied
          // email directly — a relayed reply has no CRM message id to fetch.
          // Shape: { from, to, subject, date, bodyHtml }.
          parsed = { ...target.email };
        } else {
          const url = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx'
            + `?Page=268&MessageGUID=${encodeURIComponent(target.messageGuid || '')}`
            + `&MessageID=${encodeURIComponent(target.messageId || '')}`;
          const resp = await send({ action: 'fetchRaw', url });
          if (!alive) return;
          const raw = resp?.text || '';
          if (!raw) {
            parsed = { ...target.meta, bodyHtml: '' };
          } else if (isFullHtmlPage(raw)) {
            parsed = { ...target.meta, bodyHtml: stripPageChrome(raw) };
          } else {
            const p = parseEml(raw);
            parsed = p.bodyHtml ? p : { ...target.meta, bodyHtml: plainTextBody(raw) };
          }
        }
        // Fall back to the row-scraped meta for any field the EML lacked.
        parsed.from = parsed.from || target.meta?.from || '';
        parsed.to = parsed.to || target.meta?.to || '';
        parsed.subject = parsed.subject || target.meta?.subject || '';
        parsed.date = parsed.date || target.meta?.date || '';
        setEmail(parsed);
        setLoading(false);

        // Template match → recommended chips (only relevant on a case page).
        try {
          const data = await new Promise((res) => chrome.storage.local.get(['templates', 'devSettings'], res));
          if (!alive) return;
          const caseTpls = filterCaseTemplates(
            filterLocalEmailTemplates(data?.templates, data?.devSettings),
          );
          const snapshot = {
            from: parsed.from,
            subject: parsed.subject,
            body: (parsed.bodyHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          };
          const best = pickBestCaseTemplate(caseTpls, snapshot);
          setRecommended(recommendedFromTemplate(best));
          /* Reply-template dropdown only lists templates whose match
             rules fit this email (best match first). */
          const matched = caseTpls.filter((t) => matchesCaseTpl(t, snapshot));
          setCaseTemplates(best ? [best, ...matched.filter((t) => t.id !== best.id)] : matched);
        } catch { /* no templates — rail still shows all categories */ }
      })();
      return () => { alive = false; };
    }, [target]);

    useEffect(() => {
      let alive = true;
      readEmailConfig().then((config) => { if (alive) setEmailConfig(config); });
      const onStorageChanged = (changes, area) => {
        if (!alive || area !== 'local' || !changes.gbSavedProposals) return;
        const next = changes.gbSavedProposals.newValue;
        setSavedProposals(Array.isArray(next) ? next : []);
      };
      try {
        chrome.storage.local.get('gbSavedProposals', (data) => {
          if (alive) setSavedProposals(Array.isArray(data?.gbSavedProposals) ? data.gbSavedProposals : []);
        });
        chrome.storage.onChanged.addListener(onStorageChanged);
      } catch { /* saved proposals remain empty */ }
      return () => {
        alive = false;
        try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* ignore */ }
      };
    }, [target]);

    const onApplyCategory = async (category, subcategory) => {
      if (applyState === 'saving') return;
      setApplyState('saving');
      const { ok, error } = await updateCase({ category, subcategory });
      if (ok) {
        setApplyState({ category, subcategory });
        toast?.success?.(`Categorized: ${category} → ${subcategory}`, { duration: 3000 });
      } else {
        setApplyState(null);
        toast?.error?.(error || 'Could not update case', { duration: 4000 });
      }
    };

    /* Send a picked case template through the same PA-only reply channel as
       the freeform composer. Both controls are hidden unless PA is ready. */
    const onSendTemplate = async (tpl) => {
      if (sendingTemplate) return;
      const cfg = emailConfig || await readEmailConfig();
      if (!cfg.paReady) return;
      const to = replyRecipient(email, target.meta);
      if (!to) { toast?.error?.('No customer email to reply to', { duration: 4000 }); return; }
      const subject = replySubject(email?.subject || target.meta?.subject);
      const rawBody = tpl.body || '';

      setSendingTemplate(true);
      const senderTemplate = (tpl.senderAccount || tpl.senderRandomize)
        ? tpl
        : { ...tpl, senderAccount: replySenderAccount(email, target.meta) };
      const from = pickFromAddress(senderTemplate, cfg.localPart);
      const res = await sendEmail({
        from, to, subject,
        htmlBody: rawBody,
        replyMode: 'reply',
        signature: cfg.signature,
        config: cfg,
        usageSource: 'email_preview',
      });
      setSendingTemplate(false);
      if (res.state === 'sent') {
        toast?.success?.(`Reply sent to ${to}`, { duration: 4000 });
      } else {
        toast?.error?.(`Send failed: ${res.error || 'Power Automate error'}`, { duration: 6000 });
      }
    };

    const onSendReply = async ({ to, subject, htmlBody }) => {
      if (sendingReply) return { ok: false };
      const cfg = emailConfig || await readEmailConfig();
      if (!cfg.paReady) return { ok: false, error: 'Power Automate is not enabled' };
      const recipient = bareEmail(to) || replyRecipient(email, target.meta);

      setSendingReply(true);
      const res = await sendThreadReply({
        email,
        meta: target.meta,
        to,
        subject,
        htmlBody,
        config: cfg,
      });
      setSendingReply(false);
      if (res.state === 'sent') {
        toast?.success?.(`Reply sent to ${recipient}`, { duration: 4000 });
        return { ok: true };
      }
      toast?.error?.(`Send failed: ${res.error || 'Power Automate error'}`, { duration: 6000 });
      return { ok: false, error: res.error };
    };

    const onApplyAccountTemplate = async (template) => {
      try {
        const resolver = window.__gbResolveAllVarsAsync;
        const result = await evaluateAccountEmailTemplate(template, (vars, toField) => {
          if (typeof resolver !== 'function') throw new Error('Reload this page before using account templates');
          return resolver(vars, toField, document);
        });
        return { ok: true, htmlBody: result.htmlBody };
      } catch (error) {
        const message = error?.message || 'Could not evaluate that template';
        toast?.error?.(message, { duration: 5000 });
        return { ok: false, error: message };
      }
    };

    /* Registry seam for the eventual workflow: resolve/create the account's
       opportunity, attach the saved proposal, then insert the proposal into
       the message. For now selection intentionally pastes a clear placeholder. */
    const onApplySavedProposal = async (proposal) => ({
      ok: true,
      mode: 'insert',
      text: savedProposalPlaceholder(proposal),
    });

    const onJunk = async () => {
      if (applyState === 'saving') return;
      setApplyState('saving');
      const { ok, error } = await updateCase({ category: 'Junk', subcategory: 'Junk' });
      if (ok) {
        setApplyState({ category: 'Junk', subcategory: 'Junk' });
        toast?.success?.('Marked as junk', { duration: 2500 });
        setTimeout(() => { mountOnClosed(); }, 600);
      } else {
        setApplyState(null);
        toast?.error?.(error || 'Could not mark junk', { duration: 4000 });
      }
    };

    return (
      <EmailPreview
        email={email}
        meta={target.meta}
        loading={loading}
        defaultCase={isCasePage()}
        caseId={currentCaseId()}
        recommended={recommended}
        caseTemplates={caseTemplates}
        onSendTemplate={onSendTemplate}
        sendingTemplate={sendingTemplate}
        replyEnabled={emailConfig?.paReady === true}
        onSendReply={onSendReply}
        sendingReply={sendingReply}
        accountTemplates={accountEmailTemplates(emailConfig?.templates || [])}
        onApplyAccountTemplate={onApplyAccountTemplate}
        savedProposals={savedProposals}
        onApplySavedProposal={onApplySavedProposal}
        applyState={applyState}
        onApplyCategory={onApplyCategory}
        onJunk={onJunk}
        onClosed={mountOnClosed}
        bindClose={mountBindClose}
      />
    );
  }

  window.__gbOpenEmailPreview = function (target = {}) {
    reportFeatureUsage('email_preview', { source: 'email_preview' });
    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <EmailPreviewHost target={target} mountOnClosed={onClosed} mountBindClose={bindClose} />
      </ToastHost>
    ));
  };

  /* Liquid-glass hover affordance for the inbox rows. The legacy
     modal gave each clickable row a hover highlight; the React port
     dropped it, so there was no signal the row opens a preview.
     This injects a translucent brand-tinted glass overlay (blur +
     inset ring + left accent) on hover — matching the in-page
     liquid-glass language used by the other surfaces. */
  const ROW_STYLE_ID = '__gb-email-row-style';
  function ensureRowStyle() {
    if (document.getElementById(ROW_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = ROW_STYLE_ID;
    el.textContent = `
      tr[data-gb-ep] { cursor: pointer; transition: background-color .18s ease, box-shadow .18s ease; }
      tr[data-gb-ep]:hover {
        background: color-mix(in srgb, var(--gb-brand-label, #8fce2e) 12%, transparent) !important;
        box-shadow:
          inset 3px 0 0 0 var(--gb-brand-label, #8fce2e),
          inset 0 0 0 1px color-mix(in srgb, var(--gb-brand-label, #8fce2e) 22%, transparent) !important;
      }
      tr[data-gb-ep]:hover > td {
        -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
        background: color-mix(in srgb, var(--gb-surface-1, #1e2024) 22%, transparent) !important;
      }
      tr[data-gb-ep]:active { transform: translateY(0.5px); }
    `;
    (document.head || document.documentElement).appendChild(el);
  }

  function attachRow(row, link) {
    if (row.__gbEpAttached) return;
    const href = link.getAttribute('href') || '';
    const messageId = (href.match(/MessageID=([^&]+)/i) || [])[1];
    const messageGuid = (href.match(/MessageGUID=([^&]+)/i) || [])[1] || '';
    if (!messageId) return;
    row.__gbEpAttached = true;
    row.setAttribute('data-gb-ep', '1');

    const cells = row.querySelectorAll('td');
    const meta = {
      from:    cells[1]?.textContent?.trim() || '',
      to:      cells[2]?.textContent?.trim() || '',
      subject: cells[3]?.textContent?.trim() || '',
      date:    cells[4]?.textContent?.trim() || '',
    };
    const target = {
      messageId: decodeURIComponent(messageId),
      messageGuid: decodeURIComponent(messageGuid),
      meta,
    };

    row.style.cursor = 'pointer';
    row.addEventListener('click', (e) => {
      if (e.target.closest('a[href*="Page=268"]')) return; // let the native link work
      window.__gbOpenEmailPreview(target);
    });
  }

  window.__gbEmailPreviewScan = function () {
    if (window.__gbFeatureFlags?.emailPreviewEnabled === false) return;
    ensureRowStyle();
    document.querySelectorAll(ROW_LINK_SEL).forEach((link) => {
      const row = link.closest('tr');
      if (row) attachRow(row, link);
    });
  };
}
