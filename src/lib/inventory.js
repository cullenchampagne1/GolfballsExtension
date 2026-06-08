/* ───────────────────────────────────────────────────────────────────────────
   inventory.js — stock + cost for a catalog SKU.

   Source: the session-authenticated Dynamics endpoint
     GET https://office.gbcadmin.com/office/Dynamics/Inventory.aspx?sku=<SKU>
   which returns an HTML <TABLE>. We fetch it (credentialed, via the background
   `fetchRaw` relay), parse the rows into structured variants + PO lines, and
   cache the result per SKU in chrome.storage. The per-unit Cost is also kept in
   a module-level Map so the margin calculator can read it synchronously.

   Row shapes in the source table (per variant):
     • single-row variants (e.g. custom/personalized): 12 cells —
       [itemNumber, available, onHnd, amzn, alloc, onOrdr, lastRecv, shelf,
        description, cost, asin, asinPrice]
     • rowspan variants (e.g. new/overrun stock): a header row
       [itemNumber(link), description(colspan), cost, asin, asinPrice] followed by
       a numbers row [available, onHnd, amzn, alloc, onOrdr, lastRecv, shelf, …],
       then optional PO rows [_, prmDate, onOrdr, poNumber].
   ─────────────────────────────────────────────────────────────────────────── */

const INV_URL = 'https://office.gbcadmin.com/office/Dynamics/Inventory.aspx?sku=';
const CACHE_KEY = 'gbInventoryCache';
const TTL_MS = 6 * 60 * 60 * 1000;            // 6h
const _costMap = new Map();                   // sku → per-unit cost (sync read for margin)

function _sendBg(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { reject(new Error('Not in an extension context')); return; }
    try {
      chrome.runtime.sendMessage({ action, ...payload }, (resp) => {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (!resp || !resp.ok) { reject(new Error((resp && resp.error) || (action + ' failed'))); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

const _int = (s) => { const n = parseInt(String(s).replace(/[^0-9-]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const _money = (s) => { const m = /\$?\s*([\d,]+\.?\d*)/.exec(String(s) || ''); return m ? Number(m[1].replace(/,/g, '')) : null; };

/* Parse the inventory HTML into { rows:[…], cost, sku }. Resilient — unknown
   rows are skipped, and a malformed table yields { rows:[], cost:null }. */
export function parseInventoryHtml(html, sku) {
  const out = { sku, rows: [], cost: null };
  if (!html) return out;
  let doc;
  try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch { return out; }
  const trs = Array.from(doc.querySelectorAll('tr'));
  const clean = (el) => (el ? el.textContent.replace(/ /g, ' ').trim() : '');
  let cur = null;          // variant awaiting its numbers row
  let poMode = false;
  const skuPrefix = sku ? String(sku).toUpperCase() + '-' : '';
  for (const tr of trs) {
    const cells = Array.from(tr.querySelectorAll('td,th'));
    const txt = cells.map(clean);
    const id = (tr.getAttribute('id') || '').toUpperCase();
    const isVariant = id && (!skuPrefix || id.startsWith(skuPrefix));
    if (isVariant) {
      poMode = false;
      const dollarIdx = txt.findIndex((t) => /\$/.test(t));
      let v;
      if (cells.length >= 10) {
        // single-row variant: numbers inline
        v = {
          itemNumber: txt[0], description: txt[8] || '',
          available: _int(txt[1]), onHand: _int(txt[2]), alloc: _int(txt[4]), onOrder: _int(txt[5]),
          lastRecv: txt[6] || '', cost: _money(txt[dollarIdx >= 0 ? dollarIdx : 9]),
        };
        cur = null;
      } else {
        // rowspan variant: header now, numbers next row
        v = {
          itemNumber: txt[0], description: txt[1] || '',
          available: 0, onHand: 0, alloc: 0, onOrder: 0, lastRecv: '',
          cost: _money(txt[dollarIdx >= 0 ? dollarIdx : 2]),
        };
        cur = v;
      }
      v.pos = [];
      out.rows.push(v);
      continue;
    }
    // PO sub-table header → start collecting PO lines for the current variant
    if (txt.some((t) => /^PrmDate$/i.test(t))) { poMode = true; continue; }
    if (poMode && cur && txt.length >= 4 && /\d/.test(txt[1] || '')) {
      cur.pos.push({ prmDate: txt[1], qty: _int(txt[2]), po: (txt[3] || '').trim() });
      continue;
    }
    // numbers row for the preceding rowspan variant
    if (cur && cur.available === 0 && txt.length >= 5 && /^\d/.test(txt[0] || '')) {
      cur.available = _int(txt[0]); cur.onHand = _int(txt[1]); cur.alloc = _int(txt[3]);
      cur.onOrder = _int(txt[4]); cur.lastRecv = txt[5] || '';
      cur = null;
      continue;
    }
  }
  // canonical cost = first variant with a real (>0) cost
  const priced = out.rows.find((r) => r.cost && r.cost > 0);
  out.cost = priced ? priced.cost : null;
  return out;
}

function _readCache() {
  return new Promise((resolve) => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) { resolve({}); return; }
      chrome.storage.local.get(CACHE_KEY, (d) => resolve((d && d[CACHE_KEY]) || {}));
    } catch { resolve({}); }
  });
}
function _writeCache(map) {
  try { chrome.storage.local.set({ [CACHE_KEY]: map }); } catch { /* */ }
}

/* Load all cached costs into the sync Map (call once on modal mount so the
   margin calculator can read costs without awaiting). */
export async function primeCostCache() {
  const map = await _readCache();
  for (const [sku, e] of Object.entries(map)) {
    if (e && e.parsed && e.parsed.cost != null) _costMap.set(sku, e.parsed.cost);
  }
  return _costMap.size;
}

/* Synchronous per-unit cost lookup for margin math (null if not fetched yet). */
export function cachedCostForSku(sku) {
  if (!sku) return null;
  return _costMap.has(sku) ? _costMap.get(sku) : null;
}

/* Fetch + parse inventory for a SKU, with a 6h chrome.storage cache.
   Returns the parsed object { sku, rows, cost }. `force` bypasses the cache. */
export async function getInventory(sku, { force = false } = {}) {
  if (!sku) throw new Error('No SKU');
  const key = String(sku);
  const map = await _readCache();
  const hit = map[key];
  if (!force && hit && hit.parsed && (Date.now() - (hit.ts || 0)) < TTL_MS) {
    if (hit.parsed.cost != null) _costMap.set(key, hit.parsed.cost);
    return hit.parsed;
  }
  // Fetch in the page (golfballs.com) context — it carries the gbcadmin session
  // cookie. A background service-worker fetch is a 3rd-party context and gets
  // bounced to the auth error page (see background.js `fetchInventory`).
  const r = await _sendBg('fetchInventory', { sku: key });
  const parsed = parseInventoryHtml(r.text || '', key);
  map[key] = { ts: Date.now(), parsed };
  _writeCache(map);
  if (parsed.cost != null) _costMap.set(key, parsed.cost);
  return parsed;
}
