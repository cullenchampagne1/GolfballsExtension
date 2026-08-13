/**
 * Resolve the signed-in CRM employee and publish the extension's bounded
 * current-user context.
 *
 * The authenticated iCustomize broker supplies the authoritative employee
 * name + id pair. CRM markup and the cached numeric id remain fallbacks for
 * pages that do not load that iframe. Editable installation/profile metadata
 * is exposed separately and is never treated as a CRM-verified sales-rep name.
 * Credentials, headers, cookies, tokens, and decoded claims are deliberately
 * outside this contract.
 */
export const CURRENT_USER_STORAGE_KEY = 'gbCurrentUser';
export const CURRENT_USER_EVENT = 'gb:current-user-change';
export const SESSION_IDENTITY_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const CACHED_IDENTITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function validEmployeeId(value) {
  const id = String(value == null ? '' : value).trim();
  return /^\d{1,12}$/.test(id) && Number(id) > 0 ? id : '';
}

export function normalizeEmployeeName(value) {
  const name = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) return '';
  return /^(?:unknown|n\/?a)$/i.test(name) ? '' : name;
}

function normalizeEmailLocalPart(value) {
  const localPart = String(value == null ? '' : value).trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/i.test(localPart)
    ? localPart
    : '';
}

function normalizeStoredCrmIdentity(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const employeeId = validEmployeeId(raw.employeeId);
  const employeeName = normalizeEmployeeName(raw.employeeName);
  const source = ['crm_session', 'crm_directory'].includes(raw.source)
    ? raw.source
    : 'crm_session';
  return {
    employeeId,
    employeeName: employeeId ? employeeName : '',
    source,
    updatedAt: Math.max(0, Number(raw.updatedAt) || 0),
  };
}

function timestampIsFresh(updatedAt, maxAge, now = Date.now()) {
  const stamp = Number(updatedAt) || 0;
  return stamp > 0
    && stamp <= now + 5 * 60 * 1000
    && now - stamp <= maxAge;
}

function sessionTimestampIsFresh(updatedAt, now = Date.now()) {
  return timestampIsFresh(updatedAt, SESSION_IDENTITY_MAX_AGE_MS, now);
}

/** Return only an identity that was actually decoded from a recent
 * authenticated CRM session. Profile and directory fallbacks are rejected. */
export function sessionEmployeeIdentity(value, now = Date.now()) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.nameSource || raw.source;
  const employeeId = validEmployeeId(raw.employeeId);
  const employeeName = normalizeEmployeeName(raw.employeeName);
  if (source !== 'crm_session' || !employeeId || !employeeName
      || !sessionTimestampIsFresh(raw.updatedAt, now)) return null;
  return Object.freeze({ employeeId, employeeName, updatedAt: Number(raw.updatedAt) });
}

/** Return a bounded CRM-derived identity that is safe for immediate display
 * while the authenticated toolbar refreshes it. This deliberately does not
 * imply that the current browser session has been verified. */
export function cachedEmployeeIdentity(value, now = Date.now()) {
  const raw = value && typeof value === 'object' ? value : {};
  const source = raw.nameSource || raw.source;
  const employeeId = validEmployeeId(raw.employeeId);
  const employeeName = normalizeEmployeeName(raw.employeeName);
  if (!['crm_session', 'crm_directory', 'crm_cache'].includes(source)
      || !employeeId || !employeeName
      || !timestampIsFresh(raw.updatedAt, CACHED_IDENTITY_MAX_AGE_MS, now)) return null;
  return Object.freeze({ employeeId, employeeName, updatedAt: Number(raw.updatedAt) });
}

export function employeeIdFromDocument(doc = globalThis.document) {
  if (!doc) return '';

  // The CRM's authenticated toolbar carries the signed-in employee id in its
  // iframe URL on pages (notably CRM Search) that do not repeat the usual
  // employee form field or inline variable. This is the same authoritative
  // source the legacy smartUserId() detector uses.
  const authFrame = doc.getElementById?.('ccaiFrame');
  for (const source of [
    authFrame?.getAttribute?.('src'),
    authFrame?.getAttribute?.('data-src'),
    authFrame?.src,
  ]) {
    const id = validEmployeeId((String(source || '').match(/[?&]userId=(\d{1,12})/i) || [])[1]);
    if (id) return id;
  }

  const fields = [
    '#employeeID', '#EmployeeID', '#employeeId', '#EmployeeId',
    '[name="employeeID"]', '[name="EmployeeID"]',
  ];
  for (const selector of fields) {
    const field = doc.querySelector?.(selector);
    const id = validEmployeeId(field?.value || field?.textContent);
    if (id) return id;
  }

  const pattern = /\b(?:employeeID|employeeId|adminUserID)\b\s*[:=]\s*["']?(\d{1,12})/i;
  for (const script of Array.from(doc.scripts || [])) {
    const id = validEmployeeId((String(script.textContent || '').match(pattern) || [])[1]);
    if (id) return id;
  }
  return '';
}

/** Resolve an employee name only by matching the signed-in employee id to a
 * known CRM sales-rep directory option. The selected option itself is the
 * record owner and must never be mistaken for the logged-in user. */
export function employeeNameFromDocument(doc = globalThis.document, employeeId = '') {
  const id = validEmployeeId(employeeId);
  if (!doc || !id) return '';
  const selectors = [
    '#ddlSalesRepId',
    '#ctl00_DropDownSalesRep',
    '#ctl00_customSalesReps',
    'select[id$="DropDownSalesRep"]',
  ];
  const seen = new Set();
  for (const selector of selectors) {
    for (const select of Array.from(doc.querySelectorAll?.(selector) || [])) {
      if (seen.has(select)) continue;
      seen.add(select);
      for (const option of Array.from(select.options || [])) {
        if (validEmployeeId(option.value) !== id) continue;
        const name = normalizeEmployeeName(option.text || option.textContent);
        if (name) return name;
      }
    }
  }
  return '';
}

function localStorageArea() {
  try { return globalThis.chrome?.storage?.local || null; }
  catch { return null; }
}

function readCachedEmployeeId(storage) {
  if (!storage?.get) return Promise.resolve('');
  return new Promise((resolve) => {
    try {
      storage.get('gbEmployeeId', (data) => resolve(validEmployeeId(data?.gbEmployeeId)));
    } catch { resolve(''); }
  });
}

function cacheEmployeeId(storage, employeeId) {
  if (!storage?.set || !employeeId) return;
  try { storage.set({ gbEmployeeId: employeeId }); } catch { /* unavailable */ }
}

function readStorageValues(storage, keys) {
  if (!storage?.get) return Promise.resolve({});
  return new Promise((resolve) => {
    try { storage.get(keys, (data) => resolve(data && typeof data === 'object' ? data : {})); }
    catch { resolve({}); }
  });
}

function cacheCrmIdentity(storage, identity) {
  if (!storage?.set || !identity.employeeId || !identity.employeeName) return;
  try {
    storage.set({
      gbEmployeeId: identity.employeeId,
      [CURRENT_USER_STORAGE_KEY]: {
        employeeId: identity.employeeId,
        employeeName: identity.employeeName,
        source: identity.source,
        updatedAt: identity.updatedAt,
      },
    });
  } catch { /* unavailable */ }
}

export async function resolveEmployeeId({ doc = globalThis.document, storage = localStorageArea() } = {}) {
  const pageId = employeeIdFromDocument(doc);
  if (pageId) {
    try { globalThis.window.__gbEmployeeId = pageId; } catch { /* no window */ }
    cacheEmployeeId(storage, pageId);
    return pageId;
  }

  const memoryId = validEmployeeId(globalThis.window?.__gbEmployeeId);
  if (memoryId) return memoryId;
  return readCachedEmployeeId(storage);
}

function safeInstallationIdentity(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const registered = raw.registered === true;
  const displayName = registered ? normalizeEmployeeName(raw.displayName) : '';
  const installationId = String(raw.installationId || '').trim();
  return Object.freeze({
    registered: registered && !!displayName,
    installationId: /^[a-f0-9-]{32,40}$/i.test(installationId) ? installationId : '',
    displayName,
    source: String(raw.source || '').slice(0, 32),
    createdAt: String(raw.createdAt || '').slice(0, 40),
    updatedAt: String(raw.updatedAt || '').slice(0, 40),
  });
}

function senderIdentity(localPart) {
  const addresses = Object.freeze({
    golfballs: localPart ? `${localPart}@golfballs.com` : '',
    loyaltylogo: localPart ? `${localPart}@loyaltylogo.com` : '',
  });
  return Object.freeze({ localPart, addresses });
}

/** Publish a frozen, data-only object for synchronous future consumers. */
function publishCurrentUserContext(context) {
  const win = globalThis.window;
  if (!win) return context;
  try {
    win.__gbCurrentUser = context;
    win.__gbGetCurrentUser = () => win.__gbCurrentUser || null;
    if (typeof win.dispatchEvent === 'function' && typeof win.CustomEvent === 'function') {
      win.dispatchEvent(new win.CustomEvent(CURRENT_USER_EVENT, { detail: context }));
    }
  } catch { /* no writable window */ }
  return context;
}

/**
 * Return the global safe current-user context.
 *
 * `employeeName` is populated from a live CRM-authenticated session, an exact
 * employee-id → sales-rep-directory match, or the bounded cache created by
 * either source. `name` may fall back to the installation profile for
 * presentation. Consumers that specifically require the current session must
 * check `sessionVerified` or call `sessionEmployeeIdentity`.
 */
export async function resolveCurrentUserContext({
  doc = globalThis.document,
  storage = localStorageArea(),
} = {}) {
  const values = await readStorageValues(storage, [
    'gbEmployeeId', CURRENT_USER_STORAGE_KEY, 'gbInstallationIdentity', 'devSettings',
  ]);
  const storedCrm = normalizeStoredCrmIdentity(values[CURRENT_USER_STORAGE_KEY]);
  let employeeId = await resolveEmployeeId({ doc, storage });
  if (!employeeId) employeeId = storedCrm.employeeId;
  if (employeeId) {
    try { globalThis.window.__gbEmployeeId = employeeId; } catch { /* no window */ }
  }

  const liveSession = sessionEmployeeIdentity(globalThis.window?.__gbCurrentUser);
  const storedCache = cachedEmployeeIdentity({
    ...storedCrm,
    nameSource: storedCrm.source,
  });
  const liveMatches = liveSession?.employeeId === employeeId;
  const storedMatches = storedCache?.employeeId === employeeId;
  const directoryName = employeeNameFromDocument(doc, employeeId);
  const employeeName = liveMatches
    ? liveSession.employeeName
    : (storedMatches ? storedCache.employeeName : directoryName);
  const directoryUpdatedAt = directoryName && !liveMatches && !storedMatches ? Date.now() : 0;
  const nameSource = liveMatches
    ? 'crm_session'
    : (storedMatches ? 'crm_cache' : (directoryName ? 'crm_directory' : ''));

  if (directoryName && !liveMatches && !storedMatches) {
    cacheCrmIdentity(storage, {
      employeeId,
      employeeName: directoryName,
      source: 'crm_directory',
      updatedAt: directoryUpdatedAt,
    });
  }

  const installation = safeInstallationIdentity(values.gbInstallationIdentity);
  const devSettings = values.devSettings && typeof values.devSettings === 'object'
    ? values.devSettings
    : {};
  const localPart = normalizeEmailLocalPart(
    devSettings['email.localPart'] || values.gbInstallationIdentity?.localPart,
  );
  const email = senderIdentity(localPart);
  const name = employeeName || installation.displayName;
  const identityUpdatedAt = liveMatches
    ? liveSession.updatedAt
    : (storedMatches ? storedCache.updatedAt : directoryUpdatedAt);
  const context = Object.freeze({
    employeeId,
    employeeName,
    name,
    nameSource: nameSource || (name ? 'installation_profile' : ''),
    crmVerified: !!(employeeId && employeeName),
    sessionVerified: nameSource === 'crm_session'
      && sessionTimestampIsFresh(identityUpdatedAt),
    cached: nameSource === 'crm_cache',
    email,
    installation,
    updatedAt: identityUpdatedAt,
  });
  return publishCurrentUserContext(context);
}

/** Subscribe to context changes caused by a fresh CRM session broadcast or a
 * profile/email edit. The listener receives the same frozen safe object. */
export function subscribeCurrentUserContext(listener) {
  if (typeof listener !== 'function') return () => {};
  const win = globalThis.window;
  const onWindow = (event) => listener(event?.detail || win?.__gbCurrentUser || null);
  try { win?.addEventListener?.(CURRENT_USER_EVENT, onWindow); } catch { /* unavailable */ }

  const storageEvents = globalThis.chrome?.storage?.onChanged;
  const watched = new Set([
    'gbEmployeeId', CURRENT_USER_STORAGE_KEY, 'gbInstallationIdentity', 'devSettings',
  ]);
  const onStorage = (changes, area) => {
    if (area !== 'local' || !Object.keys(changes || {}).some((key) => watched.has(key))) return;
    resolveCurrentUserContext().catch(() => {});
  };
  try { storageEvents?.addListener?.(onStorage); } catch { /* unavailable */ }

  return () => {
    try { win?.removeEventListener?.(CURRENT_USER_EVENT, onWindow); } catch { /* unavailable */ }
    try { storageEvents?.removeListener?.(onStorage); } catch { /* unavailable */ }
  };
}
