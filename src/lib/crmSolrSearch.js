/* ───────────────────────────────────────────────────────────────
   crmSolrSearch.js — the CRM Solr search transport, extracted so both
   the CRM Search modal (CRMSearch.jsx) and the full-page CRM Search
   takeover (content/crm-search-page.jsx) hit the same backend with an
   identical query-string contract.

   The endpoint is the private SolrIndexCrm web service; it takes a single
   `str` field that is a raw Solr query string. edismax with per-field
   boosts (qf) + phrase boosts (pf) so a name-token match dominates an
   email/phone substring. A QueryBuilder filter is appended as `fq=`.
─────────────────────────────────────────────────────────────── */

export const SOLR_ENDPOINT = 'https://api.golfballs.com/Golfballs/WebServices/Private/SolrIndexCrm.asmx/Query';
export const SOLR_QF = 'id^100 accountID_s^100 contactName_t^120 accountName_t^120 email_tp^25 emails_tps^25 phones_ss^25';
export const SOLR_PF = 'contactName_t^400 accountName_t^400 email_tp^60';
export const SOLR_ROWS = 100;

/* Build the raw Solr `q`: empty term → match-all (sort/filters drive
   results); otherwise tokenise and add ~1 fuzzy to tokens ≥ 4 chars for
   one-edit typo tolerance (short tokens stay literal to avoid a 1-edit
   explosion). Exact/phrase matches still rank higher via score + pf. */
export function buildSolrQ(term) {
  const t = (term || '').trim();
  if (!t) return '*:*';
  const tokens = t.split(/\s+/).filter(Boolean);
  if (!tokens.length) return '*:*';
  return tokens.map((tok) => (tok.length >= 4 ? `${tok}~1` : tok)).join(' ');
}

/* Assemble the `str` body Solr receives. Pulled out (and tested) so the
   query-string contract can't silently drift. */
export function buildSolrBody({ query = '', solrFq = '', start = 0, sortKey = 'lastOrderDate_dt', sortDir = 'desc', rows = SOLR_ROWS } = {}) {
  const term = (query || '').trim();
  const qStr = buildSolrQ(term);
  // With a term the user wants relevance first (score desc) with their
  // column choice as tiebreaker; without one, sort by the chosen column.
  const effectiveSort = term ? `score desc, ${sortKey} ${sortDir}` : `${sortKey} ${sortDir}`;
  const startPart = start > 0 ? `&start=${start}` : '';
  let body = `${qStr}${startPart}&sort=${encodeURIComponent(effectiveSort)}&rows=${rows}&qf=${encodeURIComponent(SOLR_QF)}&pf=${encodeURIComponent(SOLR_PF)}&q.op=AND&sow=false&defType=edismax`;
  if (solrFq) body += `&fq=${encodeURIComponent(solrFq)}`;
  return body;
}

/* Run one Solr page. `type` ('all'|'contact'|'account') filters recordType_s
   client-side (Solr returns mixed types). Returns { docs, numFound }. */
export async function crmSolrQuery(opts = {}) {
  const { type = 'all' } = opts;
  const body = buildSolrBody(opts);
  const res = await fetch(SOLR_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ str: body }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  const data = JSON.parse(raw.d);
  let docs = (data.response && data.response.docs) || [];
  const numFound = (data.response && data.response.numFound != null) ? data.response.numFound : docs.length;
  if (type !== 'all') docs = docs.filter((r) => (r.recordType_s || '').toLowerCase() === type);
  return { docs, numFound };
}
