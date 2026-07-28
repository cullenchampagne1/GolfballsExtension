import { PAGE_TYPE } from './constants.js';

/* Pure page-type detection, kept separate from the schema engine so URL
   routing can be used and tested without loading page extraction modules. */
export function pageUrl(doc) {
  if (doc && typeof doc.URL === 'string' && doc.URL && doc.URL !== 'about:blank') {
    const marked = doc.body && doc.body.dataset && doc.body.dataset.gbSourceUrl;
    if (marked) return marked;
  }
  if (doc === (typeof document !== 'undefined' ? document : null) && typeof window !== 'undefined') {
    return window.location.href;
  }
  return (doc && doc.body && doc.body.dataset && doc.body.dataset.gbSourceUrl) || (doc && doc.URL) || '';
}

function isOrderIndexUrl(url) {
  const value = String(url || '');
  if (/[?&]Folder=Orders\b/i.test(value)) return true;
  return /\/golfballs\/adminnew\/default\.aspx(?:[?#]|$)/i.test(value)
    && /[?&]Page=20(?:&|#|$)/i.test(value);
}

export function detectPageType(doc = (typeof document !== 'undefined' ? document : null)) {
  const url = pageUrl(doc);
  if (/[?&]page=ViewOrder/i.test(url) && /[?&]orderID=/i.test(url)) return PAGE_TYPE.ORDER;
  if (/[?&]Page=240\b/i.test(url)) return PAGE_TYPE.CONTACT;
  if (/[?&]Page=271\b/i.test(url)) return PAGE_TYPE.ACCOUNT;
  // Opportunity pages also render a contact id, so URL detection must win.
  if (/[?&]Page=280\b/i.test(url)) return PAGE_TYPE.OPPORTUNITY;
  // CRM Search (Page 360). The native search mutates the URL with its own
  // params, so match Page=360 regardless of any trailing query state.
  if (/[?&]Page=360\b/i.test(url)) return PAGE_TYPE.SEARCH;
  if (doc && typeof doc.getElementById === 'function' && doc.getElementById('tbContactId')) return PAGE_TYPE.CONTACT;
  if (/[?&]accountID=\d+/i.test(url)) return PAGE_TYPE.ACCOUNT;
  if (/[?&]customerID=\d+/i.test(url)) return PAGE_TYPE.CONTACT;
  if (isOrderIndexUrl(url)) return PAGE_TYPE.ORDER_INDEX;
  return PAGE_TYPE.OTHER;
}
