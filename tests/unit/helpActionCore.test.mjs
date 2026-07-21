import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planHelpAction, sanitizePageRoute } from '../../src/lib/helpActionCore.js';

const registry = {
  featureRules: { actionsShelfEnabled: { type: 'bool' } },
  settingRules: {
    'marginCalc.minAllowedMargin': { type: 'number', min: 0, max: 100 },
    'giftCatalog.density': { type: 'select', options: ['comfortable', 'compact'] },
  },
  themeVariants: ['dark', 'nord'],
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
    assert.deepEqual(
      planHelpAction({ type: 'set_theme_palette', target: 'brand', value: 'Pine', options: ['#AADD66', '#779933', '#557722', '#335511'] }, registry).colors,
      ['#aadd66', '#779933', '#557722', '#335511'],
    );
    assert.deepEqual(
      planHelpAction({ type: 'share_settings', target: 'settings', value: 'My setup', options: ['settings-appearance'] }, registry).scopes,
      ['settings-appearance'],
    );
    assert.equal(planHelpAction({ type: 'share_email_template', target: 'tpl-follow-up' }, registry).template.name, 'Follow up');
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
  });

  it('keeps route structure while removing record identifiers and fragments', () => {
    const route = sanitizePageRoute('https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=12345&tab=activity#private');
    assert.equal(route, 'https://www.golfballs.com/admin/Page.aspx?Page=240&customerID=*&tab=activity');
    assert.equal(sanitizePageRoute('javascript:alert(1)'), '');
  });
});
