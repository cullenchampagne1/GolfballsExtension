// main.js — injection guard, message listeners, DOM observer, init calls
/**
 * @file main.js
 * Entry point for the Golfballs.com content script bundle. Wrapped in a
 * single-execution guard so Chrome's content-script re-injection on
 * navigations does not register duplicate listeners. Registers:
 * - postMessage bridge for iframe → page communication (calendar, notifications)
 * - chrome.runtime.onMessage listener for popup/background → page actions
 * - Initial page scans and a MutationObserver for dynamic content
 */
// *** Must be listed LAST in manifest content_scripts for golfballs.com ***

if (!window.__gbContentReady) {
window.__gbContentReady = true;

// ── Message bridge from iframe (calendar, dates, notifications) ─────────────
  // MESSAGE LISTENER (From Iframe)
  // ═══════════════════════════════════════════════════════
  
  /* showGbNotification (the old vanilla toast) is gone — relay to the
     page-wide React toast (window.__gbToast, installed by the actions-
     shelf). Maps the old (message, type, duration) shape; 'loading'
     falls back to an info pill. */
  function gbNotify(msg, type = 'info', dur = 3000) {
    const t = window.__gbToast;
    if (!t || !msg) return;
    const fn = t[type] || t.info; // success | error | warning | info
    try { fn?.(msg, dur > 0 ? { duration: dur } : {}); } catch { /* no host */ }
  }

  window.addEventListener('message', (event) => {
    const { action, message, type, duration, data } = event.data || {};

    if (action === 'GB_NOTIFY') {
      gbNotify(message, type, duration);
    }

    if (action === 'GB_OPEN_CALENDAR') {
      if (window.__gbFeatureFlags?.calendarEnabled !== false) {
        // React Order Date Manager only — no legacy fallback. If the
        // content entry didn't load, tell the rep instead of silently
        // failing.
        if (typeof window.__gbOpenOrderCalendar === 'function') {
          window.__gbOpenOrderCalendar(data);
        } else {
          window.__gbToast?.error?.('Order Date Manager failed to load — reload the page and try again.', { duration: 5000 });
        }
      }
    }

    if (action === 'GB_PUSH_DATES_AND_NOTE') {
      if (window.__gbFeatureFlags?.autoPushEnabled !== false) openAutoPushNotification(event.data);
    }

    // Store employee ID broadcast from the iframe toolbar for use by case actions
    if (action === 'GB_EMPLOYEE_ID' && event.data.employeeId) {
      window.__gbEmployeeId = event.data.employeeId;
      // Persist across page navigations — case pages don't load the iframe toolbar
      chrome.storage.local.set({ gbEmployeeId: String(event.data.employeeId) });
    }

    // ── Calendar step updates from iframe ────────────────────────────────────
    if (action === 'GB_CALENDAR_STEP' && window.__gbActiveCalendar) {
      window.__gbActiveCalendar.onStep(event.data.step, event.data.label);
    }
    if (action === 'GB_CALENDAR_DONE' && window.__gbActiveCalendar) {
      window.__gbActiveCalendar.onDone();
    }
    if (action === 'GB_CALENDAR_ERROR' && window.__gbActiveCalendar) {
      window.__gbActiveCalendar.onError(event.data.error);
    }
  });

  /* Auto Date Push progress — moved here from the (removed) vanilla
     calendar.js, now a centered React step toast. Driven by the iframe's
     GB_AUTO_PUSH_STEP / GB_DATES_PUSHED / GB_AUTO_PUSH_ERROR messages. */
  function openAutoPushNotification(data) {
    const { daysOut } = data;
    const t = window.__gbToast;
    const totalSteps = data.commitmentOffset !== null ? 3 : 2;
    const steps = totalSteps === 3
      ? ['Pushing approval date', 'Pushing commitment date', 'Submitting note']
      : ['Pushing approval date', 'Submitting note'];
    const id = t?.step?.({
      steps, currentStep: 0,
      title: `Auto Date Push — ${daysOut} day${daysOut !== 1 ? 's' : ''} out`,
      placement: 'top-center',
    });
    const handler = (event) => {
      const d = event.data;
      if (!d) return;
      if (d.action === 'GB_AUTO_PUSH_STEP') {
        if (d.step != null && id != null) t?.update?.(id, { currentStep: Math.max(0, (parseInt(d.step, 10) || 1) - 1) });
      }
      if (d.action === 'GB_DATES_PUSHED') {
        window.removeEventListener('message', handler);
        if (id != null) {
          t?.update?.(id, { currentStep: steps.length });
          setTimeout(() => { t?.dismiss?.(id); t?.success?.('Dates saved', { placement: 'top-center', duration: 2500 }); }, 700);
        }
      }
      if (d.action === 'GB_AUTO_PUSH_ERROR') {
        window.removeEventListener('message', handler);
        if (id != null) t?.dismiss?.(id);
        t?.error?.('Auto push failed: ' + String(d.error || 'Failed').slice(0, 55), { placement: 'top-center', duration: 6000 });
      }
    };
    window.addEventListener('message', handler);
  }

// ── chrome.runtime messages from popup / background ─────────────────────────
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.action === 'enterPickMode') {
      enterPickMode();
      return true;
    }

    if (msg.action === 'resolveVars') {
      // Always async now to support recommended_replacement
      resolveAllVarsAsync(msg.vars, msg.toField)
        .then(result => sendResponse(result))
        .catch(() => sendResponse({ resolved: {}, toEmail: '' }));
      return true;
    }

    /* Resolve variables against a fetched HTML string instead of the
       live page. Used by the EmailRunner's bulk-send loop so we can
       drive per-contact var resolution from a background fetchRaw
       without opening tabs. resolveAllVarsAsync already accepts a
       Document — we just parse + hand it through. */
    if (msg.action === 'resolveVarsForHtml') {
      try {
        const doc = new DOMParser().parseFromString(msg.html || '', 'text/html');
        /* Match the window-global path: include the contact's display
           name so EmailRunner's trail row can label itself with the
           actual name rather than '(unknown)'. */
        let displayName = '';
        try {
          const engine = window.__gbPageEngine;
          if (engine && typeof engine.resolvePath === 'function') {
            const first = engine.resolvePath(doc, 'contact.firstName', '') || '';
            const last  = engine.resolvePath(doc, 'contact.lastName',  '') || '';
            displayName = `${first} ${last}`.trim();
          }
        } catch {}
        resolveAllVarsAsync(msg.vars, msg.toField, doc)
          .then(result => sendResponse({ ...result, displayName }))
          .catch((err) => sendResponse({ resolved: {}, toEmail: '', displayName, error: err?.message || 'resolve failed' }));
      } catch (e) {
        sendResponse({ resolved: {}, toEmail: '', displayName: '', error: e?.message || 'parse failed' });
      }
      return true;
    }


    if (msg.action === 'getPageInfo') {
      const pageType  = smartPageType();
      const contactId = smartContactId();
      const accountId = smartAccountId();

      const matched = (msg.templates || [])
        .filter(t => {
          // Account templates: evaluate both DOM rules AND account conditions
          if (t.type === 'account') {
            return checkRules(t.rules) && checkAccountConditions(t.accountConditions);
          }
          return checkRules(t.rules);
        })
        .map(t => t.id);
      // Only resolve order number on actual order pages to avoid false positives
      // on contact/account pages whose body text contains order history table rows.
      const email           = smartEmail();
      const orderNo         = pageType === 'order' ? smartOrderNumber() : '';
      const userId        = smartUserId();
      const pageOrderTotal  = smartPageOrderTotal();
      const pageChargeTotal = smartPageChargeTotal();
      const pageChargeRows  = smartPageChargeRows();
      const messageId       = smartMessageId();
      const pageVars        = (pageType === 'contact' || pageType === 'account') ? smartPageVariables() : {};
      sendResponse({ email, orderNo, matchedTemplateIds: matched, userId, pageOrderTotal, pageChargeTotal, pageChargeRows, messageId, pageType, contactId, accountId, pageVars });
      return true;
    }

    if (msg.action === 'GB_FEATURE_FLAGS') {
      window.__gbFeatureFlags = { ...(window.__gbFeatureFlags || {}), ...msg.flags };
      // Enable/disable email/text preview
      if ('emailPreviewEnabled' in msg.flags) {
        if (msg.flags.emailPreviewEnabled) {
            if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
            if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
        }
      }
      if ('imagePreviewEnabled' in msg.flags) {
        if (msg.flags.imagePreviewEnabled) {
          if (window.__gbScanForRenderImages) window.__gbScanForRenderImages();
        } else {
          window.__gbHideHoverBtn?.();
          document.getElementById('__gb-img-hover-btn')?.remove();
        }
      }
      if ('signifydGlowEnabled' in msg.flags) {
        if (msg.flags.signifydGlowEnabled) __gbApplySignifydGlow();
        else document.getElementById('__gb-signifyd-glow')?.remove();
      }
      return true;
    }

    if (msg.action === 'showChargeModal') {
      __gbShowChargeModal(msg.context);
      return true;
    }

    // --- Order Edit Modal ---
    if (msg.action === 'showOrderEditModal') {
      __gbShowOrderEditModal();
      return true;
    }

    if (msg.action === 'showCrmSearchModal') {
      if (typeof window.__gbShowCrmSearchModal === 'function') window.__gbShowCrmSearchModal();
      return true;
    }

    if (msg.action === 'showTaskListModal') {
      if (typeof window.__gbShowTaskListModal === 'function') {
        window.__gbShowTaskListModal();
      }
      return true;
    }

    if (msg.action === 'showWatchListModal') {
      if (typeof __gbShowWatchListModal === 'function') {
        __gbShowWatchListModal();
      } else {
        console.warn('[GB] watchlist-modal.js not loaded — __gbShowWatchListModal missing');
      }
      return true;
    }

    if (msg.action === 'sendViaPA') {
      // Build the lean payload, send to PA, and surface the real result
      // as a page toast. The popup has already closed by the time PA
      // responds, so the content script is the only place we can show
      // feedback.
      chrome.storage.local.get(['emailSignature', 'devSettings'], ({ emailSignature, devSettings }) => {
        let body = msg.templateHtml || '';
        if (emailSignature) {
          body += '<br><div>' + emailSignature + '</div>';
        }
        /* Sender mapping — inlined because this file is a vanilla
           content script (no ESM imports). Keep in sync with
           src/lib/sender.js when adding accounts. Only the DOMAIN
           lives here; the local part comes from the rep's
           devSetting ('email.localPart', defaults to 'cullen'), so
           the rendered From: is e.g. cullen@golfballs.com. */
        const SENDER_DOMAINS = {
          golfballs:   'golfballs.com',
          loyaltylogo: 'loyaltylogo.com',
        };
        const SENDER_IDS = Object.keys(SENDER_DOMAINS);
        const rawLocal = (devSettings && devSettings['email.localPart']) || 'cullen';
        const localPart = String(rawLocal).trim() || 'cullen';
        const domainFor = (id) => SENDER_DOMAINS[id] || SENDER_DOMAINS[SENDER_IDS[0]];
        const fromAddr = (() => {
          const id = msg.senderRandomize
            ? SENDER_IDS[Math.floor(Math.random() * SENDER_IDS.length)]
            : (msg.senderAccount || SENDER_IDS[0]);
          return `${localPart}@${domainFor(id)}`;
        })();
        const payload = {
          emails: [{
            from:      fromAddr,
            to:        msg.contactEmail,
            subject:   msg.templateSubject,
            htmlBody:  body,
            replyMode: msg.replyMode,
          }],
        };
        chrome.runtime.sendMessage({ action: 'paAutomate', paUrl: msg.paUrl, payload }, (result) => {
          /* Always go through window.__gbToast — actions-shelf mounts
             a ToastHost on every golfballs.com page (matched in the
             manifest), so the global is reliably installed by the
             time a PA roundtrip completes. The legacy
             showGbNotification fallback used to fire here and produced
             the old-style banner the user just reported — gone now. */
          const toast = (typeof window !== 'undefined' && window.__gbToast) ? window.__gbToast : null;
          if (result?.results?.[0]?.status === 'sent') {
            toast?.success?.(`Email sent to ${msg.contactEmail}`, { duration: 4000 });
          } else {
            const err = result?.results?.[0]?.error || result?.error || 'PA FAILED';
            toast?.error?.(`Email failed: ${err}`, { duration: 6000 });
          }
        });
      });
      sendResponse({ sent: true });
      return true;
    }

    if (msg.action === 'executePresetTask') {
      // Inline Task/Create.ajax — same payload shape as lib/submitQuickTask.js
      // (used by the React QuickTask modal). Kept inline here because main.js
      // is a vanilla content script and can't ESM-import the lib. The legacy
      // crm-task-buttons.js used to host this with a "complete + create"
      // variant; that page-injected button was removed when we deleted the
      // file, so the message handler is the only remaining entry point.
      chrome.storage.local.get('noteTemplates', async ({ noteTemplates }) => {
        const taskTpl = (noteTemplates || []).find(t => t.id === msg.taskId);
        if (!taskTpl) return;
        const base = 'https://api.golfballs.com';
        const go = (url) => fetch(base + url, { credentials: 'include' }).then(r => r.json()).catch(() => null);
        const today = new Date();
        const fmt = d => `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
        const due = taskTpl.daysOut != null
          ? (() => { const d = new Date(); d.setDate(d.getDate() + taskTpl.daysOut); return fmt(d); })()
          : fmt(today);
        await go(`/golfballs/crm/Admin/Task/Create.ajax?${JSON.stringify({
          TaskID: '', Subject: taskTpl.subject || taskTpl.name,
          Description: taskTpl.body || '', LiveDate: fmt(today), DueDate: due,
          taskCategoryID: String(taskTpl.categoryId || '0'), taskStatusID: '1',
          Priority: String(taskTpl.priority || '1'),
          contactID: String(msg.contactId || '0'), leadID: '0',
          employeeID: String(msg.employeeId || '0'), caseID: 0,
        })}`);
      });
      return true;
    }

    if (msg.action === 'showImagePreview') {
      if (typeof window.__gbOpenImagePreview === 'function') {
        window.__gbOpenImagePreview({
          orderId:    msg.orderId    || '',
          customerId: msg.customerId || '',
        });
      }
      return true;
    }

  });

  /* Expose the resolver as a window global so React content scripts
     (notably EmailRunner's bulk-send loop) can call it DIRECTLY
     instead of going through chrome.runtime.sendMessage. Cross-
     content-script runtime messaging in MV3 has to round-trip
     through the background, and the bulk loop firing dozens of
     these per blast was the fragile path the user reported as
     "every send fails to evaluate the contact page." Direct call
     sidesteps the routing entirely. The chrome.runtime listener
     above stays as the canonical message handler for any caller
     that prefers messaging (popup, other extensions). */
  window.__gbResolveVarsForHtml = (html, vars, toField) => {
    try {
      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      /* Pull the contact's display name straight off the page via the
         schema engine — independent of whatever template vars are
         defined. EmailRunner needs this for the per-row trail label;
         doing it here keeps the parse + engine call in one place
         instead of re-parsing the HTML on the React side. */
      let displayName = '';
      try {
        const engine = window.__gbPageEngine;
        if (engine && typeof engine.resolvePath === 'function') {
          const first = engine.resolvePath(doc, 'contact.firstName', '') || '';
          const last  = engine.resolvePath(doc, 'contact.lastName',  '') || '';
          displayName = `${first} ${last}`.trim();
        }
      } catch {}
      return resolveAllVarsAsync(vars, toField, doc)
        .then((res) => ({ ...res, displayName }))
        .catch((err) => ({ resolved: {}, toEmail: '', displayName, error: err?.message || 'resolve failed' }));
    } catch (e) {
      return Promise.resolve({ resolved: {}, toEmail: '', displayName: '', error: e?.message || 'parse failed' });
    }
  };

// ── Initial scans + DOM mutation observer ───────────────────────────────────
  // ── Scan on load + watch for dynamic rows ─────────────

  __gbApplySignifydGlow();

  // Load feature flags then conditionally add the copy button and email preview
  chrome.storage.local.get('featureFlags', (data) => {
    window.__gbFeatureFlags = { copyIdsEnabled: true, emailPreviewEnabled: true, imagePreviewEnabled: true, calendarEnabled: true, watchListEnabled: true, autoPushEnabled: true, signifydGlowEnabled: true, ...(data.featureFlags || {}) };
    // copyIdsEnabled now powers the actions-shelf "Copy order IDs"
    // action on the Orders index page — the legacy page-injected
    // button (__gbAddCopyIdsButton) was removed in favor of that path.
    if (window.__gbFeatureFlags.emailPreviewEnabled) {
        if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
        if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
    }
    if (window.__gbFeatureFlags.imagePreviewEnabled !== false && window.__gbScanForRenderImages) window.__gbScanForRenderImages();
    if (window.__gbFeatureFlags.signifydGlowEnabled !== false) __gbApplySignifydGlow();
  });

  // ── Global key bindings ─────────────────────────────────────────────────────
  // Ctrl+[configurable] → New CRM Contact (default Q; set in Settings → Keyboard Shortcuts)
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
      const raw = keyboardShortcuts?.crmNewContact;
      const key = (raw === undefined ? 'q' : raw).toLowerCase();
      if (!key || e.key.toLowerCase() !== key) return;
      e.preventDefault();
      if (typeof window.__gbShowCrmCreateContactModal === 'function') {
        window.__gbShowCrmCreateContactModal();
      }
    });
  });

  const __gbObserver = new MutationObserver(() => {
    __gbApplySignifydGlow();
    if (window.__gbFeatureFlags?.emailPreviewEnabled !== false) {
        if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
        if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
    }
    if (window.__gbFeatureFlags?.imagePreviewEnabled  !== false && window.__gbScanForRenderImages) window.__gbScanForRenderImages();
    if (window.__gbFeatureFlags?.signifydGlowEnabled  !== false) __gbApplySignifydGlow();
  });
  __gbObserver.observe(document.body, { childList: true, subtree: true });

  // ═══════════════════════════════════════════════════════

} // end injection guard