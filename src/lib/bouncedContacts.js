/**
 * bouncedContacts.js — what the relay's bounce notification turns into.
 *
 * The email relay watches our own mailbox and recognizes a delivery-failure
 * report the moment it arrives. The CRM raises its own bounce tasks eventually
 * ("Investigate bounced contact" / "Replacement contact needed"), but eventually
 * is the problem: a rep keeps emailing a dead address until that automation
 * catches up. This module is the rule for closing that gap — the bounce
 * notification names an ADDRESS, and this turns it into the same kind of task
 * the Replacement Contacts queue already works.
 *
 * Everything here is pure so the rule is testable without a CRM: what a bounce
 * payload means, what task it becomes, and — the one that matters most — when
 * NOT to write anything, because the CRM (or an earlier bounce) already raised
 * the task and a duplicate would put the same contact in the queue twice.
 *
 * The subject deliberately reuses the queue's own prefix (see
 * replacementContacts.js REPLACEMENT_SUBJECTS): a task we write and a task the
 * CRM writes have to be the same row to the rep working the page.
 */

import { isReplacementTask, REPLACEMENT_SUBJECTS } from './replacementContacts.js';
import { TASK_CATEGORY_OPTIONS } from './taskCategories.js';

/** The Action Language command the relay sends for a bounce. */
export const BOUNCE_ACTION_COMMAND = 'flag_bounced_contact';

/** Classification the relay puts in the action options. */
export const BOUNCE_KINDS = Object.freeze(['hard', 'soft', 'unknown']);

/* 'Replacement Contact' — the CRM's own category for this work. */
export const BOUNCE_TASK_CATEGORY_ID = (
  TASK_CATEGORY_OPTIONS.find((option) => option.label === 'Replacement Contact')?.id || '0'
);

/* The queue's 'replacement' prefix, so a task written here and one written by
   the CRM land in the same bucket on the page rather than looking like two
   different kinds of work. */
const REPLACEMENT_PREFIX = (
  REPLACEMENT_SUBJECTS.find((row) => row.kind === 'replacement')?.prefix
  || 'replacement contact needed'
);

const SUBJECT_LEAD = REPLACEMENT_PREFIX.replace(/^./, (c) => c.toUpperCase());

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}$/;

/** Lowercased address, or '' when it is not one. */
export function normalizeBounceEmail(value) {
  const email = String(value ?? '').trim().replace(/^<|>$/g, '').toLowerCase();
  return email.length <= 320 && EMAIL_RE.test(email) ? email : '';
}

/**
 * Read one normalized Action Language envelope into a bounce job.
 *
 * Returns null for anything that is not a usable bounce instruction — a
 * different command, or a target that is not an address. `auto` is the relay's
 * opinion that this bounce is certain enough to act on without a human click;
 * only a hard bounce carries it.
 */
export function bounceJobFromAction(action, extra = {}) {
  if (!action || typeof action !== 'object') return null;
  if (String(action.command || '') !== BOUNCE_ACTION_COMMAND) return null;
  const email = normalizeBounceEmail(action.target);
  if (!email) return null;
  const options = Array.isArray(action.options)
    ? action.options.map((value) => String(value || '').toLowerCase())
    : [];
  return {
    email,
    code: String(action.value ?? '').trim().slice(0, 40),
    kind: BOUNCE_KINDS.find((value) => options.includes(value)) || 'unknown',
    auto: options.includes('auto'),
    ...extra,
  };
}

/** `Replacement contact needed - jane@acme.com`. */
export function bounceTaskSubject(email) {
  const address = normalizeBounceEmail(email);
  return `${SUBJECT_LEAD}${address ? ` - ${address}` : ''}`.slice(0, 500);
}

/**
 * The task body. It says where this came from and what the mail system said,
 * because a rep opening it a week later has no other way to tell this apart
 * from the CRM's own bounce task.
 */
export function bounceTaskDescription({
  email, code = '', kind = 'unknown', note = '', when = '',
} = {}) {
  const address = normalizeBounceEmail(email) || String(email || '').trim();
  const certainty = {
    hard: 'The receiving mail server refused it outright — treat the address as dead.',
    soft: 'A temporary failure — the address may still work, so confirm before replacing it.',
    unknown: 'The report did not say whether the failure is permanent — confirm before replacing it.',
  }[kind] || '';
  return [
    `Email to ${address} bounced${code ? ` (${code})` : ''}.`,
    certainty,
    note ? `Bounce report: ${String(note).slice(0, 300)}` : '',
    when ? `Reported ${when}.` : '',
    'Raised by the Toolkit from the email relay, ahead of the CRM\'s own bounce task.',
  ].filter(Boolean).join(' ').slice(0, 4_000);
}

/**
 * The template a bounce becomes. Due today: this is the work for today, and a
 * due date in the future would sort it below tasks that matter less.
 */
export function bounceTaskTemplate(job = {}) {
  return {
    subject: bounceTaskSubject(job.email),
    body: bounceTaskDescription(job),
    categoryId: BOUNCE_TASK_CATEGORY_ID,
    priority: 1,
    daysOut: 0,
  };
}

/**
 * The open bounce task this contact already has, if any.
 *
 * Both sources count: a task the CRM raised on its own schedule, and one an
 * earlier bounce notification raised here. Writing a second one would show the
 * same contact twice in the queue and make the rep work them both.
 */
export function findOpenBounceTask(tasks) {
  return (Array.isArray(tasks) ? tasks : []).find(isReplacementTask) || null;
}

/** One line for the toast, from whatever the CRM half came back with. */
export function bounceOutcomeMessage(result = {}) {
  const who = result.contactName || result.email || 'the contact';
  if (result.status === 'created') return `Bounce flagged — replacement task added for ${who}`;
  if (result.status === 'existing') return `${who} already has an open bounce task`;
  if (result.status === 'unresolved') return `Bounced address ${result.email || ''} matches no CRM contact`.trim();
  return `Could not flag the bounced contact${result.error ? ` — ${result.error}` : ''}`;
}
