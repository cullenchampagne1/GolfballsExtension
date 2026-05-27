import React from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { ActionsShelf } from '../ui/components/ActionsShelf.jsx';
import { actionRegistry } from '../lib/actionRegistry.js';
import { I } from '../ui/index.js';
import { loadDevSettings, STORAGE_KEY as DEV_STORAGE_KEY } from '../lib/devSettings.js';
import { findPhone } from '../lib/findPhone.js';

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
    // Orders index — Folder=Orders WITHOUT a ViewOrder page param. The
    // ViewOrder check above already returns 'order' for the detail page,
    // so by the time we get here we know it's the listing.
    if (/[?&]Folder=Orders\b/i.test(url)) return 'order-index';
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

  /* Read the labels of every checked status filter on the Orders Index
     page. Markup is
       <div class="checker"><span><input id="statusN" type="checkbox"></span></div>
       {label text}<span class="badge">N</span><br>
     so we walk the sibling chain after each checked .checker until we
     hit a <br> (end of row), gathering text nodes and skipping the
     count badge. Empty result = no filters selected. */
  function readOrderFilters() {
    const inputs = document.querySelectorAll('input[type="checkbox"][id^="status"]:checked');
    const labels = [];
    inputs.forEach((input) => {
      const checker = input.closest('.checker');
      if (!checker) return;
      let node = checker.nextSibling;
      let text = '';
      while (node) {
        if (node.nodeType === 3) {                          // text
          text += node.textContent;
        } else if (node.nodeType === 1) {
          if (node.tagName === 'BR') break;
          if (node.tagName === 'DIV') break;                // next .checker row
          if (node.classList?.contains('badge')) {           // count chip — skip
            node = node.nextSibling; continue;
          }
          // Inline element (span, etc.) — include its text.
          text += node.textContent || '';
        }
        node = node.nextSibling;
      }
      const label = text.replace(/\s+/g, ' ').trim();
      if (label) labels.push(label);
    });
    return labels;
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
  let _logCallActionUnsub = null;
  let _taskActionUnsub = null;
  let _copyIdsActionUnsub = null;
  let _findPhoneActionUnsub = null;

  function registerCallAction(pageType, displayName) {
    if (_callActionUnsub) { _callActionUnsub(); _callActionUnsub = null; }
    if (pageType !== 'contact' && pageType !== 'account') return;

    // Title keeps the contact / account name so the action reads strongly
    // ("Call Marcus Chen"). The hint underneath surfaces the actual phone
    // number that would be dialed so the rep can verify before clicking
    // — much more useful than the old static "Dial via tel: + log the
    // outcome" description.
    const labelName = displayName || (pageType === 'account' ? 'account' : 'contact');
    const phone = readContactPhoneRaw();
    const hint = phone ? `Dials ${phone}` : 'No phone on this page';
    _callActionUnsub = actionRegistry.register({
      id: 'gb-call-contact',
      label: `Call ${labelName}`,
      icon: <I.phone size={13} />,
      hint,
      smartFor: ['contact', 'account'],
      handler: async () => {
        // Re-read at click-time so a postback that rebuilt the phone
        // label after we registered still dials whatever's on screen NOW.
        const livePhone = readContactPhoneRaw();
        const digits = livePhone.replace(/\D/g, '');
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
          await window.__gbShowCallLogModal({ phone: livePhone });
        }
      },
    });
  }

  /* Sibling of the Call action: opens the call-log modal WITHOUT
     firing the tel: link. For inbound calls the rep answered on
     their phone — they just need the log dialog. Same gating
     (contact / account pages) and same fresh phone lookup so the
     subtitle reflects whatever's currently on screen. */
  function registerLogCallAction(pageType, displayName) {
    if (_logCallActionUnsub) { _logCallActionUnsub(); _logCallActionUnsub = null; }
    if (pageType !== 'contact' && pageType !== 'account') return;

    const labelName = displayName || (pageType === 'account' ? 'account' : 'contact');
    const phone = readContactPhoneRaw();
    const hint = phone
      ? `Open log for ${phone} (no dial)`
      : 'Open the call log without dialing';
    _logCallActionUnsub = actionRegistry.register({
      id: 'gb-log-incoming-call',
      label: `Log incoming call`,
      // edit/pencil icon reads as "write a note" — visually distinct
      // from the regular Call action's phone icon.
      icon: <I.edit size={13} />,
      hint,
      smartFor: ['contact', 'account'],
      handler: async () => {
        const livePhone = readContactPhoneRaw();
        if (typeof window.__gbShowCallLogModal === 'function') {
          await window.__gbShowCallLogModal({ phone: livePhone });
        }
      },
    });
  }

  /* Find-phone: only show on contact pages where the phone field is
     missing / too short to be a real number AND the contact has at
     least one order to scan. Drives src/lib/findPhone.js with real
     DOM scraping + bg-script proxy fetch + Contact/Update.ajax save.
     Replaces the legacy inline "Find phone" pill button that used to
     inject next to #lblContactPhoneNumber via the deleted
     src/vanilla/phone-finder.js. */
  function _readContactName() {
    const first = document.getElementById('lblContactFirstName')?.textContent?.trim() || '';
    const last  = document.getElementById('lblContactLastName')?.textContent?.trim()  || '';
    return [first, last].filter(Boolean).join(' ') || 'this contact';
  }
  function _readContactPhoneDigits() {
    return (document.getElementById('lblContactPhoneNumber')?.textContent || '').replace(/\D/g, '');
  }
  function _readOrderLinks() {
    return [...document.querySelectorAll('table.dtORD tbody tr')]
      .map((tr) => tr.querySelector('td a')).filter(Boolean)
      .map((a) => a.href)
      .filter((h) => h.includes('ViewOrder') || h.includes('folder=Orders'));
  }
  function _fetchOrderPage(url) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ action: 'fetchRaw', url }, (resp) => {
          if (chrome.runtime.lastError || !resp?.ok) resolve({ html: '', url });
          else resolve({ html: resp.text, url });
        });
      } catch { resolve({ html: '', url }); }
    });
  }
  async function _saveContactPhone(phone) {
    const contactIdEl = document.getElementById('tbContactId') || document.getElementById('tbContactID');
    const contactId = contactIdEl?.value?.trim();
    if (!contactId) return { ok: false, error: 'No contact ID on this page' };
    const BASE = 'https://api.golfballs.com';
    try {
      // Update.ajax wants the full contact payload — fetch the current one
      // first, then mutate phone, then POST it back. Mirrors what the
      // legacy injector did so server-side validation rules stay the same.
      const contact = await fetch(`${BASE}/golfballs/crm/Admin/Contact/Get.ajax?${contactId}`, { credentials: 'include' }).then((r) => r.json());
      const payload = {
        customerId:  String(contact.customerId),
        firstName:   contact.firstName   || '',
        middleInit:  contact.middleInit  || '',
        lastName:    contact.lastName    || '',
        companyName: contact.companyName || '',
        jobTitle:    contact.jobTitle    || '',
        email:       contact.email       || '',
        phoneNumber: phone,
        zipCode:     contact.zipCode     || '',
        UserType:    String(contact.userType ?? 0),
        userCountry: contact.userCountry || null,
        CustomData:  contact.CustomData  || '{}',
      };
      const result = await fetch(
        `${BASE}/golfballs/crm/Admin/Contact/Update.ajax?${encodeURIComponent(JSON.stringify(payload))}`,
        { credentials: 'include' },
      ).then((r) => r.json());
      if (result?.phoneNumber) {
        // Inline patch the contact-phone label so the page reflects
        // the new number without a full reload — find-phone's whole
        // point is "I want to call this person NOW", so we'd rather
        // hand off straight to the Call Log than throw the rep back
        // through a page reload + click cycle. The legacy code
        // reloaded; the React port doesn't need to because every
        // other place the phone shows reads off the same label.
        const lbl = document.getElementById('lblContactPhoneNumber');
        if (lbl) lbl.textContent = result.phoneNumber;
        // Open the Call Log modal with the freshly-found number so
        // the rep can immediately log + dial. Pops the same modal
        // the Call action uses — same UX as the "Call ${name}" path.
        if (typeof window.__gbShowCallLogModal === 'function') {
          try { window.__gbShowCallLogModal({ phone: result.phoneNumber }); } catch {}
        }
        return { ok: true, contact: result };
      }
      return { ok: false, error: 'Save returned no phone' };
    } catch (e) {
      return { ok: false, error: e?.message || 'save failed' };
    }
  }

  function registerFindPhoneAction(pageType) {
    if (_findPhoneActionUnsub) { _findPhoneActionUnsub(); _findPhoneActionUnsub = null; }
    if (pageType !== 'contact') return;
    const flags = window.__gbFeatureFlags || {};
    if (flags.phoneFinderEnabled === false) return;
    // Already has a usable phone → nothing to do.
    if (_readContactPhoneDigits().length >= 7) return;
    const orderCount = document.querySelectorAll('table.dtORD tbody tr').length;
    if (orderCount === 0) return;

    _findPhoneActionUnsub = actionRegistry.register({
      id: 'gb-find-phone',
      label: 'Find phone',
      icon: <I.search size={13} />,
      hint: `Scan ${orderCount} order${orderCount === 1 ? '' : 's'} for a number`,
      smartFor: ['contact'],
      handler: async () => {
        // The shelf's ToastHost is mounted with installGlobal=true,
        // so window.__gbToast is set as soon as the shelf renders.
        // findPhone itself handles the (now-rare) case where it's
        // still undefined — just bails with a console.warn — so we
        // don't pre-gate the call here.
        const links = _readOrderLinks();
        await findPhone({
          contactName:     _readContactName(),
          fetchOrderLinks: async () => links,
          fetchOrderPage:  _fetchOrderPage,
          saveContact:     _saveContactPhone,
          toast:           window.__gbToast,
        });
      },
    });
  }

  /* Order-list index page — surface a "Copy order IDs" action that
     scrapes every order id (col 2 of `table.table-advance tbody tr`)
     into the clipboard. Replaces the legacy page-injected button that
     used to live in the Order List portlet title bar. Gated on the
     copyIdsEnabled feature flag so users can hide it. */
  function readOrderRows() {
    const rows = document.querySelectorAll('table.table-advance tbody tr');
    const ids = [];
    let html = '';
    let plain = '';
    rows.forEach((row) => {
      const link = row.querySelector('td:nth-child(2) a');
      if (!link) return;
      const id = (link.textContent || '').trim();
      const href = link.href || '';
      if (!id) return;
      ids.push(id);
      // <div> wrapping forces real new lines when pasted into Outlook /
      // Teams; \r\n in the plain-text fallback covers Windows clients.
      html  += `<div><a href="${href}">${id}</a> - </div>`;
      plain += `${id} - \r\n`;
    });
    return { ids, html, plain };
  }

  function registerCopyOrdersAction(pageType) {
    if (_copyIdsActionUnsub) { _copyIdsActionUnsub(); _copyIdsActionUnsub = null; }
    if (pageType !== 'order-index') return;
    const flags = window.__gbFeatureFlags || {};
    if (flags.copyIdsEnabled === false) return;
    // Initial count — gives the action a more useful hint right out of
    // the gate. Click-time re-scans pick up newly-loaded rows.
    const initial = readOrderRows();
    _copyIdsActionUnsub = actionRegistry.register({
      id: 'gb-copy-order-ids',
      label: 'Copy order IDs',
      icon: <I.copy size={13} />,
      hint: initial.ids.length
        ? `${initial.ids.length} order${initial.ids.length === 1 ? '' : 's'} on this page`
        : 'No orders detected — scroll to load the table first',
      smartFor: ['order-index'],
      handler: async () => {
        const { ids, html, plain } = readOrderRows();
        if (!ids.length) {
          window.__gbToast?.warning?.('No order rows found on this page', { duration: 2500 });
          return;
        }
        try {
          const item = new ClipboardItem({
            'text/html':  new Blob([html],  { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([item]);
        } catch {
          // Older browsers / restrictive contexts: fall back to plain text.
          const ta = document.createElement('textarea');
          ta.value = plain;
          ta.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); } catch { /* swallow */ }
          ta.remove();
        }
        window.__gbToast?.success?.(`Copied ${ids.length} order id${ids.length === 1 ? '' : 's'}`, { duration: 2400 });
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
    } else if (type === 'order-index') {
      key = 'order-index';
      label = 'Orders Index';
      // Subtitle reflects the rep's filter selection on the page so they
      // see at a glance which slice they're working with. Multiple
      // filters join with " · " — the shelf header already applies
      // overflow:hidden + textOverflow:ellipsis so a long list truncates
      // with … instead of wrapping into a second line.
      const filters = readOrderFilters();
      subLabel = filters.length
        ? `Filtered: ${filters.join(' · ')}`
        : 'No filter selected';
    }
    actionRegistry.setPage(key, label, subLabel);
    registerCallAction(type, label);
    registerLogCallAction(type, label);
    registerTaskAction(type, label);
    registerCopyOrdersAction(type);
    registerFindPhoneAction(type);
  }

  /* ── Mount the shelf overlay ────────────────────────────────
     One persistent React root in a body-level div. We don't tear
     it down on URL change — the registry updates underneath and
     the shelf re-renders via useSyncExternalStore.

     ToastHost mounts with installGlobal=true so the shelf's host
     IS the page-wide window.__gbToast — it's the only ToastHost
     that's reliably mounted on every page (loads at content_script
     time, persists for the tab's lifetime). Other modals mount
     later and the global install is a "first wins" race, so the
     shelf gets the slot. That gives find-phone (and any other
     non-modal handler that needs a toast surface) a stable
     globally-available API instead of bailing when no modal
     happens to be open. */
  const HOST_ID = '__gb-actions-shelf';
  if (!document.getElementById(HOST_ID)) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-gb-scale', 'shelf');
    document.body.appendChild(host);
    createRoot(host).render(
      <ToastHost installGlobal={true}>
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

  /* Always-available actions — surface on every page so the rep
     can reach these modals from anywhere they're working. Each one
     is gated on a dev setting (default ON) so the shelf can be
     trimmed without recompiling. We hold the unsub fn from
     actionRegistry.register and re-run applyAlwaysActions whenever
     devSettings changes in chrome.storage. */
  const ALWAYS_ACTIONS = [
    {
      key: 'actionsShelf.showImageViewer',
      def: {
        id: 'gb-open-image-viewer',
        label: 'Open Image Viewer',
        icon: <I.eye size={13} />,
        hint: 'Drag, paste, or extract — then Submit Proof',
        handler: () => {
          if (typeof window.__gbOpenImagePreview === 'function') {
            window.__gbOpenImagePreview();   // no url → drop-zone state
          } else {
            window.__gbToast?.error?.('Image viewer not loaded on this page', { duration: 2400 });
          }
        },
      },
    },
    {
      key: 'actionsShelf.showOpenContacts',
      def: {
        id: 'gb-open-contacts',
        label: 'Open Contacts',
        icon: <I.search size={13} />,
        hint: 'CRM Search — name, email, account, phone',
        handler: () => {
          if (typeof window.__gbShowCrmSearchModal === 'function') {
            window.__gbShowCrmSearchModal();
          } else {
            window.__gbToast?.error?.('CRM Search not loaded on this page', { duration: 2400 });
          }
        },
      },
    },
    {
      key: 'actionsShelf.showOpenTasks',
      def: {
        id: 'gb-open-tasks',
        label: 'Open Tasks',
        icon: <I.check size={13} />,
        hint: 'My Tasks — review, complete, follow up',
        handler: () => {
          if (typeof window.__gbShowTaskListModal === 'function') {
            window.__gbShowTaskListModal();
          } else {
            window.__gbToast?.error?.('Task list not loaded on this page', { duration: 2400 });
          }
        },
      },
    },
  ];
  const _alwaysUnsubs = new Map(); // key → unsub fn
  function applyAlwaysActions(devSettings) {
    for (const entry of ALWAYS_ACTIONS) {
      // `true` is the default; only an explicit `false` hides the action.
      const enabled = devSettings?.[entry.key] !== false;
      const existing = _alwaysUnsubs.get(entry.key);
      if (enabled && !existing) {
        _alwaysUnsubs.set(entry.key, actionRegistry.register(entry.def));
      } else if (!enabled && existing) {
        existing();
        _alwaysUnsubs.delete(entry.key);
      }
    }
  }
  // Initial registration — read settings asynchronously, then react
  // to any in-session changes via storage.onChanged.
  loadDevSettings().then(applyAlwaysActions);
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[DEV_STORAGE_KEY]) return;
      applyAlwaysActions(changes[DEV_STORAGE_KEY].newValue || {});
    });
  }

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
            n.id === 'lblContactPhoneNumber' ||
            n.id === 'Name' || n.id === 'lblAccountName') {
          queueSync();
          return;
        }
        if (n.querySelector && n.querySelector(
          '#tbContactId, #lblContactFirstName, #lblContactLastName, #lblContactCompanyName, #lblContactPhoneNumber, #Name, #lblAccountName'
        )) {
          queueSync();
          return;
        }
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* Live-update the Orders-Index subtitle whenever the rep toggles a
     status filter. Capture-phase change listener on document catches
     every status checkbox without needing to know which page is up. */
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el?.tagName === 'INPUT' && el.type === 'checkbox' && typeof el.id === 'string' && el.id.startsWith('status')) {
      queueSync();
    }
  }, { capture: true });
}
