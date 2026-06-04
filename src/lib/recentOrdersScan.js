/* ───────────────────────────────────────────────────────────────
   recentOrdersScan.js — shared state for the CRM "Scan for recent
   orders" quick action.

   The action stores a single "last run" timestamp; each scan covers
   orders placed since that point (first run = the last 7 days). The
   key lives here so the action (CRMSearch) and the admin reset
   command (installed on the Settings page console) can't drift.
─────────────────────────────────────────────────────────────── */

export const SCAN_LAST_RUN_KEY = 'gbScanRecentOrders_lastRun';

/** Clear the scan clock → the next scan falls back to the last 7 days. */
export function resetScanDate() {
  return new Promise((resolve) => {
    try { chrome.storage.local.remove(SCAN_LAST_RUN_KEY, () => resolve(true)); }
    catch { resolve(false); }
  });
}

/** Read the stored last-run timestamp (or null). */
export function getScanDate() {
  return new Promise((resolve) => {
    try { chrome.storage.local.get(SCAN_LAST_RUN_KEY, (o) => resolve(o?.[SCAN_LAST_RUN_KEY] || null)); }
    catch { resolve(null); }
  });
}

/**
 * Install the admin `__gbScan` console command on `target` (the extension
 * Settings/editor page — a same-world console, unlike a content script).
 *   __gbScan.reset()   — clear the clock (next scan covers the last 7 days)
 *   __gbScan.status()  — show the last scan time
 */
export function installScanConsole(target = (typeof window !== 'undefined' ? window : globalThis)) {
  const TAG = ['%c__gbScan', 'font-weight:bold'];
  const api = {
    reset() {
      resetScanDate().then(() => console.log(...TAG, 'recent-orders scan date reset — next scan covers the last 7 days.'));
      return 'resetting…';
    },
    async status() {
      const ts = await getScanDate();
      console.log(...TAG, ts ? `last scan: ${new Date(ts).toLocaleString()}` : 'never scanned — next scan covers the last 7 days');
      return ts;
    },
    help() {
      console.log(...TAG, '\n  .reset()  — clear the recent-orders scan clock (next scan = last 7 days)\n  .status() — show the last scan time');
    },
  };
  try { Object.defineProperty(target, '__gbScan', { value: api, configurable: true }); }
  catch { target.__gbScan = api; }
}
