import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HELP_COMPOSER_MAX_HEIGHT,
  HELP_COMPOSER_MIN_HEIGHT,
  resolveHelpComposerPrompt,
  resolveHelpComposerHeight,
  syncHelpComposerHeight,
} from '../../src/lib/helpComposer.js';

describe('Help Companion composer sizing', () => {
  it('collapses a previously expanded composer when its draft is cleared', () => {
    const element = {
      style: { height: `${HELP_COMPOSER_MAX_HEIGHT}px` },
      scrollHeight: HELP_COMPOSER_MAX_HEIGHT,
      scrollTop: 38,
    };

    const height = syncHelpComposerHeight(element, false);

    assert.equal(height, HELP_COMPOSER_MIN_HEIGHT);
    assert.equal(element.style.height, `${HELP_COMPOSER_MIN_HEIGHT}px`);
    assert.equal(element.scrollTop, 0);
  });

  it('clamps measured message content between the compact and expanded limits', () => {
    assert.equal(resolveHelpComposerHeight(8), HELP_COMPOSER_MIN_HEIGHT);
    assert.equal(resolveHelpComposerHeight(57.2), 58);
    assert.equal(resolveHelpComposerHeight(240), HELP_COMPOSER_MAX_HEIGHT);
  });

  it('renders busy copy outside the native textarea placeholder', () => {
    assert.deepEqual(resolveHelpComposerPrompt({ active: true }), {
      placeholder: '',
      overlay: 'Waiting for the current answer…',
    });
    assert.deepEqual(resolveHelpComposerPrompt({ submitting: true }), {
      placeholder: '',
      overlay: 'Sending your question…',
    });
    assert.deepEqual(resolveHelpComposerPrompt(), {
      placeholder: 'Ask about the Golfballs Toolkit…',
      overlay: '',
    });
  });
});
