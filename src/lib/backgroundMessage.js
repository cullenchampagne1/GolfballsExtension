/**
 * Send an action to the extension service worker and require its standard
 * `{ ok: true }` response contract.
 *
 * Keeping this boundary in one place prevents callers from accidentally
 * ignoring `runtime.lastError` or treating a rejected worker action as a
 * successful response. The service worker remains responsible for validating
 * each action's URLs, methods, payload sizes, and authentication context.
 */
export function sendBackgroundMessage(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      reject(new Error('Not in an extension context'));
      return;
    }

    try {
      chrome.runtime.sendMessage({ action, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || response.ok !== true) {
          reject(new Error(response?.error || `${action} failed`));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Adapter for older helpers that accept one `{ action, ...payload }` object.
 * The campaign context/email helpers use this dispatcher shape, while the
 * canonical boundary above intentionally uses `(action, payload)`.
 */
export function dispatchBackgroundMessage(message = {}) {
  const { action, ...payload } = message && typeof message === 'object'
    ? message
    : {};
  if (!action) return Promise.reject(new Error('Background action is required'));
  return sendBackgroundMessage(action, payload);
}
