import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  CONTACT_EMAIL_SUPPRESSION_STORAGE_KEY,
  isContactEmailSuppressed,
  setContactEmailSuppression,
} from '../../src/lib/contactEmailSuppressionCache.js';

function memoryArea() {
  const state = {};
  return {
    state,
    get(key, callback) { callback({ [key]: structuredClone(state[key]) }); },
    set(values, callback) { Object.assign(state, structuredClone(values)); callback?.(); },
  };
}

describe('contact email suppression cache', () => {
  it('matches normalized emails without storing the readable address', async () => {
    const area = memoryArea();
    await setContactEmailSuppression({
      email: ' Buyer@Example.Test ', contactId: '6510673', suppressed: true,
      area, cryptoImpl: webcrypto, now: 123,
    });
    assert.equal(await isContactEmailSuppressed('buyer@example.test', { area, cryptoImpl: webcrypto }), true);
    const serialized = JSON.stringify(area.state[CONTACT_EMAIL_SUPPRESSION_STORAGE_KEY]);
    assert.doesNotMatch(serialized, /buyer@example\.test/i);
    assert.match(serialized, /"markedAt":123/);
  });

  it('replaces an old address for the same contact and removes it when allowed', async () => {
    const area = memoryArea();
    const options = { contactId: '6510673', suppressed: true, area, cryptoImpl: webcrypto };
    await setContactEmailSuppression({ ...options, email: 'old@example.test' });
    await setContactEmailSuppression({ ...options, email: 'new@example.test' });
    assert.equal(await isContactEmailSuppressed('old@example.test', { area, cryptoImpl: webcrypto }), false);
    assert.equal(await isContactEmailSuppressed('new@example.test', { area, cryptoImpl: webcrypto }), true);
    await setContactEmailSuppression({ ...options, email: 'new@example.test', suppressed: false });
    assert.equal(await isContactEmailSuppressed('new@example.test', { area, cryptoImpl: webcrypto }), false);
  });

  it('guards the shared Task List and CRM Search send runner', async () => {
    const source = await readFile(new URL('../../src/modals/EmailRunner.jsx', import.meta.url), 'utf8');
    assert.match(source, /await isContactEmailSuppressed\(toEmail\)/);
    assert.match(source, /const locallySuppressed = toEmail/);
    assert.match(source, /isContactEmailSuppressed\(toEmail\)\.catch\(\(\) => true\)/);
  });
});
