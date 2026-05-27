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

/* Strict phone-shaped run.
   - (?<!\d) / (?!\d) — must not be embedded inside a longer digit run.
     Kept the old loose pattern from matching `820701-5119` inside
     `Order #2820701-5119355`, which surfaced as a bogus (820) 701-5119
     candidate.
   - The second separator `[\s.\-]` is REQUIRED (not optional). Real
     phones in this CRM are always formatted like 610-374-8344 or
     (610) 374-8344, never as 6103748344, so requiring the dash/space
     between the last two groups is safe and tightens the pattern
     further against incidental digit runs. The first separator
     stays optional so "(610) 374-8344" still parses. */
const PHONE_RE = /(?<!\d)(?:\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4})(?!\d)/g;

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
  const seen = new Set();
  const pushIfNew = (phone, name) => {
    const norm = normalizePhone(phone);
    if (!norm) return;
    if (norm.replace(/\D/g, '').length < 10) return;
    if (seen.has(norm)) return;
    seen.add(norm);
    candidates.push({ phone: norm, name: (name || '').replace(/\s+/g, ' ').trim() });
  };

  if (customerInfo) {
    /* The CRM's #customerInfo isn't a single label/value table —
       it's a wrapper around 2-3 nested <table>s (billing, payment,
       shipping). Each nested table holds:
         <tr><td class="darkText"><b>Name</b></td></tr>
         <tr><td class="darkText">street</td></tr>
         <tr><td class="darkText">city, ST zip</td></tr>
         <tr><td class="darkText">phone</td></tr>
       So we extract per-block: the FIRST <b> in the block is the
       name, and any cell whose text matches the strict PHONE_RE is
       a phone candidate paired with that name. Tables without a
       phone (the payment block) just contribute nothing. */
    for (const tbl of customerInfo.querySelectorAll('table')) {
      const nameEl = tbl.querySelector('b');
      const name = (nameEl?.textContent || '').trim();
      for (const cell of tbl.querySelectorAll('td')) {
        const text = (cell.textContent || '').trim();
        if (!text) continue;
        for (const match of text.matchAll(PHONE_RE)) {
          pushIfNew(match[0], name);
        }
      }
    }
  }

  /* Catch-all over the body text — with the lookaround-anchored
     regex it's much less likely to pick up order-id substrings as
     phones, so we keep it as a backstop for orders that store the
     phone outside #customerInfo. No name attached. */
  if (doc.body) {
    const bodyText = doc.body.textContent || '';
    for (const match of bodyText.matchAll(PHONE_RE)) {
      pushIfNew(match[0], '');
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
