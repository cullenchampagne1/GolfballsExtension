import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  opportunityStageTone,
  smartSearchBarVisible,
} from '../../src/lib/customPageLayout.js';

describe('custom page layout · opportunity stage treatment', () => {
  it('gives only the Open stage the active opportunity tone', () => {
    assert.equal(opportunityStageTone('Open'), 'success');
    assert.equal(opportunityStageTone(' open '), 'success');
    assert.equal(opportunityStageTone('Qualified'), 'info');
    assert.equal(opportunityStageTone('Won'), 'info');
    assert.equal(opportunityStageTone(null), 'info');
  });
});

describe('custom page layout · smart CRM Search bar', () => {
  it('hides on deliberate downward scroll and returns on upward intent', () => {
    assert.equal(smartSearchBarVisible({ currentTop: 90, previousTop: 70, visible: true }), false);
    assert.equal(smartSearchBarVisible({ currentTop: 70, previousTop: 90, visible: false }), true);
  });

  it('stays visible at the top, while focused, and through trackpad noise', () => {
    assert.equal(smartSearchBarVisible({ currentTop: 8, previousTop: 40, visible: false }), true);
    assert.equal(smartSearchBarVisible({ currentTop: 100, previousTop: 80, visible: true, focused: true }), true);
    assert.equal(smartSearchBarVisible({ currentTop: 102, previousTop: 100, visible: false }), false);
  });
});
