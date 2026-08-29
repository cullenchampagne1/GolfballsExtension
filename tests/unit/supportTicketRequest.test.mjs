import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUPPORT_TICKET_REQUEST_ID_RE,
  SUPPORT_TICKET_TITLE_MAX,
  SUPPORT_TICKET_DESCRIPTION_MAX,
  normalizeSupportTicketKind,
  newSupportTicketRequestId,
  buildSupportTicketRequest,
} from '../../src/lib/supportTicketRequest.js';

describe('support ticket request builder', () => {
  it('normalizes any kind to the two the backend accepts, defaulting to bug', () => {
    assert.equal(normalizeSupportTicketKind('feature'), 'feature');
    assert.equal(normalizeSupportTicketKind('bug'), 'bug');
    assert.equal(normalizeSupportTicketKind('anything-else'), 'bug');
    assert.equal(normalizeSupportTicketKind(undefined), 'bug');
  });

  it('generates a request id that satisfies the worker regex (crypto path)', () => {
    const id = newSupportTicketRequestId({ randomUUID: () => '123e4567-e89b-12d3-a456-426614174000' });
    assert.equal(id, 'st-123e4567-e89b-12d3-a456-426614174000');
    assert.match(id, SUPPORT_TICKET_REQUEST_ID_RE);
  });

  it('falls back to a valid request id when crypto.randomUUID is unavailable', () => {
    const id = newSupportTicketRequestId({});
    assert.match(id, SUPPORT_TICKET_REQUEST_ID_RE, `fallback id "${id}" must match the worker contract`);
    assert.ok(id.startsWith('st-'));
  });

  it('trims, collapses whitespace and length-caps the title and description', () => {
    const longTitle = 'x'.repeat(200);
    const longDescription = 'y'.repeat(3000);
    const { payload } = buildSupportTicketRequest({
      kind: 'bug',
      title: `  Broken   \n  checkout  `,
      description: longDescription,
      extensionVersion: '3.4.1',
    });
    assert.equal(payload.title, 'Broken checkout');
    assert.equal(payload.description.length, SUPPORT_TICKET_DESCRIPTION_MAX);

    const capped = buildSupportTicketRequest({ kind: 'bug', title: longTitle, description: 'ok' });
    assert.equal(capped.payload.title.length, SUPPORT_TICKET_TITLE_MAX);
  });

  it('stamps the context with the extension version and originating surface', () => {
    const { payload } = buildSupportTicketRequest({
      kind: 'feature', title: 'Dark mode', description: 'Please add a dark theme', extensionVersion: '3.4.1',
    });
    assert.deepEqual(payload.context, { extension_version: '3.4.1', surface: 'settings-manage' });
    assert.equal(payload.kind, 'feature');
    assert.match(payload.requestId, SUPPORT_TICKET_REQUEST_ID_RE);
  });

  it('reports invalid when a required field is blank, so the caller refuses to send', () => {
    assert.equal(buildSupportTicketRequest({ kind: 'bug', title: '   ', description: 'has body' }).valid, false);
    assert.equal(buildSupportTicketRequest({ kind: 'bug', title: 'has title', description: '  ' }).valid, false);
    assert.equal(buildSupportTicketRequest({ kind: 'bug', title: 'has title', description: 'has body' }).valid, true);
  });

  it('honors a caller-supplied request id instead of minting one', () => {
    const { payload } = buildSupportTicketRequest({
      kind: 'bug', title: 't', description: 'd', requestId: 'st-provided-key-1234',
    });
    assert.equal(payload.requestId, 'st-provided-key-1234');
  });
});
