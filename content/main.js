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
  
  window.addEventListener('message', (event) => {
    const { action, message, type, duration, data } = event.data || {};

    if (action === 'GB_NOTIFY') {
      showGbNotification(message, type, duration);
    }

    if (action === 'GB_OPEN_CALENDAR') {
      if (window.__gbFeatureFlags?.calendarEnabled !== false) openFullScreenCalendar(data);
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

// ── chrome.runtime messages from popup / background ─────────────────────────
  // MESSAGE LISTENER
  // ═══════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

    if (msg.action === 'getEmployeeId') {
      sendResponse({ employeeId: window.__gbEmployeeId || null });
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
      // Show or hide the copy button immediately without a reload
      if ('copyIdsEnabled' in msg.flags) {
        const btn = document.getElementById('__gb-copy-ids-btn');
        if (msg.flags.copyIdsEnabled) {
          if (!btn) __gbAddCopyIdsButton();
        } else {
          btn?.remove();
        }
      }
      // Enable/disable email/text preview
      if ('emailPreviewEnabled' in msg.flags) {
        if (msg.flags.emailPreviewEnabled) {
            if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
            if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
        }
      }
      if ('imagePreviewEnabled' in msg.flags) {
        if (msg.flags.imagePreviewEnabled) {
          __gbScanForRenderImages();
        } else {
          if (typeof __gbHideHoverBtn === 'function') __gbHideHoverBtn();
          document.getElementById('__gb-logo-hover-btn')?.remove();
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

    if (msg.action === 'showMarginCalcModal') {
      if (typeof window.__gbShowMarginCalcModal === 'function') window.__gbShowMarginCalcModal();
      return true;
    }

    if (msg.action === 'showCrmSearchModal') {
      if (typeof window.__gbShowCrmSearchModal === 'function') window.__gbShowCrmSearchModal();
      return true;
    }

    if (msg.action === 'showCrmCreateContactModal') {
      if (typeof window.__gbShowCrmCreateContactModal === 'function') window.__gbShowCrmCreateContactModal();
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
      // Build the lean payload, send to PA, and surface the real result as a page toast.
      // The popup has already closed by the time PA responds, so the content script
      // is the only place we can show feedback.
      chrome.storage.local.get('emailSignature', ({ emailSignature }) => {
        let body = msg.templateHtml || '';
        if (emailSignature) {
          body += '<br><div>' + emailSignature + '</div>';
        }
        const payload = {
          emails: [{
            to:        msg.contactEmail,
            subject:   msg.templateSubject,
            htmlBody:  body,
            replyMode: msg.replyMode,
          }],
        };
        chrome.runtime.sendMessage({ action: 'paAutomate', paUrl: msg.paUrl, payload }, (result) => {
          if (result?.results?.[0]?.status === 'sent') {
            showGbNotification(`Email sent to ${msg.contactEmail}`, 'success', 4000);
          } else {
            const err = result?.results?.[0]?.error || result?.error || 'Unknown error';
            showGbNotification(`Email failed: ${err}`, 'error', 6000);
          }
        });
      });
      sendResponse({ sent: true });
      return true;
    }

    if (msg.action === 'replyWithTemplate') {
      if (typeof window.__gbExecuteReplyWithTemplate !== 'function') {
        sendResponse({ fallbackToMailto: true });
        return true;
      }
      const firstRow = document.querySelector('tr[data-gbep="1"]');
      const link     = firstRow?.querySelector('a[href*="Page=268"][href*="MessageID="]');
      const href     = link?.href || '';
      const idM      = href.match(/MessageID=([^&]+)/i);
      const guidM    = href.match(/MessageGUID=([^&]+)/i);
      window.__gbExecuteReplyWithTemplate(
        idM?.[1]  || '',
        guidM?.[1] || '',
        msg.templateHtml,
        msg.contactEmail,
        msg.templateSubject || ''
      ).then(result => sendResponse(result || {})).catch(() => sendResponse({ fallbackToMailto: true }));
      return true;
    }

    if (msg.action === 'executePresetTask') {
      chrome.storage.local.get('noteTemplates', async ({ noteTemplates }) => {
        const taskTpl = (noteTemplates || []).find(t => t.id === msg.taskId);
        if (!taskTpl) return;

        if (typeof window.ctbHandleTaskClick === 'function') {
          // crm-task-buttons.js is loaded — use the shared logic
          window.ctbHandleTaskClick(taskTpl, msg.contactId, msg.employeeId).catch(() => {});
        } else {
          // Fallback: inline the create-only path (no open task to complete on non-contact pages)
          const base = 'https://api.golfballs.com';
          const go   = url => fetch(base + url, { credentials: 'include' }).then(r => r.json()).catch(() => null);
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
        }
      });
      return true;
    }

    if (msg.action === 'showSubmitProofModal') {
      if (typeof __gbBuildProofModal === 'function') {
        __gbBuildProofModal({
          logoUrl:        '',
          orderId:        msg.orderId        || '',
          customerId:     msg.customerId     || '',
          salesRep:       msg.salesRep       || '',
          itemUrl:        null,
          liveReps:       msg.liveReps       || [],
          liveArtists:    msg.liveArtists    || [],
          existingProofs: msg.existingProofs || [],
        });
      }
      return true;
    }

    if (msg.action === 'devFireNotification') {
      const { type = 'info', msg: message = 'Test notification', dur = 4000 } = msg;
      const handle = showGbNotification(message, type, dur);
      if (type === 'loading' && handle) {
        let pct = 0;
        const tick = setInterval(() => {
          pct += 10;
          handle.setProgress(pct);
          if (pct >= 100) {
            clearInterval(tick);
            handle.update('Loading complete — all good', 'success');
            handle.dismiss(2000);
          }
        }, 350);
      }
      return true;
    }

    if (msg.action === 'devFireModal') {
      if (msg.modal === 'calendar') {
        openFullScreenCalendar({
          orderID: 'TEST-1234', calendarUrl: null,
          defaultApproval: null, defaultCommitment: null, _devMode: true
        });
      }
      if (msg.modal === 'image-viewer') {
        if (typeof __gbDevOpenImageModal === 'function') __gbDevOpenImageModal();
      }
      if (msg.modal === 'proof-modal') {
        if (typeof window.__gbDevOpenProofModal === 'function') window.__gbDevOpenProofModal();
      }
      if (msg.modal === 'email-preview') {
        if (typeof window.__gbOpenEmailPreview === 'function') {
          window.__gbOpenEmailPreview({
            messageId:       'DEV-MSG-001',
            messageGuid:     'dev-guid-0000',
            _devMode:        true,
            _devIsCasePage:  !!msg.isCasePage,
            meta: {
              from:    'orders@golfballs.com',
              to:      'customer@example.com',
              subject: '[DEV] Test Order Confirmation — #TEST-1234',
              date:    new Date().toLocaleString(),
            },
          });
        }
      }
      if (msg.modal === 'text-preview') { // <-- ADDED THIS FOR DEV TESTING
        if (typeof window.__gbOpenTextPreview === 'function') {
            window.__gbOpenTextPreview('DEV-CHAT-001', false, {
                subject: '[DEV] Test Chat Transcript',
                date: new Date().toLocaleString()
            });
        }
      }
      return true;
    }
  });

// ── Initial scans + DOM mutation observer ───────────────────────────────────
  // ── Scan on load + watch for dynamic rows ─────────────

  __gbApplySignifydGlow();

  // Load feature flags then conditionally add the copy button and email preview
  chrome.storage.local.get('featureFlags', (data) => {
    window.__gbFeatureFlags = { copyIdsEnabled: true, emailPreviewEnabled: true, imagePreviewEnabled: true, developerMode: false, calendarEnabled: true, watchListEnabled: true, autoPushEnabled: true, signifydGlowEnabled: true, ...(data.featureFlags || {}) };
    if (window.__gbFeatureFlags.copyIdsEnabled)      __gbAddCopyIdsButton();
    if (window.__gbFeatureFlags.emailPreviewEnabled) {
        if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
        if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
    }
    if (window.__gbFeatureFlags.imagePreviewEnabled !== false) __gbScanForRenderImages();
    if (window.__gbFeatureFlags.signifydGlowEnabled !== false) __gbApplySignifydGlow();
  });

  // ── Global key bindings ─────────────────────────────────────────────────────
  // Ctrl+[configurable] → New CRM Contact (default Q; set in Settings → Keyboard Shortcuts)
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
      const key = (keyboardShortcuts?.crmNewContact || 'q').toLowerCase();
      if (!key || e.key.toLowerCase() !== key) return;
      e.preventDefault();
      if (typeof window.__gbShowCrmCreateContactModal === 'function') {
        window.__gbShowCrmCreateContactModal();
      }
    });
  });

  const __gbObserver = new MutationObserver(() => {
    __gbApplySignifydGlow();
    if (window.__gbFeatureFlags?.copyIdsEnabled      !== false) __gbAddCopyIdsButton();
    if (window.__gbFeatureFlags?.emailPreviewEnabled !== false) {
        if (window.__gbEmailPreviewScan) __gbEmailPreviewScan();
        if (window.__gbTextPreviewScan) __gbTextPreviewScan(); // <-- ADDED THIS
    }
    if (window.__gbFeatureFlags?.imagePreviewEnabled  !== false) __gbScanForRenderImages();
    if (window.__gbFeatureFlags?.signifydGlowEnabled  !== false) __gbApplySignifydGlow();
  });
  __gbObserver.observe(document.body, { childList: true, subtree: true });

  // ═══════════════════════════════════════════════════════

} // end injection guard