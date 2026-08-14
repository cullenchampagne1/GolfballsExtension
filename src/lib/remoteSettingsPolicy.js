import { useEffect, useState } from 'react';
import {
  EMPTY_REMOTE_POLICY,
  REMOTE_POLICY_KEY,
  normalizeRemotePolicy,
} from './managedSettingsPolicy.js';

/* ───────────────────────────────────────────────────────────────
   remoteSettingsPolicy — React view of the server-pushed settings
   policy that hides or locks features / developer settings / custom pages.

   useRemoteSettingsPolicy() reads the last policy written to
   chrome.storage.local[gbRemoteSettingsPolicy] and re-renders on
   chrome.storage.onChanged. normalizeRemotePolicy() drops anything that isn't
   schemaVersion 1, so components always get the frozen empty-policy
   shape (never a partial object). Outside an extension context the
   hook simply stays on that empty policy.
─────────────────────────────────────────────────────────────── */

export { REMOTE_POLICY_KEY } from './managedSettingsPolicy.js';

export const REMOTE_POLICY_SYNC_ACTION = 'gbSyncRemoteSettingsPolicy';

/** Ask the worker for the effective policy for this exact installation. */
export function requestRemoteSettingsPolicySync() {
  return new Promise((resolve) => {
    const runtime = globalThis.chrome?.runtime;
    if (typeof runtime?.sendMessage !== 'function') {
      resolve({ ok: false, error: 'Extension runtime is unavailable' });
      return;
    }
    try {
      runtime.sendMessage({ action: REMOTE_POLICY_SYNC_ACTION }, (response) => {
        const error = runtime.lastError;
        if (error) resolve({ ok: false, error: error.message || 'Unable to refresh settings policy' });
        else resolve(response || { ok: false, error: 'Settings policy refresh returned no response' });
      });
    } catch (error) {
      resolve({ ok: false, error: String(error?.message || error) });
    }
  });
}

/** React view of the last policy that was fully validated and applied. */
export function useRemoteSettingsPolicy() {
  const [policy, setPolicy] = useState(EMPTY_REMOTE_POLICY);
  useEffect(() => {
    if (!globalThis.chrome?.storage?.local) return undefined;
    let cancelled = false;
    const readPolicy = () => chrome.storage.local.get(REMOTE_POLICY_KEY, (data) => {
      if (!cancelled) setPolicy(normalizeRemotePolicy(data?.[REMOTE_POLICY_KEY]));
    });
    const listener = (changes, area) => {
      if (area === 'local' && changes[REMOTE_POLICY_KEY]) {
        setPolicy(normalizeRemotePolicy(changes[REMOTE_POLICY_KEY].newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    readPolicy();
    // Policy edits are server-owned and may have happened after the worker's
    // last 15-minute alarm. Refresh on Settings open, then re-read even when a
    // storage-change event was coalesced or the effective values were equal.
    requestRemoteSettingsPolicySync().then(readPolicy);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);
  return policy;
}
