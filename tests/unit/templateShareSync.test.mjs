import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  acknowledgeOwnedTemplateShare,
  ownedTemplateShares,
  pendingOwnedTemplateShareUpdates,
  reconcileOwnedTemplateShares,
  registerOwnedTemplateShare,
  removeOwnedTemplateShare,
  templateShareDiff,
  templateShareSnapshot,
} from '../../src/lib/templateShareSync.js';

const SHARE_ID = 'T1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p-';
const SESSION_ID = 'share-edit-session-0001';

describe('owned email-template share synchronization', () => {
  it('exposes only validated owner share rows to owner-facing controls', () => {
    const valid = { shareId: SHARE_ID, version: 2 };
    assert.deepEqual(ownedTemplateShares({
      shareSync: {
        kind: 'revstack-owned-email-template-shares',
        owned: [valid, { shareId: 'not-a-share' }],
      },
    }), [valid]);
    assert.deepEqual(ownedTemplateShares({ shareSync: { owned: [valid] } }), []);
  });

  it('builds a server snapshot without local ids, folders, timestamps, or sync metadata', () => {
    assert.deepEqual(templateShareSnapshot({
      id: 'local-id', folderId: 'folder-1', createdAt: 1, updatedAt: 2,
      name: 'Follow up', type: 'order', body: '<p>Hello</p>',
      shareImport: { shareId: 'not-server-content' },
      shareSync: { owned: [] },
      managedTemplate: { bucketId: 'not-server-content' },
      managedTemplateEnrollment: { kind: 'not-server-content' },
    }), {
      name: 'Follow up', type: 'order', body: '<p>Hello</p>',
    });
  });

  it('creates a nested merge diff with deletions instead of re-uploading the template', () => {
    assert.deepEqual(templateShareDiff(
      { name: 'Before', vars: { greeting: { type: 'literal', value: 'Hi' } }, variations: [1] },
      { name: 'After', vars: { greeting: { type: 'literal', value: 'Hello' } } },
    ), {
      name: 'After',
      vars: { greeting: { value: 'Hello' } },
      variations: null,
    });
  });

  it('tracks, emits, acknowledges, and removes an owned share without losing newer local work', () => {
    const original = registerOwnedTemplateShare({
      id: 'local-id', name: 'Follow up', type: 'order', body: '<p>Hello</p>',
    }, { id: SHARE_ID, version: 1, updated_at: '2026-08-22T10:00:00' });
    assert.deepEqual(pendingOwnedTemplateShareUpdates(original, SESSION_ID), []);

    const edited = { ...original, body: '<p>Updated</p>', subject: 'Checking in' };
    const [update] = pendingOwnedTemplateShareUpdates(edited, SESSION_ID);
    assert.equal(update.shareId, SHARE_ID);
    assert.deepEqual(update.patch, { body: '<p>Updated</p>', subject: 'Checking in' });

    const changedAgain = { ...edited, subject: 'Newer local subject' };
    const acknowledged = acknowledgeOwnedTemplateShare(
      changedAgain, SHARE_ID, update.snapshot,
      { version: 2, updated_at: '2026-08-22T10:10:00' },
    );
    assert.equal(acknowledged.subject, 'Newer local subject');
    assert.deepEqual(
      pendingOwnedTemplateShareUpdates(acknowledged, SESSION_ID)[0].patch,
      { subject: 'Newer local subject' },
    );
    assert.equal(removeOwnedTemplateShare(acknowledged, SHARE_ID).shareSync, undefined);
  });

  it('reconnects a legacy owned share only to one unambiguous local source template', () => {
    const legacyShare = {
      id: SHARE_ID, relationship: 'owned', version: 4,
      template: { name: 'Follow up', type: 'order', body: '<p>Server baseline</p>' },
    };
    const local = {
      id: 'local-id', name: 'Follow up', type: 'order', body: '<p>Edited locally</p>',
    };
    const reconciled = reconcileOwnedTemplateShares([local], [legacyShare]);
    assert.equal(reconciled.changed, true);
    assert.deepEqual(
      pendingOwnedTemplateShareUpdates(reconciled.templates[0], SESSION_ID)[0].patch,
      { body: '<p>Edited locally</p>' },
    );

    const ambiguous = reconcileOwnedTemplateShares([
      local, { ...local, id: 'duplicate-id' },
    ], [legacyShare]);
    assert.equal(ambiguous.changed, false);
    assert.equal(ambiguous.templates.some((template) => template.shareSync), false);
  });
});
