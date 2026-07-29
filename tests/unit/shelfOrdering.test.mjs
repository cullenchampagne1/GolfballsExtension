/**
 * Shelf ordering: user-authored custom actions (weight 100) must sort AFTER
 * built-in feature actions (default weight 0) within every section, so a
 * page-scoped custom action never takes slot 1/2 ahead of the real features.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { actionRegistry, getContextualActions } from '../../src/lib/actionRegistry.js';

beforeEach(() => {
  actionRegistry.clear();
  actionRegistry.setPage('contact');
});

describe('actionRegistry · custom actions sort after built-ins', () => {
  it('orders a page-smart section built-ins first, custom (weight 100) last', () => {
    // Register the custom action FIRST to prove ordering is by weight, not
    // insertion order.
    actionRegistry.register({ id: 'custom-x', label: 'My Custom', smartFor: ['contact'], weight: 100, handler() {} });
    actionRegistry.register({ id: 'builtin-a', label: 'Call', smartFor: ['contact'], handler() {} });
    actionRegistry.register({ id: 'builtin-b', label: 'Task', smartFor: ['contact'], handler() {} });

    const { pageSmart } = getContextualActions();
    assert.deepEqual(pageSmart.map((a) => a.id), ['builtin-a', 'builtin-b', 'custom-x']);
  });

  it('keeps registration order among equal-weight built-ins (stable sort)', () => {
    actionRegistry.register({ id: 'first', label: 'First', handler() {} });
    actionRegistry.register({ id: 'second', label: 'Second', handler() {} });
    actionRegistry.register({ id: 'z-custom', label: 'Custom', weight: 100, handler() {} });

    const { page } = getContextualActions();   // no smartFor → "Page actions" bucket
    assert.deepEqual(page.map((a) => a.id), ['first', 'second', 'z-custom']);
  });
});
