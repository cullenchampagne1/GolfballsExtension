import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAutoProofNames,
  buildProofEmailSubject,
  proofItemLabel,
} from '../../src/lib/submitProofNames.js';

describe('submit proof · generated names', () => {
  it('shortens every gift-set variant to Gift Set', () => {
    assert.equal(
      proofItemLabel('Gift Set - 6 Ball - Wooden Box - Poker Chip'),
      'Gift Set',
    );
    assert.equal(proofItemLabel('Giftset - Accessory - Black Box'), 'Gift Set');
  });

  it('keeps ordinary product names unchanged', () => {
    assert.equal(proofItemLabel('Divot Tools'), 'Divot Tools');
    assert.deepEqual(
      buildAutoProofNames('Acme', ['Ball', 'Divot Tools']),
      ['Acme - Ball', 'Acme - Divot Tools'],
    );
  });

  it('numbers different gift-set variants after shortening them', () => {
    const names = buildAutoProofNames('Acme', [
      'Gift Set - 6 Ball - Wooden Box - Poker Chip',
      'Gift Set - Single Sleeve - Black Box - Lever Divot Tool',
    ]);

    assert.deepEqual(names, ['Acme - Gift Set - 1', 'Acme - Gift Set - 2']);
    assert.ok(names.every((name) => !name.includes('Wooden Box') && !name.includes('Single Sleeve')));
  });

  it('uses the shortened proof names in the Outlook subject', () => {
    const proofNames = buildAutoProofNames('Acme', [
      'Gift Set - 6 Ball - Black Box - Poker Chip',
      'Gift Set - Accessory - Black Box - Poker Chips',
    ]);

    assert.equal(
      buildProofEmailSubject({
        rush: true,
        proofNames,
        orderType: 'Live Order',
        orderValue: 'Under $2k',
        orderId: '12345',
      }),
      'Rush Multi Live Order Under 2k - Acme - Gift Set - 1, Acme - Gift Set - 2 - 12345',
    );
  });
});
