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
```

`page` retains the parsed schema for the hydrated record. Account campaigns can
therefore group `page.orders`, inspect `page.account`, and complete the
account-wide `page.tasks.open` rows. CRM task writes are contact-indexed; on an
account audience row the engine uses the account schema's first related contact
as the writer contact while retaining the account id and account-wide read
model.

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
  categoryId?: number
});

await actions.completeTask({ id: created.taskId });

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

## Prior-year anniversary account campaign

The paste-ready example at
[`docs/examples/prior-year-anniversary-campaign.js`](examples/prior-year-anniversary-campaign.js)
runs against account records. It groups orders by source year + month, averages
the day within each group, completes existing open tasks whose subject contains
`Prior Year`, and creates a fresh three-task future cycle:

1. `Prior Year #1` — three weeks before the anniversary.
2. `Prior Year #2` — two weeks before the anniversary.
3. `Prior Year #3` — the Monday before the anniversary.

Every subject retains the source year in brackets, and every description lists
the source orders used to derive the averaged date. If the first step in this
year's sequence has passed, the whole sequence rolls to next year so the three
tasks remain chronological.
