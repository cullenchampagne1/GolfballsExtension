import { useEffect, useState } from 'react';

/* ───────────────────────────────────────────────────────────────
   remoteSettingsPolicy — React view of the server-pushed settings
   policy that hides features / developer settings / custom pages.

   useRemoteSettingsPolicy() reads the last policy written to
   chrome.storage.local[gbRemoteSettingsPolicy] and re-renders on
   chrome.storage.onChanged. normalize() drops anything that isn't
   schemaVersion 1, so components always get the frozen EMPTY_POLICY
   shape (never a partial object). Outside an extension context the
   hook simply stays on EMPTY_POLICY.
─────────────────────────────────────────────────────────────── */

export const REMOTE_POLICY_KEY = 'gbRemoteSettingsPolicy';
const EMPTY_POLICY = Object.freeze({
  adminBypass: false,
  hiddenFeatures: {},
  hiddenDeveloperSettings: {},
  hiddenCustomPages: false,
  hiddenCustomPageScopes: {},
  developerSectionHidden: false,
});

function normalize(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return EMPTY_POLICY;
  return {
    ...EMPTY_POLICY,
    ...value,
    hiddenFeatures: value.hiddenFeatures || {},
    hiddenDeveloperSettings: value.hiddenDeveloperSettings || {},
    hiddenCustomPageScopes: value.hiddenCustomPageScopes || {},
  };
}

/** React view of the last policy that was fully validated and applied. */
export function useRemoteSettingsPolicy() {
  const [policy, setPolicy] = useState(EMPTY_POLICY);
  useEffect(() => {
    if (!globalThis.chrome?.storage?.local) return undefined;
    chrome.storage.local.get(REMOTE_POLICY_KEY, (data) => setPolicy(normalize(data?.[REMOTE_POLICY_KEY])));
    const listener = (changes, area) => {
      if (area === 'local' && changes[REMOTE_POLICY_KEY]) {
        setPolicy(normalize(changes[REMOTE_POLICY_KEY].newValue));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return policy;
}
