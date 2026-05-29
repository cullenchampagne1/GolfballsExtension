import React, { useEffect, useState } from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost, useToast } from '../ui/components/ToastHost.jsx';
import { EmailPreview } from '../modals/EmailPreview.jsx';
import { parseEml, isFullHtmlPage, stripPageChrome, plainTextBody } from '../lib/emailParse.js';
import { filterCaseTemplates, pickBestCaseTemplate, recommendedFromTemplate, matchesCaseTpl } from '../lib/caseMatch.js';

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
    const [applyState, setApplyState] = useState(null); // 'saving' | { category, subcategory }

    useEffect(() => {
      let alive = true;
      (async () => {
        const url = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx'
          + `?Page=268&MessageGUID=${encodeURIComponent(target.messageGuid || '')}`
          + `&MessageID=${encodeURIComponent(target.messageId || '')}`;
        const resp = await send({ action: 'fetchRaw', url });
        if (!alive) return;
        const raw = resp?.text || '';
        let parsed;
        if (!raw) {
          parsed = { ...target.meta, bodyHtml: '' };
        } else if (isFullHtmlPage(raw)) {
          parsed = { ...target.meta, bodyHtml: stripPageChrome(raw) };
        } else {
          const p = parseEml(raw);
          parsed = p.bodyHtml ? p : { ...target.meta, bodyHtml: plainTextBody(raw) };
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
          const data = await new Promise((res) => chrome.storage.local.get('templates', res));
          if (!alive) return;
          const caseTpls = filterCaseTemplates(data?.templates);
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

    const onSendTemplate = async (tpl) => {
      if (sendingTemplate) return;
      setSendingTemplate(true);
      /* TODO: real reply-send transport (Power Automate / CRM reply
         endpoint) isn't wired yet — surface the pick so the workflow is
         testable end-to-end once the send pipe lands. */
      toast?.info?.(`Reply template "${tpl.name || tpl.subject || 'Untitled'}" ready — send pipe not wired yet`, { duration: 3500 });
      setSendingTemplate(false);
    };

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
        applyState={applyState}
        onApplyCategory={onApplyCategory}
        onJunk={onJunk}
        onClosed={mountOnClosed}
        bindClose={mountBindClose}
      />
    );
  }

  window.__gbOpenEmailPreview = function (target = {}) {
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
