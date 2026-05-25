import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { ActionsShelf } from '../ui/components/ActionsShelf.jsx';
import { actionRegistry } from '../lib/actionRegistry.js';
import { I } from '../ui/index.js';

/* ───────────────────────────────────────────────────────────────
   actions-shelf.jsx — the persistent smart-actions shelf overlay.

   Mounts ONCE on every *.golfballs.com page and stays alive for
   the lifetime of the tab. The shelf component itself is the
   floating bottom-right pill; clicking it expands the panel. The
   list of actions it renders is driven entirely by:

     1. The page context  — actionRegistry.setPage(key, label, sub)
     2. The action registry — actionRegistry.register({...})

   This file owns both: it detects the page type from the URL +
   DOM, syncs the registry, and re-registers context-bound
   actions (e.g. "Call Marcus Chen") whenever the contact name
   changes. Smart actions float to the top of the shelf when
   their `smartFor` page-key matches the current page.

   Why per-page detection lives here instead of in smart-detection.js:
     The legacy smart-detection script is purpose-built for the
     watch-list / template engine — it scrapes a lot of page state
     for template variable resolution. The shelf just needs "what
     KIND of page is this", which is a one-line URL check. Keeping
     it self-contained means the shelf survives if smart-detection
     hasn't loaded yet, fails, or gets unloaded.

   Public contract:
     window.__gbActionsShelfLoaded   single-execution guard
─────────────────────────────────────────────────────────────── */

if (!window.__gbActionsShelfLoaded) {
  window.__gbActionsShelfLoaded = true;
  ensureTheme();

  /* ── Page-type detection ─────────────────────────────────────
     Mirrors the heuristics in src/vanilla/smart-detection.js
     (smartPageType) so the two surfaces agree on what page the
     rep is looking at. Order matters — order pages can ALSO have
     a customerID query param, so check the more-specific case
     first. */
  function detectPageType() {
    const url = window.location.href;
    if (/[?&]page=ViewOrder/i.test(url) && /[?&]orderID=/i.test(url)) return 'order';
    if (/[?&]Page=240\b/i.test(url)) return 'contact';
    if (/[?&]Page=271\b/i.test(url)) return 'account';
    if (document.getElementById('tbContactId')) return 'contact';
    if (/[?&]accountID=\d+/i.test(url)) return 'account';
    if (/[?&]customerID=\d+/i.test(url)) return 'contact';
    return 'other';
  }

  /* ── DOM helpers for the page-header labels ─────────────────
     Each returns a trimmed string or '' — they're safe to call on
     pages where the element doesn't exist. */
  function readContactName() {
    const first = (document.getElementById('lblContactFirstName')?.textContent || '').trim();
    const last  = (document.getElementById('lblContactLastName')?.textContent  || '').trim();
    const full = `${first} ${last}`.trim();
    return full;
  }
  function readContactCompany() {
    return (document.getElementById('lblContactCompanyName')?.textContent || '').trim();
  }
  function readAccountName() {
    return (document.getElementById('Name')?.value || '').trim()
        || (document.getElementById('lblAccountName')?.textContent || '').trim();
  }
  function readContactPhoneRaw() {
    const el = document.getElementById('lblContactPhoneNumber');
    return (el?.querySelector?.('a')?.textContent || el?.textContent || '').trim();
  }
  function readOrderId() {
    const m = window.location.href.match(/[?&]orderID=(\d+)/i);
    return m ? m[1] : '';
  }

  /* ── Context-bound action registration ──────────────────────
     "Call ${name}" + "Quick task for ${name}" both embed the
     contact's name in the label so the button text reads strongly
     on its own (the shelf also shows the page label as a header,
     but having the name on the button itself reads as a clearer
     affordance). When the page changes — or when the same contact
     page rebuilds its name labels via postback — we unregister
     the previous action + register a fresh one with the new label.

     Each context-bound action keeps its own unsub fn in a module-
     scoped var so the next syncContext can swap it. */
  let _callActionUnsub = null;
  let _taskActionUnsub = null;

  function registerCallAction(pageType, displayName) {
    if (_callActionUnsub) { _callActionUnsub(); _callActionUnsub = null; }
    if (pageType !== 'contact' && pageType !== 'account') return;

    const labelName = displayName || (pageType === 'account' ? 'account' : 'contact');
    _callActionUnsub = actionRegistry.register({
      id: 'gb-call-contact',
      label: `Call ${labelName}`,
      icon: <I.phone size={13} />,
      hint: 'Dial via tel: + log the outcome',
      smartFor: ['contact', 'account'],
      handler: async () => {
        // Re-read the phone at click-time so a stale registration
        // (page rebuilt the phone label after we registered) still
        // dials whatever's on screen NOW.
        const phone = readContactPhoneRaw();
        const digits = phone.replace(/\D/g, '');
        if (digits) {
          // _blank target hands the dial to whichever app owns
          // the tel: protocol (3CX desktop, 3CX PWA, or FaceTime)
          // without navigating the current tab.
          window.open(`tel:${digits}`, '_blank');
        }
        // Open the log modal next. The content-script entry
        // (src/content/call-log.jsx) reads context fresh from the
        // DOM via readCallContext(); we just pass `phone` as a
        // formatted-string override so the subtitle reflects what
        // we just dialed.
        if (typeof window.__gbShowCallLogModal === 'function') {
          await window.__gbShowCallLogModal({ phone });
        }
      },
    });
  }

  function registerTaskAction(pageType, displayName) {
    if (_taskActionUnsub) { _taskActionUnsub(); _taskActionUnsub = null; }
    if (pageType !== 'contact' && pageType !== 'account') return;

    const labelName = displayName || (pageType === 'account' ? 'account' : 'contact');
    _taskActionUnsub = actionRegistry.register({
      id: 'gb-quick-task',
      label: `Quick task for ${labelName}`,
      icon: <I.check size={13} />,
      hint: 'Create a CRM task from a preset or custom form',
      smartFor: ['contact', 'account'],
      handler: async () => {
        // Modal reads contactId / employeeId fresh from the DOM
        // via readTaskContext(); no override needed for the
        // common path.
        if (typeof window.__gbShowQuickTaskModal === 'function') {
          await window.__gbShowQuickTaskModal();
        }
      },
    });
  }

  /* ── Sync the page context + context-bound actions ──────────
     Called on initial load + on every URL or DOM change. Idempotent
     when nothing actually changed (actionRegistry.setPage no-ops
     when the values match). */
  function syncContext() {
    const type = detectPageType();
    let key = null, label = '', subLabel = '';
    if (type === 'contact') {
      key = 'contact';
      const name = readContactName();
      const company = readContactCompany();
      label = name || 'Contact';
      subLabel = company ? `Contact · ${company}` : 'Contact';
    } else if (type === 'account') {
      key = 'account';
      label = readAccountName() || 'Account';
      subLabel = 'Account';
    } else if (type === 'order') {
      key = 'order';
      const id = readOrderId();
      label = id ? `Order #${id}` : 'Order';
      subLabel = 'Order';
    }
    actionRegistry.setPage(key, label, subLabel);
    registerCallAction(type, label);
    registerTaskAction(type, label);
  }

  /* ── Mount the shelf overlay ────────────────────────────────
     One persistent React root in a body-level div. We don't tear
     it down on URL change — the registry updates underneath and
     the shelf re-renders via useSyncExternalStore.

     ToastHost is mounted with installGlobal:false so it doesn't
     fight with any other ToastHost a modal might mount; the
     shelf's own action handlers don't fire toasts directly
     (they delegate to the called modal / handler). */
  const HOST_ID = '__gb-actions-shelf';
  if (!document.getElementById(HOST_ID)) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
    createRoot(host).render(
      <ToastHost installGlobal={false}>
        <ActionsShelf />
      </ToastHost>,
    );
  }

  /* ── Re-sync on navigation + DOM updates ────────────────────
     The CRM mixes full-page nav (ASP.NET postbacks) with same-page
     URL rewrites (history.pushState in a few places). We listen to:

       - popstate: back/forward
       - pushState / replaceState (monkey-patched, since the CRM
         doesn't fire any custom event for these)
       - MutationObserver on body: catches the postback case where
         the URL doesn't change but the contact-name labels do
         (server-rendered HTML swapped in via the ASP.NET
         partial-postback machinery).

     30ms debounce so a burst of postback DOM mutations only
     triggers one sync. */
  let _syncTimer = 0;
  const queueSync = () => {
    clearTimeout(_syncTimer);
    _syncTimer = setTimeout(syncContext, 30);
  };

  syncContext();
  window.addEventListener('popstate', queueSync);

  const _pushState = history.pushState;
  history.pushState = function () { const r = _pushState.apply(this, arguments); queueSync(); return r; };
  const _replaceState = history.replaceState;
  history.replaceState = function () { const r = _replaceState.apply(this, arguments); queueSync(); return r; };

  // High-signal nodes — only re-sync when these appear/change.
  // Scanning every mutation would be expensive on heavy CRM pages.
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.id === 'tbContactId' || n.id === 'lblContactFirstName' ||
            n.id === 'lblContactLastName' || n.id === 'lblContactCompanyName' ||
            n.id === 'Name' || n.id === 'lblAccountName') {
          queueSync();
          return;
        }
        if (n.querySelector && n.querySelector(
          '#tbContactId, #lblContactFirstName, #lblContactLastName, #lblContactCompanyName, #Name, #lblAccountName'
        )) {
          queueSync();
          return;
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}
