/**
 * Pure helpers for the extension-facing portion of the remote settings policy.
 *
 * A managed map stores the authoritative value, not just a `true` marker. That
 * lets every write path preserve policy immediately (including legacy settings
 * imports) without waiting for the next background sync.
 */

export const REMOTE_POLICY_KEY = 'gbRemoteSettingsPolicy';

export const EMPTY_REMOTE_POLICY = Object.freeze({
  adminBypass: false,
  hiddenFeatures: {},
  hiddenDeveloperSettings: {},
  developerSectionHidden: false,
  managedFeatures: {},
  managedDeveloperSettings: {},
});

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Normalize the fully validated policy metadata read from extension storage. */
export function normalizeRemotePolicy(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) {
    return EMPTY_REMOTE_POLICY;
  }
  return {
    ...EMPTY_REMOTE_POLICY,
    ...value,
    hiddenFeatures: record(value.hiddenFeatures),
    hiddenDeveloperSettings: record(value.hiddenDeveloperSettings),
    managedFeatures: record(value.managedFeatures),
    managedDeveloperSettings: record(value.managedDeveloperSettings),
  };
}

export function featureIsManaged(policy, key) {
  return policy?.adminBypass !== true
    && Object.hasOwn(record(policy?.managedFeatures), key);
}

export function developerSettingIsManaged(policy, key) {
  return policy?.adminBypass !== true
    && Object.hasOwn(record(policy?.managedDeveloperSettings), key);
}

/**
 * Reapply authoritative values to a single storage record. Unknown keys stay
 * local; only paths explicitly present in a managed map are replaced.
 */
export function enforceManagedStorageValue(storageKey, value, rawPolicy) {
  const policy = normalizeRemotePolicy(rawPolicy);
  const current = record(value);
  if (policy.adminBypass) return { ...current };

  if (storageKey === 'featureFlags') {
    return { ...current, ...policy.managedFeatures };
  }
  if (storageKey === 'devSettings') {
    return { ...current, ...policy.managedDeveloperSettings };
  }
  return { ...current };
}

/** Apply the same guard to a batch write such as a settings-template import. */
export function enforceManagedStorageWrites(writes, policy) {
  const next = { ...(writes || {}) };
  for (const key of ['featureFlags', 'devSettings']) {
    if (Object.hasOwn(next, key)) next[key] = enforceManagedStorageValue(key, next[key], policy);
  }
  return next;
}
