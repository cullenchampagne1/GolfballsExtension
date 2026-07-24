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

  // Origin comes from config.js (globalThis.GB_BACKEND_ORIGIN), loaded first by
  // the service worker; the literal is only a fallback for non-SW contexts.
  const API_ORIGIN = root.GB_BACKEND_ORIGIN || 'https://api.cullenchampagne.com';
  const ENROLLMENT_URL = `${API_ORIGIN}/auth/extension-installation`;
  const STORAGE_KEY = 'gbApiInstallation';
  const IDENTITY_CACHE_KEY = 'gbInstallationIdentity';
  const CLIENT_BASE = '/projects/golfballs-extension/client';
  const IDENTITY_PATH = `${CLIENT_BASE}/identity`;
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
  const ASSISTANT_BASE = '/projects/golfballs-extension/assistant';
  const ASSISTANT_RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/;
  /* @admin:start */
  const EMAIL_RELAY_PENDING_PATH = '/services/email-relay-service/messages/pending';
  /* @admin:end */
  let enrollmentPromise = null;
  let identityPromise = null;
  let identitySyncTimer = null;

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

  function storageSetKey(key, value, errorMessage) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || errorMessage));
        else resolve();
      });
    });
  }

  function storageSet(value) {
    return storageSetKey(STORAGE_KEY, value, 'Unable to save installation credential');
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

  function isAllowedApiRoute(url, method) {
    // Product calls are confined to this extension project's client namespace.
    // Help remains a separately enumerated surface. This is intentionally not
    // a general authenticated fetch primitive.
    if (url.pathname.startsWith(`${CLIENT_BASE}/`)) {
      if (method === 'DELETE') {
        return !url.search && new RegExp(
          `^${CLIENT_BASE}/product-generation/batches/batch_[a-f0-9]{32}$`,
        ).test(url.pathname);
      }
      return ['GET', 'POST'].includes(method);
    }
    /* @admin:start */
    if (url.pathname === EMAIL_RELAY_PENDING_PATH) {
      if (method !== 'GET') return false;
      const seen = new Set();
      for (const [key, value] of url.searchParams) {
        if (seen.has(key) || !['since', 'limit', 'wait'].includes(key)) return false;
        if (!/^\d{1,16}$/.test(value)) return false;
        seen.add(key);
      }
      return true;
    }
    /* @admin:end */
    if (url.search) return false;
    if (url.pathname === `${ASSISTANT_BASE}/health`) return method === 'GET';
    if (url.pathname === `${ASSISTANT_BASE}/status`) return method === 'GET';
    if (url.pathname === `${ASSISTANT_BASE}/messages`) return method === 'POST';
    if (url.pathname === `${ASSISTANT_BASE}/feedback`) return method === 'POST';
    const runMatch = url.pathname.match(new RegExp(`^${ASSISTANT_BASE}/runs/([^/]+)(/cancel)?$`));
    if (!runMatch) return false;
    let runId = '';
    try { runId = decodeURIComponent(runMatch[1]); } catch { return false; }
    if (!ASSISTANT_RUN_ID_RE.test(runId)) return false;
    return runMatch[2] ? method === 'POST' : method === 'GET';
  }

  async function apiFetch(path, options = {}) {
    const url = new URL(String(path || ''), API_ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      throw new Error('Blocked extension API method');
    }
    if (url.origin !== API_ORIGIN || !isAllowedApiRoute(url, method)) {
      throw new Error('Blocked non-extension API path');
    }
    if (url.username || url.password || url.port || url.hash) {
      throw new Error('Blocked malformed extension API URL');
    }
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
    const response = await fetch(url.href, {
      ...options,
      method,
      headers,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (response.status === 401) {
      root.GBRuntimeCoordinator?.close?.({ reload: true }).catch?.(() => {});
    } else if (response.status === 403 && url.pathname.startsWith(`${CLIENT_BASE}/`)) {
      if (root.GBRuntimeBootstrap?.isDecisionPath?.(url.pathname)) {
        root.GBRuntimeCoordinator?.close?.({ reload: true }).catch?.(() => {});
      } else {
        root.GBRuntimeCoordinator?.sync?.().catch?.(() => {});
      }
    }
    return response;
  }

  /** Fetch the one server-managed document, including an opaque dashboard
   * cookie when Chrome has one so the server can apply administrator bypass. */
  async function fetchConfiguration() {
    const installation = await ensureInstallation();
    const response = await fetch(`${API_ORIGIN}${CLIENT_BASE}/configuration`, {
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
    if (response.status === 401) {
      root.GBRuntimeCoordinator?.close?.({ reload: true }).catch?.(() => {});
    } else if (response.status === 403) {
      root.GBRuntimeCoordinator?.sync?.().catch?.(() => {});
    }
    if (!response.ok) throw new Error(`Configuration request failed with HTTP ${response.status}`);
    return readResponseJson(response, CONFIG_RESPONSE_LIMIT, 'Configuration');
  }

  /** Bounded JSON helper for fixed project-owned product endpoints. */
  async function apiJson(path, options = {}) {
    const responseLimit = Number.isFinite(Number(options.responseLimit))
      ? Math.max(1_024, Math.min(CONFIG_RESPONSE_LIMIT, Number(options.responseLimit)))
      : CONFIG_RESPONSE_LIMIT;
    const { responseLimit: _responseLimit, ...requestOptions } = options;
    if (requestOptions.body != null) {
      const headers = new Headers(requestOptions.headers || {});
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      requestOptions.headers = headers;
    }
    const response = await apiFetch(path, requestOptions);
    let payload;
    try {
      payload = await readResponseJson(response, responseLimit, 'Extension API');
    } catch (error) {
      if (!response.ok) {
        const httpError = new Error(`Extension API request failed with HTTP ${response.status}`);
        httpError.status = response.status;
        throw withResponseMetadata(httpError, response);
      }
      throw error;
    }
    if (!response.ok) {
      const detail = formatApiErrorDetail(payload);
      const error = new Error(detail || `Extension API request failed with HTTP ${response.status}`);
      error.status = response.status;
      throw withResponseMetadata(error, response);
    }
    return payload;
  }

  /* @admin:start */
  /** Bounded JSON for the admin-only mockup catalog authoring surface.
   *
   * Identical to apiJson except the dashboard cookie rides along, because the
   * server authorizes authoring on a dashboard ADMINISTRATOR session — the
   * installation key only identifies the caller. Confined to the catalog
   * subtree so this never becomes a general credentialed fetch primitive.
   */
  const CATALOG_BASE = `${CLIENT_BASE}/product-generation/catalog`;
  async function catalogAdminJson(path, options = {}) {
    const url = new URL(String(path || ''), API_ORIGIN);
    const method = String(options.method || 'GET').toUpperCase();
    if (url.origin !== API_ORIGIN
        || (url.pathname !== CATALOG_BASE && !url.pathname.startsWith(`${CATALOG_BASE}/`))
        || !['GET', 'POST'].includes(method)
        || url.username || url.password || url.port || url.hash || url.search) {
      throw new Error('Blocked non-catalog admin API path');
    }
    if (options.body != null
        && (typeof options.body !== 'string' || options.body.length > REQUEST_BODY_LIMIT)) {
      throw new Error('Extension API body must be a bounded serialized string');
    }
    const installation = await ensureInstallation();
    const headers = new Headers();
    headers.set('Authorization', `Bearer ${installation.apiKey}`);
    headers.set('Accept', 'application/json');
    if (options.body != null) headers.set('Content-Type', 'application/json');
    const response = await fetch(url.href, {
      method,
      headers,
      body: options.body ?? undefined,
      cache: 'no-store',
      credentials: 'include',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    let payload = null;
    try {
      payload = await readResponseJson(response, CONFIG_RESPONSE_LIMIT, 'Catalog admin');
    } catch (error) {
      if (response.ok) throw error;
    }
    if (!response.ok) {
      const detail = formatApiErrorDetail(payload);
      const error = new Error(
        detail || `Catalog admin request failed with HTTP ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  /* @admin:end */

  function withResponseMetadata(error, response) {
    const raw = response?.headers?.get?.('retry-after');
    if (raw) {
      const numeric = Number(raw);
      const seconds = Number.isFinite(numeric)
        ? numeric
        : (Date.parse(raw) - Date.now()) / 1000;
      if (Number.isFinite(seconds) && seconds > 0) {
        error.retryAfterSeconds = Math.max(1, Math.min(3600, Math.ceil(seconds)));
      }
    }
    return error;
  }

  function formatApiErrorDetail(payload) {
    if (typeof payload?.detail === 'string') return payload.detail.trim().slice(0, 240);
    if (!Array.isArray(payload?.detail)) return '';
    return payload.detail.slice(0, 4).map((item) => {
      if (!item || typeof item !== 'object') return '';
      const location = Array.isArray(item.loc)
        ? item.loc.filter((part) => part !== 'body').map(String).join('.')
        : '';
      const message = String(item.msg || item.message || '').trim();
      if (!message) return '';
      return location ? `${location}: ${message}` : message;
    }).filter(Boolean).join('; ').slice(0, 240);
  }

  function normalizeLocalPart(value) {
    const localPart = String(value || '').trim().toLowerCase();
    return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/.test(localPart)
      ? localPart
      : '';
  }

  function normalizeDisplayName(value) {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    return name && name.length <= 120 && !/[\u0000-\u001f\u007f]/.test(name)
      ? name
      : '';
  }

  function displayNameFromLocalPart(localPart) {
    return normalizeLocalPart(localPart)
      .split(/[._+-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .slice(0, 120);
  }

  function normalizeIdentity(value) {
    const raw = value && typeof value === 'object' ? value : {};
    const displayName = normalizeDisplayName(raw.display_name ?? raw.displayName);
    const localPart = normalizeLocalPart(raw.local_part ?? raw.localPart);
    const registered = raw.registered === true && !!displayName;
    return {
      registered,
      installationId: String(raw.installation_id ?? raw.installationId ?? '').slice(0, 40),
      displayName: registered ? displayName : '',
      localPart: registered ? localPart : '',
      source: registered ? String(raw.source || '').slice(0, 32) : '',
      createdAt: registered ? String(raw.created_at ?? raw.createdAt ?? '').slice(0, 40) : '',
      updatedAt: registered ? String(raw.updated_at ?? raw.updatedAt ?? '').slice(0, 40) : '',
      promptRequired: !registered,
    };
  }

  async function cacheIdentity(value) {
    const identity = normalizeIdentity(value);
    await storageSetKey(
      IDENTITY_CACHE_KEY, identity, 'Unable to save installation identity status',
    );
    return identity;
  }

  async function fetchIdentity() {
    return cacheIdentity(await apiJson(IDENTITY_PATH));
  }

  async function localIdentityPart() {
    const devSettings = await storageGet('devSettings');
    return normalizeLocalPart(devSettings?.['email.localPart']);
  }

  async function updateIdentity({ displayName, localPart = '', source = 'settings_prompt' } = {}) {
    const name = normalizeDisplayName(displayName);
    const part = normalizeLocalPart(localPart);
    if (!name) throw new Error('Enter your name before registering this extension');
    if (localPart && !part) throw new Error('The configured email account host is invalid');
    if (!['email_local_part', 'settings_prompt', 'settings_edit'].includes(source)) {
      throw new Error('Invalid installation identity source');
    }
    return cacheIdentity(await apiJson(IDENTITY_PATH, {
      method: 'POST',
      body: JSON.stringify({
        display_name: name,
        local_part: part || null,
        source,
      }),
    }));
  }

  async function syncIdentityFromStorage() {
    if (identityPromise) return identityPromise;
    identityPromise = (async () => {
      await ensureInstallation();
      const [identity, localPart] = await Promise.all([
        fetchIdentity(), localIdentityPart(),
      ]);
      if (!localPart) return identity;
      if (identity.registered && identity.localPart === localPart) return identity;
      const keepChosenName = identity.registered && identity.source !== 'email_local_part';
      return updateIdentity({
        displayName: keepChosenName
          ? identity.displayName
          : displayNameFromLocalPart(localPart),
        localPart,
        source: keepChosenName ? 'settings_edit' : 'email_local_part',
      });
    })();
    try {
      return await identityPromise;
    } finally {
      identityPromise = null;
    }
  }

  async function registerIdentity(displayName) {
    await ensureInstallation();
    const localPart = await localIdentityPart();
    const cached = normalizeIdentity(await storageGet(IDENTITY_CACHE_KEY));
    return updateIdentity({
      displayName,
      localPart,
      source: cached.registered ? 'settings_edit' : 'settings_prompt',
    });
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

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes?.devSettings) return;
    const previous = normalizeLocalPart(
      changes.devSettings.oldValue?.['email.localPart'],
    );
    const next = normalizeLocalPart(
      changes.devSettings.newValue?.['email.localPart'],
    );
    if (next && next !== previous) {
      if (root.GBRuntimeCoordinator?.isOpen?.() !== true) return;
      if (identitySyncTimer != null) clearTimeout(identitySyncTimer);
      identitySyncTimer = setTimeout(() => {
        identitySyncTimer = null;
        syncIdentityFromStorage().catch(() => {});
      }, 800);
    }
  });

  root.GBInstallationAuth = Object.freeze({
    API_ORIGIN,
    CLIENT_BASE,
    STORAGE_KEY,
    IDENTITY_CACHE_KEY,
    apiFetch,
    apiJson,
    /* @admin:start */
    catalogAdminJson,
    /* @admin:end */
    fetchConfiguration,
    ensureInstallation,
    getStatus,
    fetchIdentity,
    syncIdentityFromStorage,
    registerIdentity,
  });
})(globalThis);
