import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAIL_TEMPLATE_CAPABILITY_KEYS,
  filterLocalEmailTemplates,
  readEmailTemplateCapabilities,
  resolveEmailTemplateCapabilities,
} from '../../src/lib/emailTemplateCapabilities.js';

describe('managed email-template capabilities', () => {
  it('defaults every rollout capability on when no managed value is stored', () => {
    assert.deepEqual(resolveEmailTemplateCapabilities(), {
      allowCreation: true,
      allowLinkImport: true,
      allowBulkSending: true,
      allowLocalTemplateUsage: true,
    });
  });

  it('closes only capabilities explicitly set to false', () => {
    const settings = Object.fromEntries(
      Object.values(EMAIL_TEMPLATE_CAPABILITY_KEYS).map((key) => [key, false]),
    );
    assert.deepEqual(resolveEmailTemplateCapabilities(settings), {
      allowCreation: false,
      allowLinkImport: false,
      allowBulkSending: false,
      allowLocalTemplateUsage: false,
    });
  });

  it('projects local templates out without mutating or deleting the stored library', () => {
    const stored = [{ id: 'welcome' }, { id: 'follow-up' }];
    const hidden = filterLocalEmailTemplates(stored, {
      'emailTemplates.allowLocalTemplateUsage': false,
    });

    assert.deepEqual(hidden, []);
    assert.deepEqual(stored, [{ id: 'welcome' }, { id: 'follow-up' }]);
    assert.equal(filterLocalEmailTemplates(stored, {}), stored);
  });

  it('reads the live devSettings bag through the storage boundary', async () => {
    const storage = {
      get(key, callback) {
        assert.equal(key, 'devSettings');
        callback({ devSettings: { 'emailTemplates.allowBulkSending': false } });
      },
    };
    assert.equal((await readEmailTemplateCapabilities(storage)).allowBulkSending, false);
  });
});
