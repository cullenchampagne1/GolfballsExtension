/** Notifications store — the worker-side source of truth for tracked
 * customer-email notifications and the toolbar-icon badge.
 *
 * Kept in chrome.storage.local under `gbNotifications` as a newest-first list.
 * The background email-relay poll appends here on delivery; the paAutomate send
 * hook flips a contact's open notifications to done; the Notifications modal
 * (content script) reads/edits the same key directly. The icon badge always
 * reflects the number of OPEN notifications (gated on the notificationsEnabled
 * feature flag). Raw worker script (importScripts) — no ESM.
 */
(function installNotificationsStore(root) {
  'use strict';

  const STORAGE_KEY = 'gbNotifications';
  const MAX = 200;                 // cap the retained list
  const BADGE_BG = '#D64545';
  const BADGE_FG = '#FFFFFF';

  const read = () => new Promise((resolve) => {
    try { chrome.storage.local.get([STORAGE_KEY, 'featureFlags'], (d) => resolve(d || {})); }
    catch { resolve({}); }
  });
  const write = (list) => new Promise((resolve) => {
    try { chrome.storage.local.set({ [STORAGE_KEY]: list }, () => resolve()); }
    catch { resolve(); }
  });

  const normEmail = (value) => String(value || '').trim().toLowerCase();
  const list = (bag) => (Array.isArray(bag && bag[STORAGE_KEY]) ? bag[STORAGE_KEY] : []);
  function openCount(items) {
    return (Array.isArray(items) ? items : []).filter((n) => n && n.status === 'open').length;
  }

  function badgeEnabled(flags) {
    return !flags || flags.notificationsEnabled !== false;
  }

  async function paintBadge(items, flags) {
    let data = items;
    let ff = flags;
    if (data === undefined || ff === undefined) {
      const bag = await read();
      data = list(bag);
      ff = bag.featureFlags;
    }
    const count = badgeEnabled(ff) ? openCount(data) : 0;
    try {
      chrome.action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' });
      if (count > 0) {
        chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
        if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ color: BADGE_FG });
      }
    } catch { /* action API unavailable (e.g. during tests) */ }
  }

  // Append one email notification. Idempotent by messageId so re-polls of the
  // same inbound reply never double-record it.
  async function add(entry) {
    if (!entry || !entry.contactEmail) return null;
    const bag = await read();
    const items = list(bag);
    const messageId = entry.messageId || '';
    if (messageId && items.some((n) => n && n.messageId === messageId)) return null;
    const now = Date.now();
    const record = {
      id: `n_${now}_${Math.floor((now % 100000))}`,
      type: 'email',
      status: 'open',
      contactEmail: normEmail(entry.contactEmail),
      contactName: entry.contactName || '',
      subject: entry.subject || '',
      preview: entry.preview || '',
      body: entry.body || '',
      messageId,
      viewUrl: entry.viewUrl || '',
      receivedAt: entry.receivedAt || new Date(now).toISOString(),
      createdAt: now,
      completedAt: null,
      completedReason: '',
    };
    const next = [record, ...items].slice(0, MAX);
    await write(next);
    await paintBadge(next, bag.featureFlags);
    return record;
  }

  // Auto-complete: flip every OPEN notification for this contact to done. Called
  // from the paAutomate send hook when the rep replies to the customer.
  async function markDoneByEmail(email, reason) {
    const target = normEmail(email);
    if (!target) return 0;
    const bag = await read();
    const items = list(bag);
    let changed = 0;
    const next = items.map((n) => {
      if (n && n.status === 'open' && normEmail(n.contactEmail) === target) {
        changed += 1;
        return { ...n, status: 'done', completedAt: Date.now(), completedReason: reason || 'replied' };
      }
      return n;
    });
    if (!changed) return 0;
    await write(next);
    await paintBadge(next, bag.featureFlags);
    return changed;
  }

  root.GBNotifications = Object.freeze({
    STORAGE_KEY, add, markDoneByEmail, paintBadge, openCount,
  });
})(globalThis);
