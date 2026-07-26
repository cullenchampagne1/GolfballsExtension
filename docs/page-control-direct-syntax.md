# Direct page control — tasks + grouped edits via `page.*` syntax

Goal: give campaign code full, safe control of the current CRM page — complete
tasks and edit approved contact fields — using direct syntax:

```js
page.tasks.open[0].complete();           // complete one task  → a step
page.tasks.completeAll();                // complete every open task

page.contact.phone = "555-1234";         // captured, not applied yet
page.contact.jobTitle = "VP Sales";      // captured
// committed together as ONE grouped "Edit contact" step (auto at run end,
// or explicitly: page.contact.commit())
```

Everything still flows through the existing simulate → (gated) execute model:
in **simulation** these RECORD steps (no writes); a **real run** replays them
through the executor. Live writes are `remote`-gated (confirm) and are the
final, opt-in wiring step.

---

## 1. What already exists (the seams we build on)

### Page engine — the read model (`src/lib/page-engine/*`)
- `runEngine(document)` → extracted JSON for the current page (contact / account
  / opportunity / order). `src/lib/page-engine/index.js:41`.
- Contact/account schema: `src/lib/page-schemas/contact.js`. Relevant shape:
  - `contact.{ firstName, middleInitial, lastName, jobTitle, companyName, email,
    phone, zipCode, state, country, userType, … }`
  - `tasks.open[]` / `tasks.done[]`, each task: `{ id, subject, category, status,
    priority, dueDate }` — `id` comes from the CRM row key (`contact.js:606`).
- The sandbox (`sandbox-bridge.js`) is **read-only** (`ALLOWED_HELPERS`,
  `:28`). Writes CANNOT originate inside `runInSandbox` — they must run
  content-side. So the sim RECORDS intent; the executor performs it content-side.

### Contact field edits — the write mechanism
- **`crmUpdateContact(customerId, edits)`** — `src/lib/contact-detail-shared.jsx:89`.
  Read-modify-write: `Contact/Get.ajax` → merge changed keys → `Contact/Update.ajax`
  (`credentials:'include'`, content-script realm).
- **Batching already exists**: `ContactInfoCard` stages field edits in
  `draft = useRef({})` and `save()` flushes them as ONE `crmUpdateContact` call
  (`:938–956`). Our grouped `page.contact.*` edits reuse this exact model.
- **Allowlist** (de-facto): the crmUpdateContact payload keys —
  `firstName, middleInit, lastName, companyName, jobTitle, email, phoneNumber,
  zipCode, UserType, userCountry, CustomData` (`:96`). Encoded in
  `contracts.APPROVED_CONTACT_FIELDS` (schema-name → payload-key).
- **Account fields are NOT persisted today** — `AccountInfoCard` has no save;
  there is no `crmUpdateAccount`. Account writes would need a new endpoint.
- Phone-only copy: `_saveContactPhone` `src/content/actions-shelf.jsx:270`.

### Task completion — the write mechanism
- **`completeTaskById(id)`** — `src/lib/crmTasks.js:69` → `Task/Update.ajax`
  with `taskStatusID: 3`. Single call that completes a CRM task (API, not DOM).
- `completeContactTasks(contactId, { mode:'completeAll'|'completeLatest' })`
  (`:94`), `fetchOpenTasksForContact(contactId)` (`:35`).
- Inline UI already binds this: `OpenTaskRow.complete()` →
  `completeTaskById(t.id)` (`contact-detail-shared.jsx:1070`), with `t.id` from
  the extracted `tasks.open[]` item — exactly what `page.tasks.open[0].complete()`
  targets.

### The code engine (`src/lib/codeEngine/*`)
- `contracts.js` — gated verb registry. NOW includes `completeTask` (remote) and
  `editContact` (remote) + `APPROVED_CONTACT_FIELDS`.
- `simulate.js` records a dry trace; the real gated executor is not yet built
  (`simulate.js:16` anticipates it). Live effects today go through
  `campaign/actions.js` (`runStepAction`).

---

## 2. Proposed API (what code can do)

### Tasks
```js
page.tasks.open        // array of { id, subject, category, priority, dueDate }
page.tasks.done        // completed tasks (read-only)
page.tasks.open[0].complete()     // → completeTask step (remote gate)
page.tasks.completeAll()          // one complete step per open task
page.tasks.completeLatest()       // most-recent dueDate
```

### Contact edits (grouped)
```js
page.contact.phone = "…"          // Proxy set-trap; approved fields only
page.contact.jobTitle = "…"
page.contact.commit()             // optional; else auto-commit at run end
// → ONE editContact step: "Edit contact — phone, jobTitle" with before→after
```
- Unapproved field (`page.contact.ssn = …`) → a dependency-style error +
  editor lint (reuse the templateLint pattern against `APPROVED_CONTACT_FIELDS`).
- Account fields (`page.account.*`) → **read-only** until a `crmUpdateAccount`
  exists; assignment throws a clear "account edits aren’t wired yet".

### Helpers we can add (all backed by existing writers)
| syntax | effect | executor (existing) |
|---|---|---|
| `page.contact.addNote(text)` | remote | order-note / activity note bridge (`submitOrderNote.js`) — needs a contact-note variant |
| `page.contact.setDnc(true)` | remote | `crmSetDnc` (`contact-detail-shared.jsx:82`) |
| `page.contact.categorizeCase(id, cat)` | remote | `submitCaseCategory.js:36` |
| `page.tasks.create({subject, …})` | remote | already `actions.createTask` |
| `page.order.setDates({approval, commit})` | money | `submitOrderDates.js` (admin iframe bridge) |
| `page.contact.findPhone()` | remote | `findPhone.js` (+ `saveContact`) |

---

## 3. How it runs (recording → gated execute)

- **Simulate (dry):** the sandbox builds `page` with a `tasks` whose items have a
  recording `.complete()` and a `contact` Proxy whose `set` records approved
  edits into a batch; `commit()` (or run end) records the grouped `editContact`.
  These become trace steps → blocks (Complete task / Edit contact), exactly like
  `sendEmail`. No writes. Fully testable with mock page data.
- **Live page model:** for a single-contact simulation, `page` should be
  `runEngine(document)` of the current CRM page (real tasks + fields), merged with
  the audience contact. If not on a contact page, `page.tasks.open` is empty and
  edits are inert.
- **Real run (opt-in, gated):** swap the recorder for the executor —
  `completeTask` → `completeTaskById(id)`; `editContact` → `crmUpdateContact(id,
  mappedFields)` (grouped, one write). `remote` ⇒ confirm gate. This is the only
  part that touches the CRM and is held for explicit approval.

---

## 4. Build phases
1. **(done)** `completeTask` + `editContact` contracts + `APPROVED_CONTACT_FIELDS`
   + tests.
2. Runtime: `page.tasks[*].complete()` / `completeAll` + `page.contact` edit Proxy
   (+ grouped commit) in `simulate.js` + `sandboxRunner.js` (mirror), recording
   `completeTask` / `editContact` trace steps. Tests (Node + fake-sandbox).
3. Translate/instrument + blockView/BlocksView: recognize
   `page.tasks…complete()` and `page.contact.x = y` → their own step blocks
   (icon: check / edit), grouped-edit card with before→after preview.
4. `page` = live `runEngine(document)` merge for real tasks/fields; autocomplete
   + lint for approved fields; docs + spec entries.
5. **Gated executor** (opt-in): real `completeTaskById` / `crmUpdateContact`
   behind the confirm gate — the only live-write step.

Account writes and order-date (money) helpers are follow-ons once their write
paths exist / are approved.
