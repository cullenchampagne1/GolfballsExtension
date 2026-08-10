import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  cacheRuleTreeStatus,
  cachedAccountIdFilter,
  combineCrmFilterFq,
  matchesCachedAccount,
  resolveCachedAccountFilter,
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

describe('CRM cached-account match-rule queries', () => {
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

  it('evaluates grouped, quantified, and negated fields only on account snapshots', async () => {
    const matching = {
      schemaId: 'account',
      entityType: 'account',
      id: '900',
      data: {
        account: { name: 'Acme Golf', state: 'WI' },
        orders: [{ total: 250 }, { total: 1_200 }],
      },
    };
    assert.equal(await matchesCachedAccount(matching, rules), true);
    assert.equal(await matchesCachedAccount({
      ...matching,
      id: '901',
      data: { account: { name: 'Other', state: 'WI' }, orders: [{ total: 1_200 }] },
    }, rules), false);
    assert.equal(await matchesCachedAccount({ ...matching, schemaId: 'contact', entityType: 'contact' }, rules), false);

    const negated = {
      outerJoiner: 'AND',
      groups: [{
        joiner: 'AND',
        conditions: [condition('account.name', 'contains', 'competitor', { not: true })],
      }],
    };
    assert.equal(await matchesCachedAccount(matching, negated), true);
  });

  it('walks the full cache and compiles matching account IDs into a Solr filter', async () => {
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

    const result = await resolveCachedAccountFilter(rules, { query, pageSize: 2 });

    assert.deepEqual(calls, [
      { limit: 2, offset: 0, scanAll: true },
      { limit: 2, offset: 2, scanAll: true },
    ]);
    assert.deepEqual(result.accountIds, ['900', '901']);
    assert.equal(result.matchedAccounts, 2);
    assert.equal(result.scannedSnapshots, 3);
    assert.equal(result.solrFq, 'id:("account_900" OR "account_901")');
  });

  it('uses an impossible filter for zero matches and safely combines filter layers', () => {
    assert.equal(cachedAccountIdFilter([]), 'id:"__gb_no_cached_account_match__"');
    assert.equal(
      cachedAccountIdFilter(['90"0', '901']),
      'id:("account_90\\"0" OR "account_901")',
    );
    assert.equal(combineCrmFilterFq('', 'id:"account_900"'), 'id:"account_900"');
    assert.equal(combineCrmFilterFq('recordType_s:"Account"', ''), 'recordType_s:"Account"');
    assert.equal(
      combineCrmFilterFq('recordType_s:"Account"', 'id:"account_900"'),
      '(recordType_s:"Account") AND (id:"account_900")',
    );
  });
});
