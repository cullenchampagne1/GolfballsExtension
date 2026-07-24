/**
 * Mockup catalog authoring transport (admin only).
 *
 * Kept out of productGenerationClient.js on purpose: this module is reached
 * only through an `__ADMIN__` branch, so the served consumer build never
 * bundles it and no authoring action string survives into the store package.
 *
 * As everywhere else in the extension, the installation credential stays in the
 * service worker — the modal only exchanges bounded JSON with it.
 */

function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || 'Extension request failed'));
          return;
        }
        if (!response?.ok) {
          const error = new Error(response?.error || 'Extension request failed');
          error.status = Number(response?.status || 0);
          reject(error);
          return;
        }
        resolve(response.payload);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/** The managed authoring document, prompts included (administrators only). */
export async function readMockupCatalog() {
  const payload = await runtimeMessage({ action: 'mockupCatalogRead' });
  return {
    schemaVersion: Number(payload?.schema_version) || 3,
    constraints: payload?.constraints && typeof payload.constraints === 'object'
      ? payload.constraints : {},
    products: Array.isArray(payload?.products) ? payload.products : [],
    referencePrefix: String(payload?.reference_prefix || ''),
  };
}

/**
 * Replace the managed products list.
 *
 * The backend re-validates through the studio's own loader before anything
 * touches disk, so a rejected write leaves the live catalog untouched.
 */
export function writeMockupCatalog(products) {
  return runtimeMessage({
    action: 'mockupCatalogWrite',
    products: Array.isArray(products) ? products : [],
  });
}

/** Store one reference image and return its stable managed URL. */
export async function uploadMockupReference({ productId, name, mediaType, dataBase64 }) {
  const payload = await runtimeMessage({
    action: 'mockupCatalogUploadReference',
    productId: String(productId || ''),
    name: String(name || ''),
    mediaType: String(mediaType || ''),
    dataBase64: String(dataBase64 || ''),
  });
  return {
    path: String(payload?.path || ''),
    url: String(payload?.url || ''),
    bytes: Number(payload?.bytes) || 0,
  };
}
