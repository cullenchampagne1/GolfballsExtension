/* ───────────────────────────────────────────────────────────────
   customPages.js — registry of internal site pages the extension can
   override with a custom UI. Each section has a stable id (used as
   the storage key) plus a list of pages keyed by stable id.

   Storage shape:
     chrome.storage.local.customPages = {
       crm: ['dashboard', 'search', …],
       // other sections later
     }
─────────────────────────────────────────────────────────────── */

export const CUSTOM_PAGE_SECTIONS = [
  {
    id: 'crm',
    label: 'CRM',
    /* CRM admin sidebar items, captured from the Contact Details
       design handoff. Order matches the live sidebar. */
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
      { id: 'adjust_leaderboard',  label: 'Adjust Leader Board' },
      { id: 'contact_details',     label: 'Contact Details' },
    ],
  },
];

export const STORAGE_KEY = 'customPages';

export function emptyCustomPages() {
  const out = {};
  for (const s of CUSTOM_PAGE_SECTIONS) out[s.id] = [];
  return out;
}

export function loadCustomPages() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      resolve(emptyCustomPages());
      return;
    }
    chrome.storage.local.get(STORAGE_KEY, (d) => {
      const saved = d[STORAGE_KEY] || {};
      resolve({ ...emptyCustomPages(), ...saved });
    });
  });
}

export function saveCustomPages(pages) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.set({ [STORAGE_KEY]: pages });
}
