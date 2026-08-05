import {
  REMOTE_POLICY_KEY,
  enforceManagedStorageValue,
} from './managedSettingsPolicy.js';

/* ───────────────────────────────────────────────────────────────
   customPages.js — registry of internal site pages the extension can
   override with a custom UI. The one generic Custom Pages switch owns
   every registered custom page, regardless of the host product area.

   Storage shape:
     chrome.storage.local.customPages = {
       all: ['dashboard', 'search', …],
     }
─────────────────────────────────────────────────────────────── */

export const CUSTOM_PAGE_SECTIONS = [
  {
    id: 'all',
    label: 'Custom Pages',
    /* Every registered takeover. This remains one switch as pages expand
       beyond the current CRM admin set. */
    items: [
      { id: 'dashboard',           label: 'Dashboard' },
      { id: 'search',              label: 'Search' },
      { id: 'custom_rep_activity', label: 'Custom Rep Activity' },
      { id: 'my_recent_history',   label: 'My Recent History' },
      { id: 'task_list',           label: 'Task List' },
      { id: 'action_review',       label: 'Action Review' },
      { id: 'blacklisted_emails',  label: 'Blacklisted Emails' },
      { id: 'recent_calls',        label: 'Recent Calls' },
      { id: 'case_index',          label: 'Case Index' },
      { id: 'create_contact',      label: 'Create Contact' },
      { id: 'open_lead',           label: 'Open Lead' },
      { id: 'opportunity',         label: 'Opportunity' },
      { id: 'opportunity_linking', label: 'Opportunity Linking' },
      /* Page 294 in the host CRM is "Adjust Leader Board", which nobody uses.
         The takeover claims that route (and its sidebar slot) for the
         Replacement Contacts queue — see src/lib/replacementContacts.js. */
      { id: 'replacement_contacts', label: 'Replacement Contacts' },
      { id: 'contact_details',     label: 'Contact Details' },
      { id: 'account_details',     label: 'Account Details' },
      { id: 'opportunity_details', label: 'Opportunity Details' },
    ],
  },
];

export const STORAGE_KEY = 'customPages';
const LEGACY_SCOPE_ID = 'crm';

export function emptyCustomPages() {
  const out = {};
  for (const s of CUSTOM_PAGE_SECTIONS) out[s.id] = [];
  return out;
}

/** Collapse old per-product scope data into the one all-pages control. */
export function normalizeStoredCustomPages(value) {
  const saved = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
  const section = CUSTOM_PAGE_SECTIONS[0];
  const current = Array.isArray(saved[section.id]) ? saved[section.id] : null;
  const legacy = Array.isArray(saved[LEGACY_SCOPE_ID]) ? saved[LEGACY_SCOPE_ID] : [];
  const enabled = (current || legacy).length > 0;
  const pages = { [section.id]: enabled ? section.items.map((item) => item.id) : [] };
  const changed = JSON.stringify(saved) !== JSON.stringify(pages);
  return { pages, changed };
}

export function loadCustomPages() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(emptyCustomPages());
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (d) => {
      const { pages, changed } = normalizeStoredCustomPages(d[STORAGE_KEY]);
      if (changed) chrome.storage.local.set({ [STORAGE_KEY]: pages });
      resolve(pages);
    });
  });
}

export function saveCustomPages(pages) {
  if (typeof chrome === 'undefined' || !chrome.storage) return Promise.resolve();
  const normalized = normalizeStoredCustomPages(pages).pages;
  return new Promise((resolve) => {
    chrome.storage.local.get(REMOTE_POLICY_KEY, (stored) => {
      const guarded = enforceManagedStorageValue(
        STORAGE_KEY, normalized, stored?.[REMOTE_POLICY_KEY],
      );
      chrome.storage.local.set({ [STORAGE_KEY]: guarded }, resolve);
    });
  });
}
