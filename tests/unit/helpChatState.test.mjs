import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createChrome, createContext, loadScript } from '../integration/helpers/harness.mjs';

function loadState() {
  const { chrome } = createChrome();
  const context = createContext({ chrome, fetchImpl: async () => new Response('{}') });
  loadScript(context, 'help-chat-state.js');
  return context.GBHelpChatState;
}

describe('Help Companion state', () => {
  it('builds a bounded backend request from real conversation turns and safe context', () => {
    const State = loadState();
    const messages = Array.from({ length: 15 }, (_, index) => ({
      id: `user:${index}`,
      role: index % 2 ? 'assistant' : 'user',
      text: `turn ${index}`,
      createdAt: index,
    }));
    const request = State.buildRequest(
      { ...State.emptyState(1), messages },
      'Where is the theme setting?',
      {
        extension_version: '3.3.1',
        edition: 'admin',
        surface: 'actions-shelf',
        page_type: 'contact',
        feature_states: { actionsShelfEnabled: true, invalid: 'yes' },
        page_url: 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*',
        action_confirmations: ['submit_ticket', 'submit_ticket', '../unsafe'],
        available_resources: [{ kind: 'email_template', id: 'tpl-follow-up', label: 'Follow up' }],
        unexpected: 'must not cross the contract',
      },
      'help:request-1234',
    );

    assert.equal(request.message, 'Where is the theme setting?');
    assert.equal(request.history.length, 12);
    assert.equal(request.history.at(-1).role, 'user');
    assert.equal(request.history.at(-1).content, 'turn 14');
    assert.equal(request.context.page_type, 'contact');
    assert.equal(Object.hasOwn(request.context, 'answer_mode'), false);
    assert.equal(request.context.page_url, 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*');
    assert.equal(request.context.available_resources[0].id, 'tpl-follow-up');
    assert.equal(JSON.stringify(request.context.feature_states), JSON.stringify({ actionsShelfEnabled: true }));
    assert.equal(JSON.stringify(request.context.action_confirmations), JSON.stringify(['submit_ticket']));
    assert.equal(Object.hasOwn(request.context, 'unexpected'), false);
  });

  it('applies a completed structured answer once and increments unread once', () => {
    const State = loadState();
    let state = State.beginTurn(State.emptyState(10), {
      message: 'How do I open the guide?', requestId: 'help:request-1234', now: 10,
    });
    state = State.applyRun(state, { run_id: 'run_12345678', status: 'queued', poll_after_ms: 3000 }, 20);
    const completed = {
      run_id: 'run_12345678', status: 'completed',
      answer: {
        text: 'Open the guide from Settings.',
        steps: [{ text: 'Open Settings.', citation_ids: ['guide-1'] }],
        citations: [{ id: 'guide-1', title: 'Settings', kind: 'guide', source: 'guide', guide_route: '#settings', excerpt: 'Open Settings.' }],
        actions: [{
          type: 'open_guide', target: '#settings', label: 'Open guide',
          citation_id: 'guide-1', receipt_id: 'act_0123456789abcdef',
        }],
        suggested_questions: ['Where are feature flags?'],
        confidence: 0.91,
      },
    };
    state = State.applyRun(state, completed, 30);

    assert.equal(state.active, null);
    assert.equal(state.messages.length, 2);
    assert.equal(state.messages[1].text, 'Open the guide from Settings.');
    assert.equal(state.messages[1].citations[0].guideRoute, '#settings');
    assert.equal(state.messages[1].actions[0].type, 'open_guide');
    assert.equal(state.messages[1].actions[0].receiptId, 'act_0123456789abcdef');
    assert.equal(state.unread, 1);

    state = State.applyRun(state, completed, 40);
    assert.equal(state.messages.length, 2, 'repeat polling must not duplicate the answer');
    assert.equal(state.unread, 1, 'repeat polling must not duplicate unread state');
    assert.equal(State.markRead(state, 50).unread, 0);
  });

  it('keeps a failed question retryable without duplicating its user bubble', () => {
    const State = loadState();
    let state = State.beginTurn(State.emptyState(10), {
      message: 'Why is the shelf hidden?', requestId: 'help:request-1234', now: 10,
    });
    state = State.failTurn(state, {
      message: 'Service unavailable', status: 503, reuseRequestId: true, now: 20,
    });
    assert.equal(state.lastError.reuseRequestId, true);
    assert.equal(State.normalizeState(state).lastError.reuseRequestId, true);
    const retryId = 'help:request-5678';
    const request = State.buildRequest(state, state.lastError.retryMessage, {}, retryId, { retry: true });
    state = State.beginTurn(state, {
      message: request.message, requestId: retryId, reuseLastUser: true, now: 30,
    });

    assert.equal(request.history.length, 0, 'the retried prompt must not also appear in history');
    assert.equal(state.messages.filter((item) => item.role === 'user').length, 1);
    assert.equal(state.active.requestId, retryId);
  });

  it('drops unsupported answer actions and bounds stored answer content', () => {
    const State = loadState();
    const answer = State.normalizeAnswer({
      text: 'x'.repeat(30_000),
      actions: [
        { type: 'open_guide', target: '#manual/actions-shelf', label: 'Open guide' },
        { type: 'set_feature', target: 'actionsShelfEnabled', value: 'false', options: [], label: 'Disable shelf' },
        { type: 'submit_ticket', target: 'bug', value: 'The shelf does not open.', options: [], label: 'Shelf does not open' },
        { type: 'request_data_access', target: 'email_templates', value: 'order', options: ['fields:metadata'], label: 'Allow templates', receipt_id: 'act_access1234' },
        { type: 'run_javascript', target: 'alert(1)', label: 'Run' },
      ],
      citations: [{ id: '../bad', title: 'Bad id' }, { id: 'safe-id', title: 'Safe citation' }],
    });
    assert.equal(answer.text.length, 24_000);
    assert.equal(JSON.stringify(answer.actions.map((item) => item.type)), JSON.stringify(['open_guide', 'set_feature', 'submit_ticket', 'request_data_access']));
    assert.equal(answer.actions[1].value, 'false');
    assert.equal(answer.actions[2].target, 'bug');
    assert.equal(answer.actions[3].receiptId, 'act_access1234');
    assert.equal(JSON.stringify(answer.citations.map((item) => item.id)), JSON.stringify(['safe-id']));
  });

  it('never stringifies structured fragments or internal citation ids into chat prose', () => {
    const State = loadState();
    assert.equal(State.normalizeAnswer({ text: { accidental: true } }).text, '');
    const answer = State.normalizeAnswer({
      text: 'Applied the theme.\n\n[object Object]\n[guide:article:theme-appearance:beginner]',
      warning: { code: 'review_before_write', text: 'Review the charge before confirming.' },
    });
    assert.equal(answer.text, 'Applied the theme.');
    assert.equal(answer.warning, 'Review the charge before confirming.');
    assert.equal(State.normalizeAnswer({ text: 'Okay.', warning: '[object Object]' }).warning, '');
  });
});
