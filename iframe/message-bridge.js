// Authenticated iframe → top-frame bridge. Page JavaScript cannot call
// chrome.runtime, so routing through the service worker avoids the spoofable
// window.postMessage channel previously used for calendar and employee data.
(function installIframeMessageBridge(root) {
  'use strict';
  const ACTIONS = new Set([
    'GB_SALES_REP_FOUND', 'GB_EMPLOYEE_ID', 'GB_EMPLOYEE_IDENTITY',
    'GB_NOTIFY', 'GB_OPEN_CALENDAR',
    'GB_PUSH_DATES_AND_NOTE', 'GB_CALENDAR_STEP', 'GB_CALENDAR_DONE',
    'GB_CALENDAR_ERROR', 'GB_AUTO_PUSH_STEP', 'GB_DATES_PUSHED',
    'GB_AUTO_PUSH_ERROR', 'GB_QUICK_NOTE_DONE', 'GB_QUICK_NOTE_ERROR',
  ]);

  function post(action, payload = {}) {
    if (!ACTIONS.has(action) || !payload || typeof payload !== 'object') return;
    try {
      chrome.runtime.sendMessage({ action: 'broadcastToFrames', payload: { action, ...payload } });
    } catch { /* extension context was unloaded */ }
  }

  root.__gbIframeBridge = Object.freeze({ post });
})(window);
