/**
 * Proposal stores — share saved proposals via the backend, mirroring the
 * custom-items product-store workflow. Tests the pure transport pieces
 * (normalize / build / parse); the backend link path is a thin
 * sendBackgroundMessage wrapper over the same /product-stores endpoint.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeProposalEntry, buildProposalStoreFile, parseProposalStoreFile,
  PROPOSAL_STORE_FILE_KIND, PROPOSAL_STORE_FILE_VERSION,
} from '../../src/lib/saveProposal.js';

const entry = () => ({
  id: 'prop-abc123',
  name: 'Fall gift picks',
  date: '2026-07-30',
  promotion: { promo: 'BUY12GET4FREE', promoType: 'FREE_QUANTITY' },
  lines: [{
    product: { id: 'P00WSY', title: 'Z-Star 8' },
    decoration: { engine: 'ballLogo' },
    variant: null,
    free: false,
    freeValue: null,
    splits: [{ qty: 12, price: 57.99 }],
  }],
});

describe('proposal store · normalize', () => {
  it('allowlists a saved-proposal entry to the persisted shape', () => {
    const n = normalizeProposalEntry({ ...entry(), junk: 'x', lines: [{ ...entry().lines[0], junk: 1 }] });
    assert.deepEqual(Object.keys(n).sort(), ['date', 'id', 'lines', 'name', 'promotion']);
    assert.equal(n.lines[0].junk, undefined, 'unknown line fields are dropped');
    assert.deepEqual(n.lines[0].splits, [{ qty: 12, price: 57.99 }]);
  });

  it('drops a promotion object with no promo and coerces split numbers', () => {
    const n = normalizeProposalEntry({ lines: [{ splits: [{ qty: '6', price: '10.5' }] }], promotion: { x: 1 } });
    assert.equal(n.promotion, null);
    assert.deepEqual(n.lines[0].splits, [{ qty: 6, price: 10.5 }]);
    assert.match(n.id, /^prop-/); // missing id gets a fresh one
    assert.equal(n.name, 'Untitled draft');
  });
});

describe('proposal store · file transport', () => {
  it('build → parse round-trips the entries under a versioned envelope', () => {
    const file = buildProposalStoreFile('Set A', [entry()]);
    assert.equal(file.kind, PROPOSAL_STORE_FILE_KIND);
    assert.equal(file.schemaVersion, PROPOSAL_STORE_FILE_VERSION);
    const parsed = parseProposalStoreFile(JSON.stringify(file));
    assert.equal(parsed.name, 'Set A');
    assert.equal(parsed.items.length, 1);
    assert.equal(parsed.items[0].id, 'prop-abc123');
    assert.deepEqual(parsed.items[0].lines[0].splits, [{ qty: 12, price: 57.99 }]);
  });

  it('rejects a non-proposal envelope (e.g. a product store) and bad input', () => {
    assert.throws(() => parseProposalStoreFile('not json'), /valid JSON/);
    assert.throws(() => parseProposalStoreFile(JSON.stringify({ kind: 'golfballs-product-store', schemaVersion: 1, name: 'x', items: [{ id: '1' }] })), /not a versioned Golfballs proposal store/);
    // Right kind but items aren't proposals (no `lines`) → rejected.
    assert.throws(
      () => parseProposalStoreFile(JSON.stringify({ kind: PROPOSAL_STORE_FILE_KIND, schemaVersion: 1, name: 'x', items: [{ id: '1', sku: 'ABC' }] })),
      /no proposals/,
    );
  });

  it('requires a name and at least one proposal to build', () => {
    assert.throws(() => buildProposalStoreFile('', [entry()]), /name is required/);
    assert.throws(() => buildProposalStoreFile('Set', []), /at least one/);
  });
});
