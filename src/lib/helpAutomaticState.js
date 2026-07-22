/** Build the low-risk settings bucket sent with each Help Companion turn. */
export function buildAutomaticHelpState(
  flagsValue,
  settingsValue,
  hiddenKeys = [],
  registeredFeatureKeys = [],
  registeredSettingKeys = [],
) {
  const flags = flagsValue && typeof flagsValue === 'object' ? flagsValue : {};
  const settings = settingsValue && typeof settingsValue === 'object' ? settingsValue : {};
  const hidden = new Set(Array.isArray(hiddenKeys) ? hiddenKeys : []);
  const features = {};
  for (const key of registeredFeatureKeys.slice(0, 80)) {
    if (!hidden.has(key) && typeof flags[key] === 'boolean') features[key] = flags[key];
  }
  const developerSettings = {};
  for (const key of registeredSettingKeys.slice(0, 240)) {
    if (hidden.has(key)) continue;
    const value = settings[key];
    if (value === null || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))) {
      developerSettings[key] = value;
    } else if (typeof value === 'string') {
      developerSettings[key] = value
        .replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500);
    }
  }
  return { features, developer_settings: developerSettings };
}
