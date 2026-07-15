import { normalizeOrderNote, saveLastOrderNoteId } from './quickOrderNote.js';

const pending = new Map();
let listenerInstalled = false;

function ensureResultListener() {
  if (listenerInstalled || typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
  listenerInstalled = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !['GB_QUICK_NOTE_DONE', 'GB_QUICK_NOTE_ERROR'].includes(message.action)) return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    clearTimeout(request.timer);
    request.resolve(message.action === 'GB_QUICK_NOTE_DONE'
      ? { ok: true }
      : { ok: false, error: message.error || 'The order note could not be applied' });
  });
}

export function submitOrderNote(template, { timeoutMs = 35_000 } = {}) {
  const note = normalizeOrderNote(template);
  if (!note.subject && !note.body) return Promise.resolve({ ok: false, error: 'Add a subject or note body first' });
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return Promise.resolve({ ok: false, error: 'The order frame is unavailable' });
  }
  ensureResultListener();
  const requestId = `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: 'The order frame did not respond' });
    }, timeoutMs);
    pending.set(requestId, { resolve, timer });
    chrome.runtime.sendMessage({
      action: 'broadcastToFrames',
      payload: { action: 'GB_APPLY_QUICK_NOTE', requestId, note },
    }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve({ ok: false, error: chrome.runtime.lastError?.message || response?.error || 'Could not reach the order frame' });
      }
    });
  }).then(async (result) => {
    if (result.ok && note.id && !note.id.startsWith('custom-')) await saveLastOrderNoteId(note.id);
    return result;
  });
}
