/** Apply the authenticated server policy to local extension settings. */
(function installRemoteSettingsPolicy(root) {
  'use strict';

  const POLICY_KEY = 'gbRemoteSettingsPolicy';
  const BACKUP_KEY = 'gbRemoteSettingsBackup';
  const LEGACY_KEY = 'secret_settings';
  const ALARM_NAME = 'gbRemoteSettingsSync';
  const DEFAULT_REFRESH_MINUTES = 15;
  let syncPromise = null;

  const getStorage = (keys) => new Promise((resolve, reject) => chrome.storage.local.get(keys, (value) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message || 'Unable to read settings policy storage'));
    else resolve(value || {});
  }));
  const setStorage = (value) => new Promise((resolve, reject) => chrome.storage.local.set(value, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message || 'Unable to save settings policy'));
    else resolve();
  }));
  const removeStorage = (keys) => new Promise((resolve) => chrome.storage.local.remove(keys, resolve));

  function canonicalFlags(value) {
    const flags = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
    if (!Object.hasOwn(flags, 'workflowManagerEnabled')
        && typeof flags.campaignManagerEnabled === 'boolean') {
      flags.workflowManagerEnabled = flags.campaignManagerEnabled;
    }
    delete flags.campaignManagerEnabled;
    delete flags.submitProofEnabled;
    return flags;
  }

  function canonicalDevSettings(value) {
    const settings = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
    if (!Object.hasOwn(settings, 'workflowManager.scale')
        && Object.hasOwn(settings, 'campaignManager.scale')) {
      settings['workflowManager.scale'] = settings['campaignManager.scale'];
    }
    delete settings['campaignManager.scale'];
    return settings;
  }

  function canonicalCustomPages(value) {
    const pages = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const scopes = root.GB_SETTINGS_REGISTRY?.customPageScopes || {};
    const canonical = {};
    for (const [scope, spec] of Object.entries(scopes)) {
      const selected = Array.isArray(pages[scope])
        ? pages[scope]
        : (scope === 'all' && Array.isArray(pages.crm) ? pages.crm : []);
      canonical[scope] = selected.length ? [...(spec.pageIds || [])] : [];
    }
    return canonical;
  }

  async function canonicalizeStoredSettings(current) {
    const next = { ...current };
    const updates = {};
    const migrate = (key, fn) => {
      if (!Object.hasOwn(current, key)) return;
      const value = fn(current[key]);
      next[key] = value;
      if (JSON.stringify(value) !== JSON.stringify(current[key])) updates[key] = value;
    };
    migrate('featureFlags', canonicalFlags);
    migrate('devSettings', canonicalDevSettings);
    migrate('customPages', canonicalCustomPages);

    const backup = current[BACKUP_KEY];
    if (backup?.version === 1) {
      const migrated = {
        ...backup,
        featureFlags: canonicalFlags(backup.featureFlags),
        devSettings: canonicalDevSettings(backup.devSettings),
        ...(Object.hasOwn(backup, 'hadCustomPages')
          ? { customPages: canonicalCustomPages(backup.customPages) }
          : {}),
      };
      next[BACKUP_KEY] = migrated;
      if (JSON.stringify(migrated) !== JSON.stringify(backup)) updates[BACKUP_KEY] = migrated;
    }
    if (Object.keys(updates).length) await setStorage(updates);
    return next;
  }

  function valueIsValid(rule, value) {
    if (rule.type === 'bool') return typeof value === 'boolean';
    if (rule.type === 'string') return typeof value === 'string' && value.length <= 10_000;
    if (rule.type === 'number') {
      return typeof value === 'number' && Number.isFinite(value)
        && (rule.min === undefined || value >= rule.min)
        && (rule.max === undefined || value <= rule.max);
    }
    if (rule.type === 'select') return typeof value === 'string' && rule.options.includes(value);
    return false;
  }

  function validateSection(name, input, registry) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`${name} must be a map`);
    const expected = Object.keys(registry).sort();
    const validated = {};
    for (const key of expected) {
      const entry = input[key];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)
          || typeof entry.hidden !== 'boolean' || typeof entry.managed !== 'boolean'
          || !valueIsValid(registry[key], entry.value)) {
        throw new Error(`${name}.${key} is invalid`);
      }
      validated[key] = entry;
    }
    // A rolling server deploy can know settings this installed client does
    // not. Unknown rows are ignored after every local row has validated, so a
    // newer registry cannot strand this client on its previous policy.
    return validated;
  }

  function validateEnvelope(payload) {
    if (!payload || payload.schema_version !== 1 || typeof payload.admin_bypass !== 'boolean'
        || !/^[a-f0-9]{64}$/.test(String(payload.revision || ''))) {
      throw new Error('Configuration envelope is invalid');
    }
    if (payload.admin_bypass) return null;
    const config = payload.configuration;
    const registry = root.GB_SETTINGS_REGISTRY;
    if (!registry || !config || config.schema_version !== registry.schemaVersion) {
      throw new Error('Configuration schema is unsupported');
    }
    if (!config.developer_section || typeof config.developer_section.hidden !== 'boolean') {
      throw new Error('Developer section policy is invalid');
    }
    const features = validateSection('features', config.features, registry.features);
    const developerSettings = validateSection(
      'developer_settings', config.developer_settings, registry.developerSettings,
    );
    if (!config.custom_pages || typeof config.custom_pages !== 'object'
        || typeof config.custom_pages.hidden !== 'boolean'
        || typeof config.custom_pages.managed !== 'boolean'
        || !valueIsValid(registry.customPages, config.custom_pages.value)) {
      throw new Error('Custom pages policy is invalid');
    }
    const customPageScopes = validateSection(
      'custom_pages.scopes', config.custom_pages.scopes, registry.customPageScopes,
    );
    return {
      ...config,
      features,
      developer_settings: developerSettings,
      custom_pages: { ...config.custom_pages, scopes: customPageScopes },
    };
  }

  async function broadcastFlags(flags) {
    const tabs = await chrome.tabs.query({
      url: [
        'https://www.golfballs.com/*',
        'https://api.golfballs.com/*',
        'https://office.gbcadmin.com/*',
        'https://operations.gbcadmin.com/*',
      ],
    });
    await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, {
      action: 'GB_FEATURE_FLAGS', flags,
    }).catch(() => undefined)));
  }

  function schedule(minutes) {
    const requested = Number(minutes);
    const safeMinutes = Number.isFinite(requested)
      ? Math.max(1, Math.min(1440, requested))
      : DEFAULT_REFRESH_MINUTES;
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: safeMinutes });
  }

  async function restoreForAdmin(payload, current) {
    const backup = current[BACKUP_KEY];
    if (backup?.version === 1) {
      const restored = {};
      if (backup.hadFeatureFlags) restored.featureFlags = backup.featureFlags;
      if (backup.hadDevSettings) restored.devSettings = backup.devSettings;
      if (backup.hadCustomPages) restored.customPages = backup.customPages;
      await setStorage(restored);
      if (!backup.hadFeatureFlags) await removeStorage('featureFlags');
      if (!backup.hadDevSettings) await removeStorage('devSettings');
      if (!backup.hadCustomPages) await removeStorage('customPages');
    }
    await setStorage({
      [POLICY_KEY]: {
        schemaVersion: 1, adminBypass: true, revision: payload.revision,
        appliedAt: Date.now(), hiddenFeatures: {}, hiddenDeveloperSettings: {},
        hiddenCustomPages: false, hiddenCustomPageScopes: {},
        developerSectionHidden: false, managedFeatures: {},
        managedDeveloperSettings: {}, managedCustomPages: null,
        managedCustomPageScopes: {},
      },
    });
    await removeStorage([BACKUP_KEY, LEGACY_KEY]);
    const latest = await getStorage('featureFlags');
    await broadcastFlags(latest.featureFlags || {});
    schedule(DEFAULT_REFRESH_MINUTES);
  }

  async function applyConfiguration(payload, config, current) {
    if (!current[BACKUP_KEY]) {
      await setStorage({
        [BACKUP_KEY]: {
          version: 1,
          hadFeatureFlags: Object.hasOwn(current, 'featureFlags'),
          featureFlags: current.featureFlags || {},
          hadDevSettings: Object.hasOwn(current, 'devSettings'),
          devSettings: current.devSettings || {},
          hadCustomPages: Object.hasOwn(current, 'customPages'),
          customPages: current.customPages || {},
        },
      });
    } else if (!Object.hasOwn(current[BACKUP_KEY], 'hadCustomPages')) {
      // Upgrade an existing feature/dev-only backup before custom-page policy
      // is first applied, so a later administrator bypass remains reversible.
      await setStorage({
        [BACKUP_KEY]: {
          ...current[BACKUP_KEY],
          hadCustomPages: Object.hasOwn(current, 'customPages'),
          customPages: current.customPages || {},
        },
      });
    }
    const flags = { ...(current.featureFlags || {}) };
    const devSettings = { ...(current.devSettings || {}) };
    const hiddenFeatures = {};
    const hiddenDeveloperSettings = {};
    const managedFeatures = {};
    const managedDeveloperSettings = {};
    const customPages = { ...(current.customPages || {}) };
    const hiddenCustomPageScopes = {};
    const managedCustomPageScopes = {};
    for (const [key, entry] of Object.entries(config.features)) {
      if (entry.managed) {
        flags[key] = entry.value;
        managedFeatures[key] = entry.value;
      }
      if (entry.hidden) hiddenFeatures[key] = true;
    }
    for (const [key, entry] of Object.entries(config.developer_settings)) {
      if (entry.managed) {
        devSettings[key] = entry.value;
        managedDeveloperSettings[key] = entry.value;
      }
      if (entry.hidden) hiddenDeveloperSettings[key] = true;
    }
    for (const [scope, entry] of Object.entries(config.custom_pages.scopes)) {
      if (entry.managed) {
        const pages = entry.value
          ? [...root.GB_SETTINGS_REGISTRY.customPageScopes[scope].pageIds]
          : [];
        customPages[scope] = pages;
        managedCustomPageScopes[scope] = [...pages];
      }
      if (entry.hidden) hiddenCustomPageScopes[scope] = true;
    }
    if (config.custom_pages.managed && !config.custom_pages.value) {
      for (const scope of Object.keys(root.GB_SETTINGS_REGISTRY.customPageScopes)) {
        customPages[scope] = [];
        // The root switch wins even when this specific scope is configured as
        // user-controlled, so the UI must lock it while the global value is Off.
        managedCustomPageScopes[scope] = [];
      }
    }
    await setStorage({
      featureFlags: flags,
      devSettings,
      customPages,
      [POLICY_KEY]: {
        schemaVersion: 1, adminBypass: false, revision: payload.revision,
        appliedAt: Date.now(), hiddenFeatures, hiddenDeveloperSettings,
        hiddenCustomPages: config.custom_pages.hidden, hiddenCustomPageScopes,
        developerSectionHidden: config.developer_section.hidden,
        managedFeatures, managedDeveloperSettings,
        managedCustomPages: config.custom_pages.managed
          ? config.custom_pages.value
          : null,
        managedCustomPageScopes,
      },
    });
    await removeStorage(LEGACY_KEY);
    await broadcastFlags(flags);
    schedule(config.refresh_minutes);
  }

  async function sync() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      const payload = await root.GBInstallationAuth.fetchConfiguration();
      const config = validateEnvelope(payload);
      const stored = await getStorage(['featureFlags', 'devSettings', 'customPages', POLICY_KEY, BACKUP_KEY]);
      const current = await canonicalizeStoredSettings(stored);
      if (payload.admin_bypass) await restoreForAdmin(payload, current);
      else await applyConfiguration(payload, config, current);
      return { adminBypass: payload.admin_bypass, revision: payload.revision };
    })();
    try { return await syncPromise; } finally { syncPromise = null; }
  }

  function syncQuietly() {
    sync().catch(() => {});
  }
  chrome.runtime.onInstalled.addListener(syncQuietly);
  chrome.runtime.onStartup.addListener(syncQuietly);
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM_NAME) syncQuietly(); });
  schedule(DEFAULT_REFRESH_MINUTES);
  syncQuietly();

  root.GBRemoteSettingsPolicy = Object.freeze({ POLICY_KEY, BACKUP_KEY, ALARM_NAME, sync });
})(globalThis);
