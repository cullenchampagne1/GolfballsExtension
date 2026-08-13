import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertCodeBodyAllowed,
  staticCheckCodeBody,
} from '../../src/lib/page-engine/code-precheck.js';

// SECURITY-AUDITED: the wildcard below is inert source text in a negative
// precheck fixture; this test never invokes window.postMessage.

describe('code precheck · shared sandbox tripwires', () => {
  it('accepts an ordinary action body', () => {
    assert.equal(
      staticCheckCodeBody('const subject = page.contact.name; return subject;'),
      null,
    );
    assert.doesNotThrow(() => assertCodeBodyAllowed('return page.tasks.open.length;'));
  });

  it('blocks real ambient window access with the live error message', () => {
    const expected = 'blocked: ambient window access not allowed';
    assert.equal(staticCheckCodeBody('return window.location.href;'), expected);
    assert.throws(
      () => assertCodeBodyAllowed('postMessage({ ready: true }, "*");'),
      new RegExp(expected),
    );
  });
});
