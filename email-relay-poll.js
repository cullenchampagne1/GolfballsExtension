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

  function sendToTabs(tabs, payload) {
    for (const tab of tabs) {
      if (!tab || tab.id == null) continue;
      try { chrome.tabs.sendMessage(tab.id, payload).catch(() => {}); }
      catch { /* tab navigated away — ignore */ }
    }
  }

  // A simple pill (used for the overflow summary only).
  function pillToTabs(tabs, message) {
    sendToTabs(tabs, { action: 'GB_NOTIFY', message, type: 'info', duration: 6000 });
  }

  // ── Contact resolution ──────────────────────────────────────────────────────
  // Resolve the sender's email to a CRM contact so the toast's View button can
  // jump straight to the contact page. Index-first (fast, when the worker CRM
  // index can answer by email — currently a no-op until it gains searchByEmail),
  // then the authenticated Solr CRM search as the live fallback. Runs in the
  // service worker; the golfballs session cookie rides along via credentials.
  const SOLR_ENDPOINT = 'https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query';
  const SOLR_QF = 'id^100 accountID_s^100 contactName_t^120 accountName_t^120 email_tp^25 emails_tps^25 phones_ss^25';
  const CONTACT_PAGE = 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=';

  function contactIdFromDoc(doc) {
    const id = String((doc && doc.id) || '');
    const m = id.match(/^contact_(.+)$/i);
    const cid = (m && m[1]) || (doc && doc.importContactID_s) || '';
    return String(cid || '').trim();
  }
  function docMatchesEmail(doc, email) {
    const target = String(email || '').toLowerCase();
    const fields = [].concat((doc && doc.emails_tps) || [], (doc && doc.email_tp) || []);
    return fields.some((e) => String(e).toLowerCase() === target);
  }
  function contactUrl(contactId) {
    return contactId ? CONTACT_PAGE + encodeURIComponent(contactId) : '';
  }

  // Fast path: the encrypted worker CRM index. GBCrmIndex.search is name-only
  // today, so this returns null until the index exposes an email lookup — the
  // "use the index when available" hook the rep asked for.
  async function resolveViaIndex(email) {
    const idx = root.GBCrmIndex;
    if (!idx || typeof idx.searchByEmail !== 'function') return null;
    try {
      const hit = await idx.searchByEmail(email);
      const cid = hit && (hit.contactId || contactIdFromDoc(hit));
      return cid ? { contactId: cid, viewUrl: contactUrl(cid) } : null;
    } catch { return null; }
  }

  async function resolveViaSolr(email) {
    const str = `q=${encodeURIComponent(email)}&rows=5&qf=${encodeURIComponent(SOLR_QF)}&q.op=AND&sow=false&defType=edismax`;
    let res;
    try {
      res = await fetch(SOLR_ENDPOINT, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ str }),
      });
    } catch { return null; }               // offline / not logged into golfballs
    if (!res.ok) return null;
    let docs = [];
    try {
      const raw = await res.json();
      const data = JSON.parse(raw.d);      // ASMX wraps the Solr JSON in `d`
      docs = (data && data.response && data.response.docs) || [];
    } catch { return null; }
    const contacts = docs.filter((d) => (d.recordType_s || '').toLowerCase() === 'contact' && contactIdFromDoc(d));
    const pick = contacts.find((d) => docMatchesEmail(d, email)) || contacts[0];
    if (!pick) return null;
    const cid = contactIdFromDoc(pick);
    return cid ? { contactId: cid, viewUrl: contactUrl(cid) } : null;
  }

  async function resolveContact(email) {
    if (!email) return null;
    const viaIndex = await resolveViaIndex(email);
    if (viaIndex) return viaIndex;
    return resolveViaSolr(email);
  }

  // Build the large action-toast payload for one inbound reply.
  function relayNotifyPayload(msg, viewUrl) {
    const who = (msg.contact_name || msg.contact_email || 'A customer').trim();
    const ref = msg.order_ref ? ` · order #${msg.order_ref}` : '';
    const message = (msg.subject && String(msg.subject).trim())
      || (msg.preview && String(msg.preview).trim())
      || 'Opened a new email thread.';
    return {
      action: 'GB_EMAIL_RELAY_NOTIFY',
      tone: 'brand',
      title: `New reply from ${who}${ref}`,
      message,
      viewUrl: viewUrl || '',
    };
  }

  async function fetchPending(since) {
    const auth = root.GBInstallationAuth;
    if (!auth || typeof auth.apiJson !== 'function') return null;
    const q = `${ENDPOINT}?since=${encodeURIComponent(since)}&limit=25`;
    try { return await auth.apiJson(q); }
    catch { return null; }              // backend not deployed yet / offline → stay quiet
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
      for (const msg of shown) {
        // Pre-resolve the contact so View is instant; a miss still notifies.
        let viewUrl = '';
        try { const c = await resolveContact(msg.contact_email); if (c) viewUrl = c.viewUrl; }
        catch { /* resolution is best-effort; notify without a View target */ }
        sendToTabs(tabs, relayNotifyPayload(msg, viewUrl));
      }
      const overflow = res.messages.length - shown.length;
      if (overflow > 0) pillToTabs(tabs, `+${overflow} more new customer ${overflow === 1 ? 'reply' : 'replies'}`);

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
