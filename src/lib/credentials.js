/**
 * Isolated storage for bearer-style configuration values.
 *
 * Chrome extension storage is access-controlled but not an operating-system
 * keychain. Keeping these values out of featureFlags prevents presets, support
 * exports, and feature-flag broadcasts from copying them accidentally. The
 * background worker remains the only code that transmits either credential.
 */
export const CREDENTIALS_KEY = 'gbCredentials';

export const EMPTY_CREDENTIALS = Object.freeze({
  powerAutomateUrl: '',
  addressAutocompleteKey: '',
});

function normalize(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    powerAutomateUrl: typeof source.powerAutomateUrl === 'string' ? source.powerAutomateUrl.trim() : '',
    addressAutocompleteKey: typeof source.addressAutocompleteKey === 'string'
      ? source.addressAutocompleteKey.trim()
      : '',
  };
}

/** Load credentials and migrate the legacy Power Automate feature-flag field. */
export function loadCredentials() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([CREDENTIALS_KEY, 'featureFlags'], (stored) => {
        const credentials = normalize(stored[CREDENTIALS_KEY]);
        const flags = stored.featureFlags && typeof stored.featureFlags === 'object'
          ? { ...stored.featureFlags }
          : {};
        const legacyUrl = typeof flags.powerAutomateUrl === 'string' ? flags.powerAutomateUrl.trim() : '';
        let migrated = false;

        if (!credentials.powerAutomateUrl && legacyUrl) {
          credentials.powerAutomateUrl = legacyUrl;
          migrated = true;
        }
        if (Object.prototype.hasOwnProperty.call(flags, 'powerAutomateUrl')) {
          delete flags.powerAutomateUrl;
          migrated = true;
        }
        if (Object.prototype.hasOwnProperty.call(flags, 'directSendUrl')) {
          if (!credentials.powerAutomateUrl && typeof flags.directSendUrl === 'string') {
            credentials.powerAutomateUrl = flags.directSendUrl.trim();
          }
          delete flags.directSendUrl;
          migrated = true;
        }

        if (migrated) {
          chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials, featureFlags: flags });
        }
        resolve(credentials);
      });
    } catch {
      resolve({ ...EMPTY_CREDENTIALS });
    }
  });
}

/** Replace the isolated credential record with normalized string values. */
export async function saveCredentials(value) {
  const credentials = normalize(value);
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials });
  return credentials;
}
