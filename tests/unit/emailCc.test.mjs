import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CC_ADDRESS_MAX,
  CC_MAX,
  normalizeCcField,
  parseCcEntries,
  parseCcList,
} from '../../src/lib/emailCc.js';

describe('email · template CC list parsing', () => {
  it('splits a comma-delimited list into trimmed addresses', () => {
    assert.deepEqual(
      parseCcList(' manager@golfballs.com ,orders@golfballs.com'),
      ['manager@golfballs.com', 'orders@golfballs.com'],
    );
  });

  it('accepts semicolons and newlines, the separators Outlook and the CRM paste', () => {
    assert.deepEqual(
      parseCcList('a@golfballs.com; b@golfballs.com\nc@golfballs.com'),
      ['a@golfballs.com', 'b@golfballs.com', 'c@golfballs.com'],
    );
  });

  it('reports a malformed address instead of silently dropping it', () => {
    const { valid, invalid } = parseCcEntries('good@golfballs.com, not-an-email, also bad@x');
    assert.deepEqual(valid, ['good@golfballs.com']);
    assert.deepEqual(invalid, ['not-an-email', 'also bad@x']);
  });

  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    assert.deepEqual(
      parseCcList('Manager@Golfballs.com, manager@golfballs.com'),
      ['Manager@Golfballs.com'],
    );
  });

  it(`caps the list at ${CC_MAX} addresses and counts what it dropped`, () => {
    const raw = Array.from({ length: CC_MAX + 3 }, (_, i) => `rep${i}@golfballs.com`).join(',');
    const { valid, truncated } = parseCcEntries(raw);
    assert.equal(valid.length, CC_MAX);
    assert.equal(truncated, 3);
    assert.equal(valid[0], 'rep0@golfballs.com');
  });

  it('rejects an address longer than the worker payload ceiling', () => {
    const long = `${'a'.repeat(CC_ADDRESS_MAX)}@golfballs.com`;
    const { valid, invalid } = parseCcEntries(long);
    assert.deepEqual(valid, []);
    assert.deepEqual(invalid, [long]);
  });

  it('treats an empty, whitespace, or non-string field as no CC at all', () => {
    assert.deepEqual(parseCcList(''), []);
    assert.deepEqual(parseCcList('   , ,'), []);
    assert.deepEqual(parseCcList(undefined), []);
    assert.deepEqual(parseCcList(null), []);
  });

  it('leaves a pre-CC import untouched instead of recording an empty override', async () => {
    // An overrideDefaults snapshot captured before `cc` existed has no cc key.
    // Comparing it against the '' baseline must not read as a recipient edit.
    const { applyImportedEmailTemplateOverrides } = await import('../../src/lib/templateImport.js');
    const result = applyImportedEmailTemplateOverrides({
      name: 'Shared', type: 'order', presetTaskId: 'task-1',
      shareImport: {
        kind: 'revstack-email-template-share',
        shareId: 'a'.repeat(32),
        overrideDefaults: { presetTaskId: 'task-1', senderAccount: 'golfballs' },
        overrides: {},
      },
    });
    assert.deepEqual(result.shareImport.overrides, {});
  });

  it('normalizes an untouched field to undefined so it never enters storage', () => {
    assert.equal(normalizeCcField('   '), undefined);
    assert.equal(normalizeCcField(''), undefined);
    assert.equal(normalizeCcField(undefined), undefined);
    assert.equal(normalizeCcField('  manager@golfballs.com '), 'manager@golfballs.com');
  });
});
