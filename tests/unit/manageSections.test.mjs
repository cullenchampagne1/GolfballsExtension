import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  retainManagedRowsOnFailure,
  settingsJsonFallbackMessage,
  shouldShowManagedSection,
} from '../../src/lib/manageSections.js';

describe('Settings managed-section visibility', () => {
  it('keeps Product Stores absent while loading or when no stores are shared', () => {
    assert.equal(shouldShowManagedSection([], true), false);
    assert.equal(shouldShowManagedSection([], false), false);
    assert.equal(shouldShowManagedSection(null, false), false);
  });

  it('shows Product Stores as soon as an active shared store exists', () => {
    assert.equal(shouldShowManagedSection([{ id: 'store-1' }], false), true);
  });

  it('retains the last usable remote rows when a refresh cannot reach the network', () => {
    const rows = [{ id: 'share-1' }, { id: 'share-2' }];
    assert.equal(retainManagedRowsOnFailure(rows), rows);
    assert.deepEqual(retainManagedRowsOnFailure(null), []);
  });

  it('describes the JSON fallback without exposing backend availability', () => {
    const message = settingsJsonFallbackMessage('  David settings  ');
    assert.equal(
      message,
      'Downloaded "David settings" as a JSON settings template',
    );
    assert.doesNotMatch(message, /server|cloudflare|network|offline/i);
  });
});
