import { isOrderPrintUrl } from './pageType.js';

/* PDF documents normally stay free of extension chrome so printing and the
   browser's native viewer are unobstructed. Golfballs' PrintOrder endpoint is
   the exception: it is an authenticated order surface, and reps still need the
   contextual quick actions while viewing its invoice/order PDF. */
export function shouldMountActionsShelf({ url = '', contentType = '', pathname = '' } = {}) {
  if (isOrderPrintUrl(url)) return true;
  if (String(contentType).split(';', 1)[0].trim().toLowerCase() === 'application/pdf') return false;
  if (/\.pdf$/i.test(String(pathname).split(/[?#]/, 1)[0])) return false;
  return true;
}
