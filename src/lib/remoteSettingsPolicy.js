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

/** React view of the last policy that was fully validated and applied. */
export function useRemoteSettingsPolicy() {
  const [policy, setPolicy] = useState(EMPTY_REMOTE_POLICY);
  useEffect(() => {
    if (!globalThis.chrome?.storage?.local) return undefined;
    chrome.storage.local.get(REMOTE_POLICY_KEY, (data) => (
      setPolicy(normalizeRemotePolicy(data?.[REMOTE_POLICY_KEY]))
    ));
    const listener = (changes, area) => {
      if (area === 'local' && changes[REMOTE_POLICY_KEY]) {
        setPolicy(normalizeRemotePolicy(changes[REMOTE_POLICY_KEY].newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return policy;
}
