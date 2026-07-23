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

  // Thread key: a reply chain shares the sender + base subject (Re:/Fwd:
  // stripped), so replies to the same conversation fold into one notification.
  function normSubject(s) {
    return String(s || '').replace(/^(\s*(re|fwd?|fw)\s*:\s*)+/i, '').trim().toLowerCase();
  }
  function threadKey(entry) {
    return `${normEmail(entry.contactEmail)}::${normSubject(entry.subject)}`;
  }

  // Record one inbound reply. Replies in the SAME open thread update that one
  // notification to the latest message (bumping preview/subject/body/view target
  // and a reply count) instead of stacking rows — the rep only needs to respond
  // to the latest in the chain. Idempotent per message id across re-polls.
  async function add(entry) {
    if (!entry || !entry.contactEmail) return null;
    const bag = await read();
    const items = list(bag);
    const messageId = entry.messageId || '';
    if (messageId && items.some((n) => n && Array.isArray(n.messageIds) && n.messageIds.includes(messageId))) return null;
    const now = Date.now();
    const key = threadKey(entry);

    // Fold into an existing OPEN notification for the same thread.
    const idx = items.findIndex((n) => n && n.status === 'open' && n.threadKey === key);
    if (idx >= 0) {
      const prev = items[idx];
      const messageIds = [...(prev.messageIds || []), ...(messageId ? [messageId] : [])];
      const updated = {
        ...prev,
        contactName: entry.contactName || prev.contactName,
        subject: entry.subject || prev.subject,
        preview: entry.preview || prev.preview,
        body: entry.body || prev.body,
        messageId: messageId || prev.messageId,
        viewUrl: entry.viewUrl || prev.viewUrl,
        receivedAt: entry.receivedAt || prev.receivedAt,
        messageIds,
        count: messageIds.length,
        updatedAt: now,
      };
      const next = [updated, ...items.slice(0, idx), ...items.slice(idx + 1)].slice(0, MAX);
      await write(next);
      await paintBadge(next, bag.featureFlags);
      return updated;
    }

    const record = {
      id: `n_${now}_${Math.floor((now % 100000))}`,
      type: 'email',
      status: 'open',
      threadKey: key,
      contactEmail: normEmail(entry.contactEmail),
      contactName: entry.contactName || '',
      subject: entry.subject || '',
      preview: entry.preview || '',
      body: entry.body || '',
      messageId,
      messageIds: messageId ? [messageId] : [],
      count: 1,
      viewUrl: entry.viewUrl || '',
      receivedAt: entry.receivedAt || new Date(now).toISOString(),
      createdAt: now,
      updatedAt: now,
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
