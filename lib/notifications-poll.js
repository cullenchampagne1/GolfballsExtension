/** Authenticated per-installation update polling.
 *
 * Typed state events are always applied before the cursor advances. Rows the
 * server marks visible additionally enter the offline notification cache.
 * A short worker-side loop gives responsive delivery; a one-minute alarm
 * restarts it after Chrome suspends the service worker.
 */
(function installNotificationPoll(root) {
  'use strict';

  const ALARM_NAME = 'gbNotificationPoll';
  const CURSOR_KEY = 'gbNotificationCursor';
  const ENDPOINT = '/projects/golfballs-extension/client/notifications';
  const RECEIPTS_ENDPOINT = `${ENDPOINT}/receipts`;
  const POLL_MINUTES = 1;
  const LONG_POLL_SECONDS = 25;
  const FALLBACK_LOOP_SECONDS = 12;
  const MAX_TOASTS = 4;
  const GOLFBALLS_TABS = [
    'https://www.golfballs.com/*',
    'https://api.golfballs.com/*',
  ];
  let polling = false;
  let looping = false;
  let nextLoopDelayMs = FALLBACK_LOOP_SECONDS * 1_000;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getStorage = (keys) => new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (value) => resolve(value || {}));
    } catch { resolve({}); }
  });
  const setStorage = (value) => new Promise((resolve) => {
    try { chrome.storage.local.set(value, () => resolve()); }
    catch { resolve(); }
  });

  async function notificationsEnabled() {
    const bag = await getStorage('featureFlags');
    return bag.featureFlags?.notificationsEnabled !== false;
  }

  function activeGolfballsTab() {
    return new Promise((resolve) => {
      try {
        chrome.tabs.query(
          { active: true, lastFocusedWindow: true, url: GOLFBALLS_TABS },
          (tabs) => resolve((tabs || [])[0] || null),
        );
      } catch { resolve(null); }
    });
  }

  function sendToTab(tab, payload) {
    if (!tab || tab.id == null) return;
    try { chrome.tabs.sendMessage(tab.id, payload).catch(() => {}); }
    catch { /* tab navigated between query and delivery */ }
  }

  const SOLR_ENDPOINT = 'https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query';
  const SOLR_QF = 'id^100 accountID_s^100 contactName_t^120 accountName_t^120 email_tp^25 emails_tps^25 phones_ss^25';
  const CONTACT_PAGE = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=';

  function contactIdFromDoc(doc) {
    const id = String(doc?.id || '');
    const match = id.match(/^contact_(.+)$/i);
    return String(match?.[1] || doc?.importContactID_s || '').trim();
  }

  function contactUrl(contactId) {
    return contactId
      ? `${CONTACT_PAGE}${encodeURIComponent(contactId)}`
      : '';
  }

  async function resolveViaIndex(email) {
    const index = root.GBCrmIndex;
    if (!index || typeof index.searchByEmail !== 'function') return '';
    try {
      const hit = await index.searchByEmail(email);
      return contactUrl(hit?.contactId || contactIdFromDoc(hit));
    } catch { return ''; }
  }

  async function resolveViaSolr(email) {
    const request = `q=${encodeURIComponent(email)}&rows=5&qf=${encodeURIComponent(SOLR_QF)}&q.op=AND&sow=false&defType=edismax`;
    try {
      const response = await fetch(SOLR_ENDPOINT, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ str: request }),
      });
      if (!response.ok) return '';
      const outer = await response.json();
      const docs = JSON.parse(outer.d)?.response?.docs || [];
      const target = String(email || '').toLowerCase();
      const contacts = docs.filter((doc) => (
        String(doc?.recordType_s || '').toLowerCase() === 'contact'
        && contactIdFromDoc(doc)
      ));
      const exact = contacts.find((doc) => (
        [].concat(doc?.emails_tps || [], doc?.email_tp || [])
          .some((value) => String(value).toLowerCase() === target)
      ));
      return contactUrl(contactIdFromDoc(exact || contacts[0]));
    } catch { return ''; }
  }

  async function resolveContact(email) {
    if (!email) return '';
    return (await resolveViaIndex(email)) || resolveViaSolr(email);
  }

  async function sendReceipt(notificationIds, state) {
    const ids = [...new Set(
      (Array.isArray(notificationIds) ? notificationIds : [notificationIds])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    )];
    if (!ids.length) return false;
    const auth = root.GBInstallationAuth;
    if (!auth || typeof auth.apiJson !== 'function') return false;
    try {
      await auth.apiJson(RECEIPTS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ notification_ids: ids, state }),
      });
      return true;
    } catch { return false; }
  }

  async function fetchNext(cursor) {
    const auth = root.GBInstallationAuth;
    if (!auth || typeof auth.apiJson !== 'function') return null;
    const startedAt = Date.now();
    try {
      const payload = await auth.apiJson(
        `${ENDPOINT}?after=${encodeURIComponent(cursor)}&limit=50&wait_seconds=${LONG_POLL_SECONDS}`,
      );
      const heldOpen = Date.now() - startedAt >= 5_000;
      const hasRows = Array.isArray(payload?.notifications) && payload.notifications.length > 0;
      // New servers hold an empty request open, so reconnect immediately and
      // keep delivery live. Against an older server, retain the safe 12-second
      // cadence instead of hammering its shared installation rate limit.
      nextLoopDelayMs = heldOpen || hasRows
        ? 250 : FALLBACK_LOOP_SECONDS * 1_000;
      return payload;
    } catch { return null; }
  }

  async function enrichActions(items) {
    const store = root.GBNotifications;
    if (!store) return items;
    await Promise.all(items.map(async (item) => {
      // The contact action is no longer necessarily the only one — a reply
      // leads with its email — so find it wherever it sits in the list.
      const contact = (Array.isArray(item.actions) ? item.actions : [item.action])
        .map((action) => {
          try { return root.GBActionLanguage.normalize(action); } catch { return null; }
        })
        .find((payload) => payload?.command === 'open_contact');
      if (!contact) return;
      const url = await resolveContact(contact.target);
      if (!url) return;
      item.localActionUrl = url;
      await store.setActionUrl(item.remoteId, url);
    }));
    return items;
  }

  async function processResult(result) {
    if (!result || !Array.isArray(result.notifications)) return false;
    const store = root.GBNotifications;
    // State changes use the same authenticated cursor even when the user has
    // disabled visible notifications. Do not acknowledge a known state event
    // until its authoritative refresh succeeds; the next alarm will request
    // the same row from the retained cursor and retry it.
    try { await root.GBLiveUpdates?.applyAll?.(result.notifications); }
    catch { return false; }
    const visible = result.notifications.filter((item) => item?.visible !== false);
    const showNotifications = await notificationsEnabled();
    const added = showNotifications && typeof store?.mergeRemote === 'function'
      ? await enrichActions(await store.mergeRemote(visible))
      : [];
    /* @admin:start */
    // A bounce notification is also work: the queue keeps it until a CRM page
    // can turn it into a task. Never fatal to delivery — a failure here must
    // not stop the notification itself from reaching the rep.
    try { await root.GBBounceQueue?.capture?.(added); }
    catch { /* the queue owns its own retries */ }
    /* @admin:end */
    // Attribute a reply only when its normalized subject matches a recorded
    // outbound send. Tracking is bookkeeping and must never prevent the
    // notification itself from being delivered.
    try { await root.GBEmailTemplateTracking?.recordReplies?.(added); }
    catch { /* tracker state repairs itself on the next notification */ }
    const ids = result.notifications.map((item) => item?.id);
    await sendReceipt(ids, 'delivered');
    if (Number.isSafeInteger(Number(result.cursor))) {
      await setStorage({ [CURSOR_KEY]: Number(result.cursor) });
    }
    if (!showNotifications || !added.length) return true;
    const tab = await activeGolfballsTab();
    if (!tab) return true;
    for (const item of added.slice(0, MAX_TOASTS)) {
      sendToTab(tab, {
        action: 'GB_EXTENSION_NOTIFICATION',
        notification: item,
      });
    }
    const overflow = added.length - MAX_TOASTS;
    if (overflow > 0) {
      sendToTab(tab, {
        action: 'GB_NOTIFY',
        type: 'info',
        duration: 6_000,
        message: `+${overflow} more new notification${overflow === 1 ? '' : 's'}`,
      });
    }
    return true;
  }

  async function poll() {
    if (polling) return false;
    polling = true;
    try {
      const bag = await getStorage(CURSOR_KEY);
      const cursor = Math.max(0, Number(bag[CURSOR_KEY]) || 0);
      return await processResult(await fetchNext(cursor));
    } finally {
      polling = false;
      /* @admin:start */
      // Queued bounce work is retried on the poll's own clock, so a job that
      // arrived with no CRM tab open lands as soon as one is.
      try { root.GBBounceQueue?.drain?.().catch(() => {}); }
      catch { /* no queue in this build */ }
      /* @admin:end */
    }
  }

  async function pollLoop() {
    if (looping) return;
    looping = true;
    try {
      while (true) {
        const ok = await poll();
        if (!ok) break;
        await sleep(nextLoopDelayMs);
      }
    } finally {
      looping = false;
    }
  }

  function ensureLoop() {
    if (!looping) pollLoop().catch(() => {});
  }

  async function reconcile() {
    const existing = await new Promise((resolve) => {
      try { chrome.alarms.get(ALARM_NAME, (alarm) => resolve(alarm || null)); }
      catch { resolve(null); }
    });
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: POLL_MINUTES,
        periodInMinutes: POLL_MINUTES,
      });
    }
    ensureLoop();
  }

  const reconcileQuietly = () => { reconcile().catch(() => {}); };
  chrome.runtime.onInstalled.addListener(reconcileQuietly);
  chrome.runtime.onStartup.addListener(reconcileQuietly);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === ALARM_NAME) {
      ensureLoop();
    }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.featureFlags) reconcileQuietly();
  });

  root.GBNotificationPoll = Object.freeze({
    ALARM_NAME,
    ENDPOINT,
    RECEIPTS_ENDPOINT,
    poll,
    processResult,
    reconcile,
    resolveContact,
    sendReceipt,
  });
})(globalThis);
