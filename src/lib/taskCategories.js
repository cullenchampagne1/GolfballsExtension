/* ───────────────────────────────────────────────────────────────
   taskCategories.js — the real CRM task-category enum.

   These are the exact `tbCategory` <option> values the CRM's Task
   modal renders (Modules/CRM/Admin ContactDetails → TaskModal). The
   id is the wire format the Task/Create.ajax + Update.ajax payloads
   send as `taskCategoryID`; the label is the display. Don't invent
   ids — they have to match the CRM enum or tasks get miscategorized.

   Same convention as src/lib/callLog.js's CALL_CATEGORY_OPTIONS, so
   the Notes editor (settings) and the QuickTask modal (UI) can share
   one canonical picker instead of forcing reps to type a raw id.
─────────────────────────────────────────────────────────────── */

export const TASK_CATEGORY_OPTIONS = [
  { id: '0',  label: 'Select' },
  { id: '1',  label: 'Other' },
  { id: '7',  label: 'Order History Special' },
  { id: '8',  label: 'Proposal Follow-up' },
  { id: '9',  label: 'Order day call' },
  { id: '10', label: 'Customer Request' },
  { id: '11', label: 'High Priority' },
  { id: '12', label: '15 Day Call/Email' },
  { id: '13', label: '5 Day Follow-Up to Email' },
  { id: '14', label: 'Workflow Task' },
  { id: '16', label: 'Courier Claims' },
  { id: '17', label: 'High Priority Opportunity' },
  { id: '18', label: 'Replacement Contact' },
];

/* Status-tint hint per category, for the composer's chip / menu in
   the redesigned QuickTask modal. Picked to read at a glance: the
   priority-flavored ones warm up (warning/error), opportunities go
   success, the rest stay informational/neutral. Purely cosmetic —
   the id→label list above is the load-bearing data. */
export const TASK_CATEGORY_TONES = {
  '0':  'neutral',
  '1':  'neutral',
  '7':  'info',
  '8':  'brand',
  '9':  'info',
  '10': 'info',
  '11': 'warning',
  '12': 'brand',
  '13': 'brand',
  '14': 'neutral',
  '16': 'error',
  '17': 'success',
  '18': 'info',
};

/** Human label for a numeric/string category id. Returns '' for the
 *  '0' / 'Select' placeholder (and unknown ids) so callers can decide
 *  whether to render a "no category" hint. */
export function getTaskCategoryLabel(id) {
  const sid = String(id ?? '');
  if (!sid || sid === '0') return '';
  return TASK_CATEGORY_OPTIONS.find((o) => o.id === sid)?.label || '';
}

/** Tone token for a category id — defaults to neutral. */
export function getTaskCategoryTone(id) {
  return TASK_CATEGORY_TONES[String(id ?? '')] || 'neutral';
}
