import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const {
  LAST_ORDER_NOTE_KEY,
  buildCustomOrderNote,
  filterOrderNoteTemplates,
  loadLastOrderNote,
  loadOrderNoteTemplates,
  normalizeOrderNote,
  saveLastOrderNoteId,
} = await import('../../src/lib/quickOrderNote.js');

const FIXTURE = [
  { id: 'n1', name: 'Proof requested', subType: 'note', enabled: true, daysOut: 2 },
  { id: 'n2', name: 'Legacy note', enabled: true },
  { id: 'n3', name: 'Disabled note', subType: 'note', enabled: false },
  { id: 't1', name: 'Task', subType: 'task', enabled: true },
];

describe('order-note template filtering', () => {
  it('keeps enabled note and legacy-note templates only', () => {
    assert.deepEqual(filterOrderNoteTemplates(FIXTURE).map((row) => row.id), ['n1', 'n2']);
  });

  it('reads the same filtered rows from chrome storage', async () => {
    globalThis.chrome = { storage: { local: { get(key, cb) { cb({ noteTemplates: FIXTURE }); } } } };
    try { assert.deepEqual((await loadOrderNoteTemplates()).map((row) => row.id), ['n1', 'n2']); }
    finally { delete globalThis.chrome; }
  });
});

describe('order-note payload normalization', () => {
  it('keeps the iframe contract fields and clamps invalid days-out to null', () => {
    assert.deepEqual(normalizeOrderNote({
      id: 42, name: ' Note ', subject: ' Subject ', body: 'Body', audienceVal: ' Art ', daysOut: -2,
    }), {
      id: '42', name: 'Note', subType: 'note', subject: 'Subject', body: 'Body', audienceVal: 'Art', daysOut: null,
    });
  });

  it('builds a custom note compatible with saved templates', () => {
    const note = buildCustomOrderNote({ subject: 'Status', body: 'Proof requested', audienceVal: 'Custom Logo', daysOut: 3 });
    assert.match(note.id, /^custom-/);
    assert.equal(note.name, 'Status');
    assert.equal(note.daysOut, 3);
    assert.equal(note.audienceVal, 'Custom Logo');
  });

  it('preserves a saved follow-up action for the post-success runner', () => {
    const note = normalizeOrderNote({
      id: 'n1',
      subject: 'Proof requested',
      followUpActionId: ' action_9 ',
    });
    assert.equal(note.followUpActionId, 'action_9');
  });
});

describe('Apply last note storage', () => {
  it('stores an applied template id and resolves it against current enabled notes', async () => {
    const state = { noteTemplates: FIXTURE };
    globalThis.chrome = {
      storage: { local: {
        get(keys, cb) { cb(state); },
        set(values) { Object.assign(state, values); return Promise.resolve(); },
      } },
    };
    try {
      await saveLastOrderNoteId('n1');
      assert.equal(state[LAST_ORDER_NOTE_KEY], 'n1');
      assert.equal((await loadLastOrderNote()).name, 'Proof requested');
    } finally { delete globalThis.chrome; }
  });

  it('returns null when the remembered template was removed or disabled', async () => {
    globalThis.chrome = { storage: { local: { get(keys, cb) { cb({ noteTemplates: FIXTURE, [LAST_ORDER_NOTE_KEY]: 'n3' }); } } } };
    try { assert.equal(await loadLastOrderNote(), null); }
    finally { delete globalThis.chrome; }
  });
});
