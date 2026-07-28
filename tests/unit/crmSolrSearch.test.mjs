import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSolrQ, buildSolrBody } from '../../src/lib/crmSolrSearch.js';

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
  });

  it('without a term, sorts by the chosen column only (no score)', () => {
    const b = buildSolrBody({ query: '', sortKey: 'yearToDateRevenue_f', sortDir: 'desc' });
    assert.match(b, new RegExp('sort=' + encodeURIComponent('yearToDateRevenue_f desc')));
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
});
