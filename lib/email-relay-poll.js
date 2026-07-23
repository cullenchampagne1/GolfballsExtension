/** Email Relay notification poll.
 *
 * When the `emailRelay.notifications` dev setting is ON, this polls the RevStack
 * backend for new inbound customer emails and raises an in-page toast on open
 * golfballs.com tabs so the rep sees "a customer just replied" without watching
 * a second inbox. It mirrors remote-settings-policy.js: a chrome.alarms loop
 * that authenticates through GBInstallationAuth (the installation's Bearer key)
 * against the project-owned extension client endpoint.
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
  const ENDPOINT = '/projects/golfballs-extension/client/email-relay/pending';
  const POLL_MINUTES = 1;          // alarm cadence — a keepalive/respawn safety net
  const LOOP_SECONDS = 6;          // client-side gap between immediate polls
  const MAX_TOASTS = 5;            // cap per tick; summarize the overflow
  const GOLFBALLS_TABS = ['https://www.golfballs.com/*', 'https://api.golfballs.com/*'];
  let polling = false;
  let looping = false;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getStorage = (keys) => new Promise((resolve) =>
    chrome.storage.local.get(keys, (v) => resolve(v || {})));
  const setStorage = (v) => new Promise((resolve) =>
    chrome.storage.local.set(v, () => resolve()));

  async function flagOn() {
    const { [DEV_KEY]: dev } = await getStorage(DEV_KEY);
    return !!(dev && dev[FLAG]);
  }

  // The single golfballs tab the rep is actually looking at (active tab of the
  // last-focused window), or null if that tab isn't a golfballs page. Transient
  // toasts target only this tab so a reply isn't announced on every open CRM tab
  // — which forced the rep to dismiss the same toast page by page. The badge and
  // notifications modal still reflect the reply everywhere.
  function activeGolfballsTab() {
    return new Promise((resolve) => {
      try { chrome.tabs.query({ active: true, lastFocusedWindow: true, url: GOLFBALLS_TABS }, (tabs) => resolve((tabs || [])[0] || null)); }
      catch { resolve(null); }
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
  // jump straight to the contact page. Index-FIRST: GBCrmIndex.searchByEmail
  // decrypts the local CRM index in the worker (no network, no cookies) — the
  // fast, reliable path the rep asked for. Solr is only a best-effort fallback
  // when the contact isn't indexed; a background cross-site fetch may not carry
  // the golfballs session, so the index is the path that actually resolves.
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

  // Fast path: the encrypted worker CRM index resolves email→contact locally
  // (GBCrmIndex.searchByEmail). Returns null when the index is empty or the
  // contact isn't indexed, so the Solr fallback can try.
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

  async function fetchPending(since, waitSeconds) {
    const auth = root.GBInstallationAuth;
    if (!auth || typeof auth.apiJson !== 'function') return null;
    let q = `${ENDPOINT}?since=${encodeURIComponent(since)}&limit=25`;
    if (waitSeconds) q += `&wait=${encodeURIComponent(waitSeconds)}`;
    try { return await auth.apiJson(q); }
    catch { return null; }              // backend not deployed yet / offline → stay quiet
  }

  /* First enable: record the latest cursor WITHOUT notifying, so only mail that
     arrives after the rep turns the feature on is announced. */
  async function prime() {
    const res = await fetchPending(0, 0);
    if (res && typeof res.cursor !== 'undefined') {
      await setStorage({ [CURSOR_KEY]: res.cursor });
    }
  }

  // Record + notify for one pending result. Returns true when the fetch
  // succeeded (empty or not), false on error/offline so the caller stops looping.
  async function processResult(res) {
    if (!res) return false;
    if (!Array.isArray(res.messages) || res.messages.length === 0) return true;

    const activeTab = await activeGolfballsTab();
    const toastTabs = activeTab ? [activeTab] : [];
    let toasts = 0;
    for (const msg of res.messages) {
      // Pre-resolve the contact so View is instant; a miss still records.
      let viewUrl = '';
      try { const c = await resolveContact(msg.contact_email); if (c) viewUrl = c.viewUrl; }
      catch { /* resolution is best-effort */ }
      // Persist to the notifications store (badge + modal), idempotent by
      // message id, whether or not a tab is open.
      try {
        if (root.GBNotifications) await root.GBNotifications.add({
          contactEmail: msg.contact_email, contactName: msg.contact_name,
          subject: msg.subject, preview: msg.preview, body: msg.body,
          messageId: msg.message_id, viewUrl, receivedAt: msg.received_at,
        });
      } catch { /* store write is best-effort */ }
      // Transient toast — only on the tab the rep is looking at, within the cap.
      if (toastTabs.length && toasts < MAX_TOASTS) { sendToTabs(toastTabs, relayNotifyPayload(msg, viewUrl)); toasts += 1; }
    }
    if (toastTabs.length) {
      const overflow = res.messages.length - toasts;
      if (overflow > 0) pillToTabs(toastTabs, `+${overflow} more new customer ${overflow === 1 ? 'reply' : 'replies'}`);
    }
    // The store owns every reply, so advance the cursor unconditionally.
    if (typeof res.cursor !== 'undefined') await setStorage({ [CURSOR_KEY]: res.cursor });
    return true;
  }

  // One short (non-blocking) catch-up poll — the alarm safety net.
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      if (!(await flagOn())) return;
      const stored = await getStorage(CURSOR_KEY);
      const since = Number(stored[CURSOR_KEY]) || 0;
      await processResult(await fetchPending(since, 0));
    } finally { polling = false; }
  }

  // Client-side poll loop for timely delivery WITHOUT holding a backend
  // connection open: each request returns immediately (wait=0), then the loop
  // waits LOOP_SECONDS on THIS side before polling again. Keeping the wait on the
  // extension — rather than as a server-held long-poll — stops the relay's other
  // endpoints (notably the Power Automate outbound webhook) from queuing behind a
  // held connection through the Cloudflare tunnel. An error/offline result breaks
  // the loop and the 1-minute alarm respawns it. Guarded so only one loop runs.
  async function pollLoop() {
    if (looping) return;
    looping = true;
    try {
      while (await flagOn()) {
        const stored = await getStorage(CURSOR_KEY);
        const since = Number(stored[CURSOR_KEY]) || 0;
        const ok = await processResult(await fetchPending(since, 0));
        if (!ok) break;   // offline / error → let the alarm respawn the loop
        await sleep(LOOP_SECONDS * 1000);
      }
    } finally { looping = false; }
  }

  function ensureLoop() {
    flagOn().then((on) => { if (on && !looping) pollLoop().catch(() => {}); }).catch(() => {});
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
    // Start (or keep) the client-side poll loop whenever enabled.
    if (on) ensureLoop();
  }

  const reconcileQuietly = () => { reconcile().catch(() => {}); };

  chrome.runtime.onInstalled.addListener(reconcileQuietly);
  chrome.runtime.onStartup.addListener(reconcileQuietly);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ALARM_NAME) { ensureLoop(); poll().catch(() => {}); }
  });
  // Re-arm as soon as the rep toggles the flag (no wait for the next alarm).
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[DEV_KEY]) reconcileQuietly();
  });
  reconcileQuietly();

  root.GBEmailRelayPoll = Object.freeze({ ALARM_NAME, CURSOR_KEY, FLAG, poll, reconcile });
})(globalThis);
