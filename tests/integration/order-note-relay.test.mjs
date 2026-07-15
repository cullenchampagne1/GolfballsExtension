import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const listeners = [];
const storage = { noteTemplates: [] };
let nextResult = { action: 'GB_QUICK_NOTE_DONE' };
let lastMessage = null;

globalThis.chrome = {
  runtime: {
    lastError: null,
    onMessage: { addListener(fn) { listeners.push(fn); } },
    sendMessage(message, callback) {
      lastMessage = message;
      callback({ ok: true });
      queueMicrotask(() => {
        const response = { ...nextResult, requestId: message.payload.requestId };
        listeners.forEach((listener) => listener(response));
      });
    },
  },
  storage: { local: {
    get(keys, callback) { callback(storage); },
    set(values) { Object.assign(storage, values); return Promise.resolve(); },
  } },
};

const { submitOrderNote } = await import('../../src/lib/submitOrderNote.js');
const { LAST_ORDER_NOTE_KEY } = await import('../../src/lib/quickOrderNote.js');

describe('order note top-frame → iCustomize relay', () => {
  it('broadcasts a bounded note payload and remembers a successful saved template', async () => {
    nextResult = { action: 'GB_QUICK_NOTE_DONE' };
    const result = await submitOrderNote({
      id: 'note-7', name: ' Proof requested ', subject: ' Proof ', body: 'Please review',
      audienceVal: ' Custom Logo ', daysOut: 2,
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(lastMessage.action, 'broadcastToFrames');
    assert.equal(lastMessage.payload.action, 'GB_APPLY_QUICK_NOTE');
    assert.deepEqual(lastMessage.payload.note, {
      id: 'note-7', name: 'Proof requested', subType: 'note', subject: 'Proof',
      body: 'Please review', audienceVal: 'Custom Logo', daysOut: 2,
    });
    assert.equal(storage[LAST_ORDER_NOTE_KEY], 'note-7');
  });

  it('surfaces an authenticated-frame error without changing the remembered template', async () => {
    nextResult = { action: 'GB_QUICK_NOTE_ERROR', error: 'recordNote rejected' };
    const before = storage[LAST_ORDER_NOTE_KEY];
    const result = await submitOrderNote({ id: 'note-8', subject: 'Status', body: 'Waiting' });
    assert.deepEqual(result, { ok: false, error: 'recordNote rejected' });
    assert.equal(storage[LAST_ORDER_NOTE_KEY], before);
  });

  it('rejects an empty note before contacting the frame', async () => {
    lastMessage = null;
    assert.deepEqual(await submitOrderNote({ id: 'empty' }), { ok: false, error: 'Add a subject or note body first' });
    assert.equal(lastMessage, null);
  });
});
