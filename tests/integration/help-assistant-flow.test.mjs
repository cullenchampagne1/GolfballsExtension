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
  loadScript(context, 'help-data-access.js');
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
      page_type: 'contact', page_url: 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*',
      feature_states: {}, hidden_settings: [],
      available_resources: [{ kind: 'email_template', id: 'follow-up', label: 'Follow up' }],
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
    const submitted = JSON.parse(assistantRequests[0].options.body);
    assert.equal(submitted.context.page_url, 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*');
    assert.equal(submitted.context.available_resources[0].id, 'follow-up');
    assert.equal(Object.hasOwn(submitted.context, 'answer_mode'), false);
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
    loadScript(context, 'help-data-access.js');
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

  it('retries a stale server schema without automatic state and keeps the request id', async () => {
    let submissions = 0;
    const { fetchMock, requests } = createFetchMock((url) => {
      if (!new URL(url).pathname.endsWith('/assistant/messages')) return undefined;
      submissions += 1;
      if (submissions === 1) {
        return jsonResponse({
          detail: [{
            type: 'extra_forbidden',
            loc: ['body', 'context', 'automatic_state'],
            msg: 'Extra inputs are not permitted',
          }],
        }, 422);
      }
      return jsonResponse({
        run_id: 'run_compat-12345678', status: 'queued', poll_after_ms: 3000,
      }, 202);
    });
    const stored = { gbApiInstallation: validInstallation() };
    const { chrome } = createChrome({ stored });
    const context = createContext({ chrome, fetchImpl: fetchMock });
    loadScript(context, 'installation-auth.js');
    loadScript(context, 'help-chat-state.js');
    loadScript(context, 'help-data-access.js');
    loadScript(context, 'help-assistant.js');
    const controller = context.GBHelpAssistant.createController({
      setTimer: () => 1, clearTimer: () => {},
    });

    const queued = await controller.send('Why is the margin setting wrong?', {
      feature_states: { marginCalcEnabled: true },
      automatic_state: {
        features: { marginCalcEnabled: true },
        developer_settings: { 'marginCalc.minAllowedMargin': 28 },
      },
    });

    assert.equal(queued.active.runId, 'run_compat-12345678');
    const bodies = requests
      .filter(({ url }) => new URL(url).pathname.endsWith('/assistant/messages'))
      .map(({ options }) => JSON.parse(options.body));
    assert.equal(bodies.length, 2);
    assert.equal(bodies[1].request_id, bodies[0].request_id);
    assert.equal(bodies[0].context.automatic_state.developer_settings['marginCalc.minAllowedMargin'], 28);
    assert.equal(Object.hasOwn(bodies[1].context, 'automatic_state'), false);
    assert.equal(bodies[1].context.feature_states.marginCalcEnabled, true);
  });

  it('strips each unsupported optional context field while preserving one request id', async () => {
    let submissions = 0;
    const { fetchMock, requests } = createFetchMock((url) => {
      if (!new URL(url).pathname.endsWith('/assistant/messages')) return undefined;
      submissions += 1;
      if (submissions <= 2) {
        const field = submissions === 1 ? 'recent_actions' : 'automatic_state';
        return jsonResponse({
          detail: [{
            type: 'extra_forbidden', loc: ['body', 'context', field],
            msg: 'Extra inputs are not permitted',
          }],
        }, 422);
      }
      return jsonResponse({
        run_id: 'run_compat-both1234', status: 'queued', poll_after_ms: 3000,
      }, 202);
    });
    const stored = { gbApiInstallation: validInstallation() };
    const { chrome } = createChrome({ stored });
    const context = createContext({ chrome, fetchImpl: fetchMock });
    loadScript(context, 'installation-auth.js');
    loadScript(context, 'help-chat-state.js');
    loadScript(context, 'help-data-access.js');
    loadScript(context, 'help-assistant.js');
    const controller = context.GBHelpAssistant.createController({
      setTimer: () => 1, clearTimer: () => {},
    });

    const queued = await controller.send('Turn Email Preview back on.', {
      feature_states: { emailPreviewEnabled: false },
      automatic_state: {
        features: { emailPreviewEnabled: false }, developer_settings: {},
      },
    });

    assert.equal(queued.active.runId, 'run_compat-both1234');
    const bodies = requests
      .filter(({ url }) => new URL(url).pathname.endsWith('/assistant/messages'))
      .map(({ options }) => JSON.parse(options.body));
    assert.equal(bodies.length, 3);
    assert.ok(bodies.every((body) => body.request_id === bodies[0].request_id));
    assert.equal(Object.hasOwn(bodies[0].context, 'recent_actions'), true);
    assert.equal(Object.hasOwn(bodies[1].context, 'recent_actions'), false);
    assert.equal(Object.hasOwn(bodies[1].context, 'automatic_state'), true);
    assert.equal(Object.hasOwn(bodies[2].context, 'recent_actions'), false);
    assert.equal(Object.hasOwn(bodies[2].context, 'automatic_state'), false);
  });

  it('asks once, filters local templates, and submits only the approved projection', async () => {
    const flow = makeFlow();
    flow.stored.templates = [
      {
        id: 'tpl-order-follow-up', name: 'Order follow up', type: 'order', enabled: true,
        subject: 'Checking on your order', body: '<p>Private body must remain local.</p>',
      },
      { id: 'tpl-case-follow-up', name: 'Case follow up', type: 'case', enabled: true },
    ];
    const action = {
      type: 'request_data_access', target: 'email_templates', value: 'order follow up',
      options: ['type:order', 'state:enabled', 'fields:metadata', 'limit:5'],
      label: 'Find my order follow-up template',
    };
    const first = await flow.controller.resolveDataAccess(
      'act_access0123456789', action,
      { edition: 'admin', surface: 'actions-shelf' }, 'allow',
    );
    assert.equal(first.approval.status, 'submitted');
    assert.equal(first.approval.resultCount, 1);

    const posts = flow.requests.filter(({ url, method }) => (
      new URL(url).pathname.endsWith('/assistant/messages') && method === 'POST'
    ));
    assert.equal(posts.length, 1);
    const submitted = JSON.parse(posts[0].options.body);
    assert.equal(submitted.context.available_resources[0].id, 'tpl-order-follow-up');
    assert.match(submitted.context.available_resources[0].summary, /Checking on your order/);
    assert.doesNotMatch(JSON.stringify(submitted), /Private body must remain local/);
    assert.equal(submitted.context.resource_access.target, 'email_templates');

    await flow.controller.resolveDataAccess(
      'act_access0123456789', action,
      { edition: 'admin', surface: 'actions-shelf' }, 'allow',
    );
    assert.equal(
      flow.requests.filter(({ url, method }) => (
        new URL(url).pathname.endsWith('/assistant/messages') && method === 'POST'
      )).length,
      1,
      'an approval receipt must not submit approved data twice',
    );
  });

  it('applies the same one-time approval contract to saved note templates', async () => {
    const flow = makeFlow();
    flow.stored.noteTemplates = [
      {
        id: 'note-order-delay', name: 'Order delay', subType: 'note',
        subject: 'Delay update', body: 'Customer-specific wording stays local.', enabled: true,
      },
    ];
    const action = {
      type: 'request_data_access', target: 'note_templates', value: 'order delay',
      options: ['subtype:note', 'state:enabled', 'fields:metadata', 'limit:5'],
      label: 'Check my saved order-delay notes',
    };
    const result = await flow.controller.resolveDataAccess(
      'act_noteaccess123456', action, { edition: 'admin' }, 'allow',
    );
    assert.equal(result.approval.target, 'note_templates');
    assert.equal(result.approval.resultCount, 1);
    const post = flow.requests.find(({ url, method }) => (
      new URL(url).pathname.endsWith('/assistant/messages') && method === 'POST'
    ));
    const submitted = JSON.parse(post.options.body);
    assert.equal(submitted.context.resource_access.target, 'note_templates');
    assert.equal(submitted.context.available_resources[0].kind, 'note_template');
    assert.doesNotMatch(JSON.stringify(submitted), /Customer-specific wording/);
  });
});
