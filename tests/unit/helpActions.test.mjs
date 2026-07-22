import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildAutomaticHelpState } from '../../src/lib/helpAutomaticState.js';


describe('Help Companion automatic settings context', () => {
  it('returns registered scalar state while excluding hidden and unregistered values', () => {
    const state = buildAutomaticHelpState(
      {
        chargeEnabled: false,
        emailPreviewEnabled: true,
        inventedFeature: true,
      },
      {
        'marginCalc.minAllowedMargin': 28,
        'callLog.draggable': true,
        'email.localPart': 'alex\nunsafe',
        inventedSetting: 'private',
      },
      ['emailPreviewEnabled', 'callLog.draggable'],
      ['chargeEnabled', 'emailPreviewEnabled'],
      ['marginCalc.minAllowedMargin', 'callLog.draggable', 'email.localPart'],
    );

    assert.equal(state.features.chargeEnabled, false);
    assert.equal(Object.hasOwn(state.features, 'emailPreviewEnabled'), false);
    assert.equal(Object.hasOwn(state.features, 'inventedFeature'), false);
    assert.equal(state.developer_settings['marginCalc.minAllowedMargin'], 28);
    assert.equal(state.developer_settings['email.localPart'], 'alex unsafe');
    assert.equal(Object.hasOwn(state.developer_settings, 'callLog.draggable'), false);
    assert.equal(Object.hasOwn(state.developer_settings, 'inventedSetting'), false);
  });
});
