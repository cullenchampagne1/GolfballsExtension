import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  PopupInitializationTimeoutError,
  runPopupInitialization,
} from '../../src/lib/popupInitialization.js';

const popupSource = await readFile(new URL('../../src/popup/popup.jsx', import.meta.url), 'utf8');

describe('popup initialization · bounded Chrome callbacks', () => {
  it('returns a completed page scan before its deadline', async () => {
    const result = await runPopupInitialization(
      async () => ({ pageType: 'contact' }),
      { timeoutMs: 50 },
    );

    assert.deepEqual(result, { pageType: 'contact' });
  });

  it('rejects a Chrome callback that never settles with the active startup stage', async () => {
    let stage = 'reading extension storage';
    const stalled = runPopupInitialization(
      () => new Promise(() => {}),
      { timeoutMs: 10, getStage: () => stage },
    );
    stage = 'reading page context';

    await assert.rejects(stalled, (error) => {
      assert.ok(error instanceof PopupInitializationTimeoutError);
      assert.equal(error.code, 'POPUP_INITIALIZATION_TIMEOUT');
      assert.equal(error.stage, 'reading page context');
      return true;
    });
  });

  it('preserves an immediate startup error instead of misreporting a timeout', async () => {
    await assert.rejects(
      runPopupInitialization(() => { throw new Error('storage unavailable'); }, { timeoutMs: 50 }),
      /storage unavailable/,
    );
  });

  it('wires the deadline to a usable popup fallback instead of the loading stage', () => {
    assert.match(popupSource, /runPopupInitialization\(initialize/);
    assert.match(popupSource, /renderMain\(\{ pageType: 'other' \}\)/);
    assert.match(popupSource, /setInitializationWarning\(`Page scan stalled while/);
    assert.match(popupSource, /initializationWarning && <PopupInitializationWarning/);
  });
});
