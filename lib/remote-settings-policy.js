/** Apply the authenticated server policy to local extension settings. */
(function installRemoteSettingsPolicy(root) {
  'use strict';

  const POLICY_KEY = 'gbRemoteSettingsPolicy';
  const BACKUP_KEY = 'gbRemoteSettingsBackup';
  const LEGACY_KEY = 'secret_settings';
  const ALARM_NAME = 'gbRemoteSettingsSync';
  const DEFAULT_REFRESH_MINUTES = 15;
  const SALES_FANTASY_SETTING_KEY = 'salesFantasy.enabled';
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
    delete flags.salesFantasyEnabled;
    return flags;
  }

  function canonicalDevSettings(value, legacyFlags) {
    const settings = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
    if (!Object.hasOwn(settings, 'workflowManager.scale')
        && Object.hasOwn(settings, 'campaignManager.scale')) {
      settings['workflowManager.scale'] = settings['campaignManager.scale'];
    }
    if (!Object.hasOwn(settings, SALES_FANTASY_SETTING_KEY)
        && typeof legacyFlags?.salesFantasyEnabled === 'boolean') {
      settings[SALES_FANTASY_SETTING_KEY] = legacyFlags.salesFantasyEnabled;
    }
    delete settings['campaignManager.scale'];
    return settings;
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
    if (Object.hasOwn(current, 'devSettings')
        || typeof current.featureFlags?.salesFantasyEnabled === 'boolean') {
      const value = canonicalDevSettings(current.devSettings, current.featureFlags);
      next.devSettings = value;
      if (JSON.stringify(value) !== JSON.stringify(current.devSettings)) {
        updates.devSettings = value;
      }
    }
    const backup = current[BACKUP_KEY];
    if (backup?.version === 1) {
      const hadLegacySalesFantasy = typeof backup.featureFlags?.salesFantasyEnabled === 'boolean';
      const migrated = {
        ...backup,
        featureFlags: canonicalFlags(backup.featureFlags),
        hadDevSettings: backup.hadDevSettings || hadLegacySalesFantasy,
        devSettings: canonicalDevSettings(backup.devSettings, backup.featureFlags),
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
    return {
      ...config,
      features,
      developer_settings: developerSettings,
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
      await setStorage(restored);
      if (!backup.hadFeatureFlags) await removeStorage('featureFlags');
      if (!backup.hadDevSettings) await removeStorage('devSettings');
    }
    await setStorage({
      [POLICY_KEY]: {
        schemaVersion: 1, adminBypass: true, revision: payload.revision,
        appliedAt: Date.now(), hiddenFeatures: {}, hiddenDeveloperSettings: {},
        developerSectionHidden: false, managedFeatures: {},
        managedDeveloperSettings: {},
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
        },
      });
    }
    const flags = { ...(current.featureFlags || {}) };
    const devSettings = { ...(current.devSettings || {}) };
    const hiddenFeatures = {};
    const hiddenDeveloperSettings = {};
    const managedFeatures = {};
    const managedDeveloperSettings = {};
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
    await setStorage({
      featureFlags: flags,
      devSettings,
      [POLICY_KEY]: {
        schemaVersion: 1, adminBypass: false, revision: payload.revision,
        appliedAt: Date.now(), hiddenFeatures, hiddenDeveloperSettings,
        developerSectionHidden: config.developer_section.hidden,
        managedFeatures, managedDeveloperSettings,
      },
    });
    await removeStorage(LEGACY_KEY);
    await broadcastFlags(flags);
    schedule(config.refresh_minutes);
  }

  async function sync({ force = false } = {}) {
    // A settings invalidation can arrive while startup is still fetching an
    // older policy. The event must perform a fresh pass after that request;
    // otherwise the notification cursor could advance on the stale response.
    if (syncPromise) {
      if (!force) return syncPromise;
      await syncPromise;
      return sync({ force: true });
    }
    syncPromise = (async () => {
      const payload = await root.GBInstallationAuth.fetchConfiguration();
      const config = validateEnvelope(payload);
      const stored = await getStorage(['featureFlags', 'devSettings', POLICY_KEY, BACKUP_KEY]);
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
