/* ───────────────────────────────────────────────────────────────
   workflow/context.js — per-contact context for the stateless engine.

   For each audience contact we fetch the contact's CRM page ONCE,
   parse it, run the page engine for schema (contact / account /
   orders / items), derive the workflow "signals" used by conditions,
   and hand back a `getValue(condition)` resolver in the exact shape
   matchEngine.evalTree expects. Because everything is recomputed from
   the live page every run, the workflow needs no stored per-contact
   position — a follow-up step's gate ("sent E2 and no reply") IS the
   memory.

   Signal coverage (v1):
     • order.* + lifetime spend  — derived from the contact schema
       (stats.orderCount / stats.totalRevenue / stats.lastOrderDate +
       the orders[] / items[] arrays).
     • email/call history (sent.*, received.*, replied, call.daysAgo)
       — best-effort; return null until the activity-log scrapers land
       (null fails the condition safely, per applyOp). Override via the
       `signalScrapers` option without touching the engine.
─────────────────────────────────────────────────────────────── */

import { runEngine, resolvePath, evaluateCode } from '../page-engine/index.js';
import { SIGNAL_BY_ID } from './fields.js';
import { resolveWorkflowRecordIds } from './codeContext.js';

function parseDoc(html) {
  try { return new DOMParser().parseFromString(String(html || ''), 'text/html'); }
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
  if (contact.contactUrl) {
    try {
      const fetched = await dispatch({ action: 'fetchRaw', url: contact.contactUrl });
      if (!fetched) error = 'Background not reachable';
      else if (!fetched.ok || typeof fetched.text !== 'string') error = fetched.error || `Fetch failed (HTTP ${fetched.status || '?'})`;
      else html = fetched.text;
    } catch (e) { error = e?.message || 'fetch threw'; }
  }

  const doc = html ? parseDoc(html) : null;
  const data = doc ? (runEngine(doc)?.data || {}) : {};
  const signals = doc ? deriveSignals(doc, data) : {};

  // Let callers override / extend signal computation (e.g. wire real
  // email-history scrapers) without editing the engine.
  if (doc && typeof signalScrapers === 'function') {
    Object.assign(signals, signalScrapers(doc, data, signals) || {});
  }

  // Suppression flags (from the contact schema stat tiles).
  const stats = (data && data.stats) || {};
  const bounceCode = (stats.lastBounceCode || resolvePath(doc, 'stats.lastBounceCode') || '').toString().trim();
  const mailerRemoved = !!parseInt(stats.mailerRemoved ?? resolvePath(doc, 'stats.mailerRemoved'), 10);

  const recordIds = resolveWorkflowRecordIds(contact, data);
  const contactId = recordIds.contactId;
  const phone = (resolvePath(doc, 'contact.phone') || '').toString().replace(/\D/g, '');
  const first = (contact.imported ? contact.firstName : resolvePath(doc, 'contact.firstName'))
    || resolvePath(doc, 'contact.firstName') || contact.firstName || '';
  const last = (contact.imported ? contact.lastName : resolvePath(doc, 'contact.lastName'))
    || resolvePath(doc, 'contact.lastName') || contact.lastName || '';
  const email = ((contact.imported ? contact.email : resolvePath(doc, 'contact.email'))
    || resolvePath(doc, 'contact.email') || contact.email || '').toString();
  const contactName = `${first} ${last}`.trim() || contact.contactName || contact.name || '';
  const accountId = recordIds.accountId;

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
      if (!doc || !cond.ref) return null;
      try { return await evaluateCode(doc, cond.ref, {}); } catch { return null; }
    }
    // schema (default): page-engine path, possibly array-quantified.
    return doc ? resolvePath(doc, cond.ref) : null;
  }

  return {
    contact, html, doc, data, signals, error,
    contactId, employeeId: rep.employeeId || '', phone, contactName, firstName: first, lastName: last, email, accountId,
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
