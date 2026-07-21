import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_ORIGIN, createChrome, createContext, createFetchMock, jsonResponse,
  loadScript, validInstallation,
} from './helpers/harness.mjs';

function makeFlow() {
  let runReads = 0;
  const { fetchMock, requests } = createFetchMock((url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/assistant/messages')) {
      return jsonResponse({ run_id: 'run_12345678-abcd', status: 'queued', poll_after_ms: 3000 }, 202);
    }
    if (path.endsWith('/assistant/runs/run_12345678-abcd') && (options.method || 'GET') === 'GET') {
      runReads += 1;
      return jsonResponse({
        run_id: 'run_12345678-abcd', status: 'completed',
        answer: {
          text: 'Open Settings, then choose Features.',
          steps: [{ text: 'Open Settings.', citation_ids: ['settings-guide'] }],
          citations: [{ id: 'settings-guide', title: 'Settings reference', kind: 'guide', source: 'guide', guide_route: '#settings', excerpt: 'Settings contains feature controls.' }],
          actions: [{ type: 'open_settings', target: 'features', label: 'Open settings', citation_id: 'settings-guide' }],
          confidence: 0.95,
          suggested_questions: ['How do feature flags work?'],
        },
      });
    }
    if (path.endsWith('/assistant/runs/run_12345678-abcd/cancel')) {
      return jsonResponse({ run_id: 'run_12345678-abcd', status: 'cancelled' });
    }
    if (path.endsWith('/assistant/feedback')) return jsonResponse({ recorded: true });
    if (path.endsWith('/assistant/status')) return jsonResponse({ ready: true, completion: { available: true } });
    return undefined;
  });
  const stored = { gbApiInstallation: validInstallation() };
  const parts = createChrome({ stored });
  const context = createContext({ chrome: parts.chrome, fetchImpl: fetchMock });
  loadScript(context, 'installation-auth.js');
  loadScript(context, 'help-chat-state.js');
  loadScript(context, 'help-assistant.js');
  const controllerOptions = { setTimer: () => 1, clearTimer: () => {} };
  return {
    ...parts, context, requests, stored,
    controller: context.GBHelpAssistant.createController(controllerOptions),
    restart: () => context.GBHelpAssistant.createController(controllerOptions),
    get runReads() { return runReads; },
  };
}

describe('Help Companion background flow', () => {
  it('recovers a queued run after a worker restart and exposes an unread structured answer', async () => {
    const flow = makeFlow();
    const queued = await flow.controller.send('Where are feature settings?', {
      extension_version: '3.3.0', edition: 'admin', surface: 'actions-shelf',
      page_type: 'contact', answer_mode: 'operator', feature_states: {}, hidden_settings: [],
    });

    assert.equal(queued.active.status, 'queued');
    assert.equal(queued.messages.at(-1).role, 'user');
    assert.equal(flow.stored.gbHelpChatStateV1.active.runId, 'run_12345678-abcd');

    // Simulate backing out / MV3 suspension: a fresh controller owns the same
    // chrome.storage state and installation-auth client.
    const restarted = flow.restart();
    const completed = await restarted.poll({ force: true });
    assert.equal(flow.runReads, 1);
    assert.equal(completed.active, null);
    assert.equal(completed.unread, 1);
    assert.equal(completed.messages.at(-1).text, 'Open Settings, then choose Features.');
    assert.equal(completed.messages.at(-1).actions[0].type, 'open_settings');
    assert.equal(Object.hasOwn(flow.stored.gbHelpChatStateV1, 'apiKey'), false);

    const read = await restarted.markRead();
    assert.equal(read.unread, 0);
    const feedback = await restarted.feedback('run_12345678-abcd', 'helpful');
    assert.equal(feedback.messages.at(-1).feedback, 'helpful');

    const assistantRequests = flow.requests.filter(({ url }) => url.startsWith(`${API_ORIGIN}/projects/golfballs-extension/assistant/`));
    assert.deepEqual(assistantRequests.map(({ method }) => method), ['POST', 'GET', 'POST']);
    assert.ok(assistantRequests.every(({ options }) => options.credentials === 'omit'));
    assert.ok(assistantRequests.every(({ options }) => /^Bearer rsk_/.test(options.headers.get('Authorization'))));
  });

  it('cancels an active run and leaves the conversation usable', async () => {
    const flow = makeFlow();
    await flow.controller.send('Explain the Actions Shelf.', {});
    const cancelled = await flow.controller.cancel();
    assert.equal(cancelled.active, null);
    assert.equal(cancelled.notice, 'Response cancelled.');
    assert.equal(cancelled.messages.length, 1, 'the user question remains visible after cancellation');
    assert.ok(flow.requests.some(({ url, method }) => url.endsWith('/run_12345678-abcd/cancel') && method === 'POST'));
  });

  it('reuses the request id when submission succeeds remotely but Chrome loses the response', async () => {
    let submissions = 0;
    const { fetchMock, requests } = createFetchMock((url) => {
      if (!new URL(url).pathname.endsWith('/assistant/messages')) return undefined;
      submissions += 1;
      if (submissions === 1) throw new TypeError('Network connection lost after upload');
      return jsonResponse({ run_id: 'run_recovered-1234', status: 'queued', poll_after_ms: 3000 }, 202);
    });
    const stored = { gbApiInstallation: validInstallation() };
    const { chrome } = createChrome({ stored });
    const context = createContext({ chrome, fetchImpl: fetchMock });
    loadScript(context, 'installation-auth.js');
    loadScript(context, 'help-chat-state.js');
    loadScript(context, 'help-assistant.js');
    const controller = context.GBHelpAssistant.createController({ setTimer: () => 1, clearTimer: () => {} });

    const failed = await controller.send('Where is the export setting?', {});
    assert.equal(failed.lastError.reuseRequestId, true);
    const recovered = await controller.retry({});
    assert.equal(recovered.active.runId, 'run_recovered-1234');

    const bodies = requests
      .filter(({ url }) => new URL(url).pathname.endsWith('/assistant/messages'))
      .map(({ options }) => JSON.parse(options.body));
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].request_id, bodies[0].request_id);
    assert.equal(recovered.messages.filter(({ role }) => role === 'user').length, 1);
  });
});
