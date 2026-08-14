import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dispatchBackgroundMessage,
  sendBackgroundMessage,
} from '../../src/lib/backgroundMessage.js';

describe('background message · dispatcher compatibility', () => {
  it('adapts a helper message object to the canonical action boundary', async () => {
    const prior = globalThis.chrome;
    let sent;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, done) {
          sent = message;
          done({ ok: true, text: '<html></html>' });
        },
      },
    };
    try {
      const response = await dispatchBackgroundMessage({
        action: 'fetchRaw',
        url: 'https://api.golfballs.com/contact/7',
      });
      assert.deepEqual(sent, {
        action: 'fetchRaw',
        url: 'https://api.golfballs.com/contact/7',
      });
      assert.equal(response.ok, true);
    } finally {
      globalThis.chrome = prior;
    }
  });

  it('rejects missing actions and failed worker responses', async () => {
    await assert.rejects(() => dispatchBackgroundMessage({}), /action is required/);
    const prior = globalThis.chrome;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(_message, done) {
          done({ ok: false, error: 'blocked', errorCode: 'BLOCKED_BY_TEST' });
        },
      },
    };
    try {
      await assert.rejects(
        () => sendBackgroundMessage('fetchRaw', { url: 'https://example.test' }),
        (error) => {
          assert.match(error.message, /blocked/);
          assert.equal(error.code, 'BLOCKED_BY_TEST');
          return true;
        },
      );
    } finally {
      globalThis.chrome = prior;
    }
  });
});
