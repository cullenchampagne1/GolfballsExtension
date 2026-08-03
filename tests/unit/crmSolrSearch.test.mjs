import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSolrQ, buildSolrBody, parseFacets, facetFilters,
  crmSolrQuery, mergeSolrDocs, nextSolrStart,
} from '../../src/lib/crmSolrSearch.js';

describe('crm · Solr search query building', () => {
  it('empty term → match-all', () => {
    assert.equal(buildSolrQ(''), '*:*');
    assert.equal(buildSolrQ('   '), '*:*');
  });

  it('adds ~1 fuzzy only to tokens of 4+ chars', () => {
    assert.equal(buildSolrQ('alex'), 'alex~1');
    assert.equal(buildSolrQ('abc'), 'abc');              // short → literal
    assert.equal(buildSolrQ('alex morgan bp'), 'alex~1 morgan~1 bp');
  });

  it('body carries edismax, qf, pf, AND op and the row count', () => {
    const b = buildSolrBody({ query: 'titleist' });
    assert.match(b, /^titleist~1&/);
    assert.match(b, /defType=edismax/);
    assert.match(b, /q\.op=AND/);
    assert.match(b, /rows=100/);
    assert.match(b, /qf=/);
    assert.match(b, /pf=/);
  });

  it('with a term, sorts by score first then the chosen column', () => {
    const b = buildSolrBody({ query: 'smith', sortKey: 'lastOrderDate_dt', sortDir: 'desc' });
    assert.match(b, new RegExp('sort=' + encodeURIComponent('score desc, lastOrderDate_dt desc')));
    assert.ok(b.includes(encodeURIComponent(', id asc')), 'deep pages need a unique-key tiebreaker');
  });

  it('without a term, sorts by the chosen column only (no score)', () => {
    const b = buildSolrBody({ query: '', sortKey: 'yearToDateRevenue_f', sortDir: 'desc' });
    assert.match(b, new RegExp('sort=' + encodeURIComponent('yearToDateRevenue_f desc')));
    assert.ok(b.includes(encodeURIComponent(', id asc')), 'deep pages need a unique-key tiebreaker');
    assert.doesNotMatch(b, /score/);
    assert.match(b, /^\*:\*&/);
  });

  it('appends the query-builder filter as an encoded fq', () => {
    const fq = 'role_s:"AE" AND orderCount_i:[5 TO *]';
    const b = buildSolrBody({ query: 'x', solrFq: fq });
    assert.ok(b.includes('&fq=' + encodeURIComponent(fq)));
  });

  it('omits fq entirely when there is no filter', () => {
    assert.doesNotMatch(buildSolrBody({ query: 'x' }), /&fq=/);
  });

  it('adds a start offset only past page 0 (pagination)', () => {
    assert.doesNotMatch(buildSolrBody({ query: 'x', start: 0 }), /&start=/);
    assert.match(buildSolrBody({ query: 'x', start: 100 }), /&start=100&/);
  });

  it('appends each selected facet as its own fq', () => {
    const b = buildSolrBody({ query: 'x', filters: ['recordType_s:("Contact")', 'role_s:("BDR")'] });
    assert.ok(b.includes('&fq=' + encodeURIComponent('recordType_s:("Contact")')));
    assert.ok(b.includes('&fq=' + encodeURIComponent('role_s:("BDR")')));
  });

  it('filters Contacts and Accounts in Solr so numFound and start share one result set', () => {
    const contacts = buildSolrBody({ type: 'contact' });
    const accounts = buildSolrBody({ type: 'account' });
    assert.ok(contacts.includes('&fq=' + encodeURIComponent('recordType_s:"Contact"')));
    assert.ok(accounts.includes('&fq=' + encodeURIComponent('recordType_s:"Account"')));
    assert.doesNotMatch(buildSolrBody({ type: 'all' }), /recordType_s%3A/);
  });

  it('requests value + date facets when facet:true', () => {
    const b = buildSolrBody({ facet: true });
    assert.match(b, /facet=true/);
    assert.ok(b.includes('facet.field=' + encodeURIComponent('recordType_s')));
    assert.ok(b.includes('facet.field=' + encodeURIComponent('salesRep_s')));
    assert.ok(b.includes('facet.query='));   // date-bucket counts
  });
});

describe('crm · Solr pagination state', () => {
  it('returns the next raw offset from the actual page size', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = null;
    globalThis.fetch = async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return {
        ok: true,
        async json() {
          return { d: JSON.stringify({
            response: {
              docs: [{ id: 'contact_3001' }, { id: 'contact_3002' }],
              numFound: 3407,
            },
          }) };
        },
      };
    };
    try {
      const page = await crmSolrQuery({ type: 'contact', start: 3000, rows: 100 });
      assert.equal(page.nextStart, 3002);
      assert.equal(page.numFound, 3407);
      assert.equal(page.docs.length, 2);
      assert.ok(requestBody.str.includes('&start=3000&'));
      assert.ok(requestBody.str.includes('&fq=' + encodeURIComponent('recordType_s:"Contact"')));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('advances from the raw server cursor rather than displayed-row length', () => {
    assert.equal(nextSolrStart(3000, 73), 3073);
    assert.equal(nextSolrStart('3073', 27), 3100);
    assert.equal(nextSolrStart(-10, 'bad'), 0);
  });

  it('deduplicates overlapping pages without losing id-less records', () => {
    const first = [{ id: 'contact_1' }, { id: 'contact_2' }];
    const next = [{ id: 'contact_2' }, { id: 'contact_3' }, { contactName_t: 'No id' }];
    assert.deepEqual(mergeSolrDocs(first, next), [
      { id: 'contact_1' },
      { id: 'contact_2' },
      { id: 'contact_3' },
      { contactName_t: 'No id' },
    ]);
  });

  it('does not mutate either page while merging', () => {
    const first = [{ id: 'contact_1' }];
    const next = [{ id: 'contact_2' }];
    const merged = mergeSolrDocs(first, next);
    assert.notEqual(merged, first);
    assert.deepEqual(first, [{ id: 'contact_1' }]);
    assert.deepEqual(next, [{ id: 'contact_2' }]);
  });
});

describe('crm · Solr facets', () => {
  it('parseFacets flattens facet_fields into {value,count} rows and keeps queries', () => {
    const data = { facet_counts: {
      facet_fields: { recordType_s: ['Contact', 4202914, 'Account', 147274] },
      facet_queries: { 'nextTaskDate_dt:[* TO NOW]': 122861 },
    } };
    const f = parseFacets(data);
    assert.deepEqual(f.fields.recordType_s, [{ value: 'Contact', count: 4202914 }, { value: 'Account', count: 147274 }]);
    assert.equal(f.queries['nextTaskDate_dt:[* TO NOW]'], 122861);
  });

  it('facetFilters quotes string values, ORs within a field, and leaves ints unquoted', () => {
    const fqs = facetFilters({
      recordType_s: new Set(['Contact', 'Account']),
      podID_i: new Set(['0', '3']),
      salesRep_s: new Set(['Cullen Champagne']),
    });
    assert.ok(fqs.includes('recordType_s:("Contact" OR "Account")'));
    assert.ok(fqs.includes('podID_i:(0 OR 3)'));
    assert.ok(fqs.includes('salesRep_s:("Cullen Champagne")'));
  });

  it('facetFilters maps a picked date bucket to its range fq', () => {
    const fqs = facetFilters({ nextTaskDate_dt: new Set(['pastdue']) });
    assert.ok(fqs.includes('nextTaskDate_dt:[* TO NOW]'));
  });

  it('facetFilters returns nothing when no facets are selected', () => {
    assert.deepEqual(facetFilters({}), []);
    assert.deepEqual(facetFilters({ recordType_s: new Set() }), []);
  });
});
