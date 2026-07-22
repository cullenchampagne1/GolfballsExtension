import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSerialHelpActionRunner, orderHelpActions, planHelpAction, sanitizePageRoute,
  seedHistoricalHelpActionReceipts,
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
        type: 'submit_ticket', target: 'bug', label: 'Charge button is inert',
        value: 'Clicking Charge Card does not open the payment modal.', options: [],
      }, registry),
      {
        type: 'submit_ticket', target: 'bug', kind: 'bug',
        title: 'Charge button is inert',
        description: 'Clicking Charge Card does not open the payment modal.',
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

  it('rejects invented, hidden, out-of-range, and malformed model operations', () => {
    assert.throws(() => planHelpAction({ type: 'set_feature', target: 'invented', value: 'false' }, registry), /not registered/);
    assert.throws(() => planHelpAction(
      { type: 'set_feature', target: 'actionsShelfEnabled', value: 'false' },
      { ...registry, policy: { hiddenFeatures: { actionsShelfEnabled: true } } },
    ), /hidden/);
    assert.throws(() => planHelpAction({ type: 'set_setting', target: 'marginCalc.minAllowedMargin', value: '101' }, registry), /at most 100/);
    assert.throws(() => planHelpAction({ type: 'set_theme_preset', target: 'theme', value: 'invented' }, registry), /not registered/);
    assert.throws(() => planHelpAction({ type: 'set_theme_palette', target: 'brand', options: ['red'] }, registry), /four valid colors/);
    assert.throws(() => planHelpAction({ type: 'share_settings', target: 'settings', value: 'Bad', options: ['secret-scope'] }, registry), /unregistered scope/);
    assert.throws(() => planHelpAction({ type: 'share_email_template', target: 'tpl-missing' }, registry), /not available/);
    assert.throws(() => planHelpAction({ type: 'submit_ticket', target: 'incident', label: 'Bad', value: 'Bad' }, registry), /type is invalid/);
  });

  it('keeps route structure while removing record identifiers and fragments', () => {
    const route = sanitizePageRoute('https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=12345&tab=activity#private');
    assert.equal(route, 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*&tab=activity');
    assert.equal(sanitizePageRoute('javascript:alert(1)'), '');
  });
});
