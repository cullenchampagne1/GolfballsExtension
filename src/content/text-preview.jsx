import React, { useState } from 'react';
import { mountFloating } from '../lib/mountFloating.js';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost, useToast } from '../ui/components/ToastHost.jsx';
import { TextPreview } from '../modals/TextPreview.jsx';
import { parseChat } from '../lib/parseChat.js';
import { submitCaseCategory } from '../lib/submitCaseCategory.js';

/* ───────────────────────────────────────────────────────────────
   text-preview.jsx — content-script entry for the React Chat / Case
   Notes preview (replaces the vanilla src/vanilla/modals/text-preview.js).

   __gbTextPreviewScan() arms case-history rows (table rows with a
   caseID link + an email/chat icon, and the local Notes rows on a
   case page). Clicking a row fetches the case doc, and:
     • an email case (Page=268 + MessageID) defers to the email preview
     • otherwise the SnapEngage / notes blob is parsed (lib/parseChat)
       and shown in the React TextPreview modal.
   In case mode the rep can categorize via the shared CategorizeRail.
─────────────────────────────────────────────────────────────── */

if (!window.__gbTextPreviewLoaded) {
  window.__gbTextPreviewLoaded = true;
  ensureTheme();

  const HOST_ID = '__gb-text-preview';
  const _cache = {};

  /* Stateful wrapper so the rail's Apply drives a saving → applied
     lifecycle + a toast, mirroring the email preview host. */
  function TextPreviewHost({ transcript, isCasePage, caseId, mountOnClosed, mountBindClose }) {
    const toast = useToast();
    const [applyState, setApplyState] = useState(null);

    const onApplyCategory = async (category, subcategory) => {
      if (!isCasePage) {
        toast?.info?.('Open the case page to categorize', { duration: 3000 });
        return;
      }
      if (applyState === 'saving') return;
      setApplyState('saving');
      const { ok, error } = await submitCaseCategory(caseId, category, subcategory);
      if (ok) {
        setApplyState({ category, subcategory });
        toast?.success?.(`Categorized: ${category} → ${subcategory}`, { duration: 2500 });
        // Reload so the case status reflects the update (legacy behavior).
        setTimeout(() => { mountOnClosed(); location.reload(); }, 700);
      } else {
        setApplyState(null);
        toast?.error?.(error || 'Could not update case', { duration: 4000 });
      }
    };

    return (
      <TextPreview
        transcript={transcript}
        defaultCase={isCasePage}
        applyState={applyState}
        onApplyCategory={onApplyCategory}
        onClosed={mountOnClosed}
        bindClose={mountBindClose}
      />
    );
  }

  /* Pull the chat / notes blob out of a fetched case doc — verbatim
     logic from the legacy _routeParsedCase. */
  function extractRawChat(doc) {
    const channelEl = doc.getElementById('Channel');
    const channelText = channelEl ? channelEl.textContent.trim().toLowerCase() : '';
    const isChat = channelText === 'chat' || channelText.includes('live chat');
    const tbNotes = doc.getElementById('tbNotes');
    let rawChatStr = '';
    if (tbNotes && tbNotes.value) {
      try {
        const notesObj = JSON.parse(tbNotes.value);
        Object.values(notesObj).forEach((val) => {
          if (typeof val !== 'string') return;
          if (isChat || val.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/.test(val)) rawChatStr += val + '<br />';
          else rawChatStr += val + '<br /><br />';
        });
      } catch { rawChatStr = tbNotes.value; }
    }
    return { rawChatStr, isChat, channelText };
  }

  function routeParsedCase(doc, caseId, caseHref, meta) {
    // Email case → the email preview owns it (it has the MessageID).
    const emailLink = doc.querySelector('a[href*="Page=268"][href*="MessageID="]');
    if (emailLink && typeof window.__gbOpenEmailPreview === 'function') {
      const href = emailLink.getAttribute('href');
      const idM = href.match(/[?&]MessageID=([^&]+)/i);
      const guidM = href.match(/[?&]MessageGUID=([^&]+)/i);
      if (idM) { window.__gbOpenEmailPreview({ messageId: idM[1], messageGuid: guidM ? guidM[1] : '', meta }); return; }
    }

    const { rawChatStr, isChat, channelText } = extractRawChat(doc);
    const looksChat = isChat || rawChatStr.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/.test(rawChatStr);
    const title = looksChat ? 'Live Chat Transcript'
      : channelText === 'email' ? 'Email Notes (No Message ID Found)'
        : 'Case Notes Preview';
    const isCasePage = /[?&]caseID=/i.test(window.location.href) || !!document.getElementById('tbCaseId');

    const transcript = {
      caseId: `CASE-${caseId}`,
      subject: meta?.subject && !/^Case #/.test(meta.subject) ? meta.subject : '',
      title,
      messages: parseChat(rawChatStr).messages,
    };

    mountFloating(HOST_ID, ({ onClosed, bindClose }) => (
      <ToastHost installGlobal={false}>
        <TextPreviewHost
          transcript={transcript}
          isCasePage={isCasePage}
          caseId={caseId}
          mountOnClosed={onClosed}
          mountBindClose={bindClose}
        />
      </ToastHost>
    ));
  }

  function handleCaseClick(caseId, caseHref, meta) {
    if (_cache[caseId]) { routeParsedCase(_cache[caseId], caseId, caseHref, meta); return; }
    const absoluteUrl = new URL(caseHref, window.location.href).href;
    chrome.runtime.sendMessage({ action: 'fetchRaw', url: absoluteUrl }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.text) { window.location.href = caseHref; return; }
      const doc = new DOMParser().parseFromString(resp.text, 'text/html');
      _cache[caseId] = doc;
      routeParsedCase(doc, caseId, caseHref, meta);
    });
  }

  function ensureRowStyles() {
    if (document.getElementById('__gb-tp-row-styles')) return;
    const s = document.createElement('style');
    s.id = '__gb-tp-row-styles';
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--gb-brand-label-rgb').trim() || '125,184,42';
    s.textContent = `
      tr[data-gbtp]:hover > td, tr[data-gbtp]:hover > th { background-color: rgba(${rgb},.15) !important; cursor: pointer !important; transition: background-color .15s ease !important; }
      tr[data-gbtp]:hover > td:first-child, tr[data-gbtp]:hover > th:first-child { border-left: 3px solid rgba(${rgb},.9) !important; }
    `;
    document.head.appendChild(s);
  }

  function scan() {
    if (window.__gbFeatureFlags?.emailPreviewEnabled === false) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('customerID')) return;
    ensureRowStyles();

    // 1. Case-history rows with a caseID link + email/chat icon.
    document.querySelectorAll('tr').forEach((row) => {
      if (row.__gbTpAttached) return;
      const caseLink = row.querySelector('a[href*="caseID="], a[href*="CaseID="]');
      if (!caseLink) return;
      if (row.querySelector('a[href*="MessageID="]')) return;
      const match = caseLink.getAttribute('href').match(/[?&]caseID=(\d+)/i);
      if (!match) return;
      const caseId = match[1];
      const html = row.innerHTML.toLowerCase();
      const text = row.textContent.toLowerCase();
      const isEmail = html.includes('icon-envelope') || text.includes('email');
      const isChat = html.includes('icon-comments-alt') || text.includes('chat');
      if (!isEmail && !isChat) return;

      row.__gbTpAttached = true;
      row.setAttribute('data-gbtp', '1');
      const cells = row.querySelectorAll('td');
      let subject = `Case #${caseId}`;
      if (cells.length > 4 && cells[4].textContent.trim()) subject = cells[4].textContent.trim();
      else if (cells.length >= 3 && cells[2].textContent.trim()) subject = cells[2].textContent.trim();
      const meta = { subject };

      row.addEventListener('click', (e) => {
        if (e.target.closest('a') && e.target.closest('a') !== caseLink) return;
        if (e.button === 1 || e.ctrlKey || e.metaKey) return;
        e.preventDefault(); e.stopPropagation();
        handleCaseClick(caseId, caseLink.getAttribute('href'), meta);
      });
    });

    // 2. Local Notes rows on the case-details page.
    document.querySelectorAll('tbody#Notes tr').forEach((row) => {
      if (row.__gbTpAttached) return;
      const html = row.innerHTML;
      const isChat = html.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/i.test(html) || html.toLowerCase().includes('live chat');
      if (!isChat) return;
      const caseIdInput = document.getElementById('tbCaseId');
      if (!caseIdInput) return;
      const caseId = caseIdInput.value;
      row.__gbTpAttached = true;
      row.setAttribute('data-gbtp', '1');
      const meta = { subject: `Case #${caseId} — Chat Notes` };
      row.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        if (e.button === 1 || e.ctrlKey || e.metaKey) return;
        e.preventDefault(); e.stopPropagation();
        if (!_cache[caseId]) _cache[caseId] = document;
        handleCaseClick(caseId, window.location.href, meta);
      });
    });
  }

  window.__gbTextPreviewScan = scan;
  window.__gbOpenTextPreview = handleCaseClick;
  setInterval(scan, 1500);
}
