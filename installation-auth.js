/**
 * Anonymous installation enrollment for api.cullenchampagne.com.
 *
 * Each Chrome installation receives a different existing-format RevStack API
 * key. No credential is compiled into this file, exposed through runtime
 * messages, included in presets, or broadcast to content scripts. Revocation
 * deliberately does not trigger automatic re-enrollment: a revoked install
 * must remain revoked until its local extension data is removed.
 */
(function installAnonymousApiClient(root) {
  'use strict';

  const API_ORIGIN = 'https://api.cullenchampagne.com';
  const ENROLLMENT_URL = `${API_ORIGIN}/auth/extension-installation`;
  const STORAGE_KEY = 'gbApiInstallation';
  const RESPONSE_LIMIT = 32_000;
  // Settings snapshots can legitimately contain large template libraries and
  // custom-page definitions. Keep the browser guard aligned with the backend's
  // 100 MiB per-share ceiling (plus JSON-envelope headroom) instead of failing
  // locally before fetch().
  const EXTENSION_JSON_LIMIT = 110 * 1024 * 1024;
  const CONFIG_RESPONSE_LIMIT = EXTENSION_JSON_LIMIT;
  const REQUEST_BODY_LIMIT = EXTENSION_JSON_LIMIT;
  const API_KEY_RE = /^rsk_[a-f0-9]{12}_[A-Za-z0-9_-]{40,80}$/;
  const INSTALLATION_ID_RE = /^[a-f0-9-]{32,40}$/i;
  let enrollmentPromise = null;

  function runtimeIdentity() {
    const manifest = chrome.runtime.getManifest();
    return {
      extensionId: String(chrome.runtime.id || ''),
      extensionVersion: String(manifest?.version || ''),
    };
  }

  function storageGet(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (result) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Unable to read extension storage'));
        else resolve(result?.[key]);
      });
    });
  }

  function storageSet(value) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Unable to save installation credential'));
        else resolve();
      });
    });
  }

  function normalizeInstallation(value) {
    if (!value || typeof value !== 'object') return null;
    const installationId = String(value.installationId || '');
    const apiKey = String(value.apiKey || '');
    const extensionId = String(value.extensionId || '');
    const { extensionId: currentId } = runtimeIdentity();
    if (!INSTALLATION_ID_RE.test(installationId)
        || !API_KEY_RE.test(apiKey)
        || !extensionId
        || extensionId !== currentId) return null;
    return {
      installationId,
      apiKey,
      keyPrefix: String(value.keyPrefix || '').slice(0, 40),
      enrolledAt: Number(value.enrolledAt) || 0,
      extensionId,
      extensionVersion: String(value.extensionVersion || ''),
    };
  }

  async function readResponseJson(response, limit = RESPONSE_LIMIT, label = 'Enrollment') {
    const declared = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > limit) {
      throw new Error(`${label} response exceeds size limit`);
    }
    const reader = response.body?.getReader?.();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > limit) {
            await reader.cancel();
            throw new Error(`${label} response exceeds size limit`);
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    } else {
      text = await response.text();
      if (text.length > limit) throw new Error(`${label} response exceeds size limit`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  }

  async function enroll() {
    const identity = runtimeIdentity();
    const response = await fetch(ENROLLMENT_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      const suffix = retryAfter ? `; retry after ${retryAfter}s` : '';
      throw new Error(`Installation enrollment failed with HTTP ${response.status}${suffix}`);
    }

    const payload = await readResponseJson(response);
    const candidate = normalizeInstallation({
      installationId: payload?.installation_id,
      apiKey: payload?.api_key,
      keyPrefix: payload?.key_prefix,
      enrolledAt: Date.now(),
      ...identity,
    });
    if (!candidate) throw new Error('Enrollment returned an invalid installation credential');
    await storageSet(candidate);
    return candidate;
  }

  async function ensureInstallation() {
    if (enrollmentPromise) return enrollmentPromise;
    enrollmentPromise = (async () => {
      const identity = runtimeIdentity();
      const existing = normalizeInstallation(await storageGet(STORAGE_KEY));
      if (existing) {
        if (existing.extensionVersion !== identity.extensionVersion) {
          existing.extensionVersion = identity.extensionVersion;
          await storageSet(existing);
        }
        return existing;
      }
      return enroll();
    })();
    try {
      return await enrollmentPromise;
    } finally {
      enrollmentPromise = null;
    }
  }

  async function apiFetch(path, options = {}) {
    const url = new URL(String(path || ''), API_ORIGIN);
    if (url.origin !== API_ORIGIN || !url.pathname.startsWith('/extension/')) {
      throw new Error('Blocked non-extension API path');
    }
    if (url.username || url.password || url.port || url.hash) {
      throw new Error('Blocked malformed extension API URL');
    }
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) throw new Error('Blocked extension API method');
    if (options.body != null
        && (typeof options.body !== 'string' || options.body.length > REQUEST_BODY_LIMIT)) {
      throw new Error('Extension API body must be a bounded serialized string');
    }
    if (method === 'GET' && options.body != null) {
      throw new Error('GET extension API requests cannot contain a body');
    }

    const installation = await ensureInstallation();
    const headers = new Headers(options.headers || {});
    headers.delete('authorization');
    headers.set('Authorization', `Bearer ${installation.apiKey}`);
    headers.set('Accept', 'application/json');
    return fetch(url.href, {
      ...options,
      method,
      headers,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
  }

  /** Fetch the one server-managed document, including an opaque dashboard
   * cookie when Chrome has one so the server can apply administrator bypass. */
  async function fetchConfiguration() {
    const installation = await ensureInstallation();
    const response = await fetch(`${API_ORIGIN}/extension/configuration`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${installation.apiKey}`,
      },
      cache: 'no-store',
      credentials: 'include',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error(`Configuration request failed with HTTP ${response.status}`);
    return readResponseJson(response, CONFIG_RESPONSE_LIMIT, 'Configuration');
  }

  /** Bounded JSON helper for fixed `/extension/*` product endpoints. */
  async function apiJson(path, options = {}) {
    const requestOptions = { ...options };
    if (requestOptions.body != null) {
      const headers = new Headers(requestOptions.headers || {});
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      requestOptions.headers = headers;
    }
    const response = await apiFetch(path, requestOptions);
    let payload;
    try {
      payload = await readResponseJson(response, CONFIG_RESPONSE_LIMIT, 'Extension API');
    } catch (error) {
      if (!response.ok) throw new Error(`Extension API request failed with HTTP ${response.status}`);
      throw error;
    }
    if (!response.ok) {
      const detail = typeof payload?.detail === 'string' ? payload.detail.slice(0, 240) : '';
      throw new Error(detail || `Extension API request failed with HTTP ${response.status}`);
    }
    return payload;
  }

  async function getStatus() {
    const installation = normalizeInstallation(await storageGet(STORAGE_KEY));
    if (!installation) return { enrolled: false };
    return {
      enrolled: true,
      installationId: installation.installationId,
      keyPrefix: installation.keyPrefix,
      enrolledAt: installation.enrolledAt,
      extensionId: installation.extensionId,
      extensionVersion: installation.extensionVersion,
    };
  }

  function enrollInBackground() {
    ensureInstallation().catch(() => {});
  }

  chrome.runtime.onInstalled?.addListener(enrollInBackground);
  chrome.runtime.onStartup?.addListener(enrollInBackground);

  root.GBInstallationAuth = Object.freeze({
    API_ORIGIN,
    STORAGE_KEY,
    apiFetch,
    apiJson,
    fetchConfiguration,
    ensureInstallation,
    getStatus,
  });
})(globalThis);
