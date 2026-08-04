import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OPEN_PARAM_RULES } from '../../src/lib/openParamRules.js';
import {
  createSerialHelpActionRunner, hasIssuedHelpActionReceipt, helpActionReceiptDecision,
  helpActionConfirmationCopy, helpActionConfirmationTypes, helpActionReceiptId,
  helpActionRequiresConfirmation,
  orderHelpActions, planHelpAction, sanitizePageRoute,
  seedHistoricalHelpActionReceipts, shouldNotifyHelpActionReceipt,
} from '../../src/lib/helpActionCore.js';

const registry = {
  featureRules: { actionsShelfEnabled: { type: 'bool' } },
  settingRules: {
    'marginCalc.minAllowedMargin': { type: 'number', min: 0, max: 100 },
    'giftCatalog.density': { type: 'select', options: ['comfortable', 'compact'] },
  },
  themeVariants: { dark: 'dark', nord: 'nord', slate: 'midnight', midnight: 'midnight' },
  shareScopes: ['settings-preferences', 'settings-appearance'],
  templates: [{ id: 'tpl-follow-up', name: 'Follow up', subject: 'Checking in' }],
  modalTargets: ['mockup_studio', 'crm_search', 'notifications'],
  openParamRules: OPEN_PARAM_RULES,
  policy: { hiddenFeatures: {}, hiddenDeveloperSettings: {}, adminBypass: false },
};

describe('Help Companion action policy', () => {
  it('plans registered feature, bounded setting, theme, palette, and share actions', () => {
    assert.deepEqual(
      planHelpAction({ type: 'set_feature', target: 'actionsShelfEnabled', value: 'false' }, registry),
      { type: 'set_feature', target: 'actionsShelfEnabled', value: false },
    );
    assert.equal(planHelpAction({ type: 'set_setting', target: 'marginCalc.minAllowedMargin', value: '42' }, registry).value, 42);
    assert.equal(planHelpAction({ type: 'set_theme_preset', target: 'theme', value: 'nord' }, registry).value, 'nord');
    assert.equal(planHelpAction({ type: 'set_theme_preset', target: 'theme', value: 'Slate' }, registry).value, 'midnight');
    assert.deepEqual(
      planHelpAction({ type: 'set_theme_palette', target: 'brand', value: 'Pine', options: ['#AADD66', '#779933', '#557722', '#335511'] }, registry).colors,
      ['#aadd66', '#779933', '#557722', '#335511'],
    );
    assert.deepEqual(
      planHelpAction({ type: 'share_settings', target: 'settings', value: 'My setup', options: ['settings-appearance'] }, registry).scopes,
      ['settings-appearance'],
    );
    assert.equal(planHelpAction({ type: 'share_email_template', target: 'tpl-follow-up' }, registry).template.name, 'Follow up');
    assert.deepEqual(
      planHelpAction({
        payload: JSON.stringify({
          version: 1, command: 'open_modal', target: 'mockup_studio',
          value: '', options: [], label: 'Open Mockup Studio',
        }),
      }, registry),
      { type: 'open_modal', target: 'mockup_studio', params: {} },
    );
    // open_modal with validated parameters (crm_search: query + type).
    assert.deepEqual(
      planHelpAction({
        type: 'open_modal', target: 'crm_search',
        options: ['query=acme corp', 'type=account'],
        label: 'Open CRM Search',
      }, registry),
      { type: 'open_modal', target: 'crm_search', params: { query: 'acme corp', type: 'account' } },
    );
    // a target with no schema still rejects stray options…
    assert.throws(
      () => planHelpAction({ type: 'open_modal', target: 'notifications', options: ['x=1'] }, registry),
      /unsupported arguments/,
    );
    // …and a bad parameter is rejected, not silently opened.
    assert.throws(
      () => planHelpAction({ type: 'open_modal', target: 'crm_search', options: ['type=bogus'] }, registry),
      /not an allowed value/,
    );
    assert.deepEqual(
      planHelpAction({
        type: 'submit_ticket', target: 'bug', label: 'Charge button is inert',
        value: 'Clicking Charge Card does not open the payment modal.', options: [],
        references: [{ path: 'src/modals/ChargeModal.jsx', lineStart: 20, lineEnd: 42 }],
      }, registry),
      {
        type: 'submit_ticket', target: 'bug', kind: 'bug',
        title: 'Charge button is inert',
        description: 'Clicking Charge Card does not open the payment modal.',
        references: [{ path: 'src/modals/ChargeModal.jsx', line_start: 20, line_end: 42 }],
      },
    );
  });

  it('orders and serializes a theme shell before its palette override', async () => {
    const actions = orderHelpActions([
      { type: 'set_theme_palette', value: 'Blue tones' },
      { type: 'set_feature', target: 'actionsShelfEnabled' },
      { type: 'set_theme_preset', value: 'midnight' },
    ]);
    assert.deepEqual(actions.map(({ type }) => type), [
      'set_theme_preset', 'set_feature', 'set_theme_palette',
    ]);

    const events = [];
    const run = createSerialHelpActionRunner(async (name) => {
      events.push(`start:${name}`);
      await Promise.resolve();
      events.push(`finish:${name}`);
      return name;
    });
    const first = run('preset');
    const second = run('palette');
    assert.deepEqual(events, []);
    assert.deepEqual(await Promise.all([first, second]), ['preset', 'palette']);
    assert.deepEqual(events, [
      'start:preset', 'finish:preset', 'start:palette', 'finish:palette',
    ]);
  });

  it('seeds missing historical receipts without replaying or replacing known results', () => {
    const receipts = seedHistoricalHelpActionReceipts(
      { 'run-old:0': { status: 'succeeded', message: 'Already applied', at: 10 } },
      ['run-old:0', 'run-old:1', 'not a valid receipt'],
      20,
    );
    assert.equal(receipts['run-old:0'].message, 'Already applied');
    assert.equal(receipts['run-old:1'].message, 'Historical action was not replayed.');
    assert.equal(Object.hasOwn(receipts, 'not a valid receipt'), false);
  });

  it('uses server receipts for new actions and stable non-run identities for old history', () => {
    const action = {
      type: 'set_feature', target: 'actionsShelfEnabled', value: 'false', options: [],
    };
    assert.equal(
      helpActionReceiptId({}, { ...action, receiptId: 'act_0123456789abcdef' }, 0),
      'act_0123456789abcdef',
    );
    assert.equal(hasIssuedHelpActionReceipt({ receiptId: 'act_0123456789abcdef' }), true);
    assert.equal(hasIssuedHelpActionReceipt(action), false);

    const first = helpActionReceiptId({ runId: 'run-one', createdAt: 123, text: 'Done.' }, action, 0);
    const restored = helpActionReceiptId({ runId: 'run-two', createdAt: 123, text: 'Done.' }, action, 0);
    assert.equal(first, restored, 'legacy receipt identity must not depend on a backend run id');
    assert.match(first, /^legacy:/);
  });

  it('does not replay succeeded or failed receipts unless a failed action is explicitly retried', () => {
    const receipts = {
      done: { status: 'succeeded', message: 'Applied' },
      failed: { status: 'failed', message: 'Could not apply' },
    };
    assert.equal(helpActionReceiptDecision(receipts, 'done').execute, false);
    assert.equal(helpActionReceiptDecision(receipts, 'failed').execute, false);
    assert.equal(helpActionReceiptDecision(receipts, 'failed', { retry: true }).execute, true);
    assert.equal(helpActionReceiptDecision(receipts, 'done', { retry: true }).execute, false);
    assert.equal(helpActionReceiptDecision(receipts, 'new').execute, true);
    assert.equal(shouldNotifyHelpActionReceipt({ status: 'succeeded' }), true);
    assert.equal(shouldNotifyHelpActionReceipt({ status: 'failed' }), true);
    assert.equal(shouldNotifyHelpActionReceipt({ status: 'succeeded', replayed: true }), false);
  });

  it('gates every link-minting and ticket action behind confirmation', () => {
    // A share action publishes an externally reachable link, so it must never
    // run just because its card mounted — the same rule as a ticket.
    assert.deepEqual(
      helpActionConfirmationTypes().sort(),
      ['share_email_template', 'share_settings', 'submit_ticket'],
    );
    assert.equal(helpActionRequiresConfirmation({ type: 'submit_ticket' }), true);
    assert.equal(helpActionRequiresConfirmation({ type: 'share_settings' }), true);
    assert.equal(helpActionRequiresConfirmation({ type: 'share_email_template' }), true);
    // Local, trivially reversible mutations stay auto-applied.
    assert.equal(helpActionRequiresConfirmation({ type: 'set_feature' }), false);
    assert.equal(helpActionRequiresConfirmation({ type: 'set_setting' }), false);
    assert.equal(helpActionRequiresConfirmation({ type: 'set_theme_preset' }), false);
  });

  it('labels each confirmation card for its own action, never ticket-only', () => {
    const share = helpActionConfirmationCopy({ type: 'share_settings', target: 'settings' });
    assert.match(share.pending, /settings link/i);
    assert.match(share.pending, /created|shared/i);
    assert.equal(share.confirm, 'Create link');

    const shareTemplate = helpActionConfirmationCopy({ type: 'share_email_template', target: 'tpl-1' });
    assert.match(shareTemplate.pending, /template link/i);
    assert.equal(shareTemplate.confirm, 'Create link');

    // The ticket copy still branches on bug vs feature.
    assert.equal(
      helpActionConfirmationCopy({ type: 'submit_ticket', target: 'feature' }).confirm,
      'Submit request',
    );
    assert.equal(
      helpActionConfirmationCopy({ type: 'submit_ticket', target: 'bug' }).confirm,
      'Submit report',
    );
  });

  it('keeps a declined confirmation inert until the user retries', () => {
    const receipts = {
      declined: { status: 'declined', message: 'Not submitted.' },
    };
    assert.equal(helpActionReceiptDecision(receipts, 'declined').execute, false);
    assert.equal(helpActionReceiptDecision(receipts, 'declined', { retry: true }).execute, true);
  });

  it('rejects invented, hidden, out-of-range, and malformed model operations', () => {
    assert.throws(() => planHelpAction({ type: 'set_feature', target: 'invented', value: 'false' }, registry), /not registered/);
    assert.throws(() => planHelpAction(
      { type: 'set_feature', target: 'actionsShelfEnabled', value: 'false' },
      { ...registry, policy: { hiddenFeatures: { actionsShelfEnabled: true } } },
    ), /hidden/);
    assert.throws(() => planHelpAction(
      { type: 'set_feature', target: 'actionsShelfEnabled', value: 'false' },
      { ...registry, policy: { managedFeatures: { actionsShelfEnabled: true } } },
    ), /managed/);
    assert.throws(() => planHelpAction(
      { type: 'set_setting', target: 'marginCalc.minAllowedMargin', value: '42' },
      { ...registry, policy: { managedDeveloperSettings: { 'marginCalc.minAllowedMargin': 20 } } },
    ), /managed/);
    assert.throws(() => planHelpAction({ type: 'set_setting', target: 'marginCalc.minAllowedMargin', value: '101' }, registry), /at most 100/);
    assert.throws(() => planHelpAction({ type: 'set_theme_preset', target: 'theme', value: 'invented' }, registry), /not registered/);
    assert.throws(() => planHelpAction({ type: 'set_theme_palette', target: 'brand', options: ['red'] }, registry), /four valid colors/);
    assert.throws(() => planHelpAction({ type: 'share_settings', target: 'settings', value: 'Bad', options: ['secret-scope'] }, registry), /unregistered scope/);
    assert.throws(() => planHelpAction({ type: 'share_email_template', target: 'tpl-missing' }, registry), /not available/);
    assert.throws(() => planHelpAction({ type: 'open_modal', target: 'invented' }, registry), /not registered/);
    assert.throws(() => planHelpAction({ type: 'submit_ticket', target: 'incident', label: 'Bad', value: 'Bad' }, registry), /type is invalid/);
  });

  it('keeps route structure while removing record identifiers and fragments', () => {
    const route = sanitizePageRoute('https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=12345&tab=activity#private');
    assert.equal(route, 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*&tab=activity');
    assert.equal(sanitizePageRoute('javascript:alert(1)'), '');
  });
});
