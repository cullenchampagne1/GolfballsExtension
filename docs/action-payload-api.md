# Universal Action Payload API — Design & Capability Inventory

> One JSON envelope, one executor, two callers (the Help Companion AI and
> admin‑pushed notifications). This document inventories what a user can do,
> maps each capability to a payload verb, and — the part this revision centres
> on — defines **how a verb acquires the objects it operates on** (which
> contact, which order, which task), since the API is object‑oriented but the
> envelope only carries text.

---

## 0. TL;DR

You have already built ~90% of the engine. Three pieces are live:

| Piece | File | What it is |
|---|---|---|
| **Envelope** | `lib/action-language.js` (`GBActionLanguage`) | A versioned, frozen JSON payload with a strict field allowlist + anti‑spoof check |
| **Executor** | `lib/action-runtime.js` (`GBActionRuntime`) | Command→handler registry. *"Backends can request commands; they can never ship executable code."* |
| **Safe run loop** | `src/lib/helpActions.js` (`__gbExecuteActionPayloadOnce`) | Registry validation + receipt ledger (idempotent, replay‑proof) + confirmation gating |

Both callers already route through it. **Two gaps remain:**
1. **`open_modal` can't carry data** — it opens a surface with no args, though the
   open‑functions already accept rich params. (§5)
2. **Verbs have no way to acquire their reference objects** — "create a task for
   *which* contact," "apply a note to *which* order." This is the dimension the
   design must be built around, and it is what §4 adds.

### Implementation status (live in source)

| Increment | State | What shipped |
|---|---|---|
| **Phase 1** — parameterised open | ✅ shipped | `openParamRules.js` + planner/executor wiring; params ride in `options` as key=value; `crm_search {query,type}` runs the search, `task_list {filter,status,priority}` opens filtered, plus `image_preview`, `mockup_studio`, `gift_catalog`, `watch_list`, `margin_calc`. |
| **Phase 2** — ambient composer verbs | ✅ shipped (3 of ~6) | `quick_task`, `call_log`, `quick_order_note` take a `subject` that prefills the shared composer for the current contact/order (resolved by the modal), opened auto‑composing; the rep submits in the native UI — that submit is the confirmation, no direct CRM write from the executor. |
| **Phase 2** — direct‑execute verbs | ⏸ held | `find_phone`, `categorize_case`, `create_contact` need the "confirmation card that shows the resolved object" UI (§4.4/§4.5) and, for find_phone, extraction from the shelf. No composer to reuse. |
| **Phase 3** — `commit_order_dates` (money) | ⏸ held | Not a clean composer‑open: the calendar only saves through the order‑iframe handshake (needs the scraped `calendarUrl`) and commits via an ASP.NET offset postback that can't be runtime‑verified here. Needs human validation + the §9 admin gate. |

The compiled Solr‑`fq` `filter` for `crm_search` is in the schema but not yet
consumed — a raw fq from a payload needs field/operator allowlisting first.

**Near‑term scope (this revision).** Deliberately narrow, per the product
decisions below:
- **In:** state verbs; parameterised *open* (search/filter/view); `do` verbs that
  bind to the **ambient object of the current page** (create task / log call /
  find phone for the current contact; apply note / commit dates on the current
  order; categorise the current case). Query Builder produces its query
  **directly**, never opening the child modal.
- **Out (for now):** the entire corporate‑catalog / proposal workflow; workflows;
  all email send/reply; operating on **task‑list rows** (ambiguous — no ambient
  subject); `charge` and `order‑edit`; name→object smart resolution when off the
  subject's page.

---

## 1. The envelope (canonical payload)

`normalizeEnvelope()` returns a **frozen** object with exactly these fields — any
extra key throws `Unsupported action payload field`:

```jsonc
{
  "version": 1,
  "command": "set_setting",        // must be in COMMANDS; `type` is an alias
  "target":  "marginCalc.minAllowedMargin",
  "value":   "40",                 // string≤500 | finite number | boolean | null
  "options": ["scene", "color"],   // ≤16 items, each ≤120 chars
  "label":   "Set minimum margin to 40%",  // ≤100 — the human summary
  "references": [{ "path": "…", "line_start": 39, "line_end": 97 }]
}
```

**Wrapper form + anti‑spoof.** A wrapper `{payload, type, target, value, options,
label, receipt_id}` cross‑checks its visible fields against the parsed `payload`;
a mismatch throws `The visible action does not match its payload…`. **The visible
summary can never disagree with what executes** — load‑bearing for any verb that
binds a resolved object (§4) or moves money (§9).

The envelope is deliberately flat. Rich structured params (a set of filters, or a
resolved object reference) ride in a new `params` object on the `open`/`do`
families (§5), never by loosening the flat commands.

---

## 2. The executor & lifecycle

```
caller ─► GBActionLanguage.normalize ─► resolve refs (§4) ─► GBActionRuntime.execute
                                                                 ├─ registry validation
                                                                 ├─ receipt ledger (idempotent, replay-proof)
                                                                 ├─ confirmation gating (§3)
                                                                 └─ handler (content | worker)
```

**Two callers, one loop.** Help Companion (AI) and Notifications (admin push) both
reach `__gbExecuteActionPayloadOnce` → the same serial queue + receipt ledger.
Already true for the eight shared commands.

**Receipt ledger.** `gbHelpActionReceiptsV1`, capped 400. Receipt id excludes
runId, so reopening history can't re‑arm a command; replays return the stored
receipt.

**Confirmation gating.** `submit_ticket`, `share_settings`, `share_email_template`
require a visible preview + click today; the matrix in §3 generalises this.

**One‑time data access.** `request_data_access` shares a bounded, locally‑filtered
slice of templates/notes with the AI backend only on explicit approval — the
model for any verb that must *read* user data.

**Boundary & security.** Openers/runtime/setting writes run in the page; network +
assistant in the worker. `apiFetch` allowlist, per‑install bearer auth, registry
containment (no raw storage keys, no shipped code), `__ADMIN__` build gate, and
`gbRemoteSettingsPolicy` hiding are all already enforced.

---

## 3. Effect classes → gating matrix

The effect class — not the caller — decides the gate. This is what lets the same
verb be safe whether the AI proposes it or an admin pushes it.

| Effect class | Examples | Gate |
|---|---|---|
| **read‑only** | open a surface, run a search, apply a filter, view a thread | **auto‑run** |
| **mutates‑local** | set a setting/feature/theme, add a watch item, save a query | **auto‑run** (trivially reversible) |
| **mutates‑remote** | complete a task, log a call, create a contact, categorise a case, apply an order note, find phone | **confirm** (preview + click, showing the resolved object) |
| **outward‑facing** | create a share link, send an email, run a workflow, export CSV | **confirm** (AI‑proposed shares always) |
| **money‑critical** | charge a card, commit approval/commitment dates, start an order‑edit | **hard gate** (§9). Never AI‑auto‑runnable. |

**One named exception: `flag_bounced_contact`** (admin builds only). It creates a
CRM task — mutates‑remote, so the matrix says confirm — and it runs without a
click. The exception is deliberate and bounded on every side: the target is not
proposed by a model or chosen by a backend operator but read out of a delivery‑
failure report our own mail relay received; only a **hard** bounce the relay
marked `auto` runs by itself (soft/unclassifiable ones keep the click); the CRM
half refuses to write when the contact already has an open bounce task, and the
worker keeps a settled‑address ledger, so the effect is idempotent; and
`bounce.autoFlag` turns the whole automatic path off while leaving the
notification actionable by hand. The value bought is the point of the feature —
a dead address is in the Replacement Contacts queue before a rep emails it
again, which a confirm gate sitting in an unread notification would not achieve.

---

## 4. Reference objects — resolving what a verb operates on

The API is object‑oriented (create a task **for a contact**, apply a note **to an
order**, complete **which task**) but the envelope carries only text and enums. A
verb therefore needs a *reference* to a domain object, and the AI has no channel
to acquire one. This section defines the objects, where they live, and the
cheapest path to each — the "relational map of actions → required objects →
source" the design calls for.

### 4.1 The domain objects (and where they live)

| Object | Id shape | Lives in / resolved by |
|---|---|---|
| **contact** | `customerID` (digits) | current page (URL / labels / engine), CRM index, Solr |
| **account** | account id | page engine, CRM index, Solr |
| **order** | `orderID` (digits) | page URL, page engine |
| **case** | caseId | current page (case / email‑preview) |
| **task** | `task_<id>` | task‑list DOM only (Page=349) — **no ambient, no query** |
| **opportunity** | opp id | page engine `opportunities[]` (only on account/opp page) |
| **saved proposal** | id | local storage (`gbSavedProposals`) |
| **template** | id | local storage (`templates` / `noteTemplates`) |

Concrete resolvers that already exist: `runEngine(document)` →
`{ids:{account,contact,order,customer}, contact:{name}, opportunities[]}`
(`gift-catalog.jsx`); `readCallContext()` → the true **current** contact
(`submitCallLog.js`); `detectPageType()` → `contact|account|order|order-index|other`
(`pageType.js`); `GBCrmIndex.search({query})` → encrypted name lookup
(`crm-index-store.js`).

### 4.2 Three resolution tiers (cost × certainty)

**Tier 0 — Ambient (free, deterministic).** The current page *is* the object.
Auto‑fill at plan time; the confirmation card renders the resolved object so a
human catches a mis‑bind. Covers create/log/find‑phone for the current contact,
apply‑note / commit‑dates on the current order, categorise the current case.
- **Action‑aware caveat (important):** the ambient object depends on the verb's
  subject. On an **account** page the page‑engine "contact" is a *representative*,
  not the subject — `readCallContext` deliberately bypasses the engine to read the
  true current contact. **Each ambient verb declares its own resolver**, not a
  shared "page context."

**Tier 1 — Smart resolve (one background query).** Name → object via
`GBCrmIndex.search()` / Solr. Auto‑fill **only** when exactly one match; on 0 or
>1, degrade to "open the surface / disambiguate," never guess. Always confirm.
Covers "task for John at Acme" when not on his page. Higher wrong‑object risk →
confirm always, never pre‑authorise. **Deferred** in near‑term scope.

**Tier 2 — User pick (an unavoidable choice).** The object exists only as a
row/line inside an open surface (which task, which proposal line, which
opportunity of several). A payload round‑trip is slower than the native UI here.
**Rule: the API opens the surface; the user picks. Never operate the row by
payload.** This is exactly why task‑list row ops and the proposal workflow are
out of near‑term scope.

### 4.3 The relational map (in‑scope actions)

| Action | Requires | Tier | Source | Behaviour |
|---|---|---|---|---|
| `set_*`, `open <read-only>` | — | n/a | — | no ref |
| `open crm_search {query,filter}` | — | n/a | text/compiled query | no ref |
| `create_task` | contact | 0 | `readCallContext` (current contact page) | auto‑fill + confirm |
| `log_call` | contact | 0 | `readCallContext` | auto‑fill + confirm |
| `find_phone` | contact | 0 | current contact page | auto‑fill + confirm |
| `create_contact` | — | n/a | new object | confirm |
| `apply_order_note` / `apply_last_note` | order | 0 | URL `orderID` / page | auto‑fill + confirm |
| `commit_order_dates` | order | 0 | URL `orderID` / page | auto‑fill + **hard gate** |
| `categorize_case` | case | 0 | current case page | auto‑fill + confirm |
| *(deferred)* `create_task` off‑page | contact | 1 | `GBCrmIndex.search` | one‑match‑only + confirm |
| *(deferred)* complete/push a task row | task | 2 | task‑list state | **open surface, user picks** |
| *(deferred)* add saved proposal to opp | proposal + opportunity | 2 | storage + page engine | **manual / UI** |

### 4.4 Acquiring context — two mechanisms

1. **Executor‑side auto‑resolve (preferred, no AI round‑trip).** The AI proposes an
   ambient verb with *no* explicit ref; the executor resolves Tier‑0 at plan time,
   fills it, and shows a confirmation naming the object. Unresolvable → the action
   degrades to a hint ("open a contact first"), never a silent failure. This is
   your "get the current page's contact and just ask confirmation."
2. **Context in the AI's turn.** Extend what the assistant already sends
   (`page_url`, `page_type`) to include the resolved ambient objects —
   `{contact:{id,name}, order:{id}, case:{id}, page_type}` — so the model knows
   "you're on John Smith's contact page" and only offers contact‑scoped verbs.
   Mirrors `request_data_access` but for page/CRM context; still **re‑resolved at
   execution** for safety.

### 4.5 The safety invariant

Every ref‑bound mutating verb's confirmation card **must render the resolved
object** ("Create task for **John Smith**", "Push dates on order **#12345**").
Ambient auto‑fill is only safe because the human sees the binding before the
click, and the anti‑spoof envelope check (§1) guarantees the label can't name one
object while the payload carries another.

### 4.6 "Fastest to final result" — skip the child surface

Where a child surface only *builds* a value its parent consumes, the API produces
that value **directly**, never opening the child. **Query Builder is the
archetype:** the API compiles the Solr `fq` and hands it to `open crm_search
{filter}` / `run_search` — it never mounts the builder. Generalise: **prefer the
verb that yields the final state over the verb that opens the tool that yields
it.**

---

## 5. Parameterised `open` (the data‑carrying change)

`open_modal` today invokes the opener with no args. Introduce an `open` verb whose
`params` object is validated against a **per‑target param schema** —
`openParamRules`, a sibling to `settingRules` — so nothing arbitrary reaches a
modal:

```jsonc
{ "version": 1, "command": "open", "target": "crm_search",
  "params": { "query": "acme corp", "type": "account" },
  "label": "Open CRM Search for “acme corp” accounts" }
```

```js
crm_search: { query:{type:'string',max:200}, type:{type:'enum',options:['all','contact','account']},
              filter:{type:'string',max:300} },   // a saved-query label OR a compiled solr fq
task_list:  { filter:{type:'enum',options:['all','urgent']}, status:{type:'enum',options:['new','completed','all']},
              priority:{type:'enum',options:['','high','med','low']}, query:{type:'string',max:200} },
image_preview:{ url:{type:'https',suffix:['png','jpg','jpeg','webp']}, order_id:{type:'id'} },
mockup_studio:{ batch_id:{type:'pattern', re:'^batch_[a-f0-9]{32}$'} },
```

`params` also carries a **resolved reference** (an `order_id` the executor filled
from the page). Two wiring tasks: (a) the arg‑less openers — `crm_search`,
`task_list`, `crm_create_contact`, `watch_list`, `gift_catalog` — must accept and
thread an initial‑state object; (b) child surfaces (query_builder, proposal_email,
gift_customize, …) get **no** opener — reach them pre‑configured through the parent
per §4.6, or not at all in near‑term scope.

---

## 6. Capability inventory

Legend — **Effect**: `R` read‑only · `L` local · `M` mutates‑remote · `O`
outward · `$` money. **Gate**: `auto` / `confirm` / `hard` / `admin`. **Scope**:
✅ in near‑term · ⏸ deferred.

### 6.1 CRM & tasks

**crm_search** — `crmSearchEnabled` · `__gbShowCrmSearchModal()` *(needs params)*
- ✅ `open {query,type,filter}` — filter may be a **compiled query** (query‑builder result, no child modal) — R/auto
- ✅ `run_search`, `apply_filter`, `sort`, `select`, `open_record` — R/auto
- ⏸ `export_csv` (O), `email_selected` (O), `run_workflow` (O) — confirm; **out of near‑term**

**task_list** — `taskListEnabled` · `__gbShowTaskListModal()` *(needs params)*
- ✅ `open {filter,status,priority,query}`, `refresh`, `sort` — R/auto
- ⏸ `complete_task`, `reopen_task`, `push_task_date`, `set_task_date`, `create_task` on a **specific row** — Tier‑2, ambiguous → **out**. (Create a task for the *current contact* lives on the contact page via `quick_task`, not here.)

**quick_task** — `quickTaskEnabled` · `__gbShowQuickTaskModal(overrides)` *(already accepts contact overrides)*
- ✅ `create_task` for the **current contact** — Requires contact (Tier 0) — M/confirm
- Inputs: `{subject,body,priority∈{1,2,3},categoryId,due:{relative,days}}`

**call_log** — `callLogEnabled` · `__gbShowCallLogModal(overrides)` *(accepts contact)*
- ✅ `log_call` for the **current contact** — Requires contact (Tier 0) — M/confirm
- Inputs: `{subject,body,category(CRM enum),direction∈{0,1},vm:bool}`

**crm_create_contact** — `crmNewContactEnabled` · `__gbShowCrmCreateContactModal()`
- ✅ `open (prefilled)` — L/auto; `create_contact` — no ref (new object) — M/confirm

**watch_list** — `watchListEnabled` · `__gbShowWatchListModal()` — fully local
- ✅ `open {filter}`, `add_item {title,priority,due,context}`, `toggle_done`, `delete_item` — L/auto

**query_builder** — child of crm_search. ✅ **Skip the modal** — compile the fq and
pass it to `open crm_search {filter}` (§4.6).

### 6.2 Email & templates — ⏸ mostly out of near‑term

**email_preview** — `emailPreviewEnabled` · `__gbOpenEmailPreview({messageId | email})`
- ✅ `open` — R/auto; ✅ `categorize_case` (current case, Tier 0) — M/confirm
- ⏸ `send_template_reply`, `send_reply` — O/confirm — **out (email send deferred)**

**text_preview** — ✅ `open` R/auto; ✅ `categorize_case` (Tier 0) M/confirm.

**quick_order_note** — `autoPushEnabled` · `__gbShowQuickOrderNoteModal({orderId})`
- ✅ `apply_order_note` for the **current order** (Tier 0) — M/confirm. Inputs `{subject,body,audienceVal,daysOut}`.

**proposal_email · email_runner** — ⏸ **out** (email send / workflow runner).
**editor_templates · editor_notes · editor_signature** — ⏸ author surfaces; open/save are L/auto but low near‑term value.

### 6.3 Gifting & products — ⏸ proposal workflow out; read‑only open in

**gift_catalog** — `giftCatalogEnabled` · `__gbOpenGiftCatalog()`
- ✅ `open {query,category,brand,special,sort,view}` — **browse only, read‑only** — R/L auto
- ⏸ `add_to_proposal`, `save_proposal`, `email_proposal`, `open_checkout`, custom items, supplier import — **entire proposal / corporate‑catalog workflow out.** If the AI ever builds proposals it should assemble the full payload **outside** the modal; adding a saved proposal would need a proposal‑dropdown + opportunity‑dropdown pick (Tier 2) more cumbersome than the UI, unless the background can smart‑resolve (1 open opp + 1 matching saved proposal). Revisit later.

**mockup_studio** — `mockupStudioEnabled` · `__gbOpenMockupStudio(batchId?)`
- ✅ `open (fresh or on a batch)` — R/auto (deep‑link `batch_[a-f0-9]{32}` precedent)
- ⏸ `generate_batch` (M), `download_*` (O), `open_catalog_admin` (admin) — later

**image_preview** — `imagePreviewEnabled` · `__gbOpenImagePreview({url,order_id,customer_id})` — already fully parameterised
- ✅ `open {url|order_id}`, `replace_image` — R/auto
- ⏸ `launch_submit_proof` — O/confirm — later

**submit_proof · gift_customize · proposal_checkout · mockup_catalog_admin · golfball_viewer · grass_mockup** — ⏸ out (proof submit is M; the rest are child/admin/preview‑only).

### 6.4 Orders, calendar, shelf, notifications, settings

**margin_calc** — `marginCalcEnabled` · `__gbShowMarginCalcModal()` — read‑only, no network.
- ✅ `open`, `set_fields {cost,price,margin,markup,profit,qty}` — R/auto

**order_calendar** — `calendarEnabled` · `__gbOpenOrderCalendar({orderID,calendarUrl,…})`
- ✅ `open (with order+dates)` — R/auto
- ✅ **`commit_dates`** for the **current order** (Tier 0) — **$ / hard gate** (you approved date changes)

**charge_refund** — `chargeEnabled` — ⏸ **out.** `run_charge` is `$`; you excluded it.
**order_edit** — `orderEditEnabled` — ⏸ **out.** `start_order_edit` is `$`; excluded.
**workflow_manager** — `workflowManagerEnabled` — ⏸ **out** (in‑depth, specific).

**actions_shelf** — the hub; buttons inherit their target's class. Two silent‑write
shelf actions you **kept in**: ✅ `find_phone` (M, current contact) and ✅
`apply_last_note` (M, current order) — both Tier‑0 ambient, confirm.

**notifications** — `notificationsEnabled` · the admin‑push surface itself;
`run_action` is the executor entry (§2).

**settings (no modal — direct commands):**
- ✅ `set_feature` (`featureRules`, 27 flags) · `set_setting` (`settingRules`) ·
  `set_theme_preset` (8 variants) · `set_theme_palette` · `set_scale`
  (`SCALE_CATEGORIES`) — L/auto
- ✅ `share_settings`, `share_email_template`, `submit_ticket` — O/confirm *(shipped)*

---

## 7. Command vocabulary (near‑term set)

- **`state`** (flat, auto): `set_feature`, `set_setting`, `set_theme_preset`,
  `set_theme_palette`, `set_scale`
- **`open`** (params, read‑only/local): `crm_search`, `task_list`,
  `crm_create_contact`, `watch_list`, `gift_catalog` (browse), `image_preview`,
  `mockup_studio`, `margin_calc`, `order_calendar`, `email_preview`, `text_preview`
- **`do`** (params + resolved ref, effect‑gated):
  - ambient/confirm: `create_task`, `log_call`, `find_phone` (contact) ·
    `apply_order_note`/`apply_last_note` (order) · `categorize_case` (case) ·
    `create_contact` (none)
  - ambient/hard: `commit_order_dates` (order)
  - shipped/confirm: `share_settings`, `share_email_template`, `submit_ticket`

Every `do` verb declares its effect class + required object in the registry; the
executor applies the §3 gate and the §4 resolution automatically. The caller never
chooses the gate and never supplies a raw object it wasn't handed.

---

## 8. Phased build plan (rescoped)

Baked‑in decision: **near‑term verbs bind only to Tier‑0 ambient objects on the
current page.** Tier‑1 smart resolve, Tier‑2 picks, and the deep
gift/workflow/email workflows are deferred.

| Phase | Scope | Risk |
|---|---|---|
| **0 — ship what exists** | Document the 8 live commands for AI + notification authors; add `set_scale`. | none |
| **1 — parameterised open** | `open` + `openParamRules`; teach the 5 arg‑less openers to accept initial state; **query‑builder compiles directly into `crm_search {filter}`**. Targets: crm_search, task_list, gift_catalog (browse), image_preview, margin_calc, watch_list, mockup_studio, order_calendar (view). All read‑only/local. | low |
| **2 — ambient `do` (confirm)** | The useful core, each bound to the current‑page subject: `create_task`, `log_call`, `find_phone` (contact); `apply_order_note`/`apply_last_note` (order); `categorize_case` (case); `create_contact`. Executor auto‑resolves Tier‑0 + confirmation shows the object. Feed resolved page context into the AI turn. | medium |
| **3 — approved money verb (hard gate)** | `commit_order_dates` on the current order only — fresh explicit click showing the dates, admin/consent gate, anti‑spoof label. | high (§9) |

**Explicitly out of near‑term scope:** corporate‑catalog + proposal build/save/
email/checkout; workflows; all email send/reply; **task‑list row operations**
(complete/push a specific task — Tier‑2, ambiguous); `run_charge`, `start_order_edit`;
Tier‑1 name→object resolution off the subject's page. Each is revisited only after
Tier‑0 proves out.

---

## 9. Money‑critical & security appendix

Approved in scope: **`commit_order_dates`** (date change), plus the two
mutates‑remote shelf writes **`apply_last_note`** and **`find_phone`** (not money,
but silent writes worth the same care). Excluded: **`run_charge`**,
**`start_order_edit`**.

For the one money verb that stays (`commit_order_dates`):
1. **Never auto‑runnable** by either caller. Every execution is a fresh explicit
   click on a preview showing the exact order and both dates — no remembered
   authorisation, no admin pre‑authorise, no AI auto‑run.
2. **Add an explicit admin/consent gate at the call site.** Today only
   `gbRemoteSettingsPolicy` (setting visibility) exists there; use the
   dashboard‑admin proof the mockup catalog authoring already uses
   (`catalogAdminJson`, server authorises on the admin session).
3. **Keep it on the wrapper form** so the anti‑spoof label/payload equality check
   always runs — the card can never show one order's dates while committing
   another's.

`apply_last_note` / `find_phone` follow the §4.5 invariant: ambient‑bound to the
current order/contact, auto‑resolved, confirmation names the object.

---

## Appendix A — reference-resolution substrate

| Concern | File |
|---|---|
| Page‑engine ambient ids | `runEngine(document)` via `src/content/gift-catalog.jsx:17` |
| Current‑contact reader (action‑aware) | `src/lib/submitCallLog.js` `readCallContext()` |
| Page type | `src/lib/pageType.js` `detectPageType()` |
| Name→object smart resolve (Tier 1) | `lib/crm-index-store.js` `GBCrmIndex.search()`, Solr |
| Assistant turn context | `src/lib/helpActions.js` `helpActionContext()` (`page_url`,`page_type` today) |
| Envelope / runtime / receipts | `lib/action-language.js`, `lib/action-runtime.js`, `src/lib/helpActions.js` |
| Registries | `flags.js`, `devSettings.js`, `theme.js`, `scales.js`, `presetScopes.js` |

## Appendix B — the 26 surfaces at a glance

CRM/tasks: `crm_search`, `query_builder`*, `crm_create_contact`, `quick_task`,
`quick_task_popover`*, `task_list`, `call_log`, `watch_list` ·
Email: `email_preview`, `text_preview`, `proposal_email`*, `email_runner`*,
`quick_order_note`, `editor_templates`, `editor_notes`, `editor_signature` ·
Gifting/products: `gift_catalog`, `gift_customize`*, `proposal_checkout`*,
`mockup_studio`, `mockup_catalog_admin`†, `grass_mockup`*, `golfball_viewer`*,
`image_preview`, `submit_proof` ·
Orders/system: `margin_calc`, `order_calendar`, `charge_refund`, `order_edit`,
`workflow_manager`, `notifications`, `actions_shelf`

`*` child surface (no global opener) · `†` admin‑only build.
