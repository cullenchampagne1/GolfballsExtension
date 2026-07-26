/* ───────────────────────────────────────────────────────────────
   codeEngine/docs — contextual documentation for the code editor.

   The right sidebar shows the doc for whatever the cursor is on. This is
   the pure lookup: a token (an identifier chain like "actions.sendEmail",
   a namespace like "user", or a keyword like "for") → a doc card
   { title, kind, summary, rows[], examples[] }. Action docs are derived
   from the live contract registry so they never drift.
─────────────────────────────────────────────────────────────── */

import { CONTRACTS, GATE_BY_EFFECT } from './contracts.js';

const paramLine = (c) => Object.entries(c.params)
  .map(([k, r]) => (r.options ? `${k}: ${r.options.join('|')}` : k))
  .join(', ');

function actionDoc(c) {
  return {
    title: `actions.${c.name}()`,
    kind: 'action',
    gate: GATE_BY_EFFECT[c.effect],
    summary: `${c.summary}. Takes ${c.accepts}.`,
    rows: [
      ['accepts', c.accepts],
      ['params', paramLine(c) || '—'],
      ['gate', `${GATE_BY_EFFECT[c.effect]} · ${c.effect}`],
    ],
    examples: c.name === 'sendEmail'
      ? ['await actions.sendEmail(user.email("Win-back"))', 'await actions.sendEmail({ subject: "Hi", body: "…" })']
      : c.name === 'createTask'
        ? ['await actions.createTask(user.task("Follow up"))', 'await actions.createTask({ subject: "Call", daysOut: 2 })']
        : ['await actions.logCall(user.call("Left VM"))'],
  };
}

const STATIC = {
  overview: {
    title: 'Campaign code',
    kind: 'topic',
    summary: 'Write plain JS. Each send/create is a step; if/else are branches. It runs per contact and the blocks light up as it goes.',
    rows: [
      ['page', 'the contact being run'],
      ['user', 'your saved emails / tasks / calls'],
      ['actions', 'send email · create task · log call'],
    ],
    examples: ['if (page.contact.daysCold > 30)\n  await actions.sendEmail(user.email("Win-back"))'],
  },
  page: {
    title: 'page.*',
    kind: 'data',
    summary: 'The read-only audience model for this run. page.contact is the one being simulated; page.contacts is the whole selection.',
    rows: [
      ['page.contact', 'the current contact (object)'],
      ['page.contacts', 'the whole selected audience (array)'],
      ['page.count', 'how many contacts are selected'],
      ['contact.contactName', 'display name (also .name)'],
      ['contact.email', 'email address (may be empty)'],
      ['contact.account', 'company / account name'],
      ['contact.value', 'handed-off value ($), if any'],
      ['contact.contactId', 'CRM id'],
    ],
    examples: [
      'const c = page.contact;\nif (c.email) await actions.sendEmail(user.email("Win-back"));',
      'for (const c of page.contacts) { … }',
    ],
  },
  helpers: {
    title: 'h.* helpers',
    kind: 'data',
    summary: 'Read-only formatting + lookup helpers (same as the code variables). Useful for building custom subjects/bodies before the signature is added.',
    rows: [
      ['h.fmt.title / upper / lower', 'case helpers'],
      ['h.fmt.currency / number / date', 'value formatting'],
      ['h.coalesce(a, b, …)', 'first non-empty value'],
    ],
    examples: ['await actions.sendEmail({ subject: "Hi " + h.fmt.title(page.contact.contactName), body: "…" })'],
  },
  user: {
    title: 'user.*',
    kind: 'data',
    summary: 'Your saved templates, keyed by a code id (e.g. user.emails.WinBack). They are REFERENCES — evaluate one before sending.',
    rows: [
      ['user.emails.<Id>', 'a saved email reference (auto-random version)'],
      ['user.emails.<Id>.versions[n]', 'a specific version'],
      ['user.email(name|id)', 'look one up — THROWS if missing'],
      ['user.tasks.* / user.calls.*', 'same for saved tasks + calls'],
    ],
    examples: ['const o = await page.evaluate(user.emails.WinBack);\nawait actions.sendEmail(o);'],
  },
  evaluate: {
    title: 'page.evaluate(ref)',
    kind: 'flow',
    summary: 'Render a saved-template reference into a sendable OUTBOUND object. This is its own step (it can take a few seconds) — await it, then send it.',
    rows: [
      ['outbound.subject / body', 'read or assign to override'],
      ['outbound.append(text)', 'append to the body (chainable)'],
      ['outbound.appendSubject(t)', 'append to the subject'],
      ['custom', 'build your own: { subject, body } / { subject, priority, daysOut }'],
    ],
    examples: [
      'const o = await page.evaluate(user.emails.WinBack);\no.appendSubject(" — " + page.contact.contactName);\nawait actions.sendEmail(o);',
    ],
  },
  actions: {
    title: 'actions.*',
    kind: 'topic',
    summary: 'The callable steps. Each becomes a block and runs behind its gate on a real run.',
    rows: [
      ['sendEmail(email)', 'send a saved or custom email'],
      ['createTask(task)', 'create a CRM task'],
      ['logCall(call)', 'log a call activity'],
    ],
    examples: ['await actions.sendEmail(user.email("Win-back"))'],
  },
  control: {
    title: 'Branches & loops',
    kind: 'flow',
    summary: 'Control flow becomes branches and loops in the blocks — the untaken path greys out as skipped, exactly like the old timeline.',
    rows: [
      ['if / else', 'a branch — only the taken side runs'],
      ['for / for…of', 'a loop — one pass per item'],
      ['while', 'loop while a condition holds'],
      ['switch', 'a multi-way branch'],
    ],
    examples: ['if (page.contact.ytd > 1000) { … } else { … }', 'for (const c of page.contacts) { … }'],
  },
  setvar: {
    title: 'Variables',
    kind: 'data',
    summary: 'const / let define a value — shown as its own "set" block.',
    rows: [['const name = value', 'compute something once and reuse it']],
    examples: ['const c = page.contact;', 'const cold = c.daysCold > 30;'],
  },
};

const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'switch', 'case', 'do']);
const DECL = new Set(['const', 'let', 'var']);

/**
 * Resolve a cursor token to a doc card.
 * @param {string} token  identifier chain ("actions.sendEmail"), namespace
 *   ("user"), or keyword ("for"). Empty/unknown → the overview.
 */
export function resolveDoc(token) {
  const t = String(token || '').trim();
  if (!t) return STATIC.overview;
  const head = t.split('.')[0];
  const member = t.split('.')[1];

  if (head === 'actions') {
    if (member && CONTRACTS[member]) return actionDoc(CONTRACTS[member]);
    return STATIC.actions;
  }
  if (head === 'user') return STATIC.user;
  if (head === 'page' && member === 'evaluate') return STATIC.evaluate;
  if (head === 'page' || head === 'contact') return STATIC.page;
  if (head === 'outbound') return STATIC.evaluate;
  if (head === 'h') return STATIC.helpers;
  if (KEYWORDS.has(head)) return STATIC.control;
  if (DECL.has(head)) return STATIC.setvar;
  // a bare contract name (e.g. cursor on "sendEmail")
  if (CONTRACTS[head]) return actionDoc(CONTRACTS[head]);
  return STATIC.overview;
}

export const DOC_OVERVIEW = STATIC.overview;
