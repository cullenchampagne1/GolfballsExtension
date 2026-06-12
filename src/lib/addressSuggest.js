/* ───────────────────────────────────────────────────────────────────────────
   addressSuggest — checkout address typeahead backed by Smarty
   US-Autocomplete-Pro, the same feed golfballs.com's own checkout uses (same
   endpoint + embedded website key). The network call runs in the background
   worker (see background.js `geocodeAddress`), which a declarativeNetRequest
   rule stamps with the golfballs Referer so the key authorizes. Here we just
   fire the lookup and shape Smarty's suggestions into the flat
   { addr1, city, state, zip, … } the checkout form fields consume.
   ─────────────────────────────────────────────────────────────────────────── */

// One Smarty suggestion → the flat address shape the form consumes. `addr1` is
// the street line; `secondary` (e.g. "Apt 4") is folded in when present.
function shapeSuggestion(s) {
  if (!s || !s.street_line) return null;
  const addr1 = [s.street_line, s.secondary].filter(Boolean).join(' ').trim();
  const city = s.city || '';
  const state = s.state || '';
  const zip = s.zipcode || '';
  const sub = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return { addr1, city, state, zip, label: addr1, sub, _key: addr1 + '|' + sub };
}

/* Suggest US addresses for a partial query. Resolves to an array of shaped
   suggestions (possibly empty); never rejects — typeahead should fail quiet, so
   network / extension errors all resolve to []. */
export function suggestAddresses(query) {
  const q = (query || '').trim();
  return new Promise((resolve) => {
    if (q.length < 2) { resolve([]); return; }
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { resolve([]); return; }
    try {
      chrome.runtime.sendMessage({ action: 'geocodeAddress', q }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) { resolve([]); return; }
        const seen = new Set();
        const out = [];
        (resp.suggestions || []).forEach((s) => {
          const shaped = shapeSuggestion(s);
          if (!shaped) return;
          const k = shaped._key.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k); out.push(shaped);
        });
        resolve(out.slice(0, 6));
      });
    } catch { resolve([]); }
  });
}
