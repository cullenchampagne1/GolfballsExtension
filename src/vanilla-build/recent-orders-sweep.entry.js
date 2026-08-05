/* ───────────────────────────────────────────────────────────────
   recent-orders-sweep.entry.js — the CRM-page half of the
   recent-orders tracker.

   The background worker owns the clock and the storage; it cannot
   own this one request. The CRM search index is cookie-
   authenticated and a worker fetch is cross-site, so it carries no
   session, and the signed-in employee name whose contacts we ask
   about is only authoritative where the CRM toolbar is. So the
   worker asks, and a CRM page answers — with exactly the contact
   rows the "Scan for recent orders" quick action puts on screen.

   build.js produces react-dist/vanilla/recent-orders-sweep.js from
   this file; the manifest loads it on api.golfballs.com pages only,
   which are same-origin with the index.

   It answers ONE message, only from our own worker. No URL and no
   query cross this boundary — the page can be asked to run this
   search and nothing else.
─────────────────────────────────────────────────────────────── */

import { crmSolrQuery } from '../lib/crmSolrSearch.js';
import { buildRecentOrdersFq, recentOrdersSinceDay } from '../lib/recentOrdersScan.js';
import { resolveCurrentUserContext } from '../lib/employeeIdentity.js';

const MESSAGE = 'gbRecentOrdersSweep';
const ROWS = 100;
/* Five pages of contacts is more than a rep's own book turns over between
   sweeps, and the tracker only retains 300 rows. A sweep that hits this ceiling
   still stores what it read; the next one resumes from the same watermark,
   because the worker only advances that after a sweep it received. */
const MAX_PAGES = 5;

/** Run the rep's recent-orders search and return the contact rows. */
async function sweep({ since, now = Date.now() }) {
  // The audience is the signed-in rep's own contacts, so an unverified name is
  // not a detail to fall back on — it is another rep's book. Installation
  // profile names are presentation only and never queried, exactly as in the
  // quick action.
  const currentUser = await resolveCurrentUserContext();
  if (!currentUser.sessionVerified || !currentUser.employeeName) {
    throw new Error('no CRM-verified employee name on this page yet');
  }

  const solrFq = buildRecentOrdersFq(
    currentUser.employeeName,
    recentOrdersSinceDay(since, now),
  );

  const docs = [];
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Same transport and sort the modal uses; `type` stays 'all' because the
    // Contact clause is already part of the audience.
    const result = await crmSolrQuery({
      query: '', type: 'all', solrFq, start, rows: ROWS,
      sortKey: 'lastOrderDate_dt', sortDir: 'desc',
    });
    docs.push(...result.docs);
    // Advance by what Solr actually returned; a gateway may cap `rows`.
    start = result.nextStart;
    if (!result.docs.length || docs.length >= result.numFound) break;
  }
  return docs;
}

try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.action !== MESSAGE) return undefined;
    // Our own worker, not another extension and not a content script speaking
    // for the page: a message from a tab has a `sender.tab`; ours does not.
    if (sender.id !== chrome.runtime.id || sender.tab) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return true;
    }
    sweep(message)
      .then((docs) => sendResponse({ ok: true, docs }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
} catch { /* no extension messaging here — nothing to answer */ }
