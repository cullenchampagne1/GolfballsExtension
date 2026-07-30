/* Content-side facade for the service-worker-owned Page Engine index. */
import { sendBackgroundMessage } from '../backgroundMessage.js';

const STATE_KEY = '__gbPageEngineIndexClientV1';

function createState() {
  const state = {
    config: null,
    configPromise: null,
  };
  try {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes.devSettings) {
        const settings = changes.devSettings.newValue || {};
        state.config = {
          enabled: settings['pageEngine.indexingEnabled'] === true,
          accountId: String(settings['pageEngine.accountId'] || '').trim(),
        };
        state.configPromise = null;
      }
    });
  } catch { /* non-extension/test context */ }
  return state;
}

function sharedState() {
  if (!globalThis[STATE_KEY]) globalThis[STATE_KEY] = createState();
  return globalThis[STATE_KEY];
}

async function readConfig() {
  const state = sharedState();
  if (state.config) return state.config;
  if (!state.configPromise) {
    state.configPromise = new Promise((resolve) => {
      try {
        chrome.storage.local.get('devSettings', (value) => {
          const settings = value?.devSettings || {};
          state.config = {
            enabled: settings['pageEngine.indexingEnabled'] === true,
            accountId: String(settings['pageEngine.accountId'] || '').trim(),
          };
          resolve(state.config);
        });
      } catch {
        state.config = { enabled: false, accountId: '' };
        resolve(state.config);
      }
    });
  }
  return state.configPromise;
}

function sourceUrlFor(doc, explicitUrl = '') {
  if (explicitUrl) return String(explicitUrl);
  try {
    if (doc?.body?.dataset?.gbSourceUrl) return doc.body.dataset.gbSourceUrl;
  } catch {}
  try {
    if (doc?.URL && doc.URL !== 'about:blank') return doc.URL;
  } catch {}
  try { return window.location.href; } catch { return ''; }
}

/**
 * Queue an extracted snapshot without delaying the synchronous Page Engine.
 * The worker performs an idempotent upsert, so every completed extraction is
 * submitted: a second view may contain newer CRM data than the first.
 */
export async function queueEngineSnapshot(result, { doc, sourceUrl } = {}) {
  if (!result?.schemaId || !result?.data) return { indexed: false, reason: 'no-snapshot' };
  const config = await readConfig();
  if (!config.enabled) return { indexed: false, reason: 'disabled' };
  if (!config.accountId) return { indexed: false, reason: 'missing-account-id' };

  const now = Date.now();
  return sendBackgroundMessage('pageEngineIndexPut', {
    snapshot: {
      schemaId: result.schemaId,
      data: result.data,
      sourceUrl: sourceUrlFor(doc, sourceUrl),
      indexedAt: now,
    },
  });
}

export async function getEngineIndexConfig() {
  return { ...(await readConfig()) };
}

export async function queryEngineIndex({
  where = [],
  orderBy = null,
  limit = 100,
} = {}) {
  return sendBackgroundMessage('pageEngineIndexQuery', {
    query: { where, orderBy, limit },
  });
}

export function getEngineIndexStats() {
  return sendBackgroundMessage('pageEngineIndexStats');
}

export function clearEngineIndex() {
  return sendBackgroundMessage('pageEngineIndexClear');
}
