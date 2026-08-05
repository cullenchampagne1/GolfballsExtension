/** Durable bounced-contact work queue owned by the service worker.
 *
 * The relay's bounce notification arrives whenever it arrives — usually with
 * no CRM tab open, and the CRM work it asks for can only be done on one (the
 * search index, the task list, and the signed-in employee all need that
 * session). So the worker keeps the job instead of dropping it, and hands it to
 * a CRM page the moment there is one.
 *
 * Three rules keep this from writing the same task twice, which would put one
 * contact in the Replacement Contacts queue twice:
 *   1. a job is keyed by its notification AND by its address,
 *   2. a settled address goes in a ledger and is not re-queued for 30 days,
 *   3. the page itself checks the CRM for an existing open bounce task before
 *      writing (this side cannot see that, and it is the authority).
 *
 * A wake with no CRM tab is not a failure: nothing is attempted, nothing is
 * counted, and the job waits. Only a tab that answered "I could not" burns an
 * attempt — otherwise three quiet nights would silently drop real work.
 *
 * Raw worker script (importScripts) — no ESM. Admin-only: this file is
 * excluded from the served consumer build.
 */
(function installBounceQueue(root) {
  'use strict';
  if (root.GBBounceQueue) return;

  const QUEUE_KEY = 'gbBounceQueue';
  const LEDGER_KEY = 'gbBounceLedger';
  const MESSAGE = 'gbBounceFlagContact';
  const COMMAND = 'flag_bounced_contact';
  const SETTING_KEY = 'bounce.autoFlag';
  /* The CRM proper is api.golfballs.com: same-origin with the search index and
     the task endpoints. www pages cannot answer this. */
  const CRM_TABS = ['https://api.golfballs.com/*'];
  const MAX_JOBS = 50;
  const MAX_ATTEMPTS = 3;
  const PER_DRAIN = 5;
  const JOB_MAX_AGE_MS = 7 * 86_400_000;
  const LEDGER_MAX_AGE_MS = 30 * 86_400_000;
  const LEDGER_MAX = 500;
  const ASK_TIMEOUT_MS = 30_000;
  const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/;
  const KINDS = ['hard', 'soft', 'unknown'];
  /* Statuses that mean "the CRM has been dealt with": stop asking about this
     address. 'unresolved' is included — the address matches no contact, and
     asking a second CRM page will not make one appear. */
  const SETTLED = ['created', 'existing', 'unresolved'];

  let draining = false;

  const getStorage = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (value) => resolve(value || {})); }
    catch { resolve({}); }
  });
  const setStorage = (value) => new Promise((resolve) => {
    try { chrome.storage.local.set(value, () => resolve()); }
    catch { resolve(); }
  });

  const email = (value) => {
    const address = String(value || '').trim().toLowerCase();
    return address.length <= 320 && EMAIL_RE.test(address) ? address : '';
  };
  const text = (value, maximum) => String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maximum);

  /**
   * Read one merged notification into a bounce job, or null.
   *
   * Only a hard bounce the relay marked `auto` becomes a job. A soft or
   * unclassifiable bounce still reaches the rep as a notification they can act
   * on — the difference between "we know this address is dead" and "we think
   * it might be" is exactly the difference between writing CRM work by
   * ourselves and asking first.
   */
  function jobFromNotification(item, now = Date.now()) {
    let action;
    try { action = root.GBActionLanguage?.normalize?.(item?.action); }
    catch { return null; }
    if (!action || action.command !== COMMAND) return null;
    const address = email(action.target);
    if (!address) return null;
    const options = [...(action.options || [])].map((value) => String(value).toLowerCase());
    if (!options.includes('auto')) return null;
    const kind = KINDS.find((value) => options.includes(value)) || 'unknown';
    if (kind !== 'hard') return null;
    const remoteId = Number(item?.remoteId);
    return {
      remoteId: Number.isSafeInteger(remoteId) && remoteId > 0 ? remoteId : 0,
      email: address,
      code: text(action.value, 40),
      kind,
      note: text(item?.body, 200),
      at: Number(now) || Date.now(),
      attempts: 0,
    };
  }

  function normalizeJob(value) {
    const address = email(value?.email);
    if (!address) return null;
    const remoteId = Number(value?.remoteId);
    return {
      remoteId: Number.isSafeInteger(remoteId) && remoteId > 0 ? remoteId : 0,
      email: address,
      code: text(value?.code, 40),
      kind: KINDS.includes(value?.kind) ? value.kind : 'unknown',
      note: text(value?.note, 200),
      at: Math.max(0, Number(value?.at) || 0),
      attempts: Math.max(0, Math.min(Math.floor(Number(value?.attempts) || 0), MAX_ATTEMPTS)),
    };
  }

  const normalizeJobs = (value) => (Array.isArray(value) ? value : [])
    .map(normalizeJob).filter(Boolean);

  /** Ledger of addresses already settled, pruned to what still matters. */
  function pruneLedger(value, now = Date.now()) {
    const bag = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const rows = Object.entries(bag)
      .map(([key, entry]) => [email(key), {
        at: Math.max(0, Number(entry?.at) || 0),
        status: text(entry?.status, 24) || 'created',
        taskId: text(entry?.taskId, 12),
        contactId: text(entry?.contactId, 12),
      }])
      .filter(([key, entry]) => key && now - entry.at < LEDGER_MAX_AGE_MS)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, LEDGER_MAX);
    return Object.fromEntries(rows);
  }

  const ledgerHas = (ledger, address, now = Date.now()) => {
    const entry = (ledger || {})[email(address)];
    return !!entry && now - (Number(entry.at) || 0) < LEDGER_MAX_AGE_MS;
  };

  /**
   * Add jobs to the queue.
   *
   * Deduped by notification AND by address: the same dead address bouncing off
   * three sent emails is one piece of work, not three.
   */
  function mergeJobs(existing, incoming, { now = Date.now() } = {}) {
    const out = normalizeJobs(existing).filter((job) => now - job.at < JOB_MAX_AGE_MS);
    const seenIds = new Set(out.filter((job) => job.remoteId).map((job) => job.remoteId));
    const seenEmails = new Set(out.map((job) => job.email));
    for (const candidate of normalizeJobs(incoming)) {
      if (candidate.remoteId && seenIds.has(candidate.remoteId)) continue;
      if (seenEmails.has(candidate.email)) continue;
      if (candidate.remoteId) seenIds.add(candidate.remoteId);
      seenEmails.add(candidate.email);
      out.push(candidate);
    }
    // Oldest first: the queue is worked in the order the bounces arrived, and
    // an overflowing queue drops the newest rather than starving the oldest.
    return out.sort((a, b) => a.at - b.at).slice(0, MAX_JOBS);
  }

  async function autoFlagEnabled() {
    const bag = await getStorage('devSettings');
    return bag.devSettings?.[SETTING_KEY] !== false;
  }

  /** Queue the flaggable bounces out of a batch of new notifications. */
  async function capture(items, { now = Date.now() } = {}) {
    const candidates = (Array.isArray(items) ? items : [])
      .map((item) => jobFromNotification(item, now))
      .filter(Boolean);
    if (!candidates.length) return 0;
    if (!(await autoFlagEnabled())) return 0;
    const bag = await getStorage([QUEUE_KEY, LEDGER_KEY]);
    const ledger = pruneLedger(bag[LEDGER_KEY], now);
    const fresh = candidates.filter((job) => !ledgerHas(ledger, job.email, now));
    if (!fresh.length) return 0;
    const before = normalizeJobs(bag[QUEUE_KEY]).length;
    const queue = mergeJobs(bag[QUEUE_KEY], fresh, { now });
    await setStorage({ [QUEUE_KEY]: queue, [LEDGER_KEY]: ledger });
    return Math.max(0, queue.length - before);
  }

  const crmTabs = () => new Promise((resolve) => {
    try { chrome.tabs.query({ url: CRM_TABS }, (tabs) => resolve(tabs || [])); }
    catch { resolve([]); }
  });

  function askTab(tabId, payload) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CRM tab did not answer')), ASK_TIMEOUT_MS);
      const settle = (fn, value) => { clearTimeout(timer); fn(value); };
      try {
        chrome.tabs.sendMessage(tabId, payload, (response) => {
          // A tab mid-navigation has no listener; lastError must be read or
          // Chrome logs it as unchecked.
          const failed = chrome.runtime.lastError;
          if (failed || !response) settle(reject, new Error(failed?.message || 'no answer'));
          else settle(resolve, response);
        });
      } catch (error) { settle(reject, error); }
    });
  }

  /** Ask each open CRM page in turn; a page that cannot answer is not the end
   *  of the road, another tab may be further along. Returns null when no tab
   *  answered at all — which is a missing CRM, not a failed job. */
  async function askCrm(payload) {
    const tabs = await crmTabs();
    let answer = null;
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        const response = await askTab(tab.id, payload);
        if (response?.ok) return response;
        answer = response || answer;
      } catch { /* try the next tab */ }
    }
    return answer;
  }

  function receipt(remoteId) {
    if (!remoteId) return;
    try { root.GBNotificationPoll?.sendReceipt?.([remoteId], 'acted'); }
    catch { /* the poll module owns its own failures */ }
  }

  /**
   * Hand as many queued bounces as a CRM page will take.
   *
   * Bounded per wake so a backlog drains steadily instead of firing every job
   * into the CRM the moment a tab opens.
   */
  async function drain({ now = Date.now() } = {}) {
    if (draining) return { done: 0, failed: 0, pending: 0, reason: 'busy' };
    draining = true;
    try {
      const bag = await getStorage([QUEUE_KEY, LEDGER_KEY]);
      const queue = normalizeJobs(bag[QUEUE_KEY]).filter(
        (job) => now - job.at < JOB_MAX_AGE_MS,
      );
      const ledger = pruneLedger(bag[LEDGER_KEY], now);
      if (!queue.length) {
        // The idle path runs on every poll tick, so it only writes when there
        // was actually something to clean up.
        const staleQueue = (bag[QUEUE_KEY] || []).length !== 0;
        const staleLedger = (
          Object.keys(bag[LEDGER_KEY] || {}).length !== Object.keys(ledger).length
        );
        if (staleQueue || staleLedger) {
          await setStorage({ [QUEUE_KEY]: queue, [LEDGER_KEY]: ledger });
        }
        return { done: 0, failed: 0, pending: 0 };
      }
      if (!(await autoFlagEnabled())) {
        // Turned off while work was queued: the notifications stay actionable
        // by hand, so holding jobs for a switch that may never come back on
        // would just age them out silently.
        await setStorage({ [QUEUE_KEY]: [], [LEDGER_KEY]: ledger });
        return { done: 0, failed: 0, pending: 0, reason: 'disabled' };
      }

      const settled = new Set();
      let done = 0;
      let failed = 0;
      for (const job of queue.slice(0, PER_DRAIN)) {
        if (ledgerHas(ledger, job.email, now)) { settled.add(job); continue; }
        const response = await askCrm({
          action: MESSAGE,
          email: job.email,
          code: job.code,
          kind: job.kind,
          note: job.note,
        });
        if (!response) break;  // no CRM page to work from — keep everything
        if (response.ok && SETTLED.includes(response.status)) {
          ledger[job.email] = {
            at: now,
            status: response.status,
            taskId: text(response.taskId, 12),
            contactId: text(response.contactId, 12),
          };
          settled.add(job);
          done += 1;
          // 'unresolved' is not work the rep can skip: no contact matched, so
          // the notification stays unread for them to look at.
          if (response.status !== 'unresolved') receipt(job.remoteId);
          continue;
        }
        job.attempts += 1;
        failed += 1;
        if (job.attempts >= MAX_ATTEMPTS) {
          ledger[job.email] = { at: now, status: 'failed', taskId: '', contactId: '' };
          settled.add(job);
        }
      }
      const remaining = queue.filter((job) => !settled.has(job));
      await setStorage({
        [QUEUE_KEY]: remaining,
        [LEDGER_KEY]: pruneLedger(ledger, now),
      });
      return { done, failed, pending: remaining.length };
    } finally {
      draining = false;
    }
  }

  const drainQuietly = () => { drain().catch(() => {}); };

  /* A CRM page finishing its load is the event this queue exists for. */
  try {
    chrome.tabs.onUpdated.addListener((_tabId, change, tab) => {
      if (change?.status !== 'complete') return;
      if (!/^https:\/\/api\.golfballs\.com\//i.test(String(tab?.url || ''))) return;
      drainQuietly();
    });
  } catch { /* no tabs API in this context */ }

  root.GBBounceQueue = Object.freeze({
    QUEUE_KEY,
    LEDGER_KEY,
    MESSAGE,
    COMMAND,
    MAX_ATTEMPTS,
    jobFromNotification,
    mergeJobs,
    pruneLedger,
    ledgerHas,
    capture,
    drain,
  });
})(globalThis);
