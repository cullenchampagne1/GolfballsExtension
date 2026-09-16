import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contactEmailSuppressionReason,
  shouldSuppressContactEmail,
} from '../../src/lib/contactEmailSuppression.js';

describe('contact email suppression', () => {
  it('retains the existing do-not-contact checks for names and addresses', () => {
    assert.equal(contactEmailSuppressionReason({ name: 'DO NOT CONTACT - Jane' }), 'Do not contact');
    assert.equal(contactEmailSuppressionReason({ email: 'dnc@example.com' }), 'Do not contact');
  });

  it('recognizes unsafe statuses in CRM contact context', () => {
    const examples = [
      ['Mailbox undeliverable after two attempts', 'Undeliverable'],
      ['Inactive contact — use purchasing instead', 'Inactive'],
      ['Retired in May', 'Retired'],
      ['Company is out of business', 'Out of business'],
      ['Do not email this person', 'Do not contact'],
      ['No longer with the company', 'No longer employed'],
    ];
    for (const [context, reason] of examples) {
      assert.equal(contactEmailSuppressionReason({ context }), reason);
    }
  });

  it('does not suppress ordinary context notes', () => {
    const contact = { context: 'Active buyer; prefers email on Tuesday afternoons.' };
    assert.equal(contactEmailSuppressionReason(contact), null);
    assert.equal(shouldSuppressContactEmail(contact), false);
  });
});
