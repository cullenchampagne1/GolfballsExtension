/**
 * Parameterised `open` — per-target parameter validation.
 *
 * Open parameters ride in the envelope's `options` array as key=value tokens,
 * so nothing arbitrary reaches a modal: an unknown key, a duplicate, or a value
 * that fails its rule is rejected exactly like a bad setting. These pin that
 * containment against the exact rules the executor uses.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_PARAM_RULES, planOpenParams, targetAcceptsOpenParams,
} from '../../src/lib/openParamRules.js';

const rules = (target) => OPEN_PARAM_RULES[target];

describe('open params · crm_search', () => {
  it('accepts a query and an enum type', () => {
    assert.deepEqual(
      planOpenParams(rules('crm_search'), ['query=acme corp', 'type=account']),
      { query: 'acme corp', type: 'account' },
    );
  });

  it('keeps a compiled solr filter verbatim, splitting on the first =', () => {
    const { filter } = planOpenParams(rules('crm_search'), ['filter=recordType_s:Account']);
    assert.equal(filter, 'recordType_s:Account');
  });

  it('rejects an out-of-range enum value', () => {
    assert.throws(() => planOpenParams(rules('crm_search'), ['type=customer']),
      /not an allowed value/);
  });

  it('rejects an unknown parameter', () => {
    assert.throws(() => planOpenParams(rules('crm_search'), ['limit=10']),
      /Unknown open parameter "limit"/);
  });

  it('rejects a duplicate parameter', () => {
    assert.throws(() => planOpenParams(rules('crm_search'), ['query=a', 'query=b']),
      /Duplicate open parameter "query"/);
  });

  it('rejects a token that is not key=value', () => {
    assert.throws(() => planOpenParams(rules('crm_search'), ['acme']),
      /must be key=value pairs/);
    assert.throws(() => planOpenParams(rules('crm_search'), ['=acme']),
      /must be key=value pairs/);
  });

  it('rejects an empty string value', () => {
    assert.throws(() => planOpenParams(rules('crm_search'), ['query=   ']),
      /is empty/);
  });
});

describe('open params · task_list', () => {
  it('accepts the filter/status/priority enums including the empty priority', () => {
    assert.deepEqual(
      planOpenParams(rules('task_list'), ['filter=urgent', 'status=new', 'priority=']),
      { filter: 'urgent', status: 'new', priority: '' },
    );
  });

  it('rejects a bad status', () => {
    assert.throws(() => planOpenParams(rules('task_list'), ['status=archived']),
      /not an allowed value/);
  });
});

describe('open params · image_preview', () => {
  it('accepts a direct https image URL and numeric ids', () => {
    assert.deepEqual(
      planOpenParams(rules('image_preview'), [
        'url=https://cdn.example.com/logo.png', 'order_id=12345', 'customer_id=987',
      ]),
      {
        url: 'https://cdn.example.com/logo.png',
        order_id: '12345',
        customer_id: '987',
      },
    );
  });

  it('rejects a non-https or non-image URL', () => {
    const insecureUrl = ['http:', '//x/y.png'].join('');
    assert.throws(() => planOpenParams(rules('image_preview'), [`url=${insecureUrl}`]),
      /direct https image URL/);
    assert.throws(() => planOpenParams(rules('image_preview'), ['url=https://x/y.pdf']),
      /direct https image URL/);
    assert.throws(() => planOpenParams(rules('image_preview'), ['url=https://user:pw@x/y.png']),
      /direct https image URL/);
  });

  it('rejects a non-numeric id', () => {
    assert.throws(() => planOpenParams(rules('image_preview'), ['order_id=abc']),
      /must be a numeric id/);
    assert.throws(() => planOpenParams(rules('image_preview'), ['order_id=123456789012345']),
      /must be a numeric id/);
  });
});

describe('open params · mockup_studio', () => {
  it('accepts a well-formed batch id', () => {
    const id = `batch_${'a'.repeat(32)}`;
    assert.deepEqual(planOpenParams(rules('mockup_studio'), [`batch_id=${id}`]), { batch_id: id });
  });

  it('rejects a malformed batch id', () => {
    assert.throws(() => planOpenParams(rules('mockup_studio'), ['batch_id=batch_xyz']),
      /is malformed/);
  });
});

describe('open params · ambient composer verbs', () => {
  it('accepts a subject to prefill the task composer', () => {
    assert.deepEqual(
      planOpenParams(rules('quick_task'), ['subject=Follow up on the pricing quote']),
      { subject: 'Follow up on the pricing quote' },
    );
  });

  it('accepts a subject to prefill the call composer', () => {
    assert.deepEqual(
      planOpenParams(rules('call_log'), ['subject=Left voicemail about reorder']),
      { subject: 'Left voicemail about reorder' },
    );
  });

  it('rejects a content field the composer keeps for the rep (category/priority)', () => {
    assert.throws(() => planOpenParams(rules('quick_task'), ['priority=high']),
      /Unknown open parameter "priority"/);
    assert.throws(() => planOpenParams(rules('call_log'), ['category=Sales']),
      /Unknown open parameter "category"/);
  });

  it('opens with no prefill when no subject is given', () => {
    assert.deepEqual(planOpenParams(rules('quick_task'), []), {});
  });
});

describe('open params · shape & guards', () => {
  it('returns empty params for no tokens or no rules', () => {
    assert.deepEqual(planOpenParams(rules('margin_calc'), []), {});
    assert.deepEqual(planOpenParams(undefined, ['query=x']), {});
    assert.deepEqual(planOpenParams(rules('crm_search'), []), {});
  });

  it('reports which targets accept parameters', () => {
    for (const target of ['crm_search', 'task_list', 'image_preview', 'mockup_studio',
      'gift_catalog', 'watch_list', 'margin_calc', 'quick_task', 'call_log']) {
      assert.equal(targetAcceptsOpenParams(target), true, `${target} should accept params`);
    }
    // Parameterless targets are absent from the rules and take no arguments.
    assert.equal(targetAcceptsOpenParams('notifications'), false);
    assert.equal(targetAcceptsOpenParams('quick_order_note'), false);
    assert.equal(targetAcceptsOpenParams(''), false);
  });

  it('every rules target names only known value types', () => {
    const known = new Set(['string', 'enum', 'id', 'pattern', 'https_image']);
    for (const [target, fields] of Object.entries(OPEN_PARAM_RULES)) {
      for (const [key, rule] of Object.entries(fields)) {
        assert.ok(known.has(rule.type), `${target}.${key} has unknown type ${rule.type}`);
      }
    }
  });
});
