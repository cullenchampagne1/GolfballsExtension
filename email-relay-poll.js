/** Email Relay notification poll.
 *
 * When the `emailRelay.notifications` dev setting is ON, this polls the RevStack
 * backend for new inbound customer emails and raises an in-page toast on open
 * golfballs.com tabs so the rep sees "a customer just replied" without watching
 * a second inbox. It mirrors remote-settings-policy.js: a chrome.alarms loop
 * that authenticates through GBInstallationAuth (the installation's Bearer key)
 * against the `/extension/email-relay/pending` forwarder.
 *
 * Design:
 *  - Dormant by default. The alarm is created only while the flag is ON, so a
 *    disabled feature never wakes the service worker.
 *  - Loss-averse cursor: on first enable we PRIME the cursor to the latest
 *    message without notifying (so historical mail isn't announced), then only
 *    genuinely newer messages raise a toast. The cursor advances only after a
 *    toast is actually delivered to a tab — if no golfballs tab is open, the
 *    cursor holds so the reply is announced once one is.
 */
(function installEmailRelayPoll(root) {
  'use strict';

  const ALARM_NAME = 'gbEmailRelayPoll';
  const CURSOR_KEY = 'gbEmailRelayCursor';
  const DEV_KEY = 'devSettings';
  const FLAG = 'emailRelay.notifications';
  const ENDPOINT = '/extension/email-relay/pending';
  const POLL_MINUTES = 1;          // chrome.alarms floor for a packed extension
  const MAX_TOASTS = 5;            // cap per tick; summarize the overflow
  const GOLFBALLS_TABS = ['https://www.golfballs.com/*', 'https://api.golfballs.com/*'];
  let polling = false;

  const getStorage = (keys) => new Promise((resolve) =>
    chrome.storage.local.get(keys, (v) => resolve(v || {})));
  const setStorage = (v) => new Promise((resolve) =>
    chrome.storage.local.set(v, () => resolve()));

  async function flagOn() {
    const { [DEV_KEY]: dev } = await getStorage(DEV_KEY);
    return !!(dev && dev[FLAG]);
  }

  function queryTabs() {
    return new Promise((resolve) => {
      try { chrome.tabs.query({ url: GOLFBALLS_TABS }, (tabs) => resolve(tabs || [])); }
      catch { resolve([]); }
    });
  }

  function notifyTabs(tabs, message, type = 'info', duration = 7000) {
    for (const tab of tabs) {
      if (!tab || tab.id == null) continue;
      try { chrome.tabs.sendMessage(tab.id, { action: 'GB_NOTIFY', message, type, duration }).catch(() => {}); }
      catch { /* tab navigated away — ignore */ }
    }
  }

  async function fetchPending(since) {
    const auth = root.GBInstallationAuth;
    if (!auth || typeof auth.apiJson !== 'function') return null;
    const q = `${ENDPOINT}?since=${encodeURIComponent(since)}&limit=25`;
    try { return await auth.apiJson(q); }
    catch { return null; }              // backend not deployed yet / offline → stay quiet
  }

  function describe(msg) {
    const who = (msg.contact_name || msg.contact_email || 'A customer').trim();
    const ref = msg.order_ref ? ` · order #${msg.order_ref}` : '';
    return `New reply from ${who}${ref}`;
  }

  /* First enable: record the latest cursor WITHOUT notifying, so only mail that
     arrives after the rep turns the feature on is announced. */
  async function prime() {
    const res = await fetchPending(0);
    if (res && typeof res.cursor !== 'undefined') {
      await setStorage({ [CURSOR_KEY]: res.cursor });
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    try {
      if (!(await flagOn())) return;
      const stored = await getStorage(CURSOR_KEY);
      const since = Number(stored[CURSOR_KEY]) || 0;
      const res = await fetchPending(since);
      if (!res || !Array.isArray(res.messages) || res.messages.length === 0) return;

      const tabs = await queryTabs();
      // No golfballs tab open → hold the cursor and retry next tick so the
      // reply isn't silently consumed with nowhere to show it.
      if (!tabs.length) return;

      const shown = res.messages.slice(0, MAX_TOASTS);
      for (const msg of shown) notifyTabs(tabs, describe(msg), 'info');
      const overflow = res.messages.length - shown.length;
      if (overflow > 0) notifyTabs(tabs, `+${overflow} more new customer ${overflow === 1 ? 'reply' : 'replies'}`, 'info');

      if (typeof res.cursor !== 'undefined') await setStorage({ [CURSOR_KEY]: res.cursor });
    } finally {
      polling = false;
    }
  }

  /* Create the alarm only while enabled; clear it when disabled. On a fresh
     enable, prime the cursor first so historical mail is not announced. */
  async function reconcile() {
    const on = await flagOn();
    const existing = await new Promise((resolve) => {
      try { chrome.alarms.get(ALARM_NAME, (a) => resolve(a || null)); }
      catch { resolve(null); }
    });
    if (on && !existing) {
      const stored = await getStorage(CURSOR_KEY);
      if (typeof stored[CURSOR_KEY] === 'undefined') await prime();
      chrome.alarms.create(ALARM_NAME, { delayInMinutes: POLL_MINUTES, periodInMinutes: POLL_MINUTES });
    } else if (!on && existing) {
      try { chrome.alarms.clear(ALARM_NAME); } catch { /* ignore */ }
    }
  }

  const reconcileQuietly = () => { reconcile().catch(() => {}); };

  chrome.runtime.onInstalled.addListener(reconcileQuietly);
  chrome.runtime.onStartup.addListener(reconcileQuietly);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ALARM_NAME) poll().catch(() => {});
  });
  // Re-arm as soon as the rep toggles the flag (no wait for the next alarm).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DEV_KEY]) reconcileQuietly();
  });
  reconcileQuietly();

  root.GBEmailRelayPoll = Object.freeze({ ALARM_NAME, CURSOR_KEY, FLAG, poll, reconcile });
})(globalThis);
