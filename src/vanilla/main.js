// main.js — injection guard, message listeners, DOM observer, init calls
/**
 * @file main.js
 * Entry point for the Golfballs.com content script bundle. Wrapped in a
 * single-execution guard so Chrome's content-script re-injection on
 * navigations does not register duplicate listeners. Registers:
 * - authenticated runtime bridge for iframe → page communication
 * - chrome.runtime.onMessage listener for popup/background → page actions
 * - Initial page scans and a MutationObserver for dynamic content
 */
// *** Must be listed LAST in manifest content_scripts for golfballs.com ***

if (!window.__gbContentReady) {
window.__gbContentReady = true;

// Client-side access gate (FAIL-OPEN). The service worker writes
// gbRuntimeState.{o,s} from the /client/health check: o=0 means revoked, a
// verify stamp (s) older than 48h means the offline grace expired. Either one
// disables every on-page feature (see the featureFlags load below). Missing/
// unreadable state → ALLOW, so this can never brick the page the way the old
// gate did. A determined reverse-engineer can strip it; it's here to disable
// the toolkit for the ~90% of revoked users who won't.
function __gbAccessAllowed(st, now) {
  if (!st || typeof st !== 'object') return true;
  if (!(st.o === 1 || st.o === true)) return false;
  const stamp = Number(st.s) || 0;
  return !stamp || (now - stamp) < 48 * 60 * 60 * 1000;
}

// ── Authenticated runtime bridge from iframe ────────────────────────────────
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

  function __gbNotificationReceipt(notification, state) {
    const remoteId = Number(notification?.remoteId);
    if (!Number.isSafeInteger(remoteId) || remoteId < 1) return;
    try {
      chrome.runtime.sendMessage({
        action: 'notificationReceipt',
        notificationIds: [remoteId],
        state,
      });
    } catch { /* worker unavailable during navigation */ }
  }

  const __gbActionRuntime = window.GBActionRuntime;
  __gbActionRuntime?.registerHandler?.(
    'open_mockup_batch',
    'content',
    (payload) => {
      const batchId = String(payload.target || '');
      if (
        !/^batch_[a-f0-9]{32}$/.test(batchId)
        || typeof window.__gbOpenMockupStudio !== 'function'
      ) return false;
      window.__gbOpenMockupStudio(batchId);
      return true;
    },
  );
  __gbActionRuntime?.registerHandler?.(
    'open_contact',
    'content',
    (payload, context) => {
      // Fast path: the background poller already resolved this contact's admin
      // URL (email → CRM index / Solr, at poll time) — jump straight to it.
      const url = String(context.notification?.localActionUrl || '');
      if (/^https:\/\/api\.golfballs\.com\/golfballs\/adminnew\//i.test(url)) {
        window.location.assign(url);
        return true;
      }
      // Fallback: no pre-resolved URL (the worker's index was empty or it had
      // no credentialed golfballs session at poll time). Don't dead-end — run
      // the search live at CLICK time, in this credentialed content context,
      // by opening CRM Search pre-filled with the sender's email. It auto-runs
      // the Solr query so the matching contact is one click away.
      const email = String(payload?.target || '').trim();
      if (email && typeof window.__gbShowCrmSearchModal === 'function') {
        window.__gbShowCrmSearchModal({ query: email, type: 'contact' });
        return true;
      }
      window.__gbToast?.info?.(
        'No matching contact is available on this device yet',
        { duration: 4000 },
      );
      return false;
    },
  );
  __gbActionRuntime?.registerHandler?.(
    'open_support_ticket',
    'content',
    (payload) => {
      if (!/^GBT-[A-Z0-9]{6,16}$/.test(
        String(payload.target || ''),
      )) return false;
      chrome.runtime.sendMessage({
        action: 'openEditor',
        openSettings: true,
        settingsTarget: 'support-tickets',
      });
      return true;
    },
  );

  const __gbSharedActionCommands = [
    'open_modal',
    'set_feature',
    'set_setting',
    'set_theme_preset',
    'set_theme_palette',
    'share_settings',
    'share_email_template',
    'submit_ticket',
  ];
  for (const command of __gbSharedActionCommands) {
    __gbActionRuntime?.registerHandler?.(
      command,
      'content',
      (payload, context) => {
        const run = window.__gbExecuteActionPayloadOnce;
        const remoteId = Number(context.notification?.remoteId);
        if (
          typeof run !== 'function'
          || !Number.isSafeInteger(remoteId)
          || remoteId < 1
        ) return false;
        return run(`notification:${remoteId}`, payload);
      },
    );
  }

  async function __gbOpenNotification(notification, options = {}) {
    const acknowledge = options.receipt !== false;
    const receipt = (state) => {
      if (acknowledge) __gbNotificationReceipt(notification, state);
    };
    const rawAction = notification?.action;
    if (!rawAction || typeof rawAction !== 'object') {
      window.__gbShowNotificationsModal?.();
      receipt('read');
      return true;
    }
    let result = false;
    try {
      result = await __gbActionRuntime?.execute?.(
        rawAction,
        'content',
        { notification },
      );
    } catch { result = false; }
    const handled = (
      result === true
      || (
        result
        && typeof result === 'object'
        && result.status === 'succeeded'
      )
    );
    if (handled) {
      receipt('acted');
      if (result && typeof result === 'object') {
        const message = String(result.message || 'Action applied');
        const url = String(result.url || '');
        if (url) {
          window.__gbToast?.action?.({
            title: message,
            message: 'The generated link is ready.',
            placement: 'top-right',
            align: 'right',
            secondary: 'Dismiss',
            primary: 'Copy link',
            onPrimary: async () => {
              try {
                await navigator.clipboard.writeText(url);
                window.__gbToast?.success?.('Link copied', {
                  duration: 1800,
                  placement: 'top-right',
                });
              } catch {
                window.__gbToast?.error?.('Could not copy link', {
                  duration: 2200,
                  placement: 'top-right',
                });
              }
            },
          });
        } else if (result.replayed !== true) {
          window.__gbToast?.success?.(message, {
            duration: 2300,
            placement: 'top-right',
          });
        }
      }
      return true;
    }
    window.__gbToast?.warning?.('This notification action is unavailable', {
      duration: 3500,
    });
    return false;
  }
  window.__gbRunNotificationAction = __gbOpenNotification;
  window.__gbCanRunNotificationAction = (notification) => (
    __gbActionRuntime?.canExecute?.(
      notification?.action,
      'content',
    ) === true
  );

  let __gbAutoPushUpdate = null;
  function __gbHandleIframeMessage(payload) {
    const { action, message, type, duration, data } = payload || {};
    let handled = false;

    if (action === 'GB_NOTIFY') {
      handled = true;
      gbNotify(message, type, duration);
    }

    /* Typed server notification. Functions cannot cross the runtime boundary,
       so only allowlisted local actions are reconstructed on the page. */
    if (action === 'GB_EXTENSION_NOTIFICATION') {
      handled = true;
      const notification = payload?.notification || {};
      const toast = window.__gbToast;
      const notificationType = notification.presentation?.type === 'action'
        && notification.action
        ? 'action'
        : 'tag';
      if (
        notificationType === 'action'
        && toast
        && typeof toast.action === 'function'
      ) {
        const actionTones = {
          success: 'success', warning: 'warning', error: 'error', info: 'brand',
        };
        toast.action({
          tone: actionTones[notification.level] || 'brand',
          title: notification.title || 'New notification',
          message: notification.body || '',
          placement: 'top-right',
          align: 'right',
          secondary: 'Dismiss',
          primary: notification.action?.label || 'Open',
          onPrimary: () => __gbOpenNotification(notification),
        });
      } else if (toast && typeof toast.tag === 'function') {
        const tagTones = {
          success: 'success', warning: 'warning', error: 'error', info: 'info',
        };
        toast.tag(notification.body || notification.title || 'New notification', {
          tone: tagTones[notification.level] || 'info',
          placement: 'top-right',
          duration: 5_000,
        });
      } else {
        gbNotify(notification.title || notification.body, notification.level, 6000);
      }
    }

    if (action === 'GB_OPEN_CALENDAR') {
      handled = true;
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
      handled = true;
      if (window.__gbFeatureFlags?.autoPushEnabled !== false) openAutoPushNotification(payload);
    }

    // Store the safe CRM-authenticated current-user pair. This is the only
    // broker data allowed into the content-script world: no credential,
    // header, cookie, token, or additional decoded claim crosses the bridge.
    if (action === 'GB_EMPLOYEE_IDENTITY') {
      handled = true;
      const employeeId = String(payload.employeeId || '').trim();
      const employeeName = String(payload.employeeName || '').trim().replace(/\s+/g, ' ');
      if (!/^\d{1,12}$/.test(employeeId) || Number(employeeId) < 1) return true;
      window.__gbEmployeeId = employeeId;
      if (!employeeName || employeeName.length > 120
          || /[\u0000-\u001f\u007f]/.test(employeeName)
          || /^(?:unknown|n\/?a)$/i.test(employeeName)) {
        chrome.storage.local.set({ gbEmployeeId });
        return true;
      }
      const updatedAt = Date.now();
      const identity = Object.freeze({
        employeeId,
        employeeName,
        name: employeeName,
        nameSource: 'crm_session',
        crmVerified: true,
        updatedAt,
      });
      window.__gbCurrentUser = identity;
      window.__gbGetCurrentUser = () => window.__gbCurrentUser || null;
      try {
        window.dispatchEvent(new CustomEvent('gb:current-user-change', { detail: identity }));
      } catch { /* page is unloading */ }
      chrome.storage.local.set({
        gbEmployeeId: employeeId,
        gbCurrentUser: { employeeId, employeeName, source: 'crm_session', updatedAt },
      });
    }

    // Backward-compatible id-only broadcast for an older iframe bundle.
    if (action === 'GB_EMPLOYEE_ID') {
      handled = true;
      const employeeId = String(payload.employeeId || '').trim();
      if (!/^\d{1,12}$/.test(employeeId) || Number(employeeId) < 1) return true;
      window.__gbEmployeeId = employeeId;
      // Persist across page navigations — case pages don't load the iframe toolbar
      chrome.storage.local.set({ gbEmployeeId: window.__gbEmployeeId });
    }

    // ── Calendar step updates from iframe ────────────────────────────────────
    if (action === 'GB_CALENDAR_STEP' && window.__gbActiveCalendar) {
      handled = true;
      window.__gbActiveCalendar.onStep(payload.step, payload.label);
    }
    if (action === 'GB_CALENDAR_DONE' && window.__gbActiveCalendar) {
      handled = true;
      window.__gbActiveCalendar.onDone();
    }
    if (action === 'GB_CALENDAR_ERROR' && window.__gbActiveCalendar) {
      handled = true;
      window.__gbActiveCalendar.onError(payload.error);
    }
    if (typeof __gbAutoPushUpdate === 'function') handled = __gbAutoPushUpdate(payload) || handled;
    return handled;
  }

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
    __gbAutoPushUpdate = (d) => {
      if (!d) return false;
      if (d.action === 'GB_AUTO_PUSH_STEP') {
        if (d.step != null && id != null) t?.update?.(id, { currentStep: Math.max(0, (parseInt(d.step, 10) || 1) - 1) });
        return true;
      }
      if (d.action === 'GB_DATES_PUSHED') {
        __gbAutoPushUpdate = null;
        if (id != null) {
          t?.update?.(id, { currentStep: steps.length });
          setTimeout(() => { t?.dismiss?.(id); t?.success?.('Dates saved', { placement: 'top-center', duration: 2500 }); }, 700);
        }
        return true;
      }
      if (d.action === 'GB_AUTO_PUSH_ERROR') {
        __gbAutoPushUpdate = null;
        if (id != null) t?.dismiss?.(id);
        t?.error?.('Auto push failed: ' + String(d.error || 'Failed').slice(0, 55), { placement: 'top-center', duration: 6000 });
        return true;
      }
      return false;
    };
  }

  /* Streaming variable resolution. The popup opens this port and gets a
     message per variable AS IT RESOLVES (the chain runs in dependency
     order, so simple vars land first), instead of one final batch — that's
     what lets each row clear its spinner independently. Falls back to the
     one-shot `resolveVars` message above when a port isn't used. */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnect) {
    chrome.runtime.onConnect.addListener((port) => {
      if (!port || port.name !== 'gbResolveStream') return;
      port.onMessage.addListener((msg) => {
        if (!msg || msg.action !== 'resolveVarsStream') return;
        const post = (m) => { try { port.postMessage(m); } catch {} };
        resolveAllVarsAsync(msg.vars, msg.toField, document, (ev) => post(ev))
          .then((res) => post({ kind: 'done', resolved: res.resolved, toEmail: res.toEmail }))
          .catch((err) => post({ kind: 'error', error: (err && err.message) || 'resolve failed' }));
      });
    });
  }

// ── chrome.runtime messages from popup / background ─────────────────────────
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (__gbHandleIframeMessage(msg)) {
      sendResponse({ ok: true });
      return true;
    }

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
        const doc = new DOMParser().parseFromString(gbWithBase(msg.html || '', msg.url), 'text/html');
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

    if (msg.action === 'pageEngineTerritoryInfo') {
      const engine = (typeof window !== 'undefined' && window.__gbPageEngine) || null;
      if (!engine || typeof engine.inspectTerritory !== 'function') {
        sendResponse({ ok: false, error: 'Page Engine is unavailable on this page.' });
        return true;
      }
      try {
        const territory = engine.inspectTerritory(document);
        if (!territory) {
          sendResponse({ ok: false, error: 'Open an Account or Contact page to extract its territory.' });
        } else {
          sendResponse({ ok: true, ...territory });
        }
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || 'Unable to inspect the page territory.' });
      }
      return true;
    }


    if (msg.action === 'getPageInfo') {
      // Async: grouped rule trees evaluate through the page engine
      // (matchEngine), which may await. Legacy flat rules stay on the
      // synchronous checkRules / checkAccountConditions path, unchanged.
      (async () => {
        const pageType  = smartPageType();
        const contactId = smartContactId();
        const accountId = smartAccountId();
        const engine    = (typeof window !== 'undefined' && window.__gbPageEngine) || null;

        // Sync value resolver for grouped conditions (schema path / legacy
        // DOM selector). Match rules must NOT use variables: code/template
        // variables are expensive (they fetch past orders, hit the catalog)
        // and resolving them for every template on page load is exactly
        // what we're avoiding. A `var` condition therefore resolves to ''
        // here — it's inert in matching. Variables resolve ONLY when a
        // template is clicked, via the streaming resolver.
        const getMatchValue = (cond) => {
          if (!cond) return '';
          if (cond.source === 'schema') {
            if (!engine) return '';
            const quant = engine.arrayQuantifier && engine.arrayQuantifier(cond.ref);
            if (quant) {
              const mm = cond.ref.match(/^(.*?)\[(?:any|none)\](.*)$/);
              if (!mm) return [];
              const arr = engine.resolvePath(document, mm[1], []);
              if (!Array.isArray(arr)) return [];
              const suffix = (mm[2] || '').replace(/^\./, '');
              return arr.map((item) => (suffix ? engine.resolve(item, suffix, '') : item));
            }
            return engine.resolvePath(document, cond.ref, '');
          }
          if (cond.source === 'dom') {
            try {
              const el = document.querySelector(cond.ref);
              return el ? ((typeof getTextOf === 'function') ? getTextOf(el) : (el.innerText || el.textContent || '').trim()) : '';
            } catch { return ''; }
          }
          return '';
        };

        const matched = [];
        for (const t of (msg.templates || [])) {
          const tree = t.type === 'account' ? t.accountConditions : t.rules;
          if (engine && engine.isGroupedTree(tree)) {
            // Evaluated synchronously, NO variable resolution. Any `var`
            // condition reads '' (see getMatchValue) so it can't gate a
            // match — matching never runs the code chain on page load.
            let ok = false;
            try { ok = await engine.evalTree(tree, getMatchValue); } catch { ok = false; }
            if (ok) matched.push(t.id);
          } else if (t.type === 'account') {
            if (checkRules(t.rules) && checkAccountConditions(t.accountConditions)) matched.push(t.id);
          } else if (checkRules(t.rules)) {
            matched.push(t.id);
          }
        }

        // Only resolve order number on actual order pages to avoid false
        // positives on contact/account pages whose body text contains
        // order history table rows.
        const email           = smartEmail();
        const orderNo         = pageType === 'order' ? smartOrderNumber() : '';
        const userId          = smartUserId();
        const pageOrderTotal  = smartPageOrderTotal();
        const pageChargeTotal = smartPageChargeTotal();
        const pageChargeRows  = smartPageChargeRows();
        const messageId       = smartMessageId();
        const pageVars        = (pageType === 'contact' || pageType === 'account') ? smartPageVariables() : {};
        sendResponse({ email, orderNo, matchedTemplateIds: matched, pendingTemplateIds: [], userId, pageOrderTotal, pageChargeTotal, pageChargeRows, messageId, pageType, contactId, accountId, pageVars });
      })();
      return true;
    }

    /* (removed) `resolveMatch` — match rules no longer resolve variables.
       Matching is fully synchronous in getPageInfo; variables resolve only
       when a template is clicked (the streaming resolver). */

    if (msg.action === 'GB_FEATURE_FLAGS') {
      window.__gbFeatureFlags = { ...(window.__gbFeatureFlags || {}), ...msg.flags };
      // Re-arm email + text preview independently (each has its own flag now).
      if (window.__gbFeatureFlags.emailPreviewEnabled !== false && window.__gbEmailPreviewScan) __gbEmailPreviewScan();
      if (window.__gbFeatureFlags.textPreviewEnabled  !== false && window.__gbTextPreviewScan)  __gbTextPreviewScan();
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

    /* Fire a toast on THIS page (the active tab). Lets surfaces that
       live in their own window — chiefly the browser-action popup —
       show feedback where the user is actually looking instead of in a
       window that's about to close. Routes through the page-wide
       window.__gbToast that the actions-shelf mounts. */
    if (msg.action === 'showToast') {
      const t = window.__gbToast;
      const tone = ['success', 'error', 'warning', 'info'].includes(msg.tone) ? msg.tone : 'info';
      try { t?.[tone]?.(msg.message || '', msg.opts || {}); } catch {}
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
      }
      return true;
    }

    if (msg.action === 'showNotificationsModal') {
      if (typeof window.__gbShowNotificationsModal === 'function') window.__gbShowNotificationsModal();
      return true;
    }

    if (msg.action === 'runNotificationAction') {
      const handled = __gbOpenNotification(msg.notification);
      sendResponse({ ok: handled === true });
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
           `email.localPart` dev setting. Missing configuration fails
           closed instead of falling back to another employee. */
        const SENDER_DOMAINS = {
          golfballs:   'golfballs.com',
          loyaltylogo: 'loyaltylogo.com',
        };
        const SENDER_IDS = Object.keys(SENDER_DOMAINS);
        const rawLocal = (devSettings && devSettings['email.localPart']) || '';
        const localPart = String(rawLocal).trim();
        if (!/^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i.test(localPart)) {
          window.__gbToast?.error?.('Configure Email account host in Settings before sending', { duration: 6000 });
          sendResponse({ sent: false, error: 'Sender address is not configured' });
          return;
        }
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
        chrome.runtime.sendMessage({ action: 'paAutomate', payload }, (result) => {
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
        sendResponse({ sent: true });
      });
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

    /* Generic launcher bridge for the browser-action popup. The popup can't
       reach in-page globals directly (separate window), so it messages the
       tab with the resolved target it read from the feature registry:
         · GB_LAUNCH_GLOBAL   — call a safe no-arg window.__gb* opener
         · GB_RUN_SHELF_ACTION — run a registered action-shelf action by id
                                 (for page-contextual tools like find-phone,
                                 copy-ids — which need live DOM). */
    if (msg.action === 'GB_LAUNCH_GLOBAL') {
      // Only ever invoke our own __gb* openers, never an arbitrary window fn.
      if (typeof msg.global === 'string' && /^__gb[A-Za-z]+$/.test(msg.global)) {
        const fn = window[msg.global];
        if (typeof fn === 'function') { try { fn(); } catch {} }
        else window.__gbToast?.error?.('That tool isn’t available on this page', { duration: 2600 });
      }
      return true;
    }

    if (msg.action === 'GB_RUN_SHELF_ACTION') {
      const reg = window.__gbActionRegistry;
      const act = reg?.getActions?.().find((a) => a.id === msg.id);
      if (act && typeof act.handler === 'function') { try { act.handler(); } catch {} }
      else window.__gbToast?.warning?.('That action isn’t available on this page', { duration: 2800 });
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
  /* Inject a <base href> so RELATIVE links in a fetched page (the orders
     table's order-detail anchors) resolve to absolute URLs when parsed by
     DOMParser — which, unlike the live document, has no browsing context and
     would otherwise leave a.href empty/broken. This is what lets the
     order-fetch chain (_last_order.href → h.fetchText) work in bulk send the
     same way it does on the live page. */
  function gbWithBase(html, baseUrl) {
    if (!baseUrl || typeof html !== 'string') return html || '';
    const tag = `<base href="${baseUrl}">`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + tag);
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
    return `<head>${tag}</head>${html}`;
  }

  window.__gbResolveVarsForHtml = (html, vars, toField, baseUrl) => {
    try {
      const doc = new DOMParser().parseFromString(gbWithBase(html || '', baseUrl), 'text/html');
      /* Pull the contact's display name straight off the page via the
         schema engine — independent of whatever template vars are
         defined. EmailRunner needs this for the per-row trail label;
         doing it here keeps the parse + engine call in one place
         instead of re-parsing the HTML on the React side. */
      let displayName = '';
      /* Most-recent email date from the contact's Email history portlet
         (contact.emails[].date) as an epoch-ms value — drives EmailRunner's
         "skip if emailed within N days" rule off the page's real send history.
         0 when there's no email history on the page. */
      let lastEmailMs = 0;
      try {
        const engine = window.__gbPageEngine;
        if (engine && typeof engine.resolvePath === 'function') {
          const first = engine.resolvePath(doc, 'contact.firstName', '') || '';
          const last  = engine.resolvePath(doc, 'contact.lastName',  '') || '';
          displayName = `${first} ${last}`.trim();
          const emails = engine.resolvePath(doc, 'contact.emails', []) || [];
          if (Array.isArray(emails)) {
            for (const e of emails) {
              const d = e && e.date;
              const t = d instanceof Date ? d.getTime() : Date.parse(String(d || ''));
              if (Number.isFinite(t) && t > lastEmailMs) lastEmailMs = t;
            }
          }
        }
      } catch {}
      return resolveAllVarsAsync(vars, toField, doc)
        .then((res) => ({ ...res, displayName, lastEmailMs }))
        .catch((err) => ({ resolved: {}, toEmail: '', displayName, lastEmailMs, error: err?.message || 'resolve failed' }));
    } catch (e) {
      return Promise.resolve({ resolved: {}, toEmail: '', displayName: '', error: e?.message || 'parse failed' });
    }
  };

// ── Initial scans + DOM mutation observer ───────────────────────────────────
  // ── Scan on load + watch for dynamic rows ─────────────

  __gbApplySignifydGlow();

  // Load feature flags then conditionally add the copy button and email preview
  const __gbDefaultFlags = { copyIdsEnabled: true, emailPreviewEnabled: true, textPreviewEnabled: true, imagePreviewEnabled: true, calendarEnabled: true, watchListEnabled: true, autoPushEnabled: true, signifydGlowEnabled: true, actionsShelfEnabled: true, giftCatalogEnabled: true, callLogEnabled: true, quickTaskEnabled: true, crmNewContactEnabled: true };
  chrome.storage.local.get(['featureFlags', 'gbRuntimeState'], (data) => {
    if (!__gbAccessAllowed(data.gbRuntimeState, Date.now())) {
      // Revoked / grace expired: force every feature off. Shelf actions and
      // page scans read window.__gbFeatureFlags at click/scan time, so all-false
      // neutralizes the on-page toolkit without touching the shelf's mount.
      window.__gbFeatureFlags = Object.fromEntries(Object.keys(__gbDefaultFlags).map((k) => [k, false]));
      return;
    }
    window.__gbFeatureFlags = { ...__gbDefaultFlags, ...(data.featureFlags || {}) };
    // copyIdsEnabled now powers the actions-shelf "Copy order IDs"
    // action on the Orders index page — the legacy page-injected
    // button (__gbAddCopyIdsButton) was removed in favor of that path.
    if (window.__gbFeatureFlags.emailPreviewEnabled !== false && window.__gbEmailPreviewScan) __gbEmailPreviewScan();
    if (window.__gbFeatureFlags.textPreviewEnabled  !== false && window.__gbTextPreviewScan)  __gbTextPreviewScan();
    if (window.__gbFeatureFlags.imagePreviewEnabled !== false && window.__gbScanForRenderImages) window.__gbScanForRenderImages();
    if (window.__gbFeatureFlags.signifydGlowEnabled !== false) __gbApplySignifydGlow();
  });

  // ── Global key bindings ─────────────────────────────────────────────────────
  // Ctrl+[configurable] → New CRM Contact (default Q; set in Settings → Keyboard Shortcuts)
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if ((window.__gbFeatureFlags || {}).crmNewContactEnabled === false) return;
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

  /* Re-run the page scans, each gated by its own feature flag. (Previously
     __gbApplySignifydGlow ran twice — once unconditionally, once flag-gated —
     so the glow ignored its disable flag; fixed to a single gated call.) */
  const __gbRunScans = () => {
    if (window.__gbFeatureFlags?.signifydGlowEnabled !== false) __gbApplySignifydGlow();
    if (window.__gbFeatureFlags?.emailPreviewEnabled !== false && window.__gbEmailPreviewScan) __gbEmailPreviewScan();
    if (window.__gbFeatureFlags?.textPreviewEnabled  !== false && window.__gbTextPreviewScan)  __gbTextPreviewScan();
    if (window.__gbFeatureFlags?.imagePreviewEnabled !== false && window.__gbScanForRenderImages) window.__gbScanForRenderImages();
  };

  /* Coalesce mutation bursts. CRM pages mutate the DOM continuously (live
     DataTables, async-loaded rows), and running every scan on each mutation
     is the bulk of this content script's cost on all-day tabs. Schedule one
     run per burst (~200ms trailing) instead of one per mutation. The initial
     on-load scans above still run immediately, so first paint is unaffected. */
  let __gbScanTimer = null;
  const __gbObserver = new MutationObserver(() => {
    if (__gbScanTimer) return;
    __gbScanTimer = setTimeout(() => { __gbScanTimer = null; __gbRunScans(); }, 200);
  });
  __gbObserver.observe(document.body, { childList: true, subtree: true });

  /* Release the observer + pending timer when the page is torn down. */
  window.addEventListener('pagehide', () => {
    __gbObserver.disconnect();
    if (__gbScanTimer) { clearTimeout(__gbScanTimer); __gbScanTimer = null; }
  });

  // ═══════════════════════════════════════════════════════

} // end injection guard
