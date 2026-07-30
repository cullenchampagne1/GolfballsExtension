# Golfballs CRM Campaign Authoring Toolset

Campaign Manager is code-first. A campaign stores one asynchronous JavaScript
program in `automation`; that program runs once for each selected CRM Search or
Task List record.

Use this document when generating JSON for Campaign Manager → Import. The
legacy `steps[]` authoring format is retained only as stored compatibility
metadata and is not executable by the code-first editor.

## Import envelope

Paste one campaign object, an array of campaign objects, or
`{ "campaigns": [...] }`.

```json
{
  "name": "Verify selected contacts",
  "status": "Draft",
  "paceDelay": 3,
  "paceJitter": 1,
  "suppressBounced": true,
  "suppressMailerRemoved": true,
  "suppressDoNotContact": true,
  "sendCap": 0,
  "audienceOrder": "list",
  "automation": "const task = await actions.createTask({ subject: \"Campaign QA\", daysOut: 0 });\nawait actions.completeTask({ id: task.taskId });\nawait actions.addNote({ subject: \"Campaign QA\", body: \"Verified helper execution.\" });\npage.contact.jobTitle = \"Campaign verified\";\nawait page.contact.commit();\nreturn \"verified\";"
}
```

Fields:

- `name` is required.
- `automation` is required and must parse as JavaScript.
- `status`: `Draft`, `Active`, or `Paused`.
- `paceDelay`: base seconds between live effects.
- `paceJitter`: random plus/minus seconds around the base delay.
- `suppressBounced`, `suppressMailerRemoved`, `suppressDoNotContact`: skip the
  hydrated record before any effect runs.
- `sendCap`: maximum effects across the entire run; `0` is unlimited.
- `audienceOrder`: `list`, `valueDesc`, or `shuffle`.

The importer assigns a fresh campaign id and never overwrites an existing
campaign.

## Runtime model

The body already runs once per selected record. Do not loop `page.contacts`
unless nested audience work is intentional.

```js
page.contact      // current hydrated CRM contact
page.contacts     // selected audience
page.count        // selected record count
page.account      // current account fields
page.orders       // order history: number, summary, date, revenue, status
page.items        // aggregate ordered items
page.relatedContacts // contacts listed on an account page
page.tasks.open   // current record's open tasks
page.tasks.done   // current record's completed tasks
page.tasks.items  // Task List entry-point rows; otherwise open + done
```

`page` retains the parsed schema for whichever record was selected. A contact
campaign gets that contact page's own `page.orders`, `page.tasks`, contact
fields, and contact ID; it does not require an account. An account campaign gets
the corresponding account-page tables. CRM task writes are contact-indexed, so
an account audience row uses that page's first related contact as its writer
contact while a contact row uses its exact contact ID.

Editable contact fields:

```js
page.contact.firstName
page.contact.middleInitial
page.contact.lastName
page.contact.companyName
page.contact.jobTitle
page.contact.email
page.contact.phone
page.contact.zipCode
page.contact.userType
page.contact.country
```

Assignments are grouped into one CRM update at the end of the program. Call
`await page.contact.commit()` to flush them earlier.

Task helpers:

```js
await page.tasks.open[0].complete();
await page.tasks.completeLatest();
await page.tasks.completeAll();
```

Existing tasks are mutable in both campaigns and custom actions. Direct
assignments are grouped into one confirm-gated CRM write per task:

```js
for (const task of page.tasks.items) {
  task.liveDate = "2026-08-01";
  task.priority = "high";
}

// Accepted aliases:
task.live_date = "2026-08-01";
task.due_date = "2026-08-08";
task.body = "Updated task description";

await task.commit(); // optional early flush
```

Approved fields are `subject`, `description`/`body`, `liveDate`/`live_date`,
`dueDate`/`due_date`/`due`, `categoryId`/`category_id`, and `priority`.
Task List custom actions receive every loaded row through `page.tasks.items`;
campaigns receive the same mutable task objects through `open` and `done`.

## Saved templates

Saved templates are available by generated code id or name/id lookup:

```js
user.emails.WinBack
user.tasks.FollowUp
user.calls.LeftVoicemail

user.email("Win-back")
user.task("Follow up")
user.call("Left voicemail")
```

A missing lookup throws and stops that record before an effect is sent.

Evaluate a saved email before sending it. Evaluation resolves its recipient,
variables, smart fallbacks, reply mode, and sender configuration against the
current hydrated record:

```js
const email = await page.evaluate(user.email("Win-back"));
email.append("<p>One more detail.</p>");
email.appendSubject(" — personal follow-up");
await actions.sendEmail(email);
```

The base email is used by default. Use `.versions[n]` to select a saved
variation explicitly:

```js
const email = await page.evaluate(user.emails.WinBack.versions[1]);
await actions.sendEmail(email);
```

## Actions

```js
await actions.sendEmail({ subject, body, to?, from? });

const created = await actions.createTask({
  subject,
  body?,
  priority?: "high" | "med" | "low",
  daysOut?: number,
  categoryId?: number,
  contactId?: string,
  contactName?: string,
  accountId?: string
});

await actions.completeTask({ id: created.taskId });

await actions.updateTask({
  id: page.tasks.open[0].id,
  fields: { liveDate: "2026-08-01", priority: "high" }
});

await actions.logCall({
  subject,
  body?,
  direction?: "outbound" | "inbound",
  categoryId?: number,
  voicemail?: boolean
});

await actions.addNote({
  subject?,
  body,
  categoryId?: number
});
```

Saved task and call references retain their CRM priority, due date, category,
direction, and voicemail settings:

```js
await actions.createTask(user.task("Follow up"));
await actions.logCall(user.call("Left voicemail"));
```

Every action is dry-run capable. A live run requires the confirmation screen;
email is outward-facing and CRM writes are remote effects.

The optional contact/account routing fields are intended for registered
modal-entry contexts, where one sandboxed custom action can safely schedule
tasks for several contacts without loading each profile. If `contactId` is
omitted, task creation retains the current-record behavior.

## Control flow

Ordinary JavaScript controls which blocks run:

```js
const contact = page.contact;

if (!contact.email) {
  await actions.createTask({
    subject: "Find contact email",
    priority: "high",
    daysOut: 0
  });
  return "missing email";
}

const email = await page.evaluate(user.email("Account check-in"));
await actions.sendEmail(email);

const followUp = await actions.createTask({
  subject: "Follow up with " + contact.contactName,
  priority: "med",
  daysOut: 2
});

return "email sent · task " + followUp.taskId;
```

`if`/`else`, `switch`, `for`, `for…of`, `while`, variables, object
composition, and returns are projected into the Blocks view. Unknown ordinary
JavaScript remains a raw code block but still runs inside the guarded sandbox.

## Non-email verification campaign

This is the safest full helper check because it performs no email send:

```json
{
  "name": "Campaign engine · non-email verification",
  "status": "Draft",
  "paceDelay": 1,
  "paceJitter": 0,
  "sendCap": 0,
  "audienceOrder": "list",
  "suppressBounced": false,
  "suppressMailerRemoved": false,
  "suppressDoNotContact": true,
  "automation": "const contact = page.contact;\nconst task = await actions.createTask({ subject: \"Campaign QA · \" + contact.contactName, body: \"Created by the campaign-engine verification run.\", priority: \"low\", daysOut: 0 });\nawait actions.completeTask({ id: task.taskId });\nawait actions.addNote({ subject: \"Campaign engine QA\", body: \"Create task, complete task, note, and contact edit were exercised.\" });\ncontact.jobTitle = \"Campaign QA verified\";\nawait contact.commit();\nreturn \"verified \" + contact.contactId;"
}
```

Run it first as a dry run, select one disposable test contact, inspect the
preview, and only then switch off Dry run.

## Full task reconciliation campaign

The paste-ready campaign at
[`docs/examples/task-reconciliation-campaign.js`](examples/task-reconciliation-campaign.js)
is the ONE campaign that both initiates and reconciles every owned task flow.
Run it against any contact or account audience, as often as needed: each
record converges to the same consistent state. Existing tasks are edited in
place — never completed and remade — missing tasks are created, and running
it twice back-to-back performs zero writes. Any task outside the owned flows
is read-only context: it counts as a scheduled touch and as quarter coverage
but is never edited.

**Anniversary cycles.** Orders are grouped by source year + month, only the
newest source year per calendar month is retained, and the day is the rounded
average of that period's orders. Each retained anniversary wants four tasks —
`Order Anniversary Follow Up #1` three weeks before, `#2` two weeks before,
`… Call - [Month]` one week before, and `#3` the Monday before — with the
bracket year set to the follow-up cycle year, category Order History Special
(id 7), and live date two weeks before due. Existing tasks (including legacy
`Prior Year …` naming) are matched to slots by kind and nearest due date and
edited in place; a completed task within two weeks of a slot fulfills it; an
in-flight cycle is preserved (overdue open tasks keep their dates and only
naming/category are corrected, past slots with no task are skipped, not
created late); a cycle with no evidence whose first task passed rolls to next
year; surplus anniversary tasks with no slot are retired. Candidate monthly
campaigns are ranked by newest supporting order and a lower-ranked candidate
is skipped entirely when any of its tasks would land within 20 days of an
accepted campaign's task.

**Promotion tasks.** Configure `PROMO_SUBJECT_RE` and `PROMO_TASKS` at the
top of the file for the active promotion. After a run every open promotion
task is live TODAY (future or unreadable live dates are set to today;
already-live tasks are untouched). Missing subjects are created with their
configured daysOut; an open or completed task with the subject counts as
covered.

**Quarterly reach-outs.** Coverage spans the rolling four quarters — the
whole scheduling year. Any other dated task covers its quarter. An uncovered
quarter receives one `Q<N> Reach Out Opportunity` placed at the middle of the
real gap between the surrounding touches: from the last touch at or before
the quarter's window to the next scheduled task when one lands by the end of
the following quarter, otherwise to the start of the following quarter;
touches inside the quarter split it and the reach-out takes the middle of the
largest gap, clamped into the quarter and never in the past. Existing
quarterly tasks are re-mediated to the same rule — legacy arbitrary dates get
rescheduled — duplicates for one slot are retired, live dates sit two weeks
before due, category Workflow Task (id 14). Quarters are processed
chronologically so each placement becomes a touch for the next gap. This
coverage still runs for records with no usable orders.

**Brand tier tasks.** A brand is the first word of each order summary; one
`<Brand> Customer - Tier N` task per brand reviews on December 17, 2030 (live
two weeks before). Tiering counts matching order rows — one order is Tier 3,
two or three Tier 2, four or more Tier 1 — and when the tier moves, the
existing task's subject is edited in place; duplicates are retired; missing
brand tasks are created.

Field writes are minimal by design: only fields that differ are staged, the
description refreshes only when another field changed (the page schema cannot
read descriptions back), and a category is only corrected when its label is
visible and wrong. That is what makes an immediate re-run write nothing.

### Single-record Custom Action variant

The paste-ready action at
[`docs/examples/task-reconciliation-contact-action.js`](examples/task-reconciliation-contact-action.js)
carries the SAME body (an integration test keeps the two byte-identical) for
running the reconciliation on one contact or account page from the Action
Shelf — e.g. initiating a brand-new account right from its page. Create a
Custom Action with **Runs on: Contact** and no entry point; author a second
copy with **Runs on: Account** for account pages. Live runs read the page
through the page engine — `page.orders` and `page.tasks.open`/`done`,
including tasks whose live date is in the future — and account pages resolve
their representative contact as the task writer. On a page with no readable
CRM record the action returns "Skipped" without writing. When editing the
rules, change the campaign file and copy the body across (the sync test fails
otherwise).

## Task List quarterly reach-out custom action

The paste-ready action at
[`docs/examples/quarterly-reach-out-task-list-action.js`](examples/quarterly-reach-out-task-list-action.js)
runs once over Task List's already-loaded data rather than hydrating every
contact profile. Create a Custom Action with:

- **Runs on:** `Custom (any page)`
- **Entry point:** `.gb-task-list-modal` (the aliases `task-list` and
  `modal:task-list` are equivalent)

While Task List is open, the action appears in the shelf. Its provider exposes
every loaded task under `page.entryPoint.data.tasks` and unique contact routing
under `page.entryPoint.data.contacts`, independent of the modal's visible
filter. The action groups tasks by contact and treats any dated task as
quarter coverage, but it only ever EDITS tasks it owns: `Prior Year #N`
subjects are renamed to `Order Anniversary Follow Up #N` and those anniversary
tasks get a live date fourteen days before their due date. Every other task —
promotion follow-ups, manual follow-ups, brand tiers — keeps its subject,
live date, and category untouched. It creates each missing task in the rolling
four-quarter window, placed at the middle of the gap between that contact's
surrounding touches (the same rule the reconciliation campaign uses), and
immediately gives the new task the same two-week live-date offset through the
ordinary confirmation-gated executor.

Do not widen the reconcile scope to every dated task: a task list's rows
include tasks other flows own, and setting live date to due − 14 on a task due
more than two weeks out pushes it past "live", which removes it from the Task
List pull entirely (the CRM only renders already-live tasks there).

Contacts with no contact ID are skipped because the CRM cannot attach a task
to them. A contact with no Task List row cannot be discovered from this
surface; the full reconciliation campaign is the authoritative flow — this
action is only the quick in-modal surface, and anything it creates is
re-mediated by the campaign's gap-midpoint rule on the next campaign run.
Note that promotion repair CANNOT run from this surface: the Task List pull
only renders already-live tasks, so tasks with future live dates are
invisible here; per-record campaign hydration (the contact/account page) is
the surface that still sees them.
