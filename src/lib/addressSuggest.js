/* ───────────────────────────────────────────────────────────────────────────
   addressSuggest — checkout address typeahead backed by Geoapify, a geocoder
   with strong US residential coverage (free tier ~3,000/day). The API key lives
   in devSettings ('geoapify.apiKey'); the network call runs in the background
   worker (see background.js `geocodeAddress`) so the host-page CSP can't block
   it. Here we read the key, fire the lookup, and shape the results into the flat
   { addr1, city, state, zip, … } the checkout form fields consume.
   ─────────────────────────────────────────────────────────────────────────── */

import { loadDevSettings } from './devSettings.js';

/* The configured Geoapify key (trimmed), or '' if none. */
async function geoapifyKey() {
  try { const s = await loadDevSettings(); return String(s['geoapify.apiKey'] || '').trim(); }
  catch { return ''; }
}

/* Has the user pasted a Geoapify key? Lets the field show a "set it up" hint. */
export async function geoapifyConfigured() {
  return !!(await geoapifyKey());
}

// Result types that aren't a usable street address (we want buildings/streets,
// not a bare city/region/postcode/country row).
const NON_ADDRESS = new Set(['country', 'state', 'county', 'city', 'postcode', 'region']);

// One Geoapify result → the flat address shape the form consumes. `addr1` is the
// street line (Geoapify's address_line1 is already "housenumber street").
function shapeResult(r) {
  if (!r) return null;
  if (NON_ADDRESS.has(r.result_type)) return null;
  const street = [r.housenumber, r.street].filter(Boolean).join(' ').trim();
  const addr1 = r.address_line1 || street || r.name || '';
  if (!addr1) return null;
  const city = r.city || r.town || r.village || r.county || '';
  const state = r.state_code || r.state || '';           // Geoapify gives a 2-letter state_code
  const zip = r.postcode || '';
  // Street on the primary line; city/state/zip beneath (all rows are US).
  const sub = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { addr1, city, state, zip, label: addr1, sub, _key: r.place_id || (addr1 + sub) };
}

/* Suggest US addresses for a partial query. Resolves to an array of shaped
   suggestions (possibly empty); never rejects — typeahead should fail quiet, so
   a missing key / network / extension error all resolve to []. */
export function suggestAddresses(query) {
  const q = (query || '').trim();
  return new Promise((resolve) => {
    if (q.length < 3) { resolve([]); return; }
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { resolve([]); return; }
    geoapifyKey().then((key) => {
      if (!key) { resolve([]); return; }
      try {
        chrome.runtime.sendMessage({ action: 'geocodeAddress', q, key }, (resp) => {
          if (chrome.runtime.lastError || !resp || !resp.ok) { resolve([]); return; }
          const seen = new Set();
          const out = [];
          (resp.results || []).forEach((r) => {
            const s = shapeResult(r);
            if (!s) return;
            const k = s.label.toLowerCase() + '|' + s.sub.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k); out.push(s);
          });
          resolve(out.slice(0, 6));
        });
      } catch { resolve([]); }
    });
  });
}
