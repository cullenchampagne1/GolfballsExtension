import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  attachCachedPageEngineSnapshots,
  cachedSnapshotForContact,
  pageEngineIdentity,
  pageEngineIdentityForContact,
} from '../../src/lib/page-engine/cache-actions.js';

const contactSnapshot = {
  schemaId: 'contact',
  entityType: 'contact',
  id: '42',
  indexedAt: 123,
  data: { ids: { contact: '42' }, contact: { firstName: 'Ada' } },
};
const accountSnapshot = {
  schemaId: 'account',
  entityType: 'account',
  id: '17',
  indexedAt: 456,
  data: { ids: { account: '17' }, account: { name: 'Babbage Works' } },
};

describe('Page Engine cache actions · CRM audience lookup', () => {
  it('normalizes only supported, non-empty Page Engine identities', () => {
    assert.deepEqual(pageEngineIdentity('CONTACT', 42), { schemaId: 'contact', id: '42' });
    assert.equal(pageEngineIdentity('order', '90'), null);
    assert.equal(pageEngineIdentity('contact', ''), null);
    assert.deepEqual(pageEngineIdentityForContact({
      contactUrl: '/Default.aspx?Page=240&customerID=42',
      contactId: '42',
    }), { schemaId: 'contact', id: '42' });
  });

  it('queries contact and account snapshots separately and attaches only exact hits', async () => {
    const calls = [];
    const query = async (input) => {
      calls.push(input);
      const schema = input.where[0].value;
      return { rows: schema === 'contact' ? [contactSnapshot] : [accountSnapshot] };
    };
    const source = [
      { contactId: 'row-contact', pageEngineIdentity: { schemaId: 'contact', id: '42' } },
      { contactId: 'row-account', pageEngineIdentity: { schemaId: 'account', id: '17' } },
      { contactId: 'row-missing', pageEngineIdentity: { schemaId: 'contact', id: '99' } },
    ];

    const result = await attachCachedPageEngineSnapshots(source, { query });

    assert.equal(result.available, 2);
    assert.equal(result.requested, 3);
    assert.equal(result.contacts[0].pageEngineSnapshot, contactSnapshot);
    assert.equal(result.contacts[1].pageEngineSnapshot, accountSnapshot);
    assert.equal('pageEngineSnapshot' in result.contacts[2], false);
    assert.deepEqual(calls.map((call) => call.where[0].value), ['contact', 'account']);
    assert.deepEqual(calls[0].where[1], {
      path: '__index.recordId', op: 'in', value: ['42', '99'],
    });
  });

  it('rejects a mismatched attached snapshot before an action consumes it', () => {
    const contact = {
      pageEngineIdentity: { schemaId: 'contact', id: '42' },
      pageEngineSnapshot: accountSnapshot,
    };
    assert.equal(cachedSnapshotForContact(contact), null);
    assert.equal(cachedSnapshotForContact({
      ...contact,
      pageEngineSnapshot: contactSnapshot,
    }), contactSnapshot);
  });
});
