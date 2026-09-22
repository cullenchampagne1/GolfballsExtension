import { CRM_PAGES } from './constants.js';

export const SALES_REP_DIRECTORY_URL = `/golfballs/adminnew/Default.aspx?Page=${CRM_PAGES.CONTACT_SEARCH}`;

/** Parse the same active Sales Rep dropdown used by Submit Proof. */
export function parseActiveSalesReps(doc) {
  const select = doc?.getElementById?.('ctl00_DropDownSalesRep')
    || doc?.getElementById?.('ctl00_customSalesReps')
    || doc?.querySelector?.('select[id$="DropDownSalesRep"], select[id$="customSalesReps"]');
  if (!select) return [];
  const seen = new Set();
  return Array.from(select.options || []).flatMap((option) => {
    const id = String(option?.value || '').trim();
    const name = String(option?.textContent || option?.text || '').replace(/\s+/g, ' ').trim();
    if (!/^\d{1,12}$/.test(id) || Number(id) <= 0 || !name || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name }];
  });
}

export async function loadActiveSalesReps({ fetchImpl = globalThis.fetch, parseHtml } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Sales rep lookup is unavailable');
  const response = await fetchImpl(SALES_REP_DIRECTORY_URL, { credentials: 'include' });
  if (!response?.ok) throw new Error(`Sales rep lookup returned HTTP ${response?.status || 'error'}`);
  const html = await response.text();
  const doc = parseHtml
    ? parseHtml(html)
    : new DOMParser().parseFromString(html, 'text/html');
  const reps = parseActiveSalesReps(doc);
  if (!reps.length) throw new Error('Sales rep lookup returned no active reps');
  return reps;
}
