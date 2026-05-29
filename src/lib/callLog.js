/* ───────────────────────────────────────────────────────────────
   callLog.js — shared constants + helpers for the call-log
   subsystem. Both the Notes editor (which lets reps configure
   their preset templates) and the CallLog modal (which fires
   them at quick-action time) read from this module so the two
   surfaces can't drift.

   Storage contract (matches the legacy quick-action panel at
   src/vanilla/call-log-panel.js):

     chrome.storage.local.noteTemplates: Array<Template>

   where Template (for the call_log subType) is:
     {
       id:            string,
       name:          string,    // shown on the preset row
       subType:       'call_log' | 'note' | 'task',
       enabled:       boolean,
       subject:       string,    // CRM activity "Subject" field
       body:          string,    // CRM activity "Description" field
       callDirection: 0 | 1,     // 0 = Outbound, 1 = Inbound
       callCategory:  number,    // CRM enum id (see CALL_CATEGORY_OPTIONS)
       callVoicemail: boolean,   // sets the CRM voicemail flag
       callStep1..4:  string,    // up to four next-step actions
       updatedAt:     number,
     }

   Submitting a template (preset OR custom) eventually POSTs to
   the CRM's activity-log form at /golfballs/adminnew/Default.aspx
   ?Page=272 — see src/vanilla/call-log-panel.js for the field-
   scrape + POST flow. The CallLog modal stays UI-only by taking
   the submit fn as a dep, so the playground can mock it without
   needing the CRM running.
─────────────────────────────────────────────────────────────── */

/* CRM enum ids — these are the actual values the CRM form expects
   for `tbCategory`. Don't reorder casually; the ids are the wire
   format, the labels are the display. Ported verbatim from
   src/pages/NoteEditor.jsx so both surfaces show the same picker. */
export const CALL_CATEGORY_OPTIONS = [
  { id: '0',  label: 'Select' },
  { id: '1',  label: 'Product Question' },
  { id: '2',  label: 'Order Status' },
  { id: '3',  label: 'Place Order' },
  { id: '5',  label: 'Transfer' },
  { id: '16', label: 'Order Payment' },
  { id: '17', label: 'Turnaround Time' },
  { id: '18', label: 'Art' },
  { id: '21', label: 'Prior Year Followup' },
  { id: '27', label: 'Returning VoiceMail' },
  { id: '29', label: 'Tournament Lead' },
  { id: '30', label: 'Form Lead Followup' },
  { id: '35', label: 'General Question' },
  { id: '36', label: 'Order Issues' },
  { id: '37', label: 'CSR Backup' },
  { id: '39', label: 'Discovery' },
  { id: '40', label: 'Opportunity' },
  { id: '41', label: 'Returns/Reprints' },
  { id: '49', label: 'Charge Error' },
  { id: '50', label: 'Fraud Inquiry' },
  { id: '51', label: 'International Orders' },
  { id: '52', label: 'Profanity' },
  { id: '53', label: 'Order Change' },
  { id: '54', label: 'Cancelation' },
  { id: '55', label: 'Website Concerns' },
];

/* Status-tint hint per call category, so the redesigned composer's
   rows + chips are colour-coded and scannable instead of a wall of
   identical green. Errors/fraud go red, issues/returns amber, sales
   moments green, the rest informational/neutral. Cosmetic only — the
   id→label list above is the load-bearing data. Unmapped ids fall
   back to neutral. */
export const CALL_CATEGORY_TONES = {
  '1': 'info', '2': 'info', '3': 'success', '5': 'neutral', '16': 'success',
  '17': 'info', '18': 'brand', '21': 'brand', '27': 'warning', '29': 'success',
  '30': 'brand', '35': 'neutral', '36': 'warning', '37': 'neutral', '39': 'brand',
  '40': 'success', '41': 'warning', '49': 'error', '50': 'error', '51': 'info',
  '52': 'error', '53': 'warning', '54': 'error', '55': 'info',
};

/** Tone token for a call-category id — defaults to neutral. */
export function getCallCategoryTone(id) {
  return CALL_CATEGORY_TONES[String(id ?? '')] || 'neutral';
}

/* Direction options for the Segmented switcher. 0 = Outbound is
   the default because that's what a rep is doing when they click
   "Call {contact}" from the shelf — they're placing the call. */
export const CALL_DIRECTION_OPTIONS = [
  { id: '0', label: 'Outbound' },
  { id: '1', label: 'Inbound' },
];

/** Look up a category by its numeric/string id and return the human
 *  label. Returns '' if not found (or '0'/'Select') so the UI can
 *  decide whether to render a hint. */
export function getCategoryLabel(id) {
  const sid = String(id ?? '');
  if (!sid || sid === '0') return '';
  const hit = CALL_CATEGORY_OPTIONS.find((o) => o.id === sid);
  return hit?.label || '';
}

const STORAGE_KEY = 'noteTemplates';

const hasChromeStorage = () => {
  try { return typeof chrome !== 'undefined' && !!chrome.storage?.local; } catch { return false; }
};

/** Load the user's call_log preset templates from storage. Filters
 *  out non-call_log entries + anything explicitly disabled, since
 *  the modal's Quick Log section should only ever show templates
 *  a rep actually wants in their picker.
 *
 *  Returns a Promise<Array<Template>>. Falls back to localStorage
 *  in non-extension contexts (the playground) so the same code
 *  path works in both surfaces. */
export function loadCallTemplates() {
  return new Promise((resolve) => {
    const filter = (raw) => {
      const all = Array.isArray(raw) ? raw : [];
      return all.filter((t) => t?.subType === 'call_log' && t?.enabled !== false);
    };
    if (hasChromeStorage()) {
      chrome.storage.local.get(STORAGE_KEY, (data) => {
        resolve(filter(data?.[STORAGE_KEY]));
      });
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      resolve(filter(raw ? JSON.parse(raw) : []));
    } catch { resolve([]); }
  });
}

/** Subscribe to template changes. The Notes editor saves through
 *  chrome.storage.local.set, which fires onChanged — listening here
 *  means the modal updates live if the rep edits a template while
 *  the modal is open (rare but possible).
 *
 *  In non-extension contexts there's no change channel, so this
 *  returns a no-op cleanup. */
export function subscribeToCallTemplates(handler) {
  if (!hasChromeStorage() || !chrome.storage?.onChanged?.addListener) return () => {};
  const onChanged = (changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const next = changes[STORAGE_KEY].newValue;
    const filtered = (Array.isArray(next) ? next : [])
      .filter((t) => t?.subType === 'call_log' && t?.enabled !== false);
    handler(filtered);
  };
  chrome.storage.onChanged.addListener(onChanged);
  return () => chrome.storage.onChanged.removeListener(onChanged);
}

/** Build a synthetic template from custom-log form state. Same
 *  shape as a stored Template so consumers (the submit fn) can
 *  treat preset and custom logs uniformly — the only difference
 *  is the id ("custom-…") and that it isn't persisted to
 *  noteTemplates.
 *
 *  `steps` is an array of up-to-4 next-step strings; the function
 *  flattens it to the legacy callStep1..4 keys expected on a
 *  stored template. */
export function buildCustomTemplate({
  subject, body,
  callDirection, callCategory, callVoicemail,
  steps = [],
} = {}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  return {
    id: `custom-${Date.now()}`,
    name: (subject || '').trim() || 'Custom call log',
    subType: 'call_log',
    enabled: true,
    subject: (subject || '').trim(),
    body: (body || '').trim(),
    callDirection: callDirection | 0,
    callCategory: parseInt(callCategory, 10) || 0,
    callVoicemail: !!callVoicemail,
    callStep1: (safeSteps[0] || '').trim(),
    callStep2: (safeSteps[1] || '').trim(),
    callStep3: (safeSteps[2] || '').trim(),
    callStep4: (safeSteps[3] || '').trim(),
  };
}
