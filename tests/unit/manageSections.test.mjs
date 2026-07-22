import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowManagedSection } from '../../src/lib/manageSections.js';

describe('Settings managed-section visibility', () => {
  it('keeps Product Stores absent while loading or when no stores are shared', () => {
    assert.equal(shouldShowManagedSection([], true), false);
    assert.equal(shouldShowManagedSection([], false), false);
    assert.equal(shouldShowManagedSection(null, false), false);
  });

  it('shows Product Stores as soon as an active shared store exists', () => {
    assert.equal(shouldShowManagedSection([{ id: 'store-1' }], false), true);
  });
});
