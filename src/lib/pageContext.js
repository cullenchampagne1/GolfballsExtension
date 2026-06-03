import { PAGE_TYPE } from './constants.js';
import { runEngine } from './page-engine/index.js';

/* ───────────────────────────────────────────────────────────────
   pageContext.js — the single "what page am I on + what's on it"
   API. Collapses the two hand-rolled page-type detectors (actions-
   shelf's detectPageType + smart-detection's smartPageType) into one
   superset, and pairs it with the schema engine's extracted data.

   getPageContext(doc) → {
     pageType,            // a PAGE_TYPE.* value
     ids: { order, contact, account, item },
     data,                // runEngine(doc).data, or null if no schema
     schemaId,            // 'contact' | 'account' | null
   }

   detectPageType is exposed on the frozen window.__gbPageEngine bridge
   (page-engine.entry.js) so the vanilla content scripts that can't
   import ESM share the exact same logic.
─────────────────────────────────────────────────────────────── */

/* Resolve the page URL the way the engine's registry does: the live
   document uses window.location; a fetched/parsed Document carries its
   origin URL on body.dataset.gbSourceUrl (set by the fetch proxy). */
function docUrl(doc) {
  if (doc && typeof doc.URL === 'string' && doc.URL && doc.URL !== 'about:blank') {
    // A real Document — prefer the explicit source-url marker, else its URL.
    const marked = doc.body && doc.body.dataset && doc.body.dataset.gbSourceUrl;
    if (marked) return marked;
  }
  if (doc === (typeof document !== 'undefined' ? document : null) && typeof window !== 'undefined') {
    return window.location.href;
  }
  return (doc && doc.body && doc.body.dataset && doc.body.dataset.gbSourceUrl) || (doc && doc.URL) || '';
}

function param(url, re) {
  const m = String(url || '').match(re);
  return m ? m[1] : null;
}

/* Normalize an id that may come back as a bare number OR a detail URL (the
   account page's contact id is extracted from the related-contact link, so
   it arrives as a full Page=240&customerID=… href). Returns the numeric id. */
function numericId(v, re) {
  if (v == null) return null;
  const s = String(v);
  if (/^\d+$/.test(s)) return s;
  const m = s.match(re);
  return m ? m[1] : null;
}

/* The superset detector — actions-shelf's version (the only one with the
   `order-index` branch) made canonical. URL checks first, then the
   #tbContactId DOM marker, then the looser id-param fallbacks. */
export function detectPageType(doc = (typeof document !== 'undefined' ? document : null)) {
  const url = docUrl(doc);
  if (/[?&]page=ViewOrder/i.test(url) && /[?&]orderID=/i.test(url)) return PAGE_TYPE.ORDER;
  if (/[?&]Page=240\b/i.test(url)) return PAGE_TYPE.CONTACT;
  if (/[?&]Page=271\b/i.test(url)) return PAGE_TYPE.ACCOUNT;
  if (doc && typeof doc.getElementById === 'function' && doc.getElementById('tbContactId')) return PAGE_TYPE.CONTACT;
  if (/[?&]accountID=\d+/i.test(url)) return PAGE_TYPE.ACCOUNT;
  if (/[?&]customerID=\d+/i.test(url)) return PAGE_TYPE.CONTACT;
  if (/[?&]Folder=Orders\b/i.test(url)) return PAGE_TYPE.ORDER_INDEX;
  return PAGE_TYPE.OTHER;
}

export function getPageContext(doc = (typeof document !== 'undefined' ? document : null)) {
  const pageType = detectPageType(doc);
  let data = null;
  let schemaId = null;
  try {
    const engine = runEngine(doc);
    if (engine) { data = engine.data; schemaId = engine.schemaId; }
  } catch { /* engine failure must never break callers — fall back to ids/url */ }

  const url = docUrl(doc);
  const ids = {
    /* orderID from the URL is safe today (no order schema yet). */
    order:   param(url, /[?&]orderID=(\d+)/i),
    /* Prefer the engine-extracted ids; fall back to the URL params the
       old detectors keyed off. */
    contact: numericId(data && data.ids && data.ids.contact, /[?&]customerID=(\d+)/i) || param(url, /[?&]customerID=(\d+)/i) || null,
    account: numericId(data && data.ids && data.ids.account, /[?&]accountID=(\d+)/i) || param(url, /[?&]accountID=(\d+)/i) || null,
    item:    null,
  };

  return { pageType, ids, data, schemaId };
}
