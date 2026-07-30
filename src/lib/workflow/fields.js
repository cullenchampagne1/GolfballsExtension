/* ───────────────────────────────────────────────────────────────
   workflow/fields.js — the workflow condition field catalog.

   A step's run conditions are a matchEngine grouped tree. Each
   condition's `source` tells the resolver how to read its subject:

     'signal' → a CRM-derived workflow signal (this catalog). The
                stateless engine recomputes these from the contact's
                live CRM page every run, so a gate like
                  sent.subject contains "E2"  AND  replied = 0
                is what makes "we already sent E1+E2, send E3 next"
                work without storing a per-contact counter.
     'schema' → a page-engine path (contact.* / account.* / orders[].*)
     'var'    → a code expression evaluated against the contact context

   This module is PURE DATA + helpers (no JSX) so the engine
   (context.js) and the editor UI (StepInspector) share one source of
   truth: the UI renders the picker from these, the engine resolves
   each ref the same way.
─────────────────────────────────────────────────────────────── */

import { OPS_BY_TYPE } from '../matchEngine.js';

/* CRM-derived signals. `id` is the condition `ref`; `type` drives the
   operator set + the value input kind. Booleans are modeled as numbers
   (1/0) so they ride the numeric operators (= 1 / = 0). */
/* `ready` flags whether the engine can actually resolve this signal today.
   Order/spend signals come off the contact schema and work; email/call
   history needs the activity-log scrapers (still stubbed → resolve null),
   so those are hidden from the condition picker until implemented to stop
   anyone building gates that silently never fire. */
export const SIGNAL_FIELDS = [
  // ── Orders (resolved from the contact schema) ──
  { id: 'order.count',      label: 'Order count',                group: 'Orders', type: 'number', ready: true },
  { id: 'order.daysSince',  label: 'Days since last order',       group: 'Orders', type: 'number', ready: true },
  { id: 'order.totalSpend', label: 'Lifetime spend ($)',         group: 'Orders', type: 'number', ready: true },
  { id: 'order.brand',      label: 'Has ordered brand',          group: 'Orders', type: 'string', ready: true },
  { id: 'order.keyword',    label: 'Order item contains',        group: 'Orders', type: 'string', ready: true },
  // ── Email / call history (TODO: activity-log scrapers — hidden for now) ──
  { id: 'sent.subject',     label: 'Sent email — subject',      group: 'Email history', type: 'string', ready: false },
  { id: 'sent.daysAgo',     label: 'Last sent email (days ago)', group: 'Email history', type: 'number', ready: false },
  { id: 'sent.count',       label: 'Emails we have sent',        group: 'Email history', type: 'number', ready: false },
  { id: 'received.subject', label: 'Received email — subject',    group: 'Email history', type: 'string', ready: false },
  { id: 'replied',          label: 'Contact has replied (1/0)',   group: 'Email history', type: 'number', ready: false },
  { id: 'call.daysAgo',     label: 'Last call (days ago)',       group: 'Activity', type: 'number', ready: false },
];

export const SIGNAL_BY_ID = Object.fromEntries(SIGNAL_FIELDS.map((f) => [f.id, f]));

/* The condition `source` values the workflow picker offers. */
export const CONDITION_SOURCES = [
  { id: 'signal', label: 'CRM signal' },
  { id: 'schema', label: 'Contact / account field' },
  { id: 'var',    label: 'Code expression' },
];

/* The subject type for a condition — drives operator + value-input kind.
   Signals look their type up in the catalog; schema/var carry an explicit
   `type` on the condition (default string). */
export function conditionType(cond) {
  if (!cond) return 'string';
  if (cond.source === 'signal') return SIGNAL_BY_ID[cond.ref]?.type || 'string';
  return cond.type || 'string';
}

/* Operators offered for a condition (RuleGroups `opsFor`). Booleans
   (numeric 1/0 signals) keep the numeric ops. */
export function opsForCondition(cond) {
  return OPS_BY_TYPE[conditionType(cond)] || OPS_BY_TYPE.string;
}

/* Grouped options for the signal dropdown — only signals the engine can
   actually resolve today (ready: true). */
export function signalOptionGroups() {
  const groups = {};
  for (const f of SIGNAL_FIELDS) {
    if (f.ready === false) continue;
    (groups[f.group] ||= []).push({ id: f.id, label: f.label });
  }
  return Object.entries(groups).map(([group, options]) => ({ group, options }));
}

const FIRST_READY = SIGNAL_FIELDS.find((f) => f.ready !== false) || SIGNAL_FIELDS[0];

/* A blank condition seeded for a given source — keeps the editor and any
   programmatic callers producing identical shapes. */
export function blankConditionForSource(source = 'signal') {
  if (source === 'signal') {
    return { source, ref: FIRST_READY.id, type: FIRST_READY.type, op: FIRST_READY.type === 'number' ? 'gte' : 'contains', value: '', not: false };
  }
  if (source === 'var') {
    return { source, ref: '', type: 'string', op: 'is', value: '', not: false };
  }
  return { source, ref: '', type: 'string', op: 'contains', value: '', not: false };
}
