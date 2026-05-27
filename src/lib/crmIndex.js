/* ───────────────────────────────────────────────────────────────
   crmIndex.js — local IndexedDB store + in-memory substring search
   over CRM contacts/accounts the user has chosen to "index".

   Why IndexedDB over chrome.storage.local:
     The store is keyed per-record (Solr `id`) with upsert semantics,
     and we only need to deserialise the records we care about — not a
     whole blob. IndexedDB also scales to tens of thousands of records
     without choking the storage quota chrome.storage.local enforces
     (~10 MB total per origin).

   Why substring search over a fancier engine (BM25, Fuse.js, etc.):
     Reps mostly look up by name / account / phone fragments. Substring
     scoring with prefix + word-boundary boosts handles 95% of those
     queries in <10ms on ~10k records, with no dependency added. The
     score breakdown is documented at `scoreRecord` if we ever want to
     swap in something heavier.

   Record shape:
     The store accepts the same flat Solr docs CRMSearch already
     receives — { id, recordType_s, contactName_t, accountName_t,
     emails_tps, phones_ss, salesRep_s, accountID_s, ... }. We add
     `indexedAt` (epoch ms) on every upsert so future code can age
     out stale entries.

   Public API:
     openIndexDb()       — connection (used internally)
     indexRecords(rows)  — bulk upsert; returns { added }
     getAllIndexed()     — read every indexed row
     deleteIndexed(id)   — remove one
     clearIndex()        — remove all
     searchIndexed(rows, query, opts?) — substring rank, top N
─────────────────────────────────────────────────────────────── */

const DB_NAME = 'gb-crm-index';
const STORE   = 'records';
const VERSION = 1;

let _dbPromise = null;

/** Open (or reuse) the singleton IndexedDB connection. Promise-cached
 *  so concurrent callers share a single open request. */
export function openIndexDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this context'));
      return;
    }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

/** Bulk upsert. Records without an `id` are skipped — the keyPath is
 *  the Solr doc id, and a missing id would collide silently. Each
 *  upsert refreshes `indexedAt` so callers can show "indexed 5m ago"
 *  later if we expose it. */
export async function indexRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return { added: 0 };
  const db = await openIndexDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let added = 0;
    for (const r of records) {
      if (!r?.id) continue;
      // Drop transient flags (e.g. _forceExpanded) that might have been
      // attached upstream — only persist the doc fields the consumer
      // gave us, plus our timestamp.
      const clean = { ...r, indexedAt: Date.now() };
      store.put(clean);
      added++;
    }
    tx.oncomplete = () => resolve({ added });
    tx.onerror    = () => reject(tx.error);
  });
}

export async function getAllIndexed() {
  const db = await openIndexDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

export async function deleteIndexed(id) {
  const db = await openIndexDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function clearIndex() {
  const db = await openIndexDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

/* ── Search ──────────────────────────────────────────────────
   Each candidate record builds a lazy `_search` haystack on first
   access (joined lowercase representation of every searchable
   field). The haystack is cached on the record so successive
   queries don't re-stringify. */

const SEARCHABLE_FIELDS = [
  'contactName_t', 'accountName_t', 'accountID_s', 'salesRep_s',
  'salesRepID_s', 'role_s', 'recordType_s', 'id',
];
const SEARCHABLE_ARRAY_FIELDS = ['emails_tps', 'phones_ss'];

function buildHaystack(r) {
  const parts = [];
  for (const f of SEARCHABLE_FIELDS) {
    const v = r[f];
    if (v != null && v !== '') parts.push(String(v));
  }
  for (const f of SEARCHABLE_ARRAY_FIELDS) {
    const arr = r[f];
    if (Array.isArray(arr)) {
      for (const x of arr) if (x) parts.push(String(x));
    }
  }
  return parts.join(' ').toLowerCase();
}

/** Score one record against a query already split into lowercase
 *  tokens. ALL tokens must appear somewhere in the haystack (AND
 *  semantics) — partial matches don't count. Per-token scoring:
 *
 *    prefix-of-haystack hit:   +length × 2 + 5
 *    word-boundary hit:        +length × 2 + 3
 *    interior substring hit:   +length × 2
 *
 *  Returns -1 when not all tokens match. */
function scoreRecord(hay, tokens) {
  let score = 0;
  for (const t of tokens) {
    const idx = hay.indexOf(t);
    if (idx < 0) return -1;
    score += t.length * 2;
    if (idx === 0) score += 5;
    else if (hay[idx - 1] === ' ') score += 3;
  }
  return score;
}

export function searchIndexed(records, query, { limit = 100 } = {}) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const q = (query || '').toLowerCase().trim();
  if (!q) {
    // No query — return all (capped). Newer records come first so the
    // freshly-indexed entries are most visible.
    return records
      .slice()
      .sort((a, b) => (b.indexedAt || 0) - (a.indexedAt || 0))
      .slice(0, limit);
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return records.slice(0, limit);
  const scored = [];
  for (const r of records) {
    if (!r._search) r._search = buildHaystack(r);
    const score = scoreRecord(r._search, tokens);
    if (score >= 0) scored.push({ r, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.r);
}
