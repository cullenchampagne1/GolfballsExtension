/* ───────────────────────────────────────────────────────────────────────────
   addressSuggest — checkout address typeahead backed by Photon (Komoot), a free
   OpenStreetMap geocoder that needs no API key. The network call runs in the
   background worker (see background.js `geocodeAddress`) so the host-page CSP
   can't block it; here we just shape the GeoJSON features into the flat
   { addr1, city, state, zip, … } the checkout form fields consume.
   ─────────────────────────────────────────────────────────────────────────── */

const US_STATE_ABBR = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const stateAbbr = (name) => {
  if (!name) return '';
  const n = String(name).trim();
  if (/^[A-Za-z]{2}$/.test(n)) return n.toUpperCase();
  return US_STATE_ABBR[n.toLowerCase()] || '';
};

// One Photon feature → the flat address shape the form consumes. `addr1` is the
// street line (house number + street, or the place name when there's no street).
function shapeFeature(f) {
  const p = (f && f.properties) || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
  const addr1 = street || p.name || '';
  const city = p.city || p.town || p.village || p.district || p.county || '';
  const state = stateAbbr(p.state);
  const zip = p.postcode || '';
  // A compact, human one-liner for the dropdown row.
  const label = [addr1, city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const sub = [p.country].filter(Boolean).join('');
  return { addr1, city, state, zip, country: p.country || '', label, sub, _key: (f && f.properties && f.properties.osm_id) || label };
}

/* Suggest US-biased addresses for a partial query. Resolves to an array of
   shaped suggestions (possibly empty); never rejects — typeahead should fail
   quiet, so network/extension errors resolve to []. */
export function suggestAddresses(query) {
  const q = (query || '').trim();
  return new Promise((resolve) => {
    if (q.length < 3) { resolve([]); return; }
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) { resolve([]); return; }
    try {
      chrome.runtime.sendMessage({ action: 'geocodeAddress', q }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) { resolve([]); return; }
        const seen = new Set();
        const out = [];
        (resp.features || []).forEach((f) => {
          const s = shapeFeature(f);
          if (!s.addr1) return;                       // skip pure region/POI hits
          const k = s.label.toLowerCase();
          if (seen.has(k)) return;
          seen.add(k); out.push(s);
        });
        resolve(out);
      });
    } catch { resolve([]); }
  });
}
