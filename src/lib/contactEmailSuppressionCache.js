const STORAGE_KEY = 'gbContactEmailSuppressionsV1';

let mutationQueue = Promise.resolve();

export function normalizeSuppressionEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

async function emailDigest(email, cryptoImpl = globalThis.crypto) {
  const normalized = normalizeSuppressionEmail(email);
  if (!normalized) return '';
  if (!cryptoImpl?.subtle) throw new Error('Secure email suppression storage is unavailable');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function storageArea(area) {
  const resolved = area || globalThis.chrome?.storage?.local;
  if (!resolved) throw new Error('Extension local storage is unavailable');
  return resolved;
}

function storageGet(area, key) {
  return new Promise((resolve, reject) => {
    try {
      area.get(key, (result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Could not read suppression cache'));
        else resolve(result || {});
      });
    } catch (error) { reject(error); }
  });
}

function storageSet(area, value) {
  return new Promise((resolve, reject) => {
    try {
      area.set(value, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) reject(new Error(error.message || 'Could not write suppression cache'));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
}

function validEntries(ledger) {
  const raw = ledger?.entries;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([digest, entry]) => (
    /^[a-f0-9]{64}$/.test(digest)
    && entry && typeof entry === 'object'
    && /^\d{1,12}$/.test(String(entry.contactId || ''))
  )));
}

async function readEntries(area) {
  const result = await storageGet(storageArea(area), STORAGE_KEY);
  return validEntries(result[STORAGE_KEY]);
}

export async function isContactEmailSuppressed(email, { area, cryptoImpl } = {}) {
  const digest = await emailDigest(email, cryptoImpl);
  if (!digest) return false;
  const entries = await readEntries(area);
  return Object.hasOwn(entries, digest);
}

export function setContactEmailSuppression({
  email,
  contactId,
  suppressed,
  area,
  cryptoImpl,
  now = Date.now(),
} = {}) {
  const run = async () => {
    const id = String(contactId || '').trim();
    if (!/^\d{1,12}$/.test(id)) throw new Error('A numeric contact ID is required');
    const digest = await emailDigest(email, cryptoImpl);
    if (suppressed && !digest) throw new Error('A valid contact email is required');
    const resolvedArea = storageArea(area);
    const entries = await readEntries(resolvedArea);

    for (const [key, entry] of Object.entries(entries)) {
      if (String(entry.contactId) === id) delete entries[key];
    }
    if (suppressed) entries[digest] = { contactId: id, markedAt: Number(now) || Date.now() };
    await storageSet(resolvedArea, { [STORAGE_KEY]: { version: 1, entries } });
  };
  const pending = mutationQueue.then(run, run);
  mutationQueue = pending.catch(() => {});
  return pending;
}

export const CONTACT_EMAIL_SUPPRESSION_STORAGE_KEY = STORAGE_KEY;
