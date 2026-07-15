/**
 * Resolve the signed-in CRM employee identifier without a network request.
 *
 * The CRM writes this identifier into its own page markup. The extension also
 * caches the validated numeric value so pages that do not repeat the identity
 * can still create tasks and call logs after navigation.
 */
export function validEmployeeId(value) {
  const id = String(value == null ? '' : value).trim();
  return /^\d{1,12}$/.test(id) && Number(id) > 0 ? id : '';
}

export function employeeIdFromDocument(doc = globalThis.document) {
  if (!doc) return '';

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
