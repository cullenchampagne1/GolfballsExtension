import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  identityNoticeSignature,
  installationIdentityNoticeView,
  shouldShowIdentityConfirmation,
} from '../../src/lib/installationIdentityNotice.js';

describe('installation identity confirmation', () => {
  const identity = {
    registered: true,
    installationId: 'install-123',
    updatedAt: '2026-07-21T18:00:00Z',
    displayName: 'Taylor Smith',
  };

  it('shows a newly registered identity exactly until its signature is acknowledged', () => {
    const signature = identityNoticeSignature(identity);
    assert.equal(
      signature,
      'install-123|2026-07-21T18:00:00Z|Taylor Smith',
    );
    assert.equal(shouldShowIdentityConfirmation(identity, ''), true);
    assert.equal(shouldShowIdentityConfirmation(identity, signature), false);
  });

  it('never treats an unregistered installation as a dismissible confirmation', () => {
    assert.equal(identityNoticeSignature({ registered: false }), '');
    assert.equal(shouldShowIdentityConfirmation({ registered: false }, ''), false);
  });

  it('renders no registration outage chrome before an identity is available', () => {
    assert.equal(installationIdentityNoticeView(null, '', true), 'hidden');
    assert.equal(installationIdentityNoticeView(identity, '', false), 'hidden');
  });

  it('keeps the real prompt and one-time confirmation states', () => {
    assert.equal(
      installationIdentityNoticeView({ registered: false }, '', true),
      'prompt',
    );
    assert.equal(
      installationIdentityNoticeView(identity, '', true),
      'confirmation',
    );
    assert.equal(
      installationIdentityNoticeView(
        identity, identityNoticeSignature(identity), true,
      ),
      'hidden',
    );
  });
});
