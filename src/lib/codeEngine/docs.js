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
      ? ['const email = await page.evaluate(user.email("Win-back"));\nawait actions.sendEmail(email)', 'await actions.sendEmail({ subject: "Hi", body: "…" })']
      : c.name === 'createTask'
        ? ['await actions.createTask(user.task("Follow up"))', 'const task = await actions.createTask({ subject: "Call", daysOut: 2 })']
        : c.name === 'completeTask'
          ? ['const task = await actions.createTask({ subject: "Test" });\nawait actions.completeTask({ id: task.taskId });', 'await page.tasks.open[0].complete()']
          : c.name === 'updateTask'
            ? ['await actions.updateTask({ id: task.id, fields: { liveDate: "2026-08-01" } })', 'task.live_date = newLiveDate;   // grouped automatically']
          : c.name === 'updateOpportunity'
            ? ['await actions.updateOpportunity({ id: opportunity.id, fields: { stage: "Closed - Lost" } })', 'opportunity.stage = "Closed - Lost";   // grouped automatically']
          : c.name === 'createOpportunity'
            ? ['await actions.createOpportunity({ subject: "August Order", estimatedCloseDate: "2026-09-13", estimatedValue: 2400 })']
          : c.name === 'createProposalFromOrder'
            ? ['const proposal = await actions.createProposalFromOrder({ order: page.orders[0], opportunityId: created.opportunityId });\nconst email = await page.evaluate(user.emails.ReorderProposal);\nemail.attachProposal(proposal);']
          : c.name === 'addNote'
            ? ['await actions.addNote({ subject: "Follow-up", body: "Reviewed account with customer." })']
            : ['await actions.logCall(user.call("Left VM"))'],
  };
}

const STATIC = {
  overview: {
    title: 'Workflow code',
    kind: 'topic',
    summary: 'Write plain JS. Each action is a step; if/else are branches. The body runs once per hydrated audience record and the blocks light up as it goes.',
    rows: [
      ['page', 'the contact being run'],
      ['user', 'your saved emails / tasks / calls'],
      ['actions', 'email · tasks · opportunities · reorder proposals · activity'],
    ],
    examples: ['if (page.contact.daysCold > 30)\n  await actions.sendEmail(user.email("Win-back"))'],
  },
  page: {
    title: 'page.*',
    kind: 'data',
    summary: 'The hydrated CRM record for this run. Parsed account/order data is read-only; page.contact and page.tasks expose the approved write controls.',
    rows: [
      ['page.contact', 'the current contact (object)'],
      ['page.contacts', 'the whole selected audience (array)'],
      ['page.count', 'how many contacts are selected'],
      ['page.account', 'the current account fields'],
      ['page.orders', 'the record’s order history (array)'],
      ['page.items', 'aggregate ordered items (array)'],
      ['page.relatedContacts', 'contacts listed on an account page'],
      ['contact.contactName', 'display name (also .name)'],
      ['contact.email', 'email address (may be empty)'],
      ['contact.account', 'company / account name'],
      ['contact.value', 'handed-off value ($), if any'],
      ['contact.contactId', 'CRM id'],
      ['page.contact.field = …', 'edit a field (approved fields, grouped write)'],
      ['page.tasks.items', 'Task List rows, or open + done on a workflow record'],
      ['task.liveDate / dueDate = …', 'edit dates (live_date / due_date aliases work too)'],
      ['task.subject / description = …', 'edit task copy; body aliases description'],
      ['task.categoryId / priority = …', 'edit category or priority'],
      ['task.commit()', 'flush this task’s grouped edits now'],
      ['page.tasks.open[i].complete()', 'complete a CRM task'],
      ['page.tasks.completeAll()', 'complete every open task'],
      ['page.opportunities', 'full Opportunity/Get records (fetched only when referenced)'],
      ['opportunity.subject / description = …', 'edit opportunity copy'],
      ['opportunity.estimatedValue / estimatedCloseDate = …', 'edit forecast value/date'],
      ['opportunity.stage / stageId / assignedToId = …', 'edit stage or assignment'],
      ['opportunity.commit()', 'flush this opportunity’s grouped edits now'],
    ],
    examples: [
      'const c = page.contact;\nif (c.email) await actions.sendEmail(user.email("Win-back"));',
      'const orderDates = page.orders.map((order) => order.date);',
      'page.contact.jobTitle = "VP Sales";   // grouped, one write',
      'for (const task of page.tasks.items) {\n  task.liveDate = task.dueDate;\n}',
      'if (page.tasks.open.length) page.tasks.open[0].complete();',
      'const open = page.opportunities.find((o) => !o.isClosed);\nif (open) open.stage = "Closed - Lost";',
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
      ['addNote(note)', 'add a CRM activity note'],
      ['completeTask({id})', 'complete a task returned by createTask'],
      ['updateTask({id, fields})', 'edit approved fields on an existing task'],
      ['updateOpportunity({id, fields})', 'edit a CRM opportunity (safe Get → merge → Update)'],
      ['createOpportunity(fields)', 'create an opportunity for the current contact'],
      ['createProposalFromOrder(fields)', 'refresh an old order and attach its proposal to an opportunity'],
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
