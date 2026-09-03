/**
 * Unit tests — src/lib/matchEngine.js
 *
 * Pure module (no DOM/chrome), so a plain static import works. Covers every
 * operator family in applyOp (presence, boolean, collection, numeric, date,
 * string) with matching AND non-matching fixtures, coercion edges, plus the
 * tree-walk helpers and the async evalTree joiner semantics.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOp,
  OPS_BY_TYPE,
  isValuelessOp,
  treeUsesVars,
  isGroupedTree,
  varsReferenced,
  evalTree,
  evalTreeDetailed,
} from '../../src/lib/matchEngine.js';

const DAY = 864e5;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

describe('applyOp — presence & boolean ops', () => {
  it('exists passes on a non-blank string and fails on whitespace/null', () => {
    assert.equal(applyOp('exists', 'hello'), true);
    assert.equal(applyOp('exists', '   '), false);
    assert.equal(applyOp('exists', null), false);
  });

  it('notExists is the inverse of exists, including for empty arrays', () => {
    assert.equal(applyOp('notExists', undefined), true);
    assert.equal(applyOp('notExists', []), true);
    assert.equal(applyOp('notExists', ['x']), false);
  });

  it('isEmpty / notEmpty run even when the value is missing', () => {
    assert.equal(applyOp('isEmpty', null), true);
    assert.equal(applyOp('isEmpty', 'x'), false);
    assert.equal(applyOp('notEmpty', 'x'), true);
    assert.equal(applyOp('notEmpty', ''), false);
  });

  it('isTrue accepts true, 1, "yes", "TRUE" and rejects "no"', () => {
    assert.equal(applyOp('isTrue', true), true);
    assert.equal(applyOp('isTrue', 1), true);
    assert.equal(applyOp('isTrue', 'yes'), true);
    assert.equal(applyOp('isTrue', 'TRUE'), true);
    assert.equal(applyOp('isTrue', 'no'), false);
  });

  it('isFalse rejects truthy spellings and accepts 0 / "no" / undefined', () => {
    assert.equal(applyOp('isFalse', 'true'), false);
    assert.equal(applyOp('isFalse', 0), true);
    assert.equal(applyOp('isFalse', 'no'), true);
    assert.equal(applyOp('isFalse', undefined), true);
  });

  it('every non-presence operator fails on a missing value', () => {
    assert.equal(applyOp('contains', null, 'x'), false);
    assert.equal(applyOp('eq', undefined, '5'), false);
    assert.equal(applyOp('before', null, '2024-01-01'), false);
    assert.equal(applyOp('matchesRegex', '', '.*'), false); // blank string is not present
  });
});

describe('applyOp — collection ops', () => {
  it('lengthGte counts array items and string characters', () => {
    assert.equal(applyOp('lengthGte', ['a', 'b', 'c'], '3'), true);
    assert.equal(applyOp('lengthGte', ['a', 'b'], '3'), false);
    assert.equal(applyOp('lengthGte', 'abcd', '4'), true);
  });

  it('lengthLte counts object keys and fails on a non-numeric bound', () => {
    assert.equal(applyOp('lengthLte', { a: 1, b: 2 }, '2'), true);
    assert.equal(applyOp('lengthLte', { a: 1, b: 2, c: 3 }, '2'), false);
    assert.equal(applyOp('lengthGte', ['a'], 'lots'), false);
  });

  it('hasKey matches own keys of plain objects only (not arrays)', () => {
    assert.equal(applyOp('hasKey', { total: 12 }, 'total'), true);
    assert.equal(applyOp('hasKey', { total: 12 }, 'missing'), false);
    assert.equal(applyOp('hasKey', ['total'], 'total'), false);
  });
});

describe('applyOp — numeric ops with coercion', () => {
  it('eq coerces currency-formatted strings before comparing', () => {
    assert.equal(applyOp('eq', '$1,500.00', '1500'), true);
    assert.equal(applyOp('eq', '$1,500.00', '1501'), false);
  });

  it('eq / ne fall back to case-insensitive string compare when non-numeric', () => {
    assert.equal(applyOp('eq', 'Pending', 'pending'), true);
    assert.equal(applyOp('eq', 'Pending', 'shipped'), false);
    assert.equal(applyOp('ne', 'Pending', 'shipped'), true);
    assert.equal(applyOp('ne', '5', '5.00'), false); // numeric path: equal
  });

  it('gt is strict while gte admits equality', () => {
    assert.equal(applyOp('gt', '10', '10'), false);
    assert.equal(applyOp('gte', '10', '10'), true);
    assert.equal(applyOp('gt', '10.5', '10'), true);
  });

  it('lt / lte compare parsed currency values', () => {
    assert.equal(applyOp('lt', '$99.99', '100'), true);
    assert.equal(applyOp('lte', '100', '$99.99'), false);
  });

  it('ordering ops (not eq/ne) fail when either side is non-numeric', () => {
    assert.equal(applyOp('gt', 'abc', '5'), false);
    assert.equal(applyOp('lte', '5', 'abc'), false);
  });
});

describe('applyOp — date ops', () => {
  it('before / after compare parseable dates', () => {
    assert.equal(applyOp('before', '2020-06-15', '2021-01-01'), true);
    assert.equal(applyOp('before', '2022-06-15', '2021-01-01'), false);
    assert.equal(applyOp('after', '2022-06-15', '2021-01-01'), true);
    assert.equal(applyOp('after', '2020-06-15', '2021-01-01'), false);
  });

  it('before / after fail when the compare value is not a date', () => {
    assert.equal(applyOp('before', '2020-06-15', 'not a date'), false);
    assert.equal(applyOp('after', '2020-06-15', ''), false);
  });

  it('beforeToday / afterToday compare against local midnight', () => {
    assert.equal(applyOp('beforeToday', '2000-01-02'), true);
    assert.equal(applyOp('afterToday', '2999-01-02'), true);
    assert.equal(applyOp('afterToday', '2000-01-02'), false);
  });

  it('relBefore "30:days" means strictly older than 30 days', () => {
    assert.equal(applyOp('relBefore', daysAgo(60), '30:days'), true);
    assert.equal(applyOp('relBefore', daysAgo(5), '30:days'), false);
  });

  it('relAfter "30:days" means within the last 30 days', () => {
    assert.equal(applyOp('relAfter', daysAgo(5), '30:days'), true);
    assert.equal(applyOp('relAfter', daysAgo(60), '30:days'), false);
  });

  it('an unparseable raw date fails every date op', () => {
    assert.equal(applyOp('before', 'yesterday-ish', '2021-01-01'), false);
    assert.equal(applyOp('relAfter', 'yesterday-ish', '30:days'), false);
  });
});

describe('applyOp — string ops', () => {
  it('contains is a case-insensitive substring test on strings', () => {
    assert.equal(applyOp('contains', 'Golf Balls Corp', 'balls'), true);
    assert.equal(applyOp('contains', 'Golf Balls Corp', 'tees'), false);
  });

  it('contains on an array tests exact (case-insensitive) membership, not substrings', () => {
    assert.equal(applyOp('contains', ['Red', 'Blue'], 'red'), true);
    assert.equal(applyOp('contains', ['Red', 'Blue'], 'ed'), false);
  });

  it('notContains inverts both the string and array forms', () => {
    assert.equal(applyOp('notContains', 'Golf Balls', 'tees'), true);
    assert.equal(applyOp('notContains', ['Red'], 'Red'), false);
  });

  it('is / equals compare full strings case-insensitively', () => {
    assert.equal(applyOp('is', 'Shipped', 'shipped'), true);
    assert.equal(applyOp('equals', 'Shipped', 'ship'), false);
  });

  it('startsWith / endsWith compare case-insensitively', () => {
    assert.equal(applyOp('startsWith', 'Order #123', 'order'), true);
    assert.equal(applyOp('endsWith', 'Order #123', '#123'), true);
    assert.equal(applyOp('endsWith', 'Order #123', '#124'), false);
  });

  it('normalizes op spelling: starts_with, startsWith and STARTSWITH are one op', () => {
    assert.equal(applyOp('starts_with', 'Titleist', 'title'), true);
    assert.equal(applyOp('STARTSWITH', 'Titleist', 'title'), true);
    assert.equal(applyOp('starts with', 'Titleist', 'title'), true);
  });

  it('matchesRegex tests case-insensitively and an invalid pattern is false', () => {
    assert.equal(applyOp('matchesRegex', 'HELLO-42', 'hel+o-\\d+'), true);
    assert.equal(applyOp('matchesRegex', 'HELLO-42', '^\\d+$'), false);
    assert.equal(applyOp('matchesRegex', 'HELLO-42', '('), false);
  });

  it('an unknown operator never matches', () => {
    assert.equal(applyOp('zzz', 'value', 'value'), false);
  });
});

describe('OPS_BY_TYPE', () => {
  it('offers string/number/date op lists and flags the valueless ones', () => {
    assert.deepEqual(Object.keys(OPS_BY_TYPE), ['string', 'number', 'date']);
    const stringIds = OPS_BY_TYPE.string.map((o) => o.id);
    assert.deepEqual(stringIds, ['is', 'contains', 'notContains', 'startsWith', 'endsWith', 'matchesRegex', 'exists', 'notExists']);
    const valueless = OPS_BY_TYPE.number.filter((o) => o.valueless).map((o) => o.id);
    assert.deepEqual(valueless, ['exists', 'notExists']);
  });
});

describe('isValuelessOp', () => {
  it('recognizes canonical ids and normalized spellings', () => {
    assert.equal(isValuelessOp('exists'), true);
    assert.equal(isValuelessOp('notExists'), true);
    assert.equal(isValuelessOp('not_exists'), true);
    assert.equal(isValuelessOp('IS_EMPTY'), true);
  });

  it('rejects value-bearing operators', () => {
    assert.equal(isValuelessOp('contains'), false);
    assert.equal(isValuelessOp('gte'), false);
  });
});

describe('tree-walk helpers on nested group trees', () => {
  const varTree = {
    outerJoiner: 'OR',
    groups: [
      { joiner: 'AND', conditions: [{ source: 'schema', ref: 'order.total', op: 'gt', value: '100' }] },
      { joiner: 'OR',  conditions: [
        { source: 'var', ref: 'accountTier', op: 'is', value: 'gold' },
        { source: 'var', ref: 'accountTier', op: 'is', value: 'silver' },
        { source: 'var', ref: 'lastOrderDate', op: 'beforeToday', value: '' },
      ] },
    ],
  };

  it('treeUsesVars finds a var condition buried in a later group', () => {
    assert.equal(treeUsesVars(varTree), true);
  });

  it('treeUsesVars is false for schema-only trees and non-trees', () => {
    const schemaOnly = { outerJoiner: 'AND', groups: [{ joiner: 'AND', conditions: [{ source: 'schema', ref: 'a', op: 'is', value: 'b' }] }] };
    assert.equal(treeUsesVars(schemaOnly), false);
    assert.equal(treeUsesVars(null), false);
    assert.equal(treeUsesVars({ groups: 'nope' }), false);
  });

  it('varsReferenced returns each variable name once, in first-seen order', () => {
    assert.deepEqual(varsReferenced(varTree), ['accountTier', 'lastOrderDate']);
    assert.deepEqual(varsReferenced({ groups: [] }), []);
  });

  it('isGroupedTree accepts a groups object and rejects legacy flat arrays', () => {
    assert.equal(isGroupedTree(varTree), true);
    assert.equal(isGroupedTree({ outerJoiner: 'AND', groups: [] }), true);
    assert.equal(isGroupedTree([{ field: 'subject', op: 'contains', value: 'x' }]), false);
    assert.equal(isGroupedTree(null), false);
    assert.equal(isGroupedTree({}), false);
  });
});

describe('evalTree', () => {
  const data = { status: 'Shipped', total: '150', carrier: 'UPS' };
  const getValue = (c) => data[c.ref];
  const cond = (ref, op, value, not = false) => ({ source: 'schema', ref, op, value, not });

  it('AND group fails when one condition fails', async () => {
    const tree = { outerJoiner: 'AND', groups: [{ joiner: 'AND', conditions: [cond('status', 'is', 'Shipped'), cond('total', 'gt', '200')] }] };
    assert.equal(await evalTree(tree, getValue), false);
  });

  it('OR group passes on the first matching condition', async () => {
    const tree = { outerJoiner: 'AND', groups: [{ joiner: 'OR', conditions: [cond('total', 'gt', '200'), cond('carrier', 'is', 'ups')] }] };
    assert.equal(await evalTree(tree, getValue), true);
  });

  it('the not flag inverts a single condition result', async () => {
    const tree = { outerJoiner: 'AND', groups: [{ joiner: 'AND', conditions: [cond('status', 'is', 'Shipped', true)] }] };
    assert.equal(await evalTree(tree, getValue), false);
  });

  it('an empty tree evaluates to true (no constraint unsatisfied)', async () => {
    assert.equal(await evalTree({ outerJoiner: 'AND', groups: [] }, getValue), true);
    assert.equal(await evalTree(null, getValue), true);
  });

  it('outerJoiner OR needs only one passing group', async () => {
    const tree = {
      outerJoiner: 'OR',
      groups: [
        { joiner: 'AND', conditions: [cond('total', 'gt', '999')] },
        { joiner: 'AND', conditions: [cond('status', 'startsWith', 'ship')] },
      ],
    };
    assert.equal(await evalTree(tree, getValue), true);
  });
});

describe('evalTreeDetailed', () => {
  const data = { status: 'Shipped', total: '150', carrier: 'UPS' };
  const getValue = (c) => data[c.ref];
  const cond = (ref, op, value, not = false) => ({ source: 'schema', ref, op, value, not });

  it('reports the failing condition inside a failing AND group, without short-circuiting', async () => {
    const tree = { outerJoiner: 'AND', groups: [{ joiner: 'AND', conditions: [cond('status', 'is', 'Shipped'), cond('total', 'gt', '200')] }] };
    const detail = await evalTreeDetailed(tree, getValue);
    assert.equal(detail.result, false);
    assert.equal(detail.groups.length, 1);
    assert.equal(detail.groups[0].joiner, 'AND');
    assert.equal(detail.groups[0].result, false);
    assert.deepEqual(detail.groups[0].conditions.map((c) => c.result), [true, false]);
  });

  it('reports which condition in an OR group actually passed', async () => {
    const tree = { outerJoiner: 'AND', groups: [{ joiner: 'OR', conditions: [cond('total', 'gt', '999'), cond('carrier', 'is', 'ups')] }] };
    const detail = await evalTreeDetailed(tree, getValue);
    assert.equal(detail.result, true);
    assert.deepEqual(detail.groups[0].conditions.map((c) => c.result), [false, true]);
  });

  it('reports per-group results under an OR outerJoiner, including the group that failed', async () => {
    const tree = {
      outerJoiner: 'OR',
      groups: [
        { joiner: 'AND', conditions: [cond('total', 'gt', '999')] },
        { joiner: 'AND', conditions: [cond('status', 'startsWith', 'ship')] },
      ],
    };
    const detail = await evalTreeDetailed(tree, getValue);
    assert.equal(detail.result, true);
    assert.equal(detail.outerJoiner, 'OR');
    assert.deepEqual(detail.groups.map((g) => g.result), [false, true]);
  });

  it('an empty tree evaluates to true with no groups', async () => {
    const detail = await evalTreeDetailed({ outerJoiner: 'AND', groups: [] }, getValue);
    assert.deepEqual(detail, { outerJoiner: 'AND', result: true, groups: [] });
    assert.deepEqual(await evalTreeDetailed(null, getValue), { outerJoiner: 'AND', result: true, groups: [] });
  });

  it('agrees with evalTree\'s flattened result across mixed AND/OR trees', async () => {
    const tree = {
      outerJoiner: 'OR',
      groups: [
        { joiner: 'OR', conditions: [cond('total', 'gt', '999'), cond('carrier', 'is', 'fedex')] },
        { joiner: 'AND', conditions: [cond('status', 'is', 'Shipped'), cond('carrier', 'is', 'UPS')] },
      ],
    };
    const [flat, detailed] = await Promise.all([evalTree(tree, getValue), evalTreeDetailed(tree, getValue)]);
    assert.equal(detailed.result, flat);
  });
});
