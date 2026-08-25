import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cachedEntityIdFilter,
  cachedMatchSummary,
  cacheRuleTreeStatus,
  combineCrmFilterFq,
  matchesCachedEntity,
  resolveCachedEntityFilter,
} from '../../src/lib/crmCacheQuery.js';

const condition = (ref, op, value = '', extra = {}) => ({
  source: 'schema',
  ref,
  type: 'string',
  op,
  value,
  not: false,
  ...extra,
});

const rules = {
  outerJoiner: 'AND',
  groups: [
    {
      joiner: 'OR',
      conditions: [
        condition('account.name', 'contains', 'acme'),
        condition('account.state', 'is', 'TX'),
      ],
    },
    {
      joiner: 'AND',
      conditions: [condition('orders[any].total', 'gte', '800', { type: 'number' })],
    },
  ],
};

describe('CRM cached-record match-rule queries', () => {
  it('distinguishes an unused cache layer from incomplete and valid rules', () => {
    assert.deepEqual(cacheRuleTreeStatus(null), {
      active: false,
      valid: true,
      count: 0,
      reason: '',
    });
    assert.deepEqual(cacheRuleTreeStatus({
      outerJoiner: 'AND',
      groups: [{ joiner: 'AND', conditions: [condition('', 'contains', '')] }],
    }), {
      active: true,
      valid: false,
      count: 1,
      reason: 'Choose a cached field for every cache condition.',
    });
    assert.deepEqual(cacheRuleTreeStatus({
      outerJoiner: 'AND',
      groups: [{ joiner: 'AND', conditions: [condition('account.name', 'contains', '')] }],
    }), {
      active: true,
      valid: false,
      count: 1,
      reason: 'Enter a value for every cache condition that needs one.',
    });
    assert.deepEqual(cacheRuleTreeStatus({
      outerJoiner: 'AND',
      groups: [{ joiner: 'AND', conditions: [condition('account.name', 'exists')] }],
    }), {
      active: true,
      valid: true,
      count: 1,
      reason: '',
    });
  });

  it('evaluates grouped, quantified, and negated fields on Contact and Account snapshots', async () => {
    const matching = {
      schemaId: 'account',
      entityType: 'account',
      id: '900',
      data: {
        account: { name: 'Acme Golf', state: 'WI' },
        orders: [{ total: 250 }, { total: 1_200 }],
      },
    };
    assert.equal(await matchesCachedEntity(matching, rules), true);
    assert.equal(await matchesCachedEntity({
      ...matching,
      id: '901',
      data: { account: { name: 'Other', state: 'WI' }, orders: [{ total: 1_200 }] },
    }, rules), false);
    assert.equal(await matchesCachedEntity({
      ...matching, schemaId: 'contact', entityType: 'contact', id: '42',
    }, rules), true);
    assert.equal(await matchesCachedEntity({
      ...matching, schemaId: 'order', entityType: 'order', id: '5001',
    }, rules), false);

    const negated = {
      outerJoiner: 'AND',
      groups: [{
        joiner: 'AND',
        conditions: [condition('account.name', 'contains', 'competitor', { not: true })],
      }],
    };
    assert.equal(await matchesCachedEntity(matching, negated), true);
  });

  it('walks the full cache and compiles matching Contact and Account IDs into a Solr filter', async () => {
    const rows = [
      {
        schemaId: 'account', entityType: 'account', id: '900',
        data: { account: { name: 'Acme Golf', state: 'WI' }, orders: [{ total: 900 }] },
      },
      {
        schemaId: 'contact', entityType: 'contact', id: '42',
        data: { account: { name: 'Acme Golf', state: 'TX' }, orders: [{ total: 900 }] },
      },
      {
        schemaId: 'account', entityType: 'account', id: '901',
        data: { account: { name: 'Other', state: 'TX' }, orders: [{ total: 1_000 }] },
      },
    ];
    const calls = [];
    const query = async (request) => {
      calls.push(request);
      const page = rows.slice(request.offset, request.offset + request.limit);
      return { rows: page, matched: rows.length, scanned: page.length };
    };

    const result = await resolveCachedEntityFilter(rules, { query, pageSize: 2 });

    assert.deepEqual(calls, [
      { limit: 2, offset: 0, scanAll: true },
      { limit: 2, offset: 2, scanAll: true },
    ]);
    assert.deepEqual(result.entities, [
      { entityType: 'account', id: '900' },
      { entityType: 'contact', id: '42' },
      { entityType: 'account', id: '901' },
    ]);
    assert.equal(result.matchedRecords, 3);
    assert.deepEqual(result.matchedByType, { contact: 1, account: 2 });
    assert.equal(result.scannedSnapshots, 3);
    assert.equal(result.solrFq, 'id:("account_900" OR "contact_42" OR "account_901")');
  });

  it('uses an impossible filter for zero matches and safely combines filter layers', () => {
    assert.equal(cachedEntityIdFilter([]), 'id:"__gb_no_cached_record_match__"');
    assert.equal(
      cachedEntityIdFilter([
        { entityType: 'contact', id: '4"2' },
        { entityType: 'account', id: '901' },
        { entityType: 'contact', id: '4"2' },
      ]),
      'id:("contact_4\\"2" OR "account_901")',
    );
    assert.equal(combineCrmFilterFq('', 'id:"account_900"'), 'id:"account_900"');
    assert.equal(combineCrmFilterFq('recordType_s:"Account"', ''), 'recordType_s:"Account"');
    assert.equal(
      combineCrmFilterFq('recordType_s:"Account"', 'id:"account_900"'),
      '(recordType_s:"Account") AND (id:"account_900")',
    );
  });

  it('uses Solr terms lookup instead of thousands of Boolean clauses for a large cache match', () => {
    const entities = Array.from({ length: 7_005 }, (_, index) => ({
      entityType: 'contact', id: String(index + 1),
    }));
    const filter = cachedEntityIdFilter(entities);

    assert.match(filter, /^\{!terms f=id\}contact_1,contact_2,/);
    assert.match(filter, /,contact_7005$/);
    assert.doesNotMatch(filter, / OR /);
  });

  it('evaluates items contains across more than 7,000 cached Contacts', async () => {
    const rows = Array.from({ length: 7_005 }, (_, index) => ({
      schemaId: 'contact',
      entityType: 'contact',
      id: String(index + 1),
      data: {
        items: index >= 7_000
          ? [{ name: 'Golf Balls' }, { name: 'Tees' }]
          : [{ name: 'Apparel' }],
      },
    }));
    const calls = [];
    const query = async (request) => {
      calls.push(request);
      return {
        rows: rows.slice(request.offset, request.offset + request.limit),
        matched: rows.length,
      };
    };
    const itemRules = {
      outerJoiner: 'AND',
      groups: [{
        joiner: 'AND',
        conditions: [condition('items[any].name', 'contains', 'Golf Balls')],
      }],
    };

    const result = await resolveCachedEntityFilter(itemRules, { query });

    assert.equal(calls.length, 15);
    assert.equal(calls.at(-1).offset, 7_000);
    assert.ok(calls.every((call) => call.limit === 500 && call.scanAll === true));
    assert.equal(result.scannedSnapshots, 7_005);
    assert.deepEqual(result.entities, [
      { entityType: 'contact', id: '7001' },
      { entityType: 'contact', id: '7002' },
      { entityType: 'contact', id: '7003' },
      { entityType: 'contact', id: '7004' },
      { entityType: 'contact', id: '7005' },
    ]);
    assert.deepEqual(result.matchedByType, { contact: 5, account: 0 });
    assert.equal(cachedMatchSummary(result), '5 cached contacts matched');
  });
});
