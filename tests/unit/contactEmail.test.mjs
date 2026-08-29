import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sendContactEmail } from '../../src/lib/contactEmail.js';

describe('contact email orchestration', () => {
  it('builds a standalone message with sender identity and configured signature', async () => {
    let delivered;
    const result = await sendContactEmail({ to: 'customer@example.com', subject: 'Follow up', htmlBody: '<p>Hello</p>' }, {
      readConfig: async () => ({ localPart: 'rep', signature: '<p>Regards</p>', paReady: true }),
      pickSender: (_template, localPart) => `${localPart}@golfballs.com`,
      deliver: async (message) => { delivered = message; return { state: 'sent', transport: 'pa', error: null }; },
    });

    assert.equal(result.state, 'sent');
    assert.deepEqual(delivered, {
      from: 'rep@golfballs.com', to: 'customer@example.com', subject: 'Follow up',
      htmlBody: '<p>Hello</p>', replyMode: 'standalone', signature: '<p>Regards</p>',
      config: { localPart: 'rep', signature: '<p>Regards</p>', paReady: true },
      usageSource: 'contact',
    });
  });

  it('rejects missing contact email or subject before transport dispatch', async () => {
    let calls = 0;
    const deps = { deliver: async () => { calls += 1; } };
    assert.equal((await sendContactEmail({ subject: 'Hello' }, deps)).error, 'No recipient email');
    assert.equal((await sendContactEmail({ to: 'customer@example.com' }, deps)).error, 'Enter an email subject');
    assert.equal(calls, 0);
  });
});
