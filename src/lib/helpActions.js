import { FEATURE_DEFAULTS, FEATURE_FLAGS, loadFlags, saveFlags } from './flags.js';
import { DEV_SETTINGS, loadDevSettings, saveDevSettings } from './devSettings.js';
import {
  THEME_VARIANTS, loadTheme, applyTheme,
} from './theme.js';
import { PRESET_SCOPES, gatherScopes } from './presetScopes.js';
import { MUTATION_ACTION_TYPES, planHelpAction, sanitizePageRoute } from './helpActionCore.js';

const RECEIPTS_KEY = 'gbHelpActionReceiptsV1';
const COLOR_KEYS = ['--gb-brand-label', '--gb-brand', '--gb-brand-dark', '--gb-brand-border'];

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, (value) => resolve(value || {})));
}
function storageSet(value) {
  return new Promise((resolve, reject) => chrome.storage.local.set(value, () => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message || 'Could not save the assistant action'));
    else resolve();
  }));
}

function runtimeMessage(payload) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(payload, (response) => {
    const error = chrome.runtime.lastError;
    if (error || !response?.ok) reject(new Error(error?.message || response?.error || 'The action could not be completed'));
    else resolve(response);
  }));
}

const featureRules = Object.fromEntries(FEATURE_FLAGS.map((item) => [item.key, { type: 'bool' }]));
const settingRules = Object.fromEntries(
  DEV_SETTINGS.filter((item) => item.type !== 'action').map((item) => [item.key, item]),
);
const themeVariants = Object.fromEntries(THEME_VARIANTS.flatMap((item) => {
  const id = String(item.id || '');
  const label = String(item.name || '').trim().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [[id.toLowerCase(), id], [label, id]];
}));
const shareScopes = PRESET_SCOPES.map((item) => item.id);

async function environment() {
  const stored = await storageGet(['gbRemoteSettingsPolicy', 'templates']);
  return {
    featureRules,
    settingRules,
    themeVariants,
    shareScopes,
    templates: Array.isArray(stored.templates) ? stored.templates : [],
    policy: stored.gbRemoteSettingsPolicy || {},
  };
}

export function isExecutableHelpAction(action) {
  return MUTATION_ACTION_TYPES.has(String(action?.type || ''));
}

export async function helpActionContext() {
  const env = await environment();
  const hidden = env.policy?.adminBypass ? [] : [
    ...Object.keys(env.policy?.hiddenFeatures || {}),
    ...Object.keys(env.policy?.hiddenDeveloperSettings || {}),
    ...(env.policy?.developerSectionHidden ? Object.keys(settingRules) : []),
  ];
  const resources = env.templates
    .filter((item) => item && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(String(item.id || '')))
    .slice(0, 80)
    .map((item) => ({
      kind: 'email_template',
      id: String(item.id),
      label: String(item.name || item.id).trim().slice(0, 120),
    }));
  return {
    hidden_settings: [...new Set(hidden)].slice(0, 160),
    available_resources: resources,
    page_url: sanitizePageRoute(globalThis.location?.href),
  };
}

async function execute(action) {
  const env = await environment();
  const operation = planHelpAction(action, env);
  if (operation.type === 'set_feature') {
    const flags = { ...FEATURE_DEFAULTS, ...await loadFlags(), [operation.target]: operation.value };
    saveFlags(flags);
    return { message: `${operation.value ? 'Enabled' : 'Disabled'} ${operation.target}` };
  }
  if (operation.type === 'set_setting') {
    const settings = { ...await loadDevSettings(), [operation.target]: operation.value };
    saveDevSettings(settings);
    return { message: `Updated ${operation.target}` };
  }
  if (operation.type === 'set_theme_preset') {
    const current = await loadTheme();
    const theme = { ...current, variant: operation.value, colors: {} };
    await storageSet({ gbTheme: theme });
    applyTheme(theme);
    const label = THEME_VARIANTS.find((item) => item.id === operation.value)?.name || operation.value;
    return { message: `Applied ${label} theme` };
  }
  if (operation.type === 'set_theme_palette') {
    const current = await loadTheme();
    const colors = { ...(current.colors || {}) };
    COLOR_KEYS.forEach((key, index) => { colors[key] = operation.colors[index]; });
    const theme = { ...current, colors };
    await storageSet({ gbTheme: theme });
    applyTheme(theme);
    return { message: `Applied ${operation.value || 'custom'} palette` };
  }
  if (operation.type === 'share_settings') {
    const scopes = await gatherScopes(operation.scopes);
    const response = await runtimeMessage({ action: 'settingsShareCreate', name: operation.name, scopes });
    return { message: `Created “${response.share?.name || operation.name}”`, url: response.share?.url || '' };
  }
  const response = await runtimeMessage({ action: 'emailTemplateShareCreate', template: operation.template });
  return { message: `Created a link for “${operation.template.name || 'email template'}”`, url: response.share?.url || '' };
}

export async function executeHelpActionOnce(receiptId, action) {
  const safeReceipt = String(receiptId || '').slice(0, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(safeReceipt)) throw new Error('The action receipt is invalid');
  const stored = await storageGet(RECEIPTS_KEY);
  const receipts = stored[RECEIPTS_KEY] && typeof stored[RECEIPTS_KEY] === 'object'
    ? stored[RECEIPTS_KEY]
    : {};
  if (receipts[safeReceipt]?.status === 'succeeded') return receipts[safeReceipt];
  try {
    const result = await execute(action);
    const receipt = {
      status: 'succeeded', message: String(result.message || 'Action applied').slice(0, 200),
      url: String(result.url || '').slice(0, 2_000), at: Date.now(),
    };
    const next = { ...receipts, [safeReceipt]: receipt };
    const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 100));
    await storageSet({ [RECEIPTS_KEY]: trimmed });
    return receipt;
  } catch (error) {
    return { status: 'failed', message: String(error?.message || 'Action failed').slice(0, 240), url: '', at: Date.now() };
  }
}
