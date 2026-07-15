/* Shared storage + payload helpers for the order-page Quick Note modal. */

export const NOTE_TEMPLATES_KEY = 'noteTemplates';
export const LAST_ORDER_NOTE_KEY = 'gbLastOrderNoteTemplateId';

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; }
  catch { return false; }
};

export function filterOrderNoteTemplates(raw) {
  return (Array.isArray(raw) ? raw : []).filter((template) =>
    template && template.enabled !== false && (!template.subType || template.subType === 'note'));
}

export function loadOrderNoteTemplates() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.get(NOTE_TEMPLATES_KEY, (data) => {
        resolve(filterOrderNoteTemplates(data?.[NOTE_TEMPLATES_KEY]));
      });
      return;
    }
    try {
      resolve(filterOrderNoteTemplates(JSON.parse(localStorage.getItem(NOTE_TEMPLATES_KEY) || '[]')));
    } catch { resolve([]); }
  });
}

export function subscribeToOrderNoteTemplates(handler) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged?.addListener) return () => {};
  const onChanged = (changes, area) => {
    if (area !== 'local' || !changes[NOTE_TEMPLATES_KEY]) return;
    handler(filterOrderNoteTemplates(changes[NOTE_TEMPLATES_KEY].newValue));
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

export function normalizeOrderNote(template = {}) {
  const days = template.daysOut == null ? null : Number.parseInt(template.daysOut, 10);
  return {
    id: String(template.id || ''),
    name: String(template.name || template.subject || 'Quick note').trim().slice(0, 160),
    subType: 'note',
    subject: String(template.subject || template.name || '').trim().slice(0, 500),
    body: String(template.body || '').slice(0, 10_000),
    audienceVal: String(template.audienceVal || '').trim().slice(0, 160),
    daysOut: Number.isInteger(days) && days >= 0 && days <= 3650 ? days : null,
  };
}

export function buildCustomOrderNote({ subject, body, audienceVal, daysOut } = {}) {
  return normalizeOrderNote({
    id: `custom-${Date.now()}`,
    name: subject || 'Custom order note',
    subject,
    body,
    audienceVal,
    daysOut,
  });
}

export function saveLastOrderNoteId(id) {
  const value = String(id || '').trim();
  if (!value) return Promise.resolve();
  if (hasChromeStorage()) return chrome.storage.local.set({ [LAST_ORDER_NOTE_KEY]: value });
  try { localStorage.setItem(LAST_ORDER_NOTE_KEY, value); } catch { /* no storage */ }
  return Promise.resolve();
}

export function loadLastOrderNote() {
  return new Promise((resolve) => {
    const finish = (templates, id) => resolve(
      filterOrderNoteTemplates(templates).find((template) => String(template.id) === String(id || '')) || null,
    );
    if (hasChromeStorage()) {
      chrome.storage.local.get([NOTE_TEMPLATES_KEY, LAST_ORDER_NOTE_KEY], (data) => {
        finish(data?.[NOTE_TEMPLATES_KEY], data?.[LAST_ORDER_NOTE_KEY]);
      });
      return;
    }
    try {
      finish(JSON.parse(localStorage.getItem(NOTE_TEMPLATES_KEY) || '[]'), localStorage.getItem(LAST_ORDER_NOTE_KEY));
    } catch { resolve(null); }
  });
}
