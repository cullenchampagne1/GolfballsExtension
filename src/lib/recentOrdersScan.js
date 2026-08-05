/** Storage + audience contract for the CRM "Scan for recent orders" action. */
import { normalizeEmployeeName } from './employeeIdentity.js';

export const SCAN_LAST_RUN_KEY = 'gbScanRecentOrders_lastRun';

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
