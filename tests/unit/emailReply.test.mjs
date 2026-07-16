import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { bareEmail, replyRecipient, replySenderAccount, replySubject } = await import('../../src/lib/emailReply.js');

describe('clicked email reply routing', () => {
  it('replies to the external sender through the internal address that received the clicked email', () => {
    const email = {
      from: 'Pat Buyer <pat@example.com>',
      to: 'Cullen <cullen@loyaltylogo.com>',
    };
    assert.equal(replyRecipient(email), 'pat@example.com');
    assert.equal(replySenderAccount(email), 'loyaltylogo');
  });

  it('keeps an outbound clicked email routed to its external recipient', () => {
    const email = {
      from: 'Cullen <cullen@golfballs.com>',
      to: 'Pat Buyer <pat@example.com>',
    };
    assert.equal(replyRecipient(email), 'pat@example.com');
    assert.equal(replySenderAccount(email), 'golfballs');
  });

  it('extracts bracketed addresses and normalizes repeated RE prefixes', () => {
    assert.equal(bareEmail('Pat Buyer <pat@example.com>'), 'pat@example.com');
    assert.equal(replySubject(' Re: RE: Order 123 '), 'RE: Order 123');
  });
});
