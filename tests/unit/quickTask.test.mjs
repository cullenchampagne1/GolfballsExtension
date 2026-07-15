/**
 * Unit tests — src/lib/quickTask.js
 *
 * Storage is probed at call time, so loadTaskTemplates tests install/remove
 * stub chrome/localStorage globals per case. Date helpers under test here are
 * the input-shaped ones (format/parse); "today"-relative labels use fixed
 * daysOut integers, so nothing is wall-clock flaky.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  PRIORITY_OPTIONS,
  DEFAULT_PRIORITY,
  getPriority,
  getDueLabel,
  loadTaskTemplates,
  qtFormatTyped,
  qtParseTyped,
  buildCustomTaskTemplate,
} = await import('../../src/lib/quickTask.js');

const TASK_FIXTURE = [
  { id: 'k1', name: '5-day follow-up', subType: 'task', enabled: true },
  { id: 'k2', name: 'Disabled task', subType: 'task', enabled: false },
  { id: 'k3', name: 'A call preset', subType: 'call_log', enabled: true },
  { id: 'k4', name: 'Flagless task', subType: 'task' },
];

describe('PRIORITY_OPTIONS / DEFAULT_PRIORITY contracts', () => {
  it('exposes exactly High/Medium/Low with tone tokens', () => {
    assert.deepEqual(PRIORITY_OPTIONS, [
      { id: '1', label: 'High',   tone: 'error' },
      { id: '2', label: 'Medium', tone: 'warning' },
      { id: '3', label: 'Low',    tone: 'muted' },
    ]);
  });

  it('defaults new tasks to Medium (2)', () => {
    assert.equal(DEFAULT_PRIORITY, 2);
  });
});

describe('getPriority', () => {
  it('resolves string and numeric ids to the full option record', () => {
    assert.deepEqual(getPriority('1'), { id: '1', label: 'High', tone: 'error' });
    assert.deepEqual(getPriority(3), { id: '3', label: 'Low', tone: 'muted' });
  });

  it('falls back to Medium for garbage or missing ids', () => {
    assert.equal(getPriority('99').label, 'Medium');
    assert.equal(getPriority('urgent').label, 'Medium');
    assert.equal(getPriority(undefined).label, 'Medium');
  });
});

describe('getDueLabel', () => {
  it('labels 0 days / null / "" as due today', () => {
    assert.equal(getDueLabel(0), 'today');
    assert.equal(getDueLabel(null), 'today');
    assert.equal(getDueLabel(''), 'today');
    assert.equal(getDueLabel(undefined), 'today');
  });

  it('labels 1, 7, and 30 days out as "in Nd"', () => {
    assert.equal(getDueLabel(1), 'in 1d');
    assert.equal(getDueLabel(7), 'in 7d');
    assert.equal(getDueLabel(30), 'in 30d');
  });

  it('parses string day counts and clamps negatives to today', () => {
    assert.equal(getDueLabel('7'), 'in 7d');
    assert.equal(getDueLabel(-3), 'today');
    assert.equal(getDueLabel('junk'), 'today');
  });
});

describe('loadTaskTemplates', () => {
  it('reads noteTemplates via chrome.storage and keeps only enabled task rows', async () => {
    globalThis.chrome = {
      storage: { local: { get(key, cb) { cb({ [key]: TASK_FIXTURE }); } } },
    };
    try {
      const templates = await loadTaskTemplates();
      assert.deepEqual(templates.map((t) => t.id), ['k1', 'k4']);
    } finally {
      delete globalThis.chrome;
    }
  });

  it('resolves [] when the stored value is not an array', async () => {
    globalThis.chrome = { storage: { local: { get(key, cb) { cb({ noteTemplates: 'oops' }); } } } };
    try {
      assert.deepEqual(await loadTaskTemplates(), []);
    } finally {
      delete globalThis.chrome;
    }
  });

  it('falls back to localStorage outside an extension context', async () => {
    delete globalThis.chrome;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: (k) => (k === 'noteTemplates' ? JSON.stringify(TASK_FIXTURE) : null) },
    });
    try {
      const templates = await loadTaskTemplates();
      assert.deepEqual(templates.map((t) => t.id), ['k1', 'k4']);
    } finally {
      delete globalThis.localStorage;
    }
  });
});

describe('qtFormatTyped / qtParseTyped', () => {
  it('auto-formats raw digits into mm/dd/yy while typing', () => {
    assert.equal(qtFormatTyped('063025'), '06/30/25');
    assert.equal(qtFormatTyped('063'), '06/3');
    assert.equal(qtFormatTyped('06-30-25x9'), '06/30/25'); // strips non-digits, caps at 6
  });

  it('parses 2-digit years as 20xx at local midnight', () => {
    const d = qtParseTyped('6/30/25');
    assert.equal(d.getFullYear(), 2025);
    assert.equal(d.getMonth(), 5);
    assert.equal(d.getDate(), 30);
    assert.equal(d.getHours(), 0);
  });

  it('rejects impossible dates like 02/31 and malformed strings', () => {
    assert.equal(qtParseTyped('02/31/25'), null);
    assert.equal(qtParseTyped('13/01/25'), null);
    assert.equal(qtParseTyped('6-30-25'), null);
  });
});

describe('buildCustomTaskTemplate', () => {
  it('normalizes fields and clamps daysOut into [0, 3650]', () => {
    const tpl = buildCustomTaskTemplate({
      subject: ' Call about reorder ',
      body: ' see notes ',
      priority: '1',
      daysOut: '99999',
      categoryId: '12',
    });
    assert.equal(tpl.name, 'Call about reorder');
    assert.equal(tpl.subType, 'task');
    assert.equal(tpl.priority, 1);
    assert.equal(tpl.daysOut, 3650);
    assert.equal(tpl.categoryId, 12);
    assert.match(tpl.id, /^custom-task-\d+$/);
  });

  it('defaults to Medium priority, null daysOut, and "Custom task" name', () => {
    const tpl = buildCustomTaskTemplate({});
    assert.equal(tpl.name, 'Custom task');
    assert.equal(tpl.priority, DEFAULT_PRIORITY);
    assert.equal(tpl.daysOut, null);
    assert.equal(tpl.categoryId, 0);
  });
});
