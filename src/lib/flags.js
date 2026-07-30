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
  taskListEnabled:          true,
  marginCalcEnabled:        true,
  crmSearchEnabled:         true,
  phoneFinderEnabled:       true,
  emailTemplatesEnabled:    true,
  powerAutomateEnabled:     false,
  // ── Features that previously had no flag (now toggleable) ──
  actionsShelfEnabled:      true,   // the bottom-right quick-actions shelf itself
  giftCatalogEnabled:       true,   // Gifting Catalog (+ Customize + Monogram)
  mockupStudioEnabled:      true,   // AI product mockup batches
  callLogEnabled:           true,   // Call Log modal + Call/Log-call shelf actions
  quickTaskEnabled:         true,   // Quick Task modal + shelf action
  crmNewContactEnabled:     true,   // CRM Create Contact modal + Ctrl+Q keybind
  textPreviewEnabled:       true,   // Text/chat transcript row preview (was sharing emailPreviewEnabled)
  workflowManagerEnabled:   true,   // Single-pass account Workflow Manager
  notificationsEnabled:        true,   // targeted messages + completion alerts
};
// NOTE: the 3D golfball viewer is part of the Image Viewer (it renders inside
// ImagePreview.jsx), so it has no separate flag — `imagePreviewEnabled` covers it.

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
  // ── Email & Templates ──
  { key: 'emailTemplatesEnabled', section: 'Email & Templates', name: 'Email Templates',  desc: 'Template dropdown, resolved variables, and Send button in the popup.', icon: 'mail' },
  { key: 'chargeEnabled',         section: 'Email & Templates', name: 'Charge Card',       desc: 'Charge / Refund button in the email popup.',                          icon: 'card' },
  { key: 'orderEditEnabled',      section: 'Email & Templates', name: 'Order Edit',        desc: 'Order Edit button in the email popup.',                               icon: 'edit' },
  { key: 'emailPreviewEnabled',   section: 'Email & Templates', name: 'Email Preview',     desc: 'Click email rows in Case Email History to open the full thread.',     icon: 'mail' },
  { key: 'textPreviewEnabled',    section: 'Email & Templates', name: 'Text Preview',      desc: 'Hover preview of case notes / chat transcripts.',                     icon: 'mail' },
  { key: 'workflowManagerEnabled', section: 'Tools', name: 'Workflow Manager', desc: 'Run one reusable set of steps for each selected account or contact.', icon: 'megaphone' },
  { key: 'notificationsEnabled', section: 'Tools', name: 'Notifications', desc: 'Receive targeted messages and completion alerts in the toolbar notification center.', icon: 'alert' },
  // ── CRM & Contacts ──
  { key: 'crmSearchEnabled',       section: 'CRM & Contacts', name: 'CRM Search',        desc: 'Quick search for customers and orders (Ctrl+K).',  icon: 'search' },
  { key: 'crmNewContactEnabled',   section: 'CRM & Contacts', name: 'New Contact',       desc: 'Quick-create a CRM contact (Ctrl+Q).',             icon: 'user' },
  { key: 'callLogEnabled',         section: 'CRM & Contacts', name: 'Call Log',          desc: 'Log calls from contact / account pages.',          icon: 'phone' },
  { key: 'quickTaskEnabled',       section: 'CRM & Contacts', name: 'Quick Task',        desc: 'Create a quick task for a contact.',               icon: 'check' },
  { key: 'taskListEnabled',        section: 'CRM & Contacts', name: 'Task List',         desc: 'Full task list for order todos (Ctrl+X).',         icon: 'check' },
  // ── Orders & Pricing ──
  { key: 'marginCalcEnabled',   section: 'Orders & Pricing', name: 'Margin Calculator', desc: 'Margin + profit metrics on order pages (Ctrl+M).', icon: 'bolt' },
  { key: 'watchListEnabled',    section: 'Orders & Pricing', name: 'Watchlist',         desc: 'Track orders across sessions.',                    icon: 'eye' },
  { key: 'calendarEnabled',     section: 'Orders & Pricing', name: 'Order Dates',       desc: 'Ship dates + production timeline calendar.',       icon: 'cog' },
  { key: 'autoPushEnabled',     section: 'Orders & Pricing', name: 'Auto Push',         desc: 'Auto-push order date/note updates to the order.',  icon: 'send' },
  { key: 'copyIdsEnabled',      section: 'Orders & Pricing', name: 'Copy IDs',          desc: 'Copy all order IDs on the index page.',            icon: 'copy' },
  { key: 'signifydGlowEnabled', section: 'Orders & Pricing', name: 'Signifyd Glow',     desc: 'Glow orders by Signifyd score.',                   icon: 'alert' },
  { key: 'phoneFinderEnabled',  section: 'Orders & Pricing', name: 'Phone Finder',      desc: 'Scan a contact’s orders for a phone number.',      icon: 'search' },
  // ── Tools ──
  { key: 'imagePreviewEnabled', section: 'Tools', name: 'Image Viewer',         desc: 'View / extract logo images, the 3D ball preview, and Submit Proof (popup).', icon: 'eye' },
  { key: 'giftCatalogEnabled',  section: 'Tools', name: 'Gifting Catalog',      desc: 'Gifting catalog, customization, and monograms.',    icon: 'card' },
  { key: 'mockupStudioEnabled', section: 'Tools', name: 'Mockup Studio',        desc: 'Generate product mockups in durable image batches.', icon: 'eye' },
  { key: 'actionsShelfEnabled', section: 'Tools', name: 'Quick Actions Shelf',  desc: 'Floating bottom-right quick-actions shelf (Shift×2).', icon: 'bolt' },
];

/* Flags with bespoke Settings UI still need canonical metadata for the
   backend registry, generated help, and parity tests. */
export const AUXILIARY_FEATURE_FLAGS = [
  {
    key: 'powerAutomateEnabled',
    section: 'Integration',
    name: 'Power Automate',
    desc: 'Route emails through your Power Automate flow for silent sending. Off = pre-filled Outlook windows.',
    icon: 'send',
  },
];

export const FEATURE_FLAG_META = [...FEATURE_FLAGS, ...AUXILIARY_FEATURE_FLAGS];

const LEGACY_WORKFLOW_FLAG = 'campaignManagerEnabled';

/** Canonicalize stored flags without mutating the storage result. */
export function normalizeStoredFlags(value) {
  const flags = value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
  let changed = false;
  if (!Object.hasOwn(flags, 'workflowManagerEnabled')
      && typeof flags[LEGACY_WORKFLOW_FLAG] === 'boolean') {
    flags.workflowManagerEnabled = flags[LEGACY_WORKFLOW_FLAG];
    changed = true;
  }
  if (Object.hasOwn(flags, LEGACY_WORKFLOW_FLAG)) {
    delete flags[LEGACY_WORKFLOW_FLAG];
    changed = true;
  }
  for (const key of [
    'powerAutomateUrl', 'directSendUrl', 'replyWithTemplateEnabled',
    'directSendEnabled', 'developerMode', 'crmQueryBuilderEnabled',
    'submitProofEnabled',
  ]) {
    if (Object.hasOwn(flags, key)) {
      delete flags[key];
      changed = true;
    }
  }
  return { flags, changed };
}

/** Read saved flags merged over the defaults. Migrates legacy key names. */
export function loadFlags() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('featureFlags', (d) => {
        const { flags, changed } = normalizeStoredFlags(d.featureFlags);
        if (changed) chrome.storage.local.set({ featureFlags: flags });
        resolve({ ...FEATURE_DEFAULTS, ...flags });
      });
    } catch {
      resolve({ ...FEATURE_DEFAULTS });
    }
  });
}

/** Persist flags and broadcast them to open golfballs.com tabs. */
export function saveFlags(flags) {
  try {
    const { flags: safeFlags } = normalizeStoredFlags(flags);
    chrome.storage.local.set({ featureFlags: safeFlags });
    chrome.tabs.query({ url: ['https://www.golfballs.com/*', 'https://api.golfballs.com/*'] }, (tabs) => {
      (tabs || []).forEach((t) => {
        try { chrome.tabs.sendMessage(t.id, { action: 'GB_FEATURE_FLAGS', flags: safeFlags }); } catch {}
      });
    });
  } catch { /* not in an extension page — nothing to persist */ }
}
