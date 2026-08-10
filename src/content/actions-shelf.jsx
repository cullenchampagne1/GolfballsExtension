import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ensureTheme } from '../lib/theme.js';
import { ToastHost } from '../ui/components/ToastHost.jsx';
import { ActionsShelf } from '../ui/components/ActionsShelf.jsx';
import { actionRegistry } from '../lib/actionRegistry.js';
import { I, Icon, TYPE_ICONS } from '../ui/index.js';
import { loadFlags } from '../lib/flags.js';
import { shelfActionDefs } from '../lib/features/featureRegistry.js';
import { loadFeatureConfig, normalizeFeatureConfig, featureShowsOnPage, pageApplies, urlMatches, FEATURE_CONFIG_KEY } from '../lib/features/featureConfig.js';
import { loadCustomActions, normalizeCustomAction, STORAGE_KEY as CUSTOM_ACTIONS_KEY } from '../lib/customActions.js';
import {
  customActionEntryPoints,
  customActionSelectors,
} from '../lib/customActionEntryPoints.js';
import { CustomActionRunHost } from '../ui/components/CustomActionRunHost.jsx';
import { findPhone } from '../lib/findPhone.js';
import { detectPageType as sharedDetectPageType, getPageContext } from '../lib/pageContext.js';
import { loadLastOrderNote } from '../lib/quickOrderNote.js';
import { submitOrderNote } from '../lib/submitOrderNote.js';
import { sendEmailTemplateFromPage } from '../lib/emailTemplateDelivery.js';
import { templateFollowUpActionError } from '../lib/templateFollowUpAction.js';

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

/* Skip the whole shelf when the document IS a PDF (an invoice/order PDF opened
   in the browser's native viewer). The content script still injects there, but
   a floating overlay gets in the way of printing — and there's no CRM context
   to act on anyway. `contentType` catches extension-less endpoints that stream a
   PDF (e.g. ViewInvoice.aspx); the path check is a belt-and-suspenders fallback. */
function __gbIsPdfDocument() {
  try {
    if ((document.contentType || '').toLowerCase() === 'application/pdf') return true;
    if (/\.pdf(?:[?#]|$)/i.test(location.pathname)) return true;
  } catch { /* */ }
  return false;
}

/* Toolbar-popup bridge. Install outside the one-time shelf guard so an open
   tab reinjected after an extension update receives the newest delivery
   implementation even when its existing shelf root is still mounted. */
if (!__gbIsPdfDocument()) {
  window.__gbSendEmailTemplate = (input = {}) => sendEmailTemplateFromPage({
    ...input,
    document,
  });
}

if (!window.__gbActionsShelfLoaded && !__gbIsPdfDocument()) {
  window.__gbActionsShelfLoaded = true;
  ensureTheme();

  /* ── Page-type detection ─────────────────────────────────────
     Delegates to the shared detector (src/lib/pageContext.js) so the
     shelf and smart-detection can't drift. Returns PAGE_TYPE.* string
     values, identical to the literals this used to return inline. */
  function detectPageType() {
    return sharedDetectPageType(document);
  }

  /* ── Page-header label readers ──────────────────────────────
     Engine-first (the page-context schema, cached per-doc), each with
     the original label selector as fallback so an unrecognised page
     behaves exactly as before. Safe to call on any page. */
  const engineData = () => { try { return getPageContext(document).data; } catch { return null; } };
  function readContactName() {
    const c = engineData()?.contact;
    const fromEngine = c ? `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim() : '';
    if (fromEngine) return fromEngine;
    const first = (document.getElementById('lblContactFirstName')?.textContent || '').trim();
    const last  = (document.getElementById('lblContactLastName')?.textContent  || '').trim();
    return `${first} ${last}`.trim();
  }
  function readContactCompany() {
    return (engineData()?.contact?.companyName || '').trim()
        || (document.getElementById('lblContactCompanyName')?.textContent || '').trim();
  }
  function readAccountName() {
    return (engineData()?.account?.name || '').trim()
        || (document.getElementById('Name')?.value || '').trim()
        || (document.getElementById('lblAccountName')?.textContent || '').trim();
  }
  function readContactPhoneRaw() {
    const c = engineData()?.contact;
    if (c && c.phone) return String(c.phone).trim();
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
  /* ── Feature surface config (featureConfig) ──────────────────
     The single gate for what the shelf shows. A feature's action appears
     only when (a) its master flag is on (featureFlags) AND (b) its shelf
     surface is on for the current page (featureConfig showInShelf + pages).
     Defaults derive from the registry, so behavior is unchanged until a rep
     customizes it in Settings → Features / Action Shelf. Stashed on
     window.__gbFeatureConfig so other content scripts (the popup launcher
     bridge) can read the same truth. */
  let _featureCfg = normalizeFeatureConfig({});
  window.__gbFeatureConfig = _featureCfg;
  function shelfShows(key, pageType) {
    if ((window.__gbFeatureFlags || {})[key] === false) return false; // master off
    return featureShowsOnPage(_featureCfg[key], pageType, window.location.href); // surface + page + custom link
  }

  /* Standalone shelf actions (a safe no-arg window global) are generated
     straight from the registry — no per-feature boilerplate. Page-contextual
     actions (call/task/find-phone/copy-ids/order-dates) stay handcrafted
     below because they read live DOM + carry extra gates. */
  const shelfIcon = (name) => { const C = I[name] || I.bolt; return <C size={13} />; };
  const SHELF_HINTS = {
    'gb-open-image-viewer': 'Drag, paste, or extract — then Submit Proof',
    'gb-open-contacts':     'CRM Search — name, email, account, phone',
    'gb-open-tasks':        'My Tasks — review, complete, follow up',
    'gb-open-gift-catalog': 'Corporate gifting — photos, pricing, custom imprint',
    'gb-open-mockup-studio':'Generate product mockups in durable batches',
    'gb-open-watch-list':   'Track orders across sessions',
    'gb-open-notifications':'Targeted messages + completion alerts',
    'gb-open-new-contact':  'Quick-create a CRM contact',
    'gb-open-margin-calc':  'Margin + profit metrics for this order',
    'gb-order-edit':        'Edit this order’s details',
  };
  const STANDALONE_DEFS = shelfActionDefs().filter((d) => !d.dynamic);
  const _standaloneUnsubs = new Map(); // action id → unsub
  function syncStandaloneActions(pageType) {
    for (const d of STANDALONE_DEFS) {
      const show = shelfShows(d.key, pageType);
      const existing = _standaloneUnsubs.get(d.id);
      if (show && !existing) {
        _standaloneUnsubs.set(d.id, actionRegistry.register({
          id: d.id,
          label: d.label,
          icon: shelfIcon(d.icon),
          hint: SHELF_HINTS[d.id] || '',
          // Page-scoped launchers float to the top on their page; '*' ones
          // stay in the ordinary page section (matches old ALWAYS behavior).
          smartFor: d.pages.includes('*') ? [] : d.pages,
          handler: () => {
            const fn = window[d.global];
            if (typeof fn === 'function') fn();
            else window.__gbToast?.error?.(`${d.label} not loaded on this page`, { duration: 2400 });
          },
        }));
      } else if (!show && existing) {
        existing();
        _standaloneUnsubs.delete(d.id);
      }
    }
  }

  /* User-authored custom actions (gbCustomActions). Registered like standalone
     actions but gated by the action's OWN pages/enabled/showInShelf. Clicking
     one fires a window event that CustomActionRunHost picks up to dry-simulate
     → confirm → run for real (gated executor). Re-registered wholesale each
     sync so a renamed/re-iconed action refreshes. */
  let _customActions = [];
  const _customActionUnsubs = [];
  function clearCustomActions() { while (_customActionUnsubs.length) { try { _customActionUnsubs.pop()(); } catch { /* */ } } }
  function syncCustomActions(pageType) {
    clearCustomActions();
    for (const rec of _customActions) {
      if (!rec || rec.enabled === false || !rec.showInShelf) continue;
      // Page chips OR the custom-link matcher (same rule as built-in features).
      if (!pageApplies(rec.pages, pageType) && !urlMatches(rec.customUrl, window.location.href)) continue;
      const entryMatches = customActionEntryPoints.resolve(
        rec.entryPoints,
        document,
        { includeData: false },
      );
      if (rec.entryPoints?.length && !entryMatches.length) continue;
      const modalIds = [...new Set(entryMatches.map((match) => match.modalId).filter(Boolean))];
      _customActionUnsubs.push(actionRegistry.register({
        id: `custom-${rec.id}`,
        label: rec.name,
        icon: shelfIcon(rec.icon),
        hint: rec.description || 'Custom action',
        // User-authored actions sort after every built-in feature so they
        // never take slots 1/2 ahead of the real features.
        weight: 100,
        smartFor: (rec.pages || []).includes('*') ? [] : rec.pages,
        whenModalOpen: modalIds,
        handler: () => {
          try {
            window.dispatchEvent(new CustomEvent('gb-run-custom-action', {
              detail: {
                action: rec,
                entryPoints: customActionEntryPoints.resolve(rec.entryPoints, document),
              },
            }));
          } catch { /* */ }
        },
      }));
    }
  }

  let _callActionUnsub = null;
  let _logCallActionUnsub = null;
  let _taskActionUnsub = null;
  let _copyIdsActionUnsub = null;
  let _findPhoneActionUnsub = null;
  let _orderDatesActionUnsub = null;
  let _quickNoteActionUnsub = null;
  let _lastNoteActionUnsub = null;
  let _lastNoteLoadGeneration = 0;

  function registerCallAction(pageType, displayName) {
    if (_callActionUnsub) { _callActionUnsub(); _callActionUnsub = null; }
    if (!shelfShows('callLogEnabled', pageType)) return;
    /* Gate on a real phone existing on the page. When the contact has
       no phone, Call would dial nothing — surface Find phone instead
       (registered separately). Postbacks that rebuild the phone label
       trigger a syncContext re-run, so the action flips back into the
       registry as soon as a number lands. */
    const phone = readContactPhoneRaw();
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) return;

    // Title keeps the contact / account name so the action reads strongly
    // ("Call Marcus Chen"). The hint underneath surfaces the actual phone
    // number that would be dialed so the rep can verify before clicking
    // — much more useful than the old static "Dial via tel: + log the
    // outcome" description.
    const labelName = displayName || (pageType === 'account' ? 'account' : 'contact');
    const hint = `Dials ${phone}`;
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
    if (!shelfShows('callLogEnabled', pageType)) return;

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
        // Match legacy: reload so every place the phone shows on the
        // page (header label, sidebar, the action shelf's own re-sync)
        // picks up the new number. After reload the shelf's
        // syncContext re-runs and Find phone unregisters (phone now
        // exists) while Call registers (phone now present).
        setTimeout(() => { try { window.location.reload(); } catch {} }, 1100);
        return { ok: true, contact: result };
      }
      return { ok: false, error: 'Save returned no phone' };
    } catch (e) {
      return { ok: false, error: e?.message || 'save failed' };
    }
  }

  function registerFindPhoneAction(pageType) {
    if (_findPhoneActionUnsub) { _findPhoneActionUnsub(); _findPhoneActionUnsub = null; }
    if (!shelfShows('phoneFinderEnabled', pageType)) return;
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
        // findPhone itself handles the rare missing-host case, so we do not
        // pre-gate the call here.
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
    if (!shelfShows('copyIdsEnabled', pageType)) return;
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

  /* Order detail page — "Manage order dates" opens the React Order Date
     Manager. The current dates live in the order iframe, so we ask it
     (GB_REQUEST_OPEN_CALENDAR) to scrape them and post GB_OPEN_CALENDAR
     back up; main.js then mounts the modal. */
  function registerOrderDatesAction(pageType) {
    if (_orderDatesActionUnsub) { _orderDatesActionUnsub(); _orderDatesActionUnsub = null; }
    if (!shelfShows('calendarEnabled', pageType)) return;
    const id = readOrderId();
    _orderDatesActionUnsub = actionRegistry.register({
      id: 'gb-order-dates',
      label: 'Manage order dates',
      icon: <Icon size={13} strokeWidth={2.2}><rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon>,
      hint: id ? `Change approval & commitment dates for #${id}` : 'Change approval & commitment dates',
      smartFor: ['order'],
      handler: async () => {
        try {
          chrome.runtime.sendMessage({ action: 'broadcastToFrames', payload: { action: 'GB_REQUEST_OPEN_CALENDAR' } });
        } catch {
          window.__gbToast?.error?.('Could not reach the order frame', { duration: 3000 });
        }
      },
    });
  }

  /* Order detail page — move the old iframe button row into the same
     keyboard-first modal pattern used by Quick Task and Call Log. A second
     action repeats the most recently applied saved template without opening
     the picker. */
  function registerOrderNoteActions(pageType) {
    if (_quickNoteActionUnsub) { _quickNoteActionUnsub(); _quickNoteActionUnsub = null; }
    if (_lastNoteActionUnsub) { _lastNoteActionUnsub(); _lastNoteActionUnsub = null; }
    const generation = ++_lastNoteLoadGeneration;
    if (pageType !== 'order') return;
    const orderId = readOrderId();
    _quickNoteActionUnsub = actionRegistry.register({
      id: 'gb-quick-order-note',
      label: 'Apply order note',
      icon: <TYPE_ICONS.note size={13} />,
      hint: 'Choose a saved note or compose a custom one',
      smartFor: ['order'],
      handler: () => {
        if (typeof window.__gbShowQuickOrderNoteModal === 'function') {
          window.__gbShowQuickOrderNoteModal({ orderId });
        } else {
          window.__gbToast?.error?.('Quick Order Note failed to load — reload the page and try again.', { duration: 5000 });
        }
      },
    });

    loadLastOrderNote().then((last) => {
      if (generation !== _lastNoteLoadGeneration || actionRegistry.getPage() !== 'order') return;
      _lastNoteActionUnsub = actionRegistry.register({
        id: 'gb-apply-last-order-note',
        label: 'Apply last note',
        icon: <I.check size={13} />,
        hint: last ? (last.name || last.subject || 'Repeat the most recently applied note') : 'Choose a note first',
        smartFor: ['order'],
        handler: async () => {
          // Re-read at click time: the modal may have established a "last"
          // template since this action was registered on page load.
          const latest = await loadLastOrderNote();
          if (!latest) {
            window.__gbShowQuickOrderNoteModal?.({ orderId });
            return;
          }
          const result = await submitOrderNote(latest);
          if (result?.ok) {
            const followUpError = templateFollowUpActionError(result);
            if (followUpError) window.__gbToast?.warning?.(`Order note applied, but follow-up action failed: ${followUpError}`, { duration: 5000 });
            else window.__gbToast?.success?.(`Order note applied: ${latest.name || latest.subject}`, { duration: 2400 });
          }
          else window.__gbToast?.error?.(`Couldn't apply note: ${result?.error || 'unknown error'}`, { duration: 5000 });
        },
      });
    });
  }

  function registerTaskAction(pageType, displayName) {
    if (_taskActionUnsub) { _taskActionUnsub(); _taskActionUnsub = null; }
    if (!shelfShows('quickTaskEnabled', pageType)) return;

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
          // Open in the default filter/list view (same as the playground);
          // the composer is a / away. Don't force compose mode here.
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
    syncStandaloneActions(type);
    syncCustomActions(type);
    registerCallAction(type, label);
    registerLogCallAction(type, label);
    registerTaskAction(type, label);
    registerCopyOrdersAction(type);
    registerFindPhoneAction(type);
    registerOrderDatesAction(type);
    registerOrderNoteActions(type);
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
  /* Renders the shelf UI only while the `actionsShelfEnabled` feature flag is
     on. Lives inside the always-mounted ToastHost so toasts keep working even
     when the shelf is hidden. Reacts live to flag changes (storage + the
     GB_FEATURE_FLAGS broadcast both write featureFlags to storage). */
  function ShelfGate() {
    const [on, setOn] = useState(true);
    useEffect(() => {
      let alive = true;
      const apply = (f) => { if (alive) setOn((f || {}).actionsShelfEnabled !== false); };
      loadFlags().then(apply);
      const onCh = (changes, area) => {
        if (area === 'local' && changes.featureFlags) apply(changes.featureFlags.newValue || {});
      };
      try { chrome.storage.onChanged.addListener(onCh); } catch { /* */ }
      return () => { alive = false; try { chrome.storage.onChanged.removeListener(onCh); } catch { /* */ } };
    }, []);
    return on ? <ActionsShelf /> : null;
  }

  const HOST_ID = '__gb-actions-shelf';
  if (!document.getElementById(HOST_ID)) {
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-gb-scale', 'shelf');
    document.body.appendChild(host);
    // ToastHost ALWAYS mounts (it installs window.__gbToast, which non-modal
    // handlers like find-phone depend on even when the shelf UI is hidden).
    // The shelf UI itself only renders when `actionsShelfEnabled` is on.
    createRoot(host).render(
      <ToastHost installGlobal={true}>
        <ShelfGate />
        <CustomActionRunHost />
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
  customActionEntryPoints.subscribe(queueSync);

  /* Standalone "always-available" launchers (CRM Search, Task List, Gifting,
     Mockup Studio, Image Viewer, Watchlist, Notifications, New Contact,
     Workflows, Margin Calc) are now generated from the registry and gated by
     featureConfig per page — see syncStandaloneActions(), driven from
     syncContext(). Feature-flag + surface-config changes both re-run it. */
  loadFlags().then((f) => {
    // Merge persisted flags under any live broadcast already applied by main.js.
    window.__gbFeatureFlags = { ...f, ...(window.__gbFeatureFlags || {}) };
    syncContext();
  });
  loadFeatureConfig().then((c) => {
    _featureCfg = c;
    window.__gbFeatureConfig = c;
    syncContext();
  });
  loadCustomActions().then((list) => { _customActions = list; syncContext(); });
  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.featureFlags) {
        window.__gbFeatureFlags = changes.featureFlags.newValue || {};
        syncContext();
      }
      if (changes[FEATURE_CONFIG_KEY]) {
        _featureCfg = normalizeFeatureConfig(changes[FEATURE_CONFIG_KEY].newValue || {});
        window.__gbFeatureConfig = _featureCfg;
        syncContext();
      }
      if (changes[CUSTOM_ACTIONS_KEY]) {
        _customActions = (changes[CUSTOM_ACTIONS_KEY].newValue || []).map(normalizeCustomAction);
        syncContext();
      }
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
    const customSelectors = customActionSelectors(_customActions);
    for (const m of muts) {
      for (const n of [...m.addedNodes, ...m.removedNodes]) {
        if (n.nodeType !== 1) continue;
        if (customSelectors.some((selector) => {
          try {
            return n.matches?.(selector) || !!n.querySelector?.(selector);
          } catch {
            return false;
          }
        })) {
          queueSync();
          return;
        }
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
