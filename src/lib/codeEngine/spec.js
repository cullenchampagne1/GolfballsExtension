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
    language: 'JavaScript (async). Runs once per contact in a read-only sandbox.',
    model: 'Sending an email / creating a task / logging a call is a STEP. if/else are BRANCHES; for/while are LOOPS. Untaken paths show as skipped.',
    bindings: {
      page: {
        'page.contact': 'the current contact — { contactName, name, email, account, value, contactId }',
        'page.contacts': 'array — the whole selected audience',
        'page.count': 'number — audience size',
      },
      user: {
        'user.emails': '[{ id, name, subject }] — the rep\'s saved emails',
        'user.tasks': '[{ id, name, subject, priority, daysOut }] — saved tasks',
        'user.calls': '[{ id, name, subject }] — saved calls',
        'user.email(name|id)': 'returns the saved email; THROWS a dependency error if none has that name',
        'user.task(name|id)': 'returns the saved task; throws if missing',
        'user.call(name|id)': 'returns the saved call; throws if missing',
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
      'Prefer saved templates: actions.sendEmail(user.email("Win-back")). A missing name is a hard dependency error.',
      'Custom objects are allowed too: actions.sendEmail({ subject, body }); actions.createTask({ subject, priority, daysOut }).',
      'Recipient defaults to page.contact; the signature is appended by the send engine — never include it.',
      'Guard on data you use, e.g. `if (page.contact.email) …`.',
      'End with `return "<short status>"` — it becomes the closing step summary.',
    ],
    examples: [
      'const c = page.contact;\nif (c.email && c.value > 1000) {\n  await actions.sendEmail(user.email("VIP thank-you"));\n  await actions.createTask(user.task("Confirm VIP touch"));\n} else {\n  await actions.createTask(user.task("Re-engage"));\n}\nreturn c.value > 1000 ? "vip" : "nurture";',
    ],
  };
}
