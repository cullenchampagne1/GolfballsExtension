/* Background-owned persistence and attribution for automatic email-template
 * subject trackers. This module is storage-API agnostic so the worker and unit
 * tests use the same implementation. */

import {
  buildEmailTemplateTrackerCatalog,
  matchEmailTemplateSubject,
  trackerForTemplate,
} from './emailSubjectTracking.js';

export const EMAIL_TEMPLATE_TRACKERS_KEY = 'gbEmailTemplateTrackers';
export const EMAIL_TEMPLATE_SENDS_KEY = 'gbEmailTemplateSends';
const TEMPLATE_KEY = 'templates';
const MAX_SENDS = 5_000;
const MAX_SEND_AGE_MS = 365 * 86_400_000;
const ORDER_WINDOW_MS = 90 * 86_400_000;

const clean = (value, maximum = 500) => String(value == null ? '' : value)
  .trim().slice(0, maximum);
const lower = (value) => clean(value, 320).toLowerCase();
const records = (value) => (Array.isArray(value) ? value : []);

function defaultStorage() {
  try { return chrome.storage.local; } catch { return null; }
}

function readStorage(storage, keys) {
  return new Promise((resolve) => {
    if (!storage?.get) { resolve({}); return; }
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value || {});
    };
    try {
      const result = storage.get(keys, finish);
      if (result?.then) result.then(finish, () => finish({}));
    } catch { finish({}); }
  });
}

function writeStorage(storage, values) {
  return new Promise((resolve) => {
    if (!storage?.set) { resolve(); return; }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    try {
      const result = storage.set(values, finish);
      if (result?.then) result.then(finish, finish);
    } catch { finish(); }
  });
}

function same(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right); }
  catch { return false; }
}

function safeRegexMatches(tracker, subject) {
  if (!tracker?.canonicalRegex) return false;
  return matchEmailTemplateSubject(subject, { trackers: [tracker] })?.templateId
    === tracker.templateId;
}

function stripTrackingFields(email) {
  const next = { ...(email || {}) };
  for (const key of [
    'templateTrackerId', 'templateTrackingStatus', 'templateSubjectRegex',
    'templateSubjectRegexFlags', 'templateTrackerVersion',
  ]) delete next[key];
  return next;
}

function deliveryWasSuccessful(result) {
  if (!result) return true;
  const status = clean(result.status, 24).toLowerCase();
  return !status || ['sent', 'accepted', 'success', 'succeeded'].includes(status);
}

function actionPayload(action) {
  const raw = action?.payload ?? action;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function replyEmail(notification) {
  const actions = Array.isArray(notification?.actions)
    ? notification.actions : (notification?.action ? [notification.action] : []);
  for (const action of actions) {
    const payload = actionPayload(action);
    if (clean(payload?.command || payload?.type, 80).toLowerCase() === 'open_contact') {
      return lower(payload.target || payload.contact_email || payload.arguments?.contact_email);
    }
  }
  return '';
}

function sendStillTrackable(send, catalog) {
  const tracker = trackerForTemplate(catalog, send?.templateId);
  return tracker?.status === 'ready' && safeRegexMatches(tracker, send?.subject);
}

function cappedSends(value, now) {
  return records(value)
    .filter((row) => row && Number(row.sentAt) >= now - MAX_SEND_AGE_MS)
    .sort((a, b) => Number(b.sentAt) - Number(a.sentAt))
    .slice(0, MAX_SENDS);
}

function sendId(email, sentAt, index) {
  const seed = [email.templateId, lower(email.to), email.subject, sentAt, index].join('|');
  let hash = 0x811c9dc5;
  for (const char of seed) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `email-send:${sentAt}:${(hash >>> 0).toString(36)}`;
}

export function summarizeEmailTemplateSends(sends, catalog) {
  const byTemplate = new Map();
  for (const tracker of catalog?.trackers || []) {
    byTemplate.set(tracker.templateId, {
      templateId: tracker.templateId,
      templateName: tracker.templateName,
      status: tracker.status,
      trackerId: tracker.trackerId,
      conflictsWith: tracker.conflictsWith || [],
      sent: 0,
      responded: 0,
      ordered: 0,
      responseRate: 0,
      orderRate: 0,
    });
  }
  for (const send of records(sends)) {
    if (!byTemplate.has(send?.templateId)) {
      byTemplate.set(send?.templateId, {
        templateId: send?.templateId || '', templateName: send?.templateName || 'Deleted template',
        status: 'deleted', trackerId: null, conflictsWith: [], sent: 0,
        responded: 0, ordered: 0, responseRate: 0, orderRate: 0,
      });
    }
    const row = byTemplate.get(send.templateId);
    row.sent += 1;
    if (send.respondedAt) row.responded += 1;
    if (send.orderedAt) row.ordered += 1;
  }
  for (const row of byTemplate.values()) {
    row.responseRate = row.sent ? row.responded / row.sent : 0;
    row.orderRate = row.sent ? row.ordered / row.sent : 0;
  }
  return [...byTemplate.values()];
}

export function createEmailTemplateTrackingStore(options = {}) {
  const storage = options.storage || defaultStorage();
  const storageEvents = options.storageEvents
    || (() => { try { return chrome.storage.onChanged; } catch { return null; } })();
  const clock = options.now || (() => Date.now());
  let catalogCache = null;
  let installed = false;
  let writeQueue = Promise.resolve();

  async function reconcileTemplates(inputTemplates) {
    let templates = inputTemplates;
    let prior = null;
    if (!Array.isArray(templates)) {
      const bag = await readStorage(storage, [TEMPLATE_KEY, EMAIL_TEMPLATE_TRACKERS_KEY]);
      templates = records(bag[TEMPLATE_KEY]);
      prior = bag[EMAIL_TEMPLATE_TRACKERS_KEY];
    }
    const catalog = buildEmailTemplateTrackerCatalog(templates);
    catalogCache = catalog;
    if (!same(prior, catalog)) await writeStorage(storage, { [EMAIL_TEMPLATE_TRACKERS_KEY]: catalog });
    return catalog;
  }

  async function catalog() {
    if (catalogCache) return catalogCache;
    const bag = await readStorage(storage, [TEMPLATE_KEY, EMAIL_TEMPLATE_TRACKERS_KEY]);
    const current = bag[EMAIL_TEMPLATE_TRACKERS_KEY];
    // Always compile from current templates. It both repairs stale catalogs
    // after a suspended worker and keeps catalog format migrations automatic.
    const next = buildEmailTemplateTrackerCatalog(records(bag[TEMPLATE_KEY]));
    catalogCache = next;
    if (!same(current, next)) await writeStorage(storage, { [EMAIL_TEMPLATE_TRACKERS_KEY]: next });
    return next;
  }

  function install() {
    if (!installed) {
      installed = true;
      try {
        storageEvents?.addListener?.((changes, area) => {
          if (area && area !== 'local') return;
          if (!changes?.[TEMPLATE_KEY]) return;
          catalogCache = null;
          reconcileTemplates(records(changes[TEMPLATE_KEY].newValue)).catch(() => {});
        });
      } catch { /* storage events unavailable */ }
    }
    return reconcileTemplates();
  }

  async function enrichEmails(inputEmails) {
    const current = await catalog();
    return records(inputEmails).map((input) => {
      const email = stripTrackingFields(input);
      const templateId = clean(email.templateId, 200);
      if (!templateId) return email;
      const tracker = trackerForTemplate(current, templateId);
      const matched = tracker?.status === 'ready'
        && matchEmailTemplateSubject(email.subject, current)?.templateId === templateId;
      email.templateId = templateId;
      email.templateName = clean(email.templateName || tracker?.templateName, 200);
      email.templateVariationId = clean(email.templateVariationId || '__original', 200);
      email.contactId = clean(email.contactId || email.trackingContext?.crmContactId || email.trackingContext?.contactId, 120);
      email.accountId = clean(email.accountId || email.trackingContext?.accountId, 120);
      delete email.trackingContext;
      email.templateTrackingStatus = matched ? 'ready' : (tracker?.status || 'unknown');
      email.templateTrackerVersion = current.version;
      if (tracker?.status === 'ready' && !matched) email.templateTrackingStatus = 'subject-mismatch';
      if (matched) {
        email.templateTrackerId = tracker.trackerId;
        // The authoritative full regex lives in the local catalog. Mirror a
        // bounded copy into the delivery record when practical, but never let
        // a template with many variations make an otherwise valid send exceed
        // the worker payload contract.
        if (tracker.regex?.length <= 8_000) email.templateSubjectRegex = tracker.regex;
        email.templateSubjectRegexFlags = tracker.flags;
      }
      return email;
    });
  }

  function mutateSends(mutator) {
    const run = async () => {
      const now = Number(clock()) || Date.now();
      const bag = await readStorage(storage, EMAIL_TEMPLATE_SENDS_KEY);
      const current = cappedSends(bag[EMAIL_TEMPLATE_SENDS_KEY], now);
      const result = await mutator(current, now);
      const next = cappedSends(result?.sends || current, now);
      if (!same(current, next)) await writeStorage(storage, { [EMAIL_TEMPLATE_SENDS_KEY]: next });
      return result?.value;
    };
    writeQueue = writeQueue.then(run, run);
    return writeQueue;
  }

  async function recordDelivery(inputEmails, transport = 'pa', results) {
    const enriched = await enrichEmails(inputEmails);
    return mutateSends((sends, now) => {
      const added = [];
      enriched.forEach((email, index) => {
        if (!email?.templateId || !deliveryWasSuccessful(records(results)[index])) return;
        const row = {
          id: sendId(email, now, index),
          templateId: clean(email.templateId, 200),
          templateName: clean(email.templateName, 200),
          variationId: clean(email.templateVariationId || '__original', 200),
          trackerId: clean(email.templateTrackerId, 260) || null,
          trackingStatus: clean(email.templateTrackingStatus, 40) || 'unknown',
          recipient: lower(email.to),
          contactId: clean(email.contactId, 120),
          accountId: clean(email.accountId, 120),
          subject: clean(email.subject, 998),
          sentAt: now,
          transport: clean(transport, 30) || 'unknown',
          respondedAt: null,
          replyNotificationId: null,
          orderedAt: null,
          orderId: null,
        };
        added.push(row);
      });
      return { sends: [...added, ...sends], value: { added } };
    });
  }

  async function recordReplies(notifications) {
    const currentCatalog = await catalog();
    return mutateSends((sends) => {
      const updatedIds = [];
      const next = [...sends];
      for (const notification of records(notifications)) {
        if (notification?.topic !== 'message.reply.received') continue;
        const tracker = matchEmailTemplateSubject(notification.body, currentCatalog);
        if (!tracker || tracker.status !== 'ready') continue;
        const recipient = replyEmail(notification);
        const repliedAt = Number(notification.createdAt || notification.updatedAt) || Number(clock());
        const index = next.findIndex((send) => (
          send?.templateId === tracker.templateId
          && !send.respondedAt
          && Number(send.sentAt) <= repliedAt
          && (!recipient || lower(send.recipient) === recipient)
          && sendStillTrackable(send, currentCatalog)
        ));
        if (index < 0) continue;
        next[index] = {
          ...next[index],
          respondedAt: repliedAt,
          replyNotificationId: clean(notification.remoteId || notification.id, 120) || null,
        };
        updatedIds.push(next[index].id);
      }
      return { sends: next, value: { updatedIds } };
    });
  }

  async function recordOrders(orderRecords) {
    const currentCatalog = await catalog();
    return mutateSends((sends) => {
      const updatedIds = [];
      const next = [...sends];
      for (const order of records(orderRecords)) {
        const contactId = clean(order?.data?.contactId || order?.contactId, 120);
        const orderedAt = Number(order?.at || Date.parse(order?.data?.orderDate || '')) || 0;
        if (!contactId || !orderedAt) continue;
        const index = next.findIndex((send) => (
          !send.orderedAt
          && clean(send.contactId, 120) === contactId
          && Number(send.sentAt) <= orderedAt
          && orderedAt - Number(send.sentAt) <= ORDER_WINDOW_MS
          && sendStillTrackable(send, currentCatalog)
        ));
        if (index < 0) continue;
        next[index] = {
          ...next[index],
          orderedAt,
          orderId: clean(order.externalId || order.id, 200) || null,
        };
        updatedIds.push(next[index].id);
      }
      return { sends: next, value: { updatedIds } };
    });
  }

  async function summaries() {
    const [currentCatalog, bag] = await Promise.all([
      catalog(), readStorage(storage, EMAIL_TEMPLATE_SENDS_KEY),
    ]);
    return summarizeEmailTemplateSends(bag[EMAIL_TEMPLATE_SENDS_KEY], currentCatalog);
  }

  async function listSends() {
    const bag = await readStorage(storage, EMAIL_TEMPLATE_SENDS_KEY);
    return cappedSends(bag[EMAIL_TEMPLATE_SENDS_KEY], Number(clock()) || Date.now());
  }

  return Object.freeze({
    install,
    catalog,
    reconcileTemplates,
    enrichEmails,
    recordDelivery,
    recordReplies,
    recordOrders,
    summaries,
    listSends,
  });
}
