/* ───────────────────────────────────────────────────────────────
   findPhone — scan a contact's orders for a phone number + the
   shipping-address name attached to each, then prompt the user
   via a SelectToast to pick which number to save.

   Replaces the legacy phone-finder.js's "auto-save the first
   number found" behavior — sales reps tend to fish the wrong
   number when an order contains a customer's billing AND a
   recipient's shipping. A picker lets them choose.

   All side-effects (fetching orders, fetching pages, saving the
   contact, surfacing the toast) come in via the `deps` argument
   so the function is environment-independent:

     deps.fetchOrderLinks()       → Promise<string[]>
       returns absolute URLs to each order page on the contact

     deps.fetchOrderPage(url)     → Promise<{ html, url }>
       returns the order page HTML (and its URL for the toast hint)

     deps.saveContact(phone)      → Promise<{ ok: boolean, error? }>
       persists the picked number to the live contact

     deps.toast                   → { select(...), pill(...), success(...), ... }
       the React toast surface; required for prompting the user

     deps.contactName             → string for the toast header

   Live extension wires real HTTP fns; playground passes mocks.
   This lets us demo the whole flow in the playground exactly
   how it will run on golfballs.com.
─────────────────────────────────────────────────────────────── */

const PHONE_RE = /(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;

/* Normalize a phone string to the (xxx) xxx-xxxx format the CRM stores.
   Strips formatting, drops a leading country-code '1' if present. */
export function normalizePhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

/* Pull every phone + the shipping-address NAME from an order page's
   HTML. Returns 0..N candidates per order — sometimes both the
   purchaser and the recipient on a single order have different
   numbers (billing vs shipping). */
export function extractPhonesFromOrderHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const customerInfo = doc.getElementById('customerInfo');
  const candidates = [];
  if (customerInfo) {
    // The CRM's customerInfo block typically holds:
    //   <tr><td>Name</td> <td class="darkText">Recipient Name</td></tr>
    //   <tr><td>Phone</td><td class="darkText">(415) 555-0142</td></tr>
    // We scan ALL darkText cells, pair phones with the nearest name
    // cell on the same row's predecessor row when possible.
    const rows = Array.from(customerInfo.querySelectorAll('tr'));
    let lastName = '';
    for (const row of rows) {
      const labelCell = row.querySelector('td:first-child');
      const valueCell = row.querySelector('td.darkText, td:nth-child(2)');
      const label = (labelCell?.textContent || '').trim().toLowerCase();
      const value = (valueCell?.textContent || '').trim();
      if (!value) continue;
      if (label.includes('name')   || label.includes('ship to')) lastName = value;
      if (label.includes('phone')  || label.includes('contact')) {
        for (const match of value.matchAll(PHONE_RE)) {
          candidates.push({ phone: normalizePhone(match[0]), name: lastName });
        }
      }
    }
  }
  // Catch-all: any phone-formatted strings anywhere in body that the
  // structured pass missed. These get attached as anonymous candidates.
  const body = doc.body?.textContent || '';
  const seen = new Set(candidates.map((c) => c.phone));
  for (const match of body.matchAll(PHONE_RE)) {
    const phone = normalizePhone(match[0]);
    if (!seen.has(phone)) {
      candidates.push({ phone, name: '' });
      seen.add(phone);
    }
  }
  return candidates;
}

/* ────────────────────────────────────────────────────────────
   Top-level orchestrator. Run this from the smart action's
   handler. The flow:
     1. Surface a "scanning…" toast.
     2. Walk each order page, extract candidates, dedupe by phone.
     3. If we found nothing, switch the toast to "no phones found".
     4. If we found one or more, prompt the user to pick via the
        SelectToast variant.
     5. On pick, call deps.saveContact and report the outcome.
   Returns nothing — all UX flows through the toast surface.
──────────────────────────────────────────────────────────── */
export async function findPhone(deps) {
  const { fetchOrderLinks, fetchOrderPage, saveContact, toast, contactName = 'Contact' } = deps || {};
  if (!toast) { console.warn('findPhone: toast surface required'); return; }
  if (!fetchOrderLinks || !fetchOrderPage || !saveContact) {
    toast.error('Find phone — wiring missing');
    return;
  }

  const links = await fetchOrderLinks();
  if (!Array.isArray(links) || links.length === 0) {
    toast.warning('No orders found for this contact', { duration: 3000 });
    return;
  }

  // Up-front scanning notification — sticky until we know the result.
  const scanningId = toast.pill(`Scanning ${links.length} order${links.length === 1 ? '' : 's'} for phone numbers…`, {
    tone: 'info',
    duration: null,
  });

  const candidates = [];
  const seen = new Set();   // dedupe identical phones across orders
  for (let i = 0; i < links.length; i++) {
    try {
      const { html, url } = await fetchOrderPage(links[i]);
      const found = extractPhonesFromOrderHtml(html);
      for (const c of found) {
        if (seen.has(c.phone)) continue;
        seen.add(c.phone);
        candidates.push({ ...c, orderUrl: url || links[i] });
      }
    } catch (err) {
      // One order failing isn't fatal — keep scanning the rest.
      console.warn('[findPhone] order fetch failed:', err?.message || err);
    }
  }

  // Dismiss the scanning pill regardless of outcome.
  if (typeof scanningId === 'number' && toast.dismiss) toast.dismiss(scanningId);

  if (candidates.length === 0) {
    toast.warning(`No phone numbers found in orders for ${contactName}`, { duration: 4000 });
    return;
  }

  // Single candidate: skip the picker UX and just save.
  if (candidates.length === 1) {
    const only = candidates[0];
    const result = await saveContact(only.phone);
    if (result?.ok) {
      toast.success(`Saved ${only.phone} to ${contactName}`, { duration: 3000 });
    } else {
      toast.error(`Couldn't save: ${result?.error || 'unknown error'}`);
    }
    return;
  }

  // Multiple candidates: prompt the user. The SelectToast handles
  // its own dismiss; we re-resolve in the onPick.
  toast.select({
    title: `Pick a phone for ${contactName}`,
    subtitle: `Found ${candidates.length} numbers across ${links.length} order${links.length === 1 ? '' : 's'}`,
    items: candidates.map((c, i) => ({
      id: `c-${i}`,
      label: c.phone,
      hint: c.name ? `Ship to: ${c.name}` : 'No name on order',
      badge: c.name ? null : 'unknown',
      raw: c,
    })),
    onPick: async (item) => {
      const result = await saveContact(item.raw.phone);
      if (result?.ok) {
        toast.success(`Saved ${item.raw.phone} to ${contactName}`, { duration: 3000 });
      } else {
        toast.error(`Couldn't save: ${result?.error || 'unknown error'}`);
      }
    },
  });
}
