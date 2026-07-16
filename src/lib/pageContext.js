import { runEngine } from './page-engine/index.js';
import { detectPageType, pageUrl } from './pageType.js';

export { detectPageType } from './pageType.js';

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

export function getPageContext(doc = (typeof document !== 'undefined' ? document : null)) {
  const pageType = detectPageType(doc);
  let data = null;
  let schemaId = null;
  try {
    const engine = runEngine(doc);
    if (engine) { data = engine.data; schemaId = engine.schemaId; }
  } catch { /* engine failure must never break callers — fall back to ids/url */ }

  const url = pageUrl(doc);
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
