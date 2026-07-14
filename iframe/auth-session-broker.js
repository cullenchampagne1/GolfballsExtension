/**
 * Authenticated iCustomize request broker.
 *
 * Runs in the page's MAIN world so it can observe the authentication headers
 * that the iCustomize application explicitly attaches to its own fetch calls.
 * Credentials remain inside this closure. Callers can request only the exact
 * operations defined below and receive bounded results, never a bearer token.
 */
(function installAuthenticatedRequestBroker(root) {
  'use strict';

  if (root.__gbAuthBrokerExecute) return;

  const NOTE_URL = 'https://51grploz6a.execute-api.us-east-2.amazonaws.com/production/admin/recordNote';
  const MAX_TOKEN_AGE_MS = 8 * 60 * 60 * 1000;
  const MAX_RESPONSE_BYTES = 2_000_000;
  const CAPTURE_HOSTS = new Set([
    'admin.icustomize.com',
    'master.api.icustomize.com',
    'production-private-api.icustomize.com',
    '51grploz6a.execute-api.us-east-2.amazonaws.com',
  ]);
  const CHARGE_ENDPOINTS = new Map([
    ['production-private-api.icustomize.com/api/user/paymentcreditcard/getuserpaymentmethods', 'POST'],
    ['production-private-api.icustomize.com/api/user/paymentordercharge/saveadjustment', 'POST'],
    ['production-private-api.icustomize.com/api/user/creditcardinfo/getbillinginfobybillingrequest', 'POST'],
    ['master.api.icustomize.com/user/billingverify', 'PUT'],
    ['master.api.icustomize.com/user/chargecard', 'PUT'],
    ['master.api.icustomize.com/admin/editorder', 'PUT'],
  ]);

  const credentials = new Map();
  let lastCredential = null;
  const originalFetch = root.fetch.bind(root);

  function parseAllowedUrl(value) {
    try {
      const url = new URL(String(value || ''), root.location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
      return url;
    } catch {
      return null;
    }
  }

  function tokenExpiry(value, capturedAt) {
    try {
      const raw = String(value || '').replace(/^Bearer\s+/i, '');
      const part = raw.split('.')[1];
      if (!part) return capturedAt + MAX_TOKEN_AGE_MS;
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      const exp = Number(payload && payload.exp);
      if (Number.isFinite(exp) && exp > 0) return Math.min(exp * 1000, capturedAt + MAX_TOKEN_AGE_MS);
    } catch { /* opaque tokens use the bounded in-memory lifetime */ }
    return capturedAt + MAX_TOKEN_AGE_MS;
  }

  function rememberCredential(name, value) {
    const normalizedName = String(name || '').toLowerCase();
    const normalizedValue = typeof value === 'string' ? value.trim() : '';
    if (!['adminsession', 'authorization'].includes(normalizedName) || !normalizedValue || normalizedValue.length > 16_384) return;
    const capturedAt = Date.now();
    const record = { value: normalizedValue, expiresAt: tokenExpiry(normalizedValue, capturedAt) };
    if (record.expiresAt <= capturedAt) return;
    credentials.set(normalizedName, record);
    lastCredential = record;
  }

  function clearCredentials() {
    credentials.clear();
    lastCredential = null;
  }

  function activeCredential(preferredName) {
    const now = Date.now();
    for (const [name, record] of credentials) {
      if (!record || record.expiresAt <= now) credentials.delete(name);
    }
    if (lastCredential && lastCredential.expiresAt <= now) lastCredential = null;
    return credentials.get(preferredName) || lastCredential || null;
  }

  function explicitHeaders(resource, config) {
    try {
      if (config && Object.prototype.hasOwnProperty.call(config, 'headers')) return new Headers(config.headers || {});
      if (typeof Request !== 'undefined' && resource instanceof Request) return resource.headers;
    } catch { /* malformed application headers are ignored */ }
    return null;
  }

  function requestUrl(resource) {
    try {
      return typeof resource === 'string' || resource instanceof URL
        ? new URL(String(resource), root.location.href)
        : new URL(resource.url, root.location.href);
    } catch {
      return null;
    }
  }

  root.fetch = function authenticatedFetchObserver(...args) {
    const [resource, config] = args;
    const url = requestUrl(resource);
    if (url && CAPTURE_HOSTS.has(url.hostname.toLowerCase())) {
      if (/\/(?:logout|logoff|signout)(?:[/?#]|$)/i.test(url.pathname)) clearCredentials();
      const headers = explicitHeaders(resource, config);
      if (headers) {
        for (const name of ['adminsession', 'authorization']) {
          if (headers.has(name)) rememberCredential(name, headers.get(name));
        }
      }
    }

    const pending = originalFetch(...args);
    if (url && CAPTURE_HOSTS.has(url.hostname.toLowerCase())) {
      pending.then((response) => {
        if (response && response.status === 401) clearCredentials();
      }).catch(() => {});
    }
    return pending;
  };

  async function readTextLimited(response) {
    const declared = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error('Response exceeds size limit');
    if (!response.body || !response.body.getReader) {
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) throw new Error('Response exceeds size limit');
      return text;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error('Response exceeds size limit');
      }
      text += decoder.decode(part.value, { stream: true });
    }
    return text + decoder.decode();
  }

  function identityFromCredential(record) {
    if (!record) return null;
    try {
      const raw = record.value.replace(/^Bearer\s+/i, '');
      const part = raw.split('.')[1];
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
      const payload = JSON.parse(atob(padded));
      const employeeId = payload.adminUserID || payload.employeeID || payload.EmployeeID || payload.sub;
      const employeeName = payload.UserName || payload.userName || payload.name || 'Unknown';
      return employeeId ? { employeeId: String(employeeId), employeeName: String(employeeName).slice(0, 200) } : null;
    } catch {
      return null;
    }
  }

  function validatedChargeRequest(request) {
    const url = parseAllowedUrl(request && request.url);
    const method = String(request && request.method || 'POST').toUpperCase();
    if (!url || url.search) return null;
    const key = `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
    if (CHARGE_ENDPOINTS.get(key) !== method) return null;
    const body = request.body == null ? null : String(request.body);
    if (body != null && body.length > 1_000_000) return null;
    return { url, method, body };
  }

  async function executeCharge(request) {
    const validated = validatedChargeRequest(request);
    if (!validated) return { ok: false, status: 0, text: '', error: 'Blocked payment endpoint or method' };
    const isMasterApi = validated.url.hostname === 'master.api.icustomize.com';
    const isSaveAdjustment = /\/saveadjustment$/i.test(validated.url.pathname);
    const useJson = isMasterApi || isSaveAdjustment;
    const authName = isMasterApi ? 'adminsession' : 'authorization';
    const credential = activeCredential(authName);
    if (!credential) return { ok: false, status: 401, text: '', error: 'iCustomize session unavailable — reload the order iframe' };
    const headers = {
      'Content-Type': useJson ? 'application/json;charset=UTF-8' : 'application/x-www-form-urlencoded',
      'Accept': 'application/json, text/plain, */*',
      [authName]: credential.value,
    };
    try {
      const response = await originalFetch(validated.url.href, {
        method: validated.method,
        headers,
        credentials: 'omit',
        redirect: 'error',
        body: validated.body == null ? undefined : validated.body,
      });
      if (response.status === 401) clearCredentials();
      return { ok: response.ok, status: response.status, text: await readTextLimited(response) };
    } catch (error) {
      return { ok: false, status: 0, text: '', error: String(error && error.message || error) };
    }
  }

  function validText(value, maxLength, allowEmpty = true) {
    return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.trim().length > 0);
  }

  async function executeRecordNote(request) {
    const entityID = String(request && request.entityID || '').trim();
    const entityName = String(request && request.entityName || '').trim();
    const note = request && request.note;
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(entityID)
        || !/^[A-Za-z0-9._-]{1,50}$/.test(entityName)
        || !note || typeof note !== 'object'
        || !validText(note.subject || '', 5_000)
        || !validText(note.body || '', 100_000)
        || !validText(note.audienceVal || '', 500)) {
      return { ok: false, status: 0, text: '', error: 'Invalid note request' };
    }
    const credential = activeCredential('adminsession');
    const identity = identityFromCredential(credential);
    if (!credential) return { ok: false, status: 401, text: '', error: 'iCustomize session unavailable — reload the order iframe' };
    const payload = {
      entityName,
      entityID,
      data: {
        audience: note.audienceVal ? [note.audienceVal] : [],
        scope: '',
        subject: note.subject,
        body: note.body,
        employee_id: identity ? identity.employeeId : '0',
        employee_name: identity ? identity.employeeName : 'Unknown',
        hidden: false,
        media: [],
      },
    };
    try {
      const response = await originalFetch(NOTE_URL, {
        method: 'PUT',
        headers: {
          'accept': 'application/json, text/plain, */*',
          'adminsession': credential.value,
          'content-type': 'application/json;charset=UTF-8',
          'sitekey': 'golfballs',
        },
        credentials: 'omit',
        redirect: 'error',
        body: JSON.stringify(payload),
      });
      if (response.status === 401) clearCredentials();
      return { ok: response.ok, status: response.status, text: await readTextLimited(response) };
    } catch (error) {
      return { ok: false, status: 0, text: '', error: String(error && error.message || error) };
    }
  }

  async function execute(request) {
    if (!request || typeof request !== 'object') return { ok: false, status: 0, text: '', error: 'Invalid authenticated request' };
    if (request.action === 'identity') {
      const identity = identityFromCredential(activeCredential('adminsession'));
      return identity ? { ok: true, identity } : { ok: false, status: 401, error: 'iCustomize session unavailable' };
    }
    if (request.action === 'recordNote') return executeRecordNote(request);
    if (request.action === 'chargeApi') return executeCharge(request);
    return { ok: false, status: 0, text: '', error: 'Blocked authenticated operation' };
  }

  Object.defineProperty(root, '__gbAuthBrokerExecute', {
    value: execute,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  document.addEventListener('GB_AUTH_BROKER_REQUEST', (event) => {
    const detail = event && event.detail;
    const requestId = detail && detail.requestId;
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(requestId)) return;
    execute(detail.request).then((result) => {
      document.dispatchEvent(new CustomEvent('GB_AUTH_BROKER_RESPONSE', { detail: { requestId, result } }));
    });
  });

  root.addEventListener('pagehide', clearCredentials, { once: true });
})(window);
