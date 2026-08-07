/* ───────────────────────────────────────────────────────────────
   recent-orders-sweep.entry.js — the CRM-page half of the
   recent-orders tracker.

   The background worker owns the clock and the storage; it cannot
   own this one request. The CRM search index is cookie-
   authenticated and a worker fetch is cross-site, so it carries no
   session, and the signed-in employee id whose contacts we ask
   about is only readable where the CRM toolbar is. So the worker
   asks, and a CRM page answers — with exactly the contact rows the
   "Scan for recent orders" quick action puts on screen.

   build.js produces react-dist/vanilla/recent-orders-sweep.js from
   this file; the manifest loads it on api.golfballs.com pages only,
   which are same-origin with the index.

   It answers ONE message, only from our own worker. No URL and no
   query cross this boundary — the page can be asked to run this
   search and nothing else.

   IT ALSO NARRATES. Half of this tracker runs here and half runs in
   a worker nobody has open, so a sweep that comes back empty could
   have failed in either — this half logs what it asked the index
   and what came back, in THIS tab's console, while the worker logs
   what it did with the answer in its own.
─────────────────────────────────────────────────────────────── */

import { crmSolrQuery } from '../lib/crmSolrSearch.js';
import { buildRecentOrdersFq, recentOrdersSinceDay } from '../lib/recentOrdersScan.js';
import { resolveCurrentUserContext } from '../lib/employeeIdentity.js';
import '../../lib/tracker-registry.js';
import '../../lib/tracker-definitions.js';

const MESSAGE = 'gbRecentOrdersSweep';
const ROWS = 100;
/* Five pages — 500 contacts, newest order first — is the most one sweep asks
   for, against a table that retains 300 rows. It is NOT a claim that a book
   fits in it: a rep with a few thousand indexed contacts can put more than 500
   into a week-wide first-run window, and at that size every sweep truncates.
   What makes that safe is the worker's cursor rule, not this number: a
   truncated sweep still stores what it read, and the cursor moves only to the
   oldest row it banked, so the next sweep resumes at the floor of what this one
   actually drained rather than re-reading the same 500 forever. */
const MAX_PAGES = 5;

/* The same Developer Setting the worker half reads (Settings → Developer
   Settings → "Trackers: log every sweep"), so one switch narrates both halves.
   Read per sweep rather than cached: a rep who turns it on to watch the next
   sweep should not have to reload the tab first. A command typed into this
   console (below) is loud whatever the setting says. */
const PREFIX = '[gb:trackers/page]';
const DEBUG_SETTING = 'trackers.debugLog';
let loud = false;

const loggingOn = () => new Promise((resolve) => {
  if (loud) { resolve(true); return; }
  try {
    chrome.storage.local.get('devSettings', (bag) => {
      resolve(bag?.devSettings?.[DEBUG_SETTING] === true);
    });
  } catch { resolve(false); }
});

let logging = false;
// eslint-disable-next-line no-console
const note = (...args) => { if (logging) { try { console.log(PREFIX, ...args); } catch { /* */ } } }; // SECURITY-AUDITED-DEV-SETTING-CONSOLE
// eslint-disable-next-line no-console
const warn = (...args) => { if (logging) { try { console.warn(PREFIX, ...args); } catch { /* */ } } }; // SECURITY-AUDITED-DEV-SETTING-CONSOLE

/**
 * Run the rep's recent-orders search and return the contact rows.
 *
 * `complete` is the field the worker's cursor turns on: true means this window
 * was drained, so the cursor may step to now. Truncating at MAX_PAGES leaves
 * the OLDER end of the window unread (the sort is newest-first) — the worker
 * then advances only as far as the oldest row it banked, the floor of what this
 * read did drain.
 */
async function sweep({ since, now = Date.now() }) {
  logging = await loggingOn();
  note('asked for a recent-orders sweep', since ? `since ${new Date(since).toISOString()}` : '(first run)');
  // The audience is the signed-in rep's own contacts, keyed by the employee ID
  // the CRM's own authenticated toolbar carries — exactly as in the quick
  // action. Without one we do not guess: no id means no audience, not everyone.
  const currentUser = await resolveCurrentUserContext();
  if (!currentUser.employeeId) {
    warn('no CRM-verified employee id on this page yet — the toolbar has not identified you');
    throw new Error('no CRM-verified employee id on this page yet');
  }

  const sinceDay = recentOrdersSinceDay(since, now);
  const solrFq = buildRecentOrdersFq(currentUser.employeeId, sinceDay);
  note(`searching as employee ${currentUser.employeeId} (${currentUser.source || 'unknown source'}), fq: ${solrFq}`);

  const docs = [];
  let numFound = 0;
  let pages = 0;
  let start = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Same transport and sort the modal uses; `type` stays 'all' because the
    // Contact clause is already part of the audience.
    const result = await crmSolrQuery({
      query: '', type: 'all', solrFq, start, rows: ROWS,
      sortKey: 'lastOrderDate_dt', sortDir: 'desc',
    });
    pages += 1;
    numFound = result.numFound;
    docs.push(...result.docs);
    note(`page ${pages}: ${result.docs.length} row(s), ${docs.length}/${numFound} of the window`);
    // Advance by what Solr actually returned; a gateway may cap `rows`.
    start = result.nextStart;
    if (!result.docs.length || docs.length >= result.numFound) break;
  }
  const complete = docs.length >= numFound;
  if (!complete) {
    warn(`stopped at the ${MAX_PAGES}-page ceiling with ${docs.length} of ${numFound} rows — the worker moves its cursor only as far back as the oldest row here, so the older tail of this window goes unread`);
  }
  return { docs, numFound, pages, complete, sinceDay };
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
      .then((result) => {
        note(`answering with ${result.docs.length} contact row(s)`);
        sendResponse({ ok: true, ...result });
      })
      .catch((error) => {
        warn('sweep failed:', error?.message || error);
        sendResponse({ ok: false, error: String(error?.message || error) });
      });
    return true;
  });
} catch { /* no extension messaging here — nothing to answer */ }

/* ── the page console command ──────────────────────────────────────
   Runs in this content script's ISOLATED world, so page code cannot reach it
   (the same boundary tracker-net-hook.js is kept on the other side of). To use
   it, open DevTools on a CRM tab and switch the console's context dropdown
   from "top" to "Golfballs.com Sales Toolkit".

     gbOrderTracking.search()  — run the search this page would answer with,
                                 and show how every row maps. Reads only; the
                                 worker's table and cursor are untouched.
     gbOrderTracking.sweep()   — make the worker run the real thing NOW,
                                 cadence ignored, and store what comes back.
     gbOrderTracking.status()  — the worker's gates, cursors and counts.

   `search()` is the one that separates the two halves: if it returns rows and
   the table is still empty, the problem is in the worker, not the CRM.

   All three are loud whether or not the Developer Setting is on — somebody
   typed them, which is a clearer request for output than a stored flag. */
const ask = (action, extra = {}) => new Promise((resolve) => {
  try {
    chrome.runtime.sendMessage({ action, ...extra }, (response) => {
      const failed = chrome.runtime.lastError;
      resolve(failed ? { ok: false, error: failed.message } : response);
    });
  } catch (error) { resolve({ ok: false, error: String(error?.message || error) }); }
});

try {
  window.gbOrderTracking = {
    /** The search alone, with each row's fate spelled out. */
    async search({ since = null, now = Date.now() } = {}) {
      loud = true;
      const result = await sweep({ since, now });
      const definitions = globalThis.GBTrackerDefinitions;
      const rows = result.docs.map((doc) => {
        const read = definitions.readContactDoc(doc, { now });
        return read.row
          ? { id: doc.id, order: read.row.externalId, title: read.row.title, kept: true }
          : { id: doc.id, kept: false, skipped: read.skip };
      });
      const kept = rows.filter((row) => row.kept).length;
      note(`${rows.length} row(s) read → ${kept} order(s) the worker would store`);
      note(rows);
      return { ...result, rows };
    },
    /** The real sweep, in the worker, right now. */
    sweep: () => {
      loud = true;
      logging = true;
      return ask('gbTrackerSweep', { force: true }).then((response) => {
        note('worker sweep:', response);
        note('the storing half logs in the worker console — chrome://extensions → Inspect views: service worker');
        return response;
      });
    },
    status: () => {
      loud = true;
      logging = true;
      return ask('gbTrackerStatus').then((response) => {
        note('worker status:', response?.status || response);
        return response?.status || response;
      });
    },
  };
} catch { /* no window here — the listener above is the only thing that matters */ }
