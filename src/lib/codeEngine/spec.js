/* ───────────────────────────────────────────────────────────────
   codeEngine/spec — the machine-readable campaign-code API.

   One reason to author campaigns in code is that it's a natural language
   for an AI. buildCodeSpec() returns the authoritative, serializable
   description of everything the code can do — the bindings, every
   callable action with its params + gate, the page fields, the rules,
   and (optionally) the rep's saved template names — so an assistant can
   generate or edit a campaign that actually runs. Derived from the live
   contract registry so it never drifts.
─────────────────────────────────────────────────────────────── */

import { CONTRACTS, GATE_BY_EFFECT } from './contracts.js';

/** @param {{ emails?: string[], tasks?: string[], calls?: string[] }} bindings */
export function buildCodeSpec(bindings = {}) {
  return {
    version: 1,
    language: 'JavaScript (async). Runs once per hydrated audience record in a guarded sandbox.',
    model: 'Sending an email / creating a task / logging a call is a STEP. if/else are BRANCHES; for/while are LOOPS. Untaken paths show as skipped.',
    bindings: {
      page: {
        'page.contact': 'the current contact — { contactName, name, email, account, value, contactId }',
        'page.contact.<field> = value': 'edit an APPROVED contact field (firstName, lastName, middleInitial, companyName, jobTitle, email, phone, zipCode, userType, country); edits are grouped into one write at run end (or page.contact.commit())',
        'page.contacts': 'array — the whole selected audience',
        'page.count': 'number — audience size',
        'page.tasks': '{ open[], done[], items[] } — campaign rows use open/done; a Task List entry point also exposes its complete row set as items',
        'page.tasks.items': 'the Task List entry-point rows when present, otherwise open + done; each row supports approved direct edits and complete()',
        'task.liveDate / dueDate / subject / description / categoryId / priority = value': 'edit an existing task; snake_case aliases are accepted and changes group into one write per task at run end (or task.commit())',
        'page.evaluate(ref)': 'render a saved-template REFERENCE into a sendable outbound object; await it — it is its own (slow) step',
      },
      user: {
        'user.emails.<Id>': 'a saved email REFERENCE, keyed by a PascalCase code id (e.g. user.emails.WinBack); the base is used by default and .versions[n] selects a specific version',
        'user.tasks.<Id> / user.calls.<Id>': 'saved task / call references',
        'user.email(name|id)': 'look up a saved email; THROWS a dependency error if missing (same for user.task/user.call)',
      },
      outbound: {
        'outbound.subject / body': 'read or assign to override before sending',
        'outbound.append(text) / appendSubject(t)': 'append (chainable)',
        custom: 'a custom object of the same shape works too: { subject, body } (email) / { subject, priority, daysOut } (task)',
      },
      h: 'read-only helpers: h.fmt.title/upper/lower/currency/number/date, h.coalesce(...)',
    },
    actions: Object.values(CONTRACTS).map((c) => ({
      name: c.name,
      call: `actions.${c.name}(${c.object})`,
      accepts: c.accepts || c.summary,
      params: Object.fromEntries(Object.entries(c.params).map(([k, r]) => [k, r.options ? r.options.join('|') : r.type])),
      effect: c.effect,
      gate: GATE_BY_EFFECT[c.effect],
      summary: c.summary,
    })),
    saved: {
      emails: Array.isArray(bindings.emails) ? bindings.emails : [],
      tasks: Array.isArray(bindings.tasks) ? bindings.tasks : [],
      calls: Array.isArray(bindings.calls) ? bindings.calls : [],
    },
    rules: [
      'For saved emails, await page.evaluate(user.email("Win-back")) before actions.sendEmail(outbound) so variables and the recipient resolve during preview. A missing name is a hard dependency error.',
      'Custom objects are allowed too: actions.sendEmail({ subject, body }); actions.createTask({ subject, priority, daysOut }).',
      'actions.createTask returns { taskId }; complete the same task with actions.completeTask({ id: created.taskId }).',
      'actions.addNote({ subject, body }) adds a CRM activity note to the current audience record.',
      'Existing task rows are mutable through the same shared engine in campaigns and custom actions. Approved edits are subject, description/body, liveDate/live_date, dueDate/due_date/due, categoryId/category_id, and priority.',
      'Task edits are grouped into one confirm-gated write per task at run end. Use await task.commit() only when later code must create a separate update.',
      'The campaign body already runs once per audience record. Do not loop page.contacts unless you intentionally want nested audience work.',
      'Recipient defaults to page.contact; the signature is appended by the send engine — never include it.',
      'Guard on data you use, e.g. `if (page.contact.email) …`.',
      'End with `return "<short status>"` — it becomes the closing step summary.',
    ],
    examples: [
      'const c = page.contact;\nif (c.email && c.value > 1000) {\n  const email = await page.evaluate(user.email("VIP thank-you"));\n  await actions.sendEmail(email);\n  await actions.createTask(user.task("Confirm VIP touch"));\n} else {\n  await actions.createTask(user.task("Re-engage"));\n}\nreturn c.value > 1000 ? "vip" : "nurture";',
      'const task = await actions.createTask({ subject: "Campaign test", daysOut: 0 });\nawait actions.completeTask({ id: task.taskId });\nawait actions.addNote({ subject: "Campaign test", body: "Non-email workflow verified." });\nreturn "verified";',
      'for (const task of page.tasks.items) {\n  const due = new Date(task.dueDate + "T12:00:00");\n  const live = new Date(due);\n  live.setDate(live.getDate() - 7);\n  task.liveDate = live;\n}\nreturn "rescheduled";',
    ],
  };
}
