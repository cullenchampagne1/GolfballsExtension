/** Integration flow — assistant ticket creation and settings ticket listing
 * through the real background message router and installation auth client. */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  API_KEY, API_ORIGIN,
  createFetchMock, jsonResponse, loadBackground, validInstallation,
} from './helpers/harness.mjs';

const ticket = {
  id: 'GBT-ABCD2345',
  kind: 'bug',
  title: 'Charge Card button is inert',
  description: 'Clicking Charge Card does not open the payment modal.',
  status: 'open',
  replies: [],
};

let sendMessage;
let requests;

before(async () => {
  const mock = createFetchMock((url, options) => {
    const method = String(options.method || 'GET').toUpperCase();
    if (url === `${API_ORIGIN}/extension/tickets` && method === 'POST') {
      return jsonResponse({ created: true, ticket }, 201);
    }
    if (url === `${API_ORIGIN}/extension/tickets` && method === 'GET') {
      return jsonResponse({ tickets: [{ ...ticket, status: 'in_progress', replies: [{ id: 'reply-1', author: 'Cullen', message: 'I can reproduce it.' }] }] });
    }
    return undefined;
  });
  requests = mock.requests;
  const background = await loadBackground({
    stored: { gbApiInstallation: validInstallation() },
    fetchImpl: mock.fetchMock,
  });
  sendMessage = background.sendMessage;
  requests.length = 0;
});

describe('support ticket lifecycle', () => {
  it('submits a typed idempotent ticket through installation authentication', async () => {
    const response = await sendMessage({
      action: 'supportTicketCreate',
      requestId: 'help:run-charge-card:0',
      kind: 'bug',
      title: 'Charge Card button is inert',
      description: 'Clicking Charge Card does not open the payment modal.',
      context: {
        extension_version: '3.3.0',
        surface: 'actions-shelf',
        page_type: 'order',
        page_url: 'https://www.golfballs.com/admin/order?tab=payment',
      },
    });
    assert.equal(response.ok, true);
    assert.equal(response.ticket.id, 'GBT-ABCD2345');

    const request = requests.at(-1);
    assert.equal(request.url, `${API_ORIGIN}/extension/tickets`);
    assert.equal(request.method, 'POST');
    assert.equal(request.options.headers.get('Authorization'), `Bearer ${API_KEY}`);
    assert.deepEqual(JSON.parse(request.options.body), {
      request_id: 'help:run-charge-card:0',
      kind: 'bug',
      title: 'Charge Card button is inert',
      description: 'Clicking Charge Card does not open the payment modal.',
      context: {
        extension_version: '3.3.0',
        surface: 'actions-shelf',
        page_type: 'order',
        page_url: 'https://www.golfballs.com/admin/order?tab=payment',
      },
    });
  });

  it('lists status and administrator replies for the settings section', async () => {
    const response = await sendMessage({ action: 'supportTicketList' });
    assert.equal(response.ok, true);
    assert.equal(response.tickets[0].status, 'in_progress');
    assert.equal(response.tickets[0].replies[0].author, 'Cullen');
    assert.equal(requests.at(-1).method, 'GET');
  });

  it('rejects malformed assistant ticket actions before network access', async () => {
    const marker = requests.length;
    const response = await sendMessage({
      action: 'supportTicketCreate', requestId: 'short', kind: 'incident',
      title: '', description: '',
    });
    assert.deepEqual(response, { ok: false, error: 'Invalid support ticket' });
    assert.equal(requests.length, marker);
  });
});
