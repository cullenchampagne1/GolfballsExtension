/** The CRM "recent orders" audience — one definition, two callers.
 *
 * There is no "orders since X" endpoint in this CRM. What there is, is the CRM
 * Search index: a contact's `lastOrderDate_dt` moves when that contact orders.
 * So the only way to pull recent orders is to re-run the CRM search for the
 * signed-in rep's contacts whose last order landed after the previous look, and
 * read the order off each contact that comes back.
 *
 * Both callers run THAT search: the "Scan for recent orders" quick action
 * (src/modals/CRMSearch.jsx), which puts the contacts on screen, and the
 * recent-orders tracker (lib/tracker-definitions.js), which sweeps the same
 * audience in the background. This file is the only place that says what the
 * audience is.
 */
import { normalizeEmployeeName } from './employeeIdentity.js';

export const SCAN_LAST_RUN_KEY = 'gbScanRecentOrders_lastRun';

/** How far back a first look reaches, having no watermark to resume from. */
export const RECENT_ORDERS_LOOKBACK_DAYS = 7;

/** Build the visible Query Builder conditions for the signed-in rep's own
 * contacts. The caller compiles these through the shared Solr compiler, so the
 * query and the removable filter tags cannot drift apart. */
export function buildRecentOrdersConditions(employeeName, sinceDate, id = Date.now()) {
  const name = normalizeEmployeeName(employeeName);
  const date = String(sinceDate || '').trim();
  const parsedDate = Date.parse(`${date}T00:00:00Z`);
  if (!name) throw new Error('A CRM-verified employee name is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(parsedDate)
      || new Date(parsedDate).toISOString().slice(0, 10) !== date) {
    throw new Error('A valid YYYY-MM-DD scan date is required');
  }
  const suffix = String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'current';
  return [
    { id: `scan_type_${suffix}`, fieldKey: 'recordType_s', op: 'is', val: 'Contact' },
    { id: `scan_rep_${suffix}`, fieldKey: 'salesRep_s', op: 'is', val: name },
    { id: `scan_date_${suffix}`, fieldKey: 'lastOrderDate_dt', op: 'after', val: date },
  ];
}

/* Solr quoting as the Query Builder does it — bare unless the value contains a
   space. Restated (not imported) because the background sweep must not pull a
   React module in; the unit test pins this rendering against QueryBuilder's. */
const solrValue = (value) => (String(value).includes(' ') ? `"${value}"` : String(value));

/**
 * The same audience as a ready-made Solr `fq`.
 *
 * For callers with no Query Builder to compile through — the background sweep
 * has no filter bar to render, only a query to run. Built FROM the conditions
 * above so the fields and values have a single source; only the operator
 * rendering is restated, and a unit test holds it equal to `compileToSolr`.
 */
export function buildRecentOrdersFq(employeeName, sinceDate) {
  const [type, rep, date] = buildRecentOrdersConditions(employeeName, sinceDate, 'fq');
  return [
    `${type.fieldKey}:${solrValue(type.val)}`,
    `${rep.fieldKey}:${solrValue(rep.val)}`,
    `${date.fieldKey}:[${date.val}T00:00:00Z TO *]`,
  ].join(' AND ');
}

/**
 * The day a look back starts from: the previous one, or a week ago on a first
 * run.
 *
 * Day granularity matches `lastOrderDate_dt`'s midnight stamps, and resuming
 * from the previous run's DATE (not its time) keeps a one-day overlap, so an
 * order placed later on the day of the last look is never skipped. A watermark
 * from the future — a clock change, a restored profile — is clamped to now
 * rather than silently scanning nothing.
 */
export function recentOrdersSinceDay(lastRunMs, now = Date.now()) {
  const last = Number(lastRunMs);
  const fallback = now - RECENT_ORDERS_LOOKBACK_DAYS * 86_400_000;
  const base = Number.isFinite(last) && last > 0 ? Math.min(last, now) : fallback;
  return new Date(base).toISOString().slice(0, 10);
}
