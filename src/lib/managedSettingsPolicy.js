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
  hiddenCustomPages: false,
  hiddenCustomPageScopes: {},
  developerSectionHidden: false,
  managedFeatures: {},
  managedDeveloperSettings: {},
  managedCustomPages: null,
  managedCustomPageScopes: {},
});

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function pageScopeValues(value) {
  return Object.fromEntries(Object.entries(record(value)).flatMap(([key, pages]) => (
    Array.isArray(pages) ? [[key, [...pages]]] : []
  )));
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
    hiddenCustomPageScopes: record(value.hiddenCustomPageScopes),
    managedFeatures: record(value.managedFeatures),
    managedDeveloperSettings: record(value.managedDeveloperSettings),
    managedCustomPages: typeof value.managedCustomPages === 'boolean'
      ? value.managedCustomPages
      : null,
    managedCustomPageScopes: pageScopeValues(value.managedCustomPageScopes),
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

export function customPageScopeIsManaged(policy, scope) {
  return policy?.adminBypass !== true
    && Object.hasOwn(record(policy?.managedCustomPageScopes), scope);
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
  if (storageKey === 'customPages') {
    const next = Object.fromEntries(Object.entries(current).map(([key, pages]) => [
      key, Array.isArray(pages) ? [...pages] : pages,
    ]));
    for (const [scope, pages] of Object.entries(policy.managedCustomPageScopes)) {
      next[scope] = [...pages];
    }
    // A managed global Off is authoritative over every scope, including an
    // unregistered legacy scope carried by an old backup file.
    if (policy.managedCustomPages === false) {
      for (const scope of Object.keys(next)) next[scope] = [];
    }
    return next;
  }
  return { ...current };
}

/** Apply the same guard to a batch write such as a settings-template import. */
export function enforceManagedStorageWrites(writes, policy) {
  const next = { ...(writes || {}) };
  for (const key of ['featureFlags', 'devSettings', 'customPages']) {
    if (Object.hasOwn(next, key)) next[key] = enforceManagedStorageValue(key, next[key], policy);
  }
  return next;
}
