/* ───────────────────────────────────────────────────────────────
   flags.js — extension feature flags.

   Ported from editor.js's FEATURE_DEFAULTS. The settings page reads
   and writes these; content scripts gate their features on them.
─────────────────────────────────────────────────────────────── */

/** Default on/off state for every feature flag. */
export const FEATURE_DEFAULTS = {
  copyIdsEnabled:           true,
  chargeEnabled:            true,
  orderEditEnabled:         true,
  emailPreviewEnabled:      true,
  imagePreviewEnabled:      true,
  calendarEnabled:          true,
  watchListEnabled:         true,
  autoPushEnabled:          true,
  signifydGlowEnabled:      true,
  crmQueryBuilderEnabled:   true,
  submitProofEnabled:       true,
  taskListEnabled:          true,
  marginCalcEnabled:        true,
  crmSearchEnabled:         true,
  phoneFinderEnabled:       true,
  emailTemplatesEnabled:    true,
  powerAutomateEnabled:     false,
  powerAutomateUrl:         '',
};

/** Default keyboard shortcuts. */
export const KEYBOARD_SHORTCUTS_DEFAULTS = {
  taskList: 'x',
  marginCalc: 'm',
  crmSearch: 'k',
  crmNewContact: 'q',
};

/** Load keyboard shortcuts from storage. */
export async function loadKeyboardShortcuts() {
  const { keyboardShortcuts } = await chrome.storage.local.get('keyboardShortcuts');
  return { ...KEYBOARD_SHORTCUTS_DEFAULTS, ...keyboardShortcuts };
}

/** Save keyboard shortcuts to storage. */
export async function saveKeyboardShortcuts(shortcuts) {
  await chrome.storage.local.set({ keyboardShortcuts: shortcuts });
}

/** Display metadata + render order for the settings toggles. */
export const FEATURE_FLAGS = [
  {
    key: 'emailTemplatesEnabled',
    name: 'Email Templates',
    desc: 'Shows the template dropdown, resolved-variables readout, and Send button in the popup. Turn off to use the popup as a pure action launcher (Charge, Watch List, Tasks, etc.) without any template UI.',
    icon: 'mail',
  },
  {
    key: 'chargeEnabled',
    name: 'Charge Card',
    desc: 'Shows the Charge Card / Refund button in the email template popup. Disable if you don\'t process payments through the extension.',
    icon: 'card',
  },
  {
    key: 'orderEditEnabled',
    name: 'Order Edit',
    desc: 'Shows the Order Edit button in the email template popup. Disable if you don\'t use the order edit modal.',
    icon: 'edit',
  },
  {
    key: 'submitProofEnabled',
    name: 'Submit Proof',
    desc: 'Shows the Submit Proof button for sending art proofs directly from the order page.',
    icon: 'send',
  },
  {
    key: 'marginCalcEnabled',
    name: 'Margin Calculator',
    desc: 'Displays margin calculations and profit metrics on order pages.',
    icon: 'bolt',
  },
  {
    key: 'watchListEnabled',
    name: 'Watchlist',
    desc: 'Enables the watchlist feature to track orders across sessions.',
    icon: 'eye',
  },
  {
    key: 'taskListEnabled',
    name: 'Task List',
    desc: 'Shows an integrated task list for tracking order-related todos.',
    icon: 'check',
  },
  {
    key: 'crmSearchEnabled',
    name: 'CRM Search',
    desc: 'Quick search bar for looking up customers and orders in the CRM.',
    icon: 'search',
  },
  {
    key: 'crmQueryBuilderEnabled',
    name: 'CRM Query Builder',
    desc: 'Advanced query builder for filtering CRM data with complex conditions.',
    icon: 'filter',
  },
  {
    key: 'emailPreviewEnabled',
    name: 'Email Preview',
    desc: 'Hover over any email row in the Case Email History portlet to see a popup preview of the email content - no download required.',
    icon: 'mail',
  },
  {
    key: 'imagePreviewEnabled',
    name: 'Image Viewer',
    desc: 'Shows a View Logo hover button over product logo images on order pages - preview, download, or submit proof links without leaving the page.',
    icon: 'eye',
  },
  {
    key: 'calendarEnabled',
    name: 'Calendar',
    desc: 'Shows order ship dates and production timeline on a visual calendar.',
    icon: 'cog',
  },
  {
    key: 'autoPushEnabled',
    name: 'Auto Push',
    desc: 'Automatically pushes order updates to external systems when status changes.',
    icon: 'send',
  },
  {
    key: 'phoneFinderEnabled',
    name: 'Phone Finder',
    desc: 'Extracts and formats phone numbers from order data for quick copying.',
    icon: 'search',
  },
  {
    key: 'copyIdsEnabled',
    name: 'Copy IDs',
    desc: 'Shows a Copy button in the Order List portlet title bar on index pages, writing all order IDs as clickable links to the clipboard.',
    icon: 'copy',
  },
  {
    key: 'signifydGlowEnabled',
    name: 'Signifyd Glow',
    desc: 'Adds a subtle glow effect to orders based on their Signifyd score status.',
    icon: 'alert',
  },
];

/** Read saved flags merged over the defaults. Migrates legacy key names. */
export function loadFlags() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('featureFlags', (d) => {
        const saved = d.featureFlags || {};
        // Migrate the legacy directSendUrl key written by older builds.
        // replyWithTemplate/directSendEnabled were phased out in favor
        // of a per-email setting and intentionally are not migrated.
        if (saved.directSendUrl && !saved.powerAutomateUrl) {
          saved.powerAutomateUrl = saved.directSendUrl;
        }
        // Strip phased-out keys so they don't bloat storage with stale
        // values that no code consults.
        delete saved.replyWithTemplateEnabled;
        delete saved.directSendEnabled;
        delete saved.developerMode;
        resolve({ ...FEATURE_DEFAULTS, ...saved });
      });
    } catch {
      resolve({ ...FEATURE_DEFAULTS });
    }
  });
}

/** Persist flags and broadcast them to open golfballs.com tabs. */
export function saveFlags(flags) {
  try {
    chrome.storage.local.set({ featureFlags: flags });
    chrome.tabs.query({ url: ['*://*.golfballs.com/*'] }, (tabs) => {
      (tabs || []).forEach((t) => {
        try { chrome.tabs.sendMessage(t.id, { action: 'GB_FEATURE_FLAGS', flags }); } catch {}
      });
    });
  } catch { /* not in an extension page — nothing to persist */ }
}
