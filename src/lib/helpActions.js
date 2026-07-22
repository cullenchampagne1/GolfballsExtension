import { FEATURE_DEFAULTS, FEATURE_FLAGS, loadFlags } from './flags.js';
import { DEV_SETTINGS, loadDevSettings, saveDevSettings } from './devSettings.js';
import {
  THEME_VARIANTS, loadTheme, applyTheme,
} from './theme.js';
import { PRESET_SCOPES, gatherScopes } from './presetScopes.js';
import { buildAutomaticHelpState } from './helpAutomaticState.js';
import {
  createSerialHelpActionRunner, helpActionReceiptDecision, helpActionReceiptId,
  hasIssuedHelpActionReceipt, helpActionConfirmationTypes,
  helpActionRequiresConfirmation,
  MUTATION_ACTION_TYPES, planHelpAction, sanitizePageRoute,
  seedHistoricalHelpActionReceipts,
} from './helpActionCore.js';

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

export async function prepareHelpActionReceipts(receiptIds) {
  if (!Array.isArray(receiptIds) || receiptIds.length === 0) return;
  const stored = await storageGet(RECEIPTS_KEY);
  await storageSet({
    [RECEIPTS_KEY]: seedHistoricalHelpActionReceipts(
      stored[RECEIPTS_KEY], receiptIds, Date.now(),
    ),
  });
}

export { helpActionReceiptId, hasIssuedHelpActionReceipt };
export { helpActionConfirmationTypes, helpActionRequiresConfirmation };

export async function helpActionContext() {
  const env = await environment();
  const hidden = env.policy?.adminBypass ? [] : [
    ...Object.keys(env.policy?.hiddenFeatures || {}),
    ...Object.keys(env.policy?.hiddenDeveloperSettings || {}),
    ...(env.policy?.developerSectionHidden ? Object.keys(settingRules) : []),
  ];
  const [flags, settings] = await Promise.all([loadFlags(), loadDevSettings()]);
  return {
    hidden_settings: [...new Set(hidden)].slice(0, 160),
    automatic_state: buildAutomaticHelpState(
      flags, settings, hidden, Object.keys(featureRules), Object.keys(settingRules),
    ),
    // Local resources are disclosed only by the explicit one-time approval
    // flow. Keeping this empty prevents a normal help turn from leaking even
    // template names to the backend.
    available_resources: [],
    page_url: sanitizePageRoute(globalThis.location?.href),
  };
}

async function execute(action, receiptId) {
  const env = await environment();
  const operation = planHelpAction(action, env);
  if (operation.type === 'set_feature') {
    const flags = { ...FEATURE_DEFAULTS, ...await loadFlags(), [operation.target]: operation.value };
    await storageSet({ featureFlags: flags });
    if (typeof window !== 'undefined') {
      window.__gbFeatureFlags = { ...(window.__gbFeatureFlags || {}), ...flags };
    }
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
  if (operation.type === 'submit_ticket') {
    let extensionVersion = '';
    try { extensionVersion = chrome.runtime.getManifest()?.version || ''; } catch { /* */ }
    const response = await runtimeMessage({
      action: 'supportTicketCreate',
      requestId: receiptId,
      kind: operation.kind,
      title: operation.title,
      description: operation.description,
      context: {
        extension_version: String(extensionVersion).slice(0, 40),
        surface: 'actions-shelf',
        page_type: String(globalThis.__gbHelpPageType || 'unknown').slice(0, 60),
        page_url: sanitizePageRoute(globalThis.location?.href),
        ...(operation.references?.length ? { source_references: operation.references } : {}),
      },
    });
    const ticket = response.ticket || {};
    return {
      message: `${operation.kind === 'bug' ? 'Bug report' : 'Feature request'} ${ticket.id || ''} submitted`.trim(),
      reference: {
        id: String(ticket.id || '').slice(0, 20),
        kind: operation.kind,
        status: String(ticket.status || 'open').slice(0, 32),
        title: operation.title,
      },
    };
  }
  const response = await runtimeMessage({ action: 'emailTemplateShareCreate', template: operation.template });
  return { message: `Created a link for “${operation.template.name || 'email template'}”`, url: response.share?.url || '' };
}

async function executeHelpActionOnceNow(receiptId, action, { retry = false } = {}) {
  const safeReceipt = String(receiptId || '').slice(0, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(safeReceipt)) throw new Error('The action receipt is invalid');
  const stored = await storageGet(RECEIPTS_KEY);
  const receipts = stored[RECEIPTS_KEY] && typeof stored[RECEIPTS_KEY] === 'object'
    ? stored[RECEIPTS_KEY]
    : {};
  const decision = helpActionReceiptDecision(receipts, safeReceipt, { retry });
  if (!decision.execute) return { ...decision.existing, replayed: true };
  try {
    const result = await execute(action, safeReceipt);
    const receipt = {
      status: 'succeeded', message: String(result.message || 'Action applied').slice(0, 200),
      url: String(result.url || '').slice(0, 2_000), at: Date.now(),
    };
    if (result.reference && typeof result.reference === 'object') {
      const id = String(result.reference.id || '').slice(0, 20);
      if (/^GBT-[A-Z0-9]{8}$/.test(id)) {
        receipt.reference = {
          id,
          kind: result.reference.kind === 'feature' ? 'feature' : 'bug',
          status: String(result.reference.status || 'open').slice(0, 32),
          title: String(result.reference.title || '').slice(0, 120),
        };
      }
    }
    const next = { ...receipts, [safeReceipt]: receipt };
    const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 400));
    await storageSet({ [RECEIPTS_KEY]: trimmed });
    return receipt;
  } catch (error) {
    const receipt = {
      status: 'failed', message: String(error?.message || 'Action failed').slice(0, 240),
      url: '', at: Date.now(),
    };
    const next = { ...receipts, [safeReceipt]: receipt };
    const trimmed = Object.fromEntries(Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 400));
    await storageSet({ [RECEIPTS_KEY]: trimmed });
    return receipt;
  }
}

export async function readHelpActionReceipt(receiptId) {
  const safeReceipt = String(receiptId || '').slice(0, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(safeReceipt)) {
    throw new Error('The action receipt is invalid');
  }
  const stored = await storageGet(RECEIPTS_KEY);
  const receipt = stored[RECEIPTS_KEY]?.[safeReceipt];
  return receipt && typeof receipt === 'object' ? receipt : null;
}

export async function declineHelpAction(receiptId) {
  const safeReceipt = String(receiptId || '').slice(0, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/.test(safeReceipt)) {
    throw new Error('The action receipt is invalid');
  }
  const stored = await storageGet(RECEIPTS_KEY);
  const receipts = stored[RECEIPTS_KEY] && typeof stored[RECEIPTS_KEY] === 'object'
    ? stored[RECEIPTS_KEY]
    : {};
  const existing = receipts[safeReceipt];
  if (existing?.status === 'succeeded') return existing;
  const receipt = {
    status: 'declined', message: 'Not submitted.', url: '', at: Date.now(),
  };
  const next = { ...receipts, [safeReceipt]: receipt };
  const trimmed = Object.fromEntries(
    Object.entries(next).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 400),
  );
  await storageSet({ [RECEIPTS_KEY]: trimmed });
  return receipt;
}

// One queue for the whole content-script runtime. When a restored conversation
// mounts several historical receipt cards, every read/execute/write transaction
// observes the receipt written before it instead of overwriting a stale snapshot.
const executeHelpActionSerial = createSerialHelpActionRunner(executeHelpActionOnceNow);

export function executeHelpActionOnce(receiptId, action, options) {
  return executeHelpActionSerial(receiptId, action, options);
}
