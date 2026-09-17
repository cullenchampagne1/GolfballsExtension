export const POPUP_INITIALIZATION_TIMEOUT_MS = 6_000;

export class PopupInitializationTimeoutError extends Error {
  constructor(stage) {
    const normalizedStage = String(stage || 'initializing the popup');
    super(`Popup initialization timed out while ${normalizedStage}`);
    this.name = 'PopupInitializationTimeoutError';
    this.code = 'POPUP_INITIALIZATION_TIMEOUT';
    this.stage = normalizedStage;
  }
}

/**
 * Bound popup startup even when a Chrome callback never fires. Chrome callback
 * APIs do not support AbortSignal, so the underlying work may finish later;
 * its handlers remain attached and can still replace the fallback state.
 */
export function runPopupInitialization(initialize, options = {}) {
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || POPUP_INITIALIZATION_TIMEOUT_MS);
  const getStage = typeof options.getStage === 'function'
    ? options.getStage
    : () => 'initializing the popup';

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new PopupInitializationTimeoutError(getStage()));
    }, timeoutMs);

    Promise.resolve()
      .then(() => initialize())
      .then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
  });
}
