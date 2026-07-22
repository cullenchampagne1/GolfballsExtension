import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  measureShelfSections,
  resolveShelfPanelHeight,
  shelfPanelTransition,
  shouldConstrainShelfActions,
} from '../../src/lib/shelfMotion.js';

describe('Actions Shelf panel motion', () => {
  it('returns from chat to one cached compact height with a short tween', () => {
    assert.equal(resolveShelfPanelHeight('chat', 286, 640), 640);
    assert.equal(resolveShelfPanelHeight('actions', 286, 640), 286);
    const transition = shelfPanelTransition('actions');
    assert.equal(transition.height.duration, 0.18);
    assert.equal(Object.hasOwn(transition.height, 'type'), false);
  });

  it('measures natural child sections instead of the animated wrapper height', () => {
    const node = {
      scrollHeight: 640,
      children: [
        { scrollHeight: 58, offsetHeight: 54 },
        {
          scrollHeight: 528, offsetHeight: 528,
          querySelector: () => ({ scrollHeight: 184, offsetHeight: 184 }),
        },
        { scrollHeight: 34, offsetHeight: 32 },
      ],
    };
    assert.equal(measureShelfSections(node), 276);
  });

  it('constrains overflowing action lists while compact lists retain natural height', () => {
    assert.equal(shouldConstrainShelfActions(720, 640), true);
    assert.equal(shouldConstrainShelfActions(286, 640), false);
    assert.equal(resolveShelfPanelHeight('actions', 720, 640), 640);
  });
});
