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

/* The value facets the native CRM search sidebar exposes, in display order.
   Each yields facet_counts.facet_fields.<field> = [value,count,value,count,…].
   `int` fields are numbered pods; the rest are string values. */
export const SOLR_FACETS = [
  { field: 'recordType_s', label: 'Entity Types', type: 'str' },
  { field: 'salesRep_s',   label: 'Sales Rep',    type: 'str', searchable: true },
  { field: 'role_s',       label: 'Role',         type: 'str' },
  { field: 'podID_i',      label: 'Pod',          type: 'int' },
];

/* Date-range facets — expressed as Solr facet.query buckets keyed by their fq,
   so the sidebar can show a count per bucket and apply it as a filter. */
export const SOLR_DATE_FACETS = [
  {
    field: 'lastOrderDate_dt', label: 'Last Order Age',
    buckets: [
      { key: 'last30',  label: 'Last 30 days',    fq: 'lastOrderDate_dt:[NOW-30DAYS TO *]' },
      { key: '30to90',  label: '30 – 90 days',    fq: 'lastOrderDate_dt:[NOW-90DAYS TO NOW-30DAYS]' },
      { key: '90to1y',  label: '90 days – 1 year', fq: 'lastOrderDate_dt:[NOW-1YEAR TO NOW-90DAYS]' },
      { key: 'over1y',  label: 'Over a year',     fq: 'lastOrderDate_dt:[* TO NOW-1YEAR]' },
      { key: 'never',   label: 'Never ordered',   fq: '-lastOrderDate_dt:[* TO *]' },
    ],
  },
  {
    field: 'nextTaskDate_dt', label: 'Next Task',
    buckets: [
      { key: 'pastdue', label: 'Past Due',            fq: 'nextTaskDate_dt:[* TO NOW]' },
      { key: 'due7',    label: 'Due within 7 days',   fq: 'nextTaskDate_dt:[NOW TO NOW+7DAYS]' },
      { key: 'due30',   label: 'Due within 30 days',  fq: 'nextTaskDate_dt:[NOW TO NOW+30DAYS]' },
      { key: 'none',    label: 'No next task',        fq: '-nextTaskDate_dt:[* TO *]' },
    ],
  },
];

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
   query-string contract can't silently drift.
   - `filters` — extra fq strings (selected facets), each its own &fq=.
   - `facet`   — when true, request value facets + the date-bucket facet.query
                 counts for the sidebar. */
export function buildSolrBody({ query = '', solrFq = '', filters = [], start = 0, sortKey = 'lastOrderDate_dt', sortDir = 'desc', rows = SOLR_ROWS, facet = false, facetLimit = 60 } = {}) {
  const term = (query || '').trim();
  const qStr = buildSolrQ(term);
  const effectiveSort = term ? `score desc, ${sortKey} ${sortDir}` : `${sortKey} ${sortDir}`;
  const startPart = start > 0 ? `&start=${start}` : '';
  let body = `${qStr}${startPart}&sort=${encodeURIComponent(effectiveSort)}&rows=${rows}&qf=${encodeURIComponent(SOLR_QF)}&pf=${encodeURIComponent(SOLR_PF)}&q.op=AND&sow=false&defType=edismax`;
  if (solrFq) body += `&fq=${encodeURIComponent(solrFq)}`;
  for (const f of (filters || [])) if (f) body += `&fq=${encodeURIComponent(f)}`;
  if (facet) {
    body += `&facet=true&facet.mincount=1&facet.limit=${facetLimit}&facet.sort=count`;
    for (const f of SOLR_FACETS) body += `&facet.field=${encodeURIComponent(f.field)}`;
    for (const g of SOLR_DATE_FACETS) for (const b of g.buckets) body += `&facet.query=${encodeURIComponent(b.fq)}`;
  }
  return body;
}

/* Parse facet_counts into { fields: { field: [{value,count}] }, queries: { fq: count } }. */
export function parseFacets(data) {
  const out = { fields: {}, queries: {} };
  const fc = data && data.facet_counts;
  if (!fc) return out;
  const ff = fc.facet_fields || {};
  for (const field of Object.keys(ff)) {
    const flat = ff[field] || [];
    const rows = [];
    for (let i = 0; i < flat.length; i += 2) rows.push({ value: String(flat[i]), count: Number(flat[i + 1]) || 0 });
    out.fields[field] = rows;
  }
  out.queries = fc.facet_queries || {};
  return out;
}

/* Run one Solr page. `type` ('all'|'contact'|'account') filters recordType_s
   client-side. Returns { docs, numFound, facets }. */
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
  return { docs, numFound, facets: opts.facet ? parseFacets(data) : null };
}

/* Build the fq strings for the selected facets. `selected` is
   { recordType_s: Set|[values], salesRep_s: [...], ..., __date: Set of bucket fqs }.
   Within a field values are OR'd; fields are AND'd (separate fq each). */
export function facetFilters(selected = {}) {
  const out = [];
  for (const f of SOLR_FACETS) {
    const vals = Array.from(selected[f.field] || []);
    if (!vals.length) continue;
    const quoted = vals.map((v) => (f.type === 'int' ? String(v) : `"${String(v).replace(/"/g, '\\"')}"`));
    out.push(`${f.field}:(${quoted.join(' OR ')})`);
  }
  // Date buckets: OR the picked buckets within a facet; AND across the two.
  for (const g of SOLR_DATE_FACETS) {
    const sel = selected[g.field];
    const has = (k) => !!(sel && (typeof sel.has === 'function' ? sel.has(k) : (Array.isArray(sel) && sel.includes(k))));
    const picked = g.buckets.filter((b) => has(b.key));
    if (!picked.length) continue;
    out.push(picked.length === 1 ? picked[0].fq : `(${picked.map((b) => b.fq).join(' OR ')})`);
  }
  return out;
}
