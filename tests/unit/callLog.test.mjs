/**
 * Unit tests — src/lib/callLog.js
 *
 * The module probes `chrome` / `localStorage` at CALL time (not import time),
 * so tests install/remove stub globals around each loadCallTemplates call.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  CALL_CATEGORY_OPTIONS,
  CALL_DIRECTION_OPTIONS,
  getCallCategoryTone,
  getCategoryLabel,
  loadCallTemplates,
  buildCustomTemplate,
} = await import('../../src/lib/callLog.js');

const TEMPLATE_FIXTURE = [
  { id: 't1', name: 'Left VM', subType: 'call_log', enabled: true },
  { id: 't2', name: 'Old preset', subType: 'call_log', enabled: false },
  { id: 't3', name: 'Follow-up note', subType: 'note', enabled: true },
  { id: 't4', name: 'No flag preset', subType: 'call_log' }, // enabled defaults on
];

describe('getCallCategoryTone', () => {
  it('maps error/success/warning categories to their tones', () => {
    assert.equal(getCallCategoryTone('49'), 'error');   // Charge Error
    assert.equal(getCallCategoryTone(40), 'success');   // Opportunity
    assert.equal(getCallCategoryTone('36'), 'warning'); // Order Issues
  });

  it('falls back to neutral for unmapped ids and null', () => {
    assert.equal(getCallCategoryTone('0'), 'neutral');
    assert.equal(getCallCategoryTone('999'), 'neutral');
    assert.equal(getCallCategoryTone(null), 'neutral');
  });
});

describe('getCategoryLabel', () => {
  it('maps a known CRM id (string or number) to its label', () => {
    assert.equal(getCategoryLabel('2'), 'Order Status');
    assert.equal(getCategoryLabel(41), 'Returns/Reprints');
  });

  it('returns "" for the Select placeholder and unknown ids', () => {
    assert.equal(getCategoryLabel('0'), '');
    assert.equal(getCategoryLabel('4'), ''); // gap in the CRM enum
    assert.equal(getCategoryLabel(undefined), '');
  });
});

describe('CALL_CATEGORY_OPTIONS / CALL_DIRECTION_OPTIONS shape', () => {
  it('category options are unique string-id rows led by Select', () => {
    assert.equal(CALL_CATEGORY_OPTIONS[0].id, '0');
    assert.equal(CALL_CATEGORY_OPTIONS[0].label, 'Select');
    assert.equal(CALL_CATEGORY_OPTIONS.length, 25);
    const ids = CALL_CATEGORY_OPTIONS.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(CALL_CATEGORY_OPTIONS.every((o) => typeof o.id === 'string' && typeof o.label === 'string'));
  });

  it('direction options are exactly Outbound(0) then Inbound(1)', () => {
    assert.deepEqual(CALL_DIRECTION_OPTIONS, [
      { id: '0', label: 'Outbound' },
      { id: '1', label: 'Inbound' },
    ]);
  });
});

describe('loadCallTemplates', () => {
  it('reads noteTemplates via chrome.storage and keeps only enabled call_log rows', async () => {
    let requestedKey;
    globalThis.chrome = {
      storage: {
        local: {
          get(key, cb) { requestedKey = key; cb({ noteTemplates: TEMPLATE_FIXTURE }); },
        },
      },
    };
    try {
      const templates = await loadCallTemplates();
      assert.equal(requestedKey, 'noteTemplates');
      assert.deepEqual(templates.map((t) => t.id), ['t1', 't4']);
    } finally {
      delete globalThis.chrome;
    }
  });

  it('resolves [] when storage holds no array', async () => {
    globalThis.chrome = { storage: { local: { get(key, cb) { cb({}); } } } };
    try {
      assert.deepEqual(await loadCallTemplates(), []);
    } finally {
      delete globalThis.chrome;
    }
  });

  it('falls back to localStorage outside an extension context', async () => {
    delete globalThis.chrome;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k) => (k === 'noteTemplates' ? JSON.stringify(TEMPLATE_FIXTURE) : null) },
    });
    try {
      const templates = await loadCallTemplates();
      assert.deepEqual(templates.map((t) => t.id), ['t1', 't4']);
    } finally {
      delete globalThis.localStorage;
    }
  });

  it('resolves [] when localStorage JSON is corrupt', async () => {
    delete globalThis.chrome;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: () => '{not json' },
    });
    try {
      assert.deepEqual(await loadCallTemplates(), []);
    } finally {
      delete globalThis.localStorage;
    }
  });
});

describe('buildCustomTemplate', () => {
  it('flattens steps into callStep1..4 and normalizes field types', () => {
    const tpl = buildCustomTemplate({
      subject: '  Called about art proof  ',
      body: ' Discussed logo placement ',
      callDirection: 1,
      callCategory: '18',
      callVoicemail: 1,
      steps: ['Send proof', '  Follow up Friday  '],
    });
    assert.equal(tpl.name, 'Called about art proof');
    assert.equal(tpl.subject, 'Called about art proof');
    assert.equal(tpl.body, 'Discussed logo placement');
    assert.equal(tpl.subType, 'call_log');
    assert.equal(tpl.enabled, true);
    assert.equal(tpl.callDirection, 1);
    assert.equal(tpl.callCategory, 18);
    assert.equal(tpl.callVoicemail, true);
    assert.equal(tpl.callStep1, 'Send proof');
    assert.equal(tpl.callStep2, 'Follow up Friday');
    assert.equal(tpl.callStep3, '');
    assert.equal(tpl.callStep4, '');
    assert.match(tpl.id, /^custom-\d+$/);
  });

  it('defaults an empty form to "Custom call log" with category 0', () => {
    const tpl = buildCustomTemplate({});
    assert.equal(tpl.name, 'Custom call log');
    assert.equal(tpl.callCategory, 0);
    assert.equal(tpl.callDirection, 0);
    assert.equal(tpl.callVoicemail, false);
  });
});
