/* ───────────────────────────────────────────────────────────────
   workflow/context.js — per-contact context for the stateless engine.

   For each audience contact we either consume an explicitly attached,
   identity-checked Page Engine snapshot or fetch the contact's CRM page
   ONCE and run the same schema (contact / account / orders / items).
   We then derive the workflow "signals" used by conditions and hand back
   a `getValue(condition)` resolver in the exact shape matchEngine.evalTree
   expects. The workflow needs no stored per-contact position — a follow-up
   step's gate ("sent E2 and no reply") IS the memory.

   Signal coverage (v1):
     • order.* + lifetime spend  — derived from the contact schema
       (stats.orderCount / stats.totalRevenue / stats.lastOrderDate +
       the orders[] / items[] arrays).
     • email/call history (sent.*, received.*, replied, call.daysAgo)
       — best-effort; return null until the activity-log scrapers land
       (null fails the condition safely, per applyOp). Override via the
       `signalScrapers` option without touching the engine.
─────────────────────────────────────────────────────────────── */

import {
  runEngine, resolve, evaluateCode, evaluateCodeData,
} from '../page-engine/index.js';
import { resolveEmployeeId, validEmployeeId } from '../employeeIdentity.js';
import { SIGNAL_BY_ID } from './fields.js';
import { resolveWorkflowRecordIds } from './codeContext.js';
import { cachedSnapshotForContact } from '../page-engine/cache-actions.js';

function parseDoc(html, sourceUrl = '') {
  try {
    const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    if (doc.body && sourceUrl) doc.body.dataset.gbSourceUrl = String(sourceUrl);
    return doc;
  }
  catch { return null; }
}

function daysSince(dateVal) {
  if (!dateVal) return null;
  const d = new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

/* Derive workflow signals from the parsed page + page-engine data.
   Order signals come straight off the contact schema; email/call
   history is left null (best-effort) until scrapers are wired. */
function deriveSignals(doc, data) {
  const stats = (data && data.stats) || {};
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const items = Array.isArray(data?.items) ? data.items : [];

  const orderCount = Number.isFinite(stats.orderCount) ? stats.orderCount : orders.length;
  const lastOrderDate = stats.lastOrderDate
    || orders.map((o) => o.date).filter(Boolean).sort().slice(-1)[0]
    || null;
  // One searchable blob of everything the contact has ordered so
  // `order.brand` / `order.keyword` work with `contains`.
  const itemBlob = [
    ...items.map((it) => it.name || ''),
    ...orders.map((o) => o.summary || ''),
  ].join(' · ');

  return {
    'order.count': orderCount,
    'order.totalSpend': Number.isFinite(stats.totalRevenue) ? stats.totalRevenue : null,
    'order.daysSince': daysSince(lastOrderDate),
    'order.brand': itemBlob,
    'order.keyword': itemBlob,
    // Email / call history — NOT SUPPORTED: the contact activity log isn't
    // scraped, so these signals are always null. Workflow conditions that
    // reference them therefore never match (they fail safe, not error).
    'sent.subject': null,
    'sent.daysAgo': null,
    'sent.count': null,
    'received.subject': null,
    'replied': null,
    'call.daysAgo': null,
  };
}

/**
 * Build the per-contact context.
 *
 * @param contact  { contactUrl, contactId?, contactName?, email? }
 * @param deps     { rep:{ employeeId }, emailConfig, signature,
 *                   fromLocalPart, dispatch, dryRun?, signalScrapers? }
 * @returns context object consumed by engine.js + actions.js, including
 *          `getValue(condition)` for matchEngine.evalTree. On a fetch
 *          failure `error` is set and getValue resolves everything to
 *          null (so conditioned steps skip; unconditioned email steps
 *          will then fail at send with "no recipient").
 */
export async function buildContactContext(contact, deps = {}) {
  const { rep = {}, emailConfig, signature = '', fromLocalPart, dispatch, dryRun = false, signalScrapers } = deps;

  let html = '';
  let error = null;
  const cachedSnapshot = cachedSnapshotForContact(contact);
  if (!cachedSnapshot && contact.contactUrl) {
    try {
      const fetched = await dispatch({ action: 'fetchRaw', url: contact.contactUrl });
      if (!fetched) error = 'Background not reachable';
      else if (!fetched.ok || typeof fetched.text !== 'string') error = fetched.error || `Fetch failed (HTTP ${fetched.status || '?'})`;
      else html = fetched.text;
    } catch (e) { error = e?.message || 'fetch threw'; }
  }

  const sourceUrl = cachedSnapshot?.sourceUrl || contact.contactUrl || '';
  // Cached records already are the output of runEngine(). Give sandbox DOM
  // helpers an empty, source-labelled document rather than the surrounding
  // CRM Search page, then feed the stored data into every downstream model.
  const doc = html
    ? parseDoc(html, sourceUrl)
    : (cachedSnapshot ? parseDoc('<!doctype html><html><body></body></html>', sourceUrl) : null);
  const data = cachedSnapshot?.data
    || (doc && html ? (runEngine(doc, { sourceUrl })?.data || {}) : {});
  const signals = Object.keys(data).length ? deriveSignals(doc, data) : {};

  // Let callers override / extend signal computation (e.g. wire real
  // email-history scrapers) without editing the engine.
  if (html && doc && typeof signalScrapers === 'function') {
    Object.assign(signals, signalScrapers(doc, data, signals) || {});
  }

  // Suppression flags (from the contact schema stat tiles).
  const stats = (data && data.stats) || {};
  const dataValue = (path, fallback = '') => resolve(data, path, fallback);
  const bounceCode = (stats.lastBounceCode || dataValue('stats.lastBounceCode') || '').toString().trim();
  const mailerRemoved = !!parseInt(stats.mailerRemoved ?? dataValue('stats.mailerRemoved'), 10);

  const recordIds = resolveWorkflowRecordIds(contact, data);
  const contactId = recordIds.contactId;
  const phone = (dataValue('contact.phone') || '').toString().replace(/\D/g, '');
  const first = (contact.imported ? contact.firstName : dataValue('contact.firstName'))
    || dataValue('contact.firstName') || contact.firstName || '';
  const last = (contact.imported ? contact.lastName : dataValue('contact.lastName'))
    || dataValue('contact.lastName') || contact.lastName || '';
  const email = ((contact.imported ? contact.email : dataValue('contact.email'))
    || dataValue('contact.email') || contact.email || '').toString();
  const contactName = `${first} ${last}`.trim() || contact.contactName || contact.name || '';
  const accountId = recordIds.accountId;
  // A CRM Search launch starts from a page that may not have populated the
  // extension cache. The hydrated contact/account HTML still carries the
  // authenticated toolbar identity, so resolve against that fetched document
  // before falling back to memory/storage.
  const employeeId = validEmployeeId(rep.employeeId)
    || await resolveEmployeeId({ doc: doc || undefined });

  // "Do not contact" flag — set when the phrase appears in the name or email
  // (case-insensitive, flexible whitespace). Reps stash it in those fields.
  const DNC_RE = /do\s*not\s*contact/i;
  const doNotContact = DNC_RE.test(first) || DNC_RE.test(last) || DNC_RE.test(email) || DNC_RE.test(contactName);

  /* The resolver matchEngine.evalTree calls per condition. */
  async function getValue(cond) {
    if (!cond) return null;
    if (cond.source === 'signal') {
      return Object.prototype.hasOwnProperty.call(signals, cond.ref) ? signals[cond.ref] : null;
    }
    if (cond.source === 'var') {
      if (!cond.ref) return null;
      try {
        return cachedSnapshot
          ? await evaluateCodeData(data, cond.ref, {}, { sourceUrl })
          : (doc ? await evaluateCode(doc, cond.ref, {}) : null);
      } catch { return null; }
    }
    // schema (default): page-engine path, possibly array-quantified.
    return cond.ref ? dataValue(cond.ref, null) : null;
  }

  return {
    contact, html, doc, data, signals, error,
    dataSource: cachedSnapshot ? 'page_engine_cache' : (html ? 'live_page' : 'contact_row'),
    contactId, employeeId, phone, contactName, firstName: first, lastName: last, email, accountId,
    bounceCode, mailerRemoved, doNotContact,
    emailConfig, signature, fromLocalPart, dispatch, dryRun,
    getValue,
  };
}

/* Exported for tests / harness: list which signals resolved to a real
   value vs. null on a built context (handy when debugging gates). */
export function describeSignals(ctx) {
  const out = {};
  for (const id of Object.keys(SIGNAL_BY_ID)) out[id] = ctx.signals?.[id] ?? null;
  return out;
}
