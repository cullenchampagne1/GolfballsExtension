# Universal Action Payload API — Design & Capability Inventory

> One JSON envelope, one executor, two callers (the Help Companion AI and
> admin‑pushed notifications). This document inventories everything a user can
> do in the extension and maps each capability to a payload verb, so we can grow
> the AI's reach and send users an executable "setup query" through the same
> engine.

---

## 0. TL;DR — the engine already exists; there is one gap

You have already built ~90% of this. Three pieces are live today:

| Piece | File | What it is |
|---|---|---|
| **Envelope** | `lib/action-language.js` (`GBActionLanguage`) | A versioned, frozen JSON payload with a strict field allowlist and an anti‑spoof check |
| **Executor** | `lib/action-runtime.js` (`GBActionRuntime`) | A command→handler registry scoped by environment. *"Backends can request commands; they can never ship executable code."* |
| **Safe run loop** | `src/lib/helpActions.js` (`__gbExecuteActionPayloadOnce`) | Registry validation + receipt ledger (idempotent, replay‑proof) + confirmation gating |

Both callers already route through it: **Help Companion** (`helpActions.js`) and
**Notifications** (`src/vanilla/main.js` → `__gbRunNotificationAction` →
`GBActionRuntime.execute`). An admin can already push a notification whose
`action.payload` is one of eight commands and it executes on the user's page
with the same safety as the AI.

**The single gap:** `open_modal` forbids `value`/`options`
(`helpActionCore.js` — the `open_modal` branch), so a command can *open* a modal
but **cannot pass it data**. Yet the open‑functions already accept rich params —
`__gbOpenOrderCalendar({orderID,…})`, `__gbOpenEmailPreview({email})`,
`__gbOpenImagePreview({url,orderId})`. "Open CRM and run a search," "open the
task list with a filter active," "open image preview on this order's logo" are
blocked **only by that one rule.** Closing it (Phase 1 below) is the highest‑value,
lowest‑risk change in this document.

---

## 1. The envelope (canonical payload)

Defined once in `lib/action-language.js`; ESM shim `src/lib/actionLanguage.js`.
`normalizeEnvelope()` returns a **frozen** object with exactly these fields — any
extra key throws `Unsupported action payload field`:

```jsonc
{
  "version": 1,                    // must equal VERSION; else reject
  "command": "set_setting",        // ^[a-z][a-z0-9_]{1,63}$, must be in COMMANDS; `type` is an accepted alias
  "target":  "marginCalc.minAllowedMargin",  // required, ≤500 chars (≤4000 for copy_text)
  "value":   "40",                 // string≤500 | finite number | boolean | null(→"")
  "options": ["scene", "color"],   // array, deduped, ≤16 items, each ≤120 chars
  "label":   "Set minimum margin to 40%",     // ≤100 chars — the human summary
  "references": [                  // ≤6, for ticket source cites only
    { "path": "src/modals/MarginCalc.jsx", "line_start": 39, "line_end": 97 }
  ]
}
```

**Two accepted shapes** (`normalize`, `action-language.js`):

1. **Bare envelope** — the canonical fields at top level.
2. **Wrapper** — `{ payload: <envelope | JSON string>, type, target, value,
   options, label, references, receipt_id, citation_id }`. The visible wrapper
   fields are **cross‑checked** against the parsed `payload`; a mismatch throws
   `The visible action does not match its payload…`. **This is the anti‑spoof
   guard** — the model's (or admin's) visible summary can never disagree with
   what actually executes. `receipt_id` lives only on the wrapper, never inside
   the canonical payload.

Serialization re‑emits the minimal canonical JSON only, so nothing extra rides
along.

### Design rule
The envelope is deliberately **flat** (target + value + options). That is enough
for every state change and every parameterless open. Rich, structured params
(a search + a set of filters, an order id + two dates) need a bounded
`params` object — see §4. We add that **as a new field on a new `open` family**,
not by loosening the existing flat commands.

---

## 2. The executor & lifecycle

```
caller ──► GBActionLanguage.normalize ──► GBActionRuntime.execute(cmd, env, ctx)
                                              │
                                              ├─ registry validation (planHelpAction) ── nothing arbitrary
                                              ├─ receipt ledger (idempotent, replay-proof)
                                              ├─ confirmation gating (outward-facing → click)
                                              └─ handler (content | worker)
```

### Two callers, one loop
- **Help Companion (AI):** the model emits an action; `ExecutableActionCard`
  runs it through `executeHelpActionOnce`.
- **Notifications (admin push):** the server delivers a notification whose
  `action.payload` is a serialized envelope; `Notifications.jsx → runAction →
  __gbRunNotificationAction → GBActionRuntime.execute`, keyed by
  `notification:<remoteId>`.

Both land in `__gbExecuteActionPayloadOnce` → the same serial queue → the same
receipt ledger. **This is the "same engine for both consumers" the design
calls for — it is already true for the eight shared commands.**

### Receipt ledger (idempotency & replay protection)
- Storage: `gbHelpActionReceiptsV1` (chrome.storage.local, capped 400, sorted by time).
- Receipt id prefers the backend‑issued `receiptId`; else a stable
  `legacy:<createdAt36>:<fnv1a>:<pos>` derived from visible content — **excludes
  runId**, so reopening or importing a conversation can never re‑arm an old
  command.
- A receipt that already exists is not re‑executed; replays return the stored
  receipt tagged `replayed:true`.
- Historical receipts are pre‑seeded `succeeded / "not replayed"` so a restored
  conversation never re‑fires.

### Confirmation gating (`CONFIRMATION_ACTION_TYPES`)
Today: `submit_ticket`, `share_settings`, `share_email_template` — the
least‑reversible / outward‑facing actions each require a visible preview + an
explicit click. Toggles and theme changes stay auto‑applied (local, trivially
undone). **This is the exact axis the payload API must generalize** — see §3.

### One‑time data access (`request_data_access`)
Not a mutation. Renders as an approval card that asks the user to share a bounded,
locally‑filtered slice of their templates/notes with the AI backend. Resolution
is worker‑mediated (`helpAssistantResolveDataAccess`); the extension **filters
locally first, only approved results leave the device.** This is the model for
any future verb that needs to *read* user data on the AI's behalf.

### Execution boundary & security (already enforced)
- **Content vs worker:** open‑functions, the runtime, and setting/theme writes
  run in the page; all network + the assistant run in the service worker;
  `chrome.runtime.sendMessage {ok,…}` is the channel.
- **`apiFetch` allowlist** (`installation-auth.js`): method ∈ {GET,POST,DELETE},
  origin pinned, path confined to the project client namespace + an enumerated
  assistant surface. Not a general fetch primitive.
- **Registry containment:** `planHelpAction` never returns a raw storage key;
  `GBActionRuntime` maps a command only to code already compiled in. Backends
  can *name* a command; they cannot ship one.
- **Admin gating:** `__ADMIN__` is a **build‑time** constant (served build =
  `false`), so admin‑only surfaces (mockup catalog authoring, supplier import)
  don't exist in the consumer bundle. `gbRemoteSettingsPolicy.adminBypass`
  governs which settings/features are hideable, enforced in `isHidden`.

---

## 3. Effect classes → gating matrix

Every verb carries an **effect class**. The class — not the caller — decides how
it is gated. This is the safety spine of the whole API and it is what lets the
*same* verb be safe whether the AI proposes it or an admin pushes it.

| Effect class | Examples | Gate |
|---|---|---|
| **read‑only** | open a modal, run a search, apply a filter, view a thread | **auto‑run.** No prompt. |
| **mutates‑local** | set a setting/feature/theme, add a watch item, save a query, build a proposal draft | **auto‑run**, trivially reversible. |
| **mutates‑remote** | complete a task, log a call, create a contact, categorize a case, apply an order note | **confirm** (visible preview + click). |
| **outward‑facing** | create a share link, send an email, run a campaign, export CSV | **confirm**, and for AI‑proposed shares, always. |
| **money‑critical** | charge a card, commit approval/commitment dates, start an order‑edit session | **hard gate** — see §8. Never AI‑auto‑runnable. |

Cross‑cutting rules:
- **AI vs admin symmetry, with an asymmetric ceiling.** Both callers use the
  same gating, but an admin push may carry a *pre‑authorized* flag for
  `mutates‑remote` verbs the user has opted into (e.g. "apply this note to the
  order") that the AI can only *propose*. Money‑critical is never pre‑authorized
  by either.
- **Data‑reading verbs** (search results, template contents) always route through
  the one‑time `request_data_access` grant, never an implicit read.
- **Page‑context predicate.** Many verbs require a specific page (an order page,
  a contact page). The runtime already computes `detectPageType()` →
  `contact|account|order|order-index|other` and `canExecute(...,'content')`
  gates on it. A payload targeting a surface that needs context it doesn't have
  degrades to a passive card, not a silent failure.

---

## 4. The one architectural change: parameterized `open`

Today the `open_modal` command opens a surface with **no arguments**
(`helpActions.js` invokes `globalThis[MODAL_TARGETS[target]]()` — empty call),
even though the open‑functions accept rich params. Introduce a parameterized
open that reuses those signatures.

### Proposal: an `open` verb with a bounded `params` object

```jsonc
{
  "version": 1,
  "command": "open",
  "target":  "crm_search",
  "params":  { "query": "acme corp", "type": "account" },
  "label":   "Open CRM Search for “acme corp” accounts"
}
```

`params` is validated exactly like `set_setting` is validated against
`settingRules` — **against a per‑target param schema registry**, so nothing
arbitrary reaches a modal:

```js
// openParamRules — the new registry, sibling to featureRules/settingRules
crm_search: {
  query:  { type: 'string', max: 200 },
  type:   { type: 'enum', options: ['all','contact','account'] },
  filter: { type: 'string', max: 300 },     // a saved-query label or solr fq
},
task_list: {
  filter:   { type: 'enum', options: ['all','urgent'] },
  status:   { type: 'enum', options: ['new','completed','all'] },
  priority: { type: 'enum', options: ['','high','med','low'] },
  query:    { type: 'string', max: 200 },
},
image_preview: {
  url: { type: 'https', suffix: ['png','jpg','jpeg','webp'] },
  order_id: { type: 'id' }, customer_id: { type: 'id' },
},
mockup_studio: { batch_id: { type: 'pattern', re: '^batch_[a-f0-9]{32}$' } },
// …one entry per openable target
```

The executor plans the params, then calls the existing opener with the
normalized object: `__gbOpenOrderCalendar(planned)`. Because the schema is a
closed allowlist per target, an admin/AI can only pass fields the surface
already understands — the same containment property `planHelpAction` gives the
flat commands.

### Two wiring tasks this implies
1. **Open‑functions that take no args must learn to.** Only `quick-task`,
   `call-log`, `quick-order-note`, `email-preview`, `image-preview`,
   `submit-proof`, `order-calendar`, `campaign-manager`, `mockup-studio` accept
   params today. `crm-search`, `task-list`, `crm-create-contact`, `watch-list`,
   `gift-catalog` take none — each needs its `mountFloating(...)` entry to accept
   and thread an initial‑state object.
2. **Child surfaces need an opener.** `query-builder`, `quick-task-popover`,
   `proposal-email`, `email-runner`, `gift-customize`, `proposal-checkout`,
   `mockup-catalog-admin`, `golfball-viewer`, `grass-mockup` have **no global** —
   they mount only inside a parent. For the API, either (a) expose the parent
   pre‑configured to open the child, or (b) add a parent‑level dispatcher. Prefer
   (a): "open gift_catalog with the email composer armed" beats a standalone
   composer opener.

### Beyond open: in‑surface `do` verbs (Phase 2+)
Opening pre‑configured covers most of "the AI can open CRM and run a search."
Driving a surface that is **already open** (apply another filter, select a row,
categorize the case in front of the user) needs each surface to expose a small
imperative API the runtime can call — e.g. a `window.__gbSurfaceDispatch(id, op,
params)` that a mounted modal registers. That is a larger, per‑surface effort
(Phase 2/3) and should follow the same param‑schema + effect‑class discipline.

---

## 5. Capability inventory

Legend for **Effect**: `R` read‑only · `L` mutates‑local · `M` mutates‑remote ·
`O` outward‑facing · `$` money‑critical. **Gate** column: `auto` / `confirm` /
`grant` (data access) / `hard` (money) / `admin`.

### 5.1 CRM & tasks

**crm_search** — flag `crmSearchEnabled` · open `__gbShowCrmSearchModal()` *(no args today → needs params: query, type, filter)*

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with query/type/filter) | `query`, `type∈{all,contact,account}`, saved‑filter label / solr fq | R | auto |
| run_search | query, type | R (remote read) | auto |
| apply_filter / apply_query_builder | filter object `{label, solrFq, conditions}` | R | auto |
| sort | key∈{contactName,accountName,recordType,orderCount,ytdRevenue,priorYearRevenue,lastOrderDate}, dir | R | auto |
| select / deselect / select_all | row id set (`contact_n`/`account_n`) | L | auto |
| index_records | selected rows → encrypted IndexedDB | L | auto |
| import_list | .xlsx/.csv blob | L | auto |
| export_csv | selection | O | confirm |
| email_selected | audience | O | confirm |
| run_campaign | audience → `__gbOpenCampaignManager` | O | confirm |
| open_record | new tab | R | auto |

**task_list** — flag `taskListEnabled` · open `__gbShowTaskListModal()` *(no args → needs params: filter, status, priority, query)*

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with filter/status/priority/query) | status∈{new,completed,all}, priority∈{'',high,med,low}, due∈{all,urgent}, query | R | auto |
| refresh | — (scrapes Page=349) | R | auto |
| sort | key∈{account,contact,dueDate,category,priority,subject} | R | auto |
| select / range / all | task id set | L | auto |
| complete_task / reopen_task | task id | M | confirm |
| push_task_date | task id, `days:int` | M | confirm |
| set_task_date | task id, `MM/DD/YYYY` | M | confirm |
| create_task | `{template}` or `{custom:{title,days}}` | M | confirm |
| open_quick_task | task id (opens popover) | R | auto |
| export_csv / email_selected / run_campaign | selection | O | confirm |

**quick_task** — flag `quickTaskEnabled` · open `__gbShowQuickTaskModal(opts)` — **already accepts** `{autoCompose, returnData, ...overrides(contactName,contactType,contactId,employeeId)}`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (prefilled) | contact overrides, autoCompose | R | auto |
| fire_template | template id | M | confirm |
| create_custom | `{subject,body,priority∈{1,2,3},categoryId,due:{relative,days}}` | M | confirm |

**call_log** — flag `callLogEnabled` · open `__gbShowCallLogModal(overrides)` — **already accepts** `{phone,contactName,contactType,contactId,employeeId}`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (prefilled) | context overrides | R | auto |
| fire_template | template id | M/O | confirm |
| log_custom | `{subject,body,category(CRM enum),direction∈{0,1},vm:bool}` | M/O | confirm |

**crm_create_contact** — flag `crmNewContactEnabled` · open `__gbShowCrmCreateContactModal()` *(no args → could prefill fields)*

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (prefilled) | firstName,lastName,email,account,+ segmentation enums (TERRITORIES,INDUSTRIES,EMP_RANGES,REV_RANGES,CAMPAIGNS,CUSTOMER_TYPES,COUNTRIES,FLAGS) | L | auto |
| search_account | query | R | auto |
| create_contact | full field set | M/O | confirm |

**watch_list** — flag `watchListEnabled` · open `__gbShowWatchListModal()` *(no args → could prefill filter or a new item)* — **fully local**

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with filter) | filter∈{all,active,high,done}, query | R | auto |
| add_item | `{title, priority∈{high,med,low}, due, context:{type,id,name}}` | L | auto |
| toggle_done / delete_item / clear_all | item id | L | auto |

**query_builder** *(child of crm_search — reach via crm_search)* · **quick_task_popover** *(child of task_list)* — inventoried; drive through their parents.

### 5.2 Email & templates

**email_preview** — flag `emailPreviewEnabled` (+ `powerAutomateEnabled` for reply) · open `__gbOpenEmailPreview(target)` — **already accepts** `{messageId, messageGuid, email:{from,to,subject,date,bodyHtml}, meta}` *(the closest existing precedent for a fully‑formed pushed payload)*

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with message or full email) | messageId / a complete `email` object | R | auto |
| categorize_case | category+subcategory (enum `CASE_CATEGORIES`, `caseMatch.js`) | M | confirm |
| mark_junk | — | M | confirm |
| send_template_reply | case template id | O | confirm |
| send_reply | `{to,subject,htmlBody}` | O | confirm |

**text_preview** — flag `textPreviewEnabled` · open `__gbOpenTextPreview(caseId, caseHref, meta)`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open | caseId, href, meta | R | auto |
| categorize_case | category+subcategory | M | confirm |

**quick_order_note** — flag `autoPushEnabled` · open `__gbShowQuickOrderNoteModal({orderId})` — **already accepts** orderId

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with orderId) | orderId | R | auto |
| apply_note | template id, or `{subject,body,audienceVal,daysOut:int}` | M/O | confirm |

**proposal_email** *(child of gift_catalog)* · **email_runner** *(child of task_list/crm_search)* — sends bulk email; **O**, confirm. Reach via parent.

**editor_templates / editor_notes / editor_signature** — full‑page editor, auto‑saves to `chrome.storage.local` (`templates`, `noteTemplates`, `emailSignature`). Openers `__gbOpenTemplate(template)`, `__gbOpenNote(template)`, `__gbOpenSignature()`.

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open_template_editor | template object | L | auto |
| save_template | template object | L | auto |
| set_signature | signature HTML | L | auto |

### 5.3 Gifting & products

**gift_catalog** — flag `giftCatalogEnabled` · open `__gbOpenGiftCatalog()` *(no args → could prefill search/filter/view)*

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with search/filter/view) | query, category/dept id, brand set, special∈{sale,logo}, sort∈{popular,priceLow,priceHigh,name}, view∈{catalog,proposals,custom,current} | R/L | auto |
| add_to_proposal | product id + decoration | L | auto |
| apply_promo | promo code | L | auto |
| save_proposal | draft, or save‑to‑account `{accountId, oppId}` | L / M | confirm (remote) |
| email_proposal | → proposal_email | O | confirm |
| open_checkout | → proposal_checkout (preview‑only) | L | auto |

**mockup_studio** — flag `mockupStudioEnabled` · open `__gbOpenMockupStudio(batchId?)` — **already accepts** a batch id (+ `PRODUCT_GENERATION_OPEN_BATCH_EVENT` retarget — the cleanest existing deep‑link precedent)

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (fresh or on a batch) | `batch_[a-f0-9]{32}` | R | auto |
| select_product / toggle_option | product id, group key + option id | L | auto |
| upload_logo | image File | L | auto |
| generate_batch | selection + logo | M | confirm |
| open_batch / cancel_batch / delete_batch | batch id | R / M / M | auto / confirm |
| download_one / download_all | job id(s) | O | confirm |
| open_catalog_admin | — | admin | admin |

**image_preview** — flag `imagePreviewEnabled` · open `__gbOpenImagePreview({url,dataUrl,itemLink,orderId,customerId,pending})` + `__gbImagePreviewReplace({url,dataUrl})` — **already fully parameterized**

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with image) | url / dataUrl + order/customer ids | R | auto |
| replace_image | `{url,dataUrl}` | R | auto |
| launch_submit_proof | payload → submit_proof | O | confirm |

**submit_proof** — flag `submitProofEnabled` · open `__gbOpenSubmitProof({image,orderId,customerId})`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with image + order) | image, orderId, customerId | R | auto |
| submit_proof | full proof payload (items, artist, rep, orderType, flags, notes) | M/O | confirm |

**gift_customize · proposal_checkout · mockup_catalog_admin · golfball_viewer · grass_mockup** — child surfaces (no global opener). `proposal_checkout.place_order` is a **stub** (no remote write, preview‑only). `mockup_catalog_admin` is `__ADMIN__` build‑only + backend admin session.

### 5.4 Orders, calendar, campaigns, shelf, notifications, settings

**margin_calc** — flag `marginCalcEnabled` · open `__gbShowMarginCalcModal()` — **read‑only, no network.** Verbs: open, set_fields (any two of cost/price/margin/markup/profit + qty). Effect R, gate auto.

**order_calendar** — flag `calendarEnabled` · open `__gbOpenOrderCalendar({orderID,calendarUrl,defaultApproval,defaultCommitment,availableCalendars})`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with order + dates) | orderID, calendarUrl, default dates | R | auto |
| **commit_dates** | approval date, commitment date | **$** | **hard** |

**charge_refund** — flag `chargeEnabled` · open `__gbShowChargeModal(ctx)`

| Verb | Inputs | Effect | Gate |
|---|---|---|---|
| open (with order ctx) | `{orderId,userId,pageTotal,captured,diffAmount,…}` | R | auto |
| **run_charge** | amount, reason∈{Order Edit,Shipping Upgrade,Other}, note, billingID(s) | **$** | **hard** |
| refund | — | (disabled today) | — |

**order_edit** — flag `orderEditEnabled` · open `__gbShowOrderEditModal()` — opens a server‑side editable order session on the real cart. `open` is `$` (starts a session); the cart iframe does the mutation. Gate **hard**.

**campaign_manager** — flag `campaignManagerEnabled` · open `__gbOpenCampaignManager(contacts)` — editor mutates‑local; **run** is `O` (bulk email/task/call/code). Gate: build=auto, run=confirm.

**actions_shelf** — flag `actionsShelfEnabled` · the hub. Its buttons are just entry points to the surfaces above; each inherits that surface's effect/gate. Two silent‑write shelf actions to flag: **find_phone** (writes contact via `Contact/Update.ajax` — M) and **apply_last_note** (posts an order note — M) — both currently fire from a single keypress with no confirm.

**notifications** — flag `notificationsEnabled` · open `__gbShowNotificationsModal()` — the admin‑push surface itself. `run_action` on a notification is the executor entry (§2). Effect depends on the carried payload.

**settings surfaces (no modal — direct commands):**

| Verb | Target registry | Effect | Gate |
|---|---|---|---|
| set_feature | `featureRules` (27 flags, `flags.js`) | L | auto |
| set_setting | `settingRules` (`devSettings.js`; bool/number/select/string with ranges & enums) | L | auto |
| set_theme_preset | `themeVariants` (8: dark, midnight, light, cream, nord, dracula, rose, tokyo) | L | auto |
| set_theme_palette | 4 hex colors → brand vars | L | auto |
| set_scale | `SCALE_CATEGORIES` (modals, popovers, toasts, shelf, popup, editor; 0.5–1.5) | L | auto |
| share_settings | `shareScopes` (`presetScopes.js`) | O | confirm |
| share_email_template | template id | O | confirm |
| submit_ticket | kind∈{bug,feature}, title, description, refs | O | confirm |

---

## 6. Proposed command vocabulary

Organize verbs into three families. Everything above collapses into this set.

### `state` — set a value (flat envelope, auto‑run)
`set_feature` · `set_setting` · `set_theme_preset` · `set_theme_palette` ·
`set_scale`
> **Already shipped** except `set_scale` (trivial add).

### `open` — launch a surface, optionally pre‑configured (envelope + `params`)
`open` with `target ∈ {crm_search, task_list, quick_task, call_log,
crm_create_contact, watch_list, email_preview, text_preview, quick_order_note,
gift_catalog, mockup_studio, image_preview, submit_proof, order_calendar,
charge_refund, margin_calc, notifications, editor_templates}` and a
per‑target `params` schema (§4).
> **`open_modal` (no params) ships today.** Parameterized `open` is Phase 1.

### `do` — perform an operation (envelope + `params`, effect‑gated)
- **outward‑facing (confirm):** `create_settings_link`, `create_template_link`,
  `submit_ticket`, `send_email`, `run_campaign`, `export_csv`
- **mutates‑remote (confirm):** `create_task`, `complete_task`, `push_task_date`,
  `log_call`, `create_contact`, `categorize_case`, `apply_order_note`,
  `find_phone`, `save_proposal`, `submit_proof`, `generate_mockup_batch`
- **read‑with‑consent (grant):** `read_templates`, `read_notes`,
  `read_search_results` (via `request_data_access`)
- **money‑critical (hard gate, §8):** `run_charge`, `commit_order_dates`,
  `start_order_edit`
> The three `share_*`/`submit_ticket` verbs ship today. The rest are Phase 2–4,
> each needing its surface to expose an imperative hook.

Every `do` verb declares its **effect class** in the registry, and the executor
applies the §3 gate automatically — the caller never chooses the gate.

---

## 7. Phased build plan (value × safety ordered)

| Phase | Scope | Why first | Risk |
|---|---|---|---|
| **0 — ship what exists** | Wire `set_scale`; document the eight live commands for the AI + notification authors; add the confirmation copy already in place. | Zero new surface area; closes the loop between the two callers. | none |
| **1 — parameterized `open`** | Add `open` + `openParamRules` registry; teach the 5 arg‑less openers (crm_search, task_list, crm_create_contact, watch_list, gift_catalog) to accept initial state; route through existing openers that already take params. | Delivers "AI opens CRM and runs a search," "open task list filtered to today," "notification opens image preview on this order" — the headline asks — with **read‑only/local** effect only. | low |
| **2 — in‑surface `do` (read/local)** | A `__gbSurfaceDispatch(id, op, params)` each mounted modal registers; wire read‑only ops (apply another filter, select rows, switch view) on already‑open surfaces. | Lets the AI *drive* a surface, not just launch it. Still no remote writes. | low |
| **3 — `do` (mutates‑remote, confirm)** | create_task, log_call, categorize_case, apply_order_note, create_contact, generate_mockup_batch, save_proposal. Each confirm‑gated via §3; admin push may pre‑authorize opted‑in ones. | The genuinely useful automation. Bounded by the confirm gate and per‑target schemas. | medium |
| **4 — money‑critical (hard gate)** | run_charge, commit_order_dates, start_order_edit — **in the vocabulary but never AI‑auto‑runnable**; admin‑only; every execution a fresh explicit human click; add the missing admin gate at the call sites. | Complete the API surface without ever letting a payload move money unattended. | high — see §8 |

---

## 8. Money‑critical & security appendix

The inventory found five surfaces that move money or commit a live CRM state,
**none of which read an admin gate at the call site today** — only their feature
flag + page context:

- `charge-modal.js` **run_charge** — a real card debit (USIO/CONSUMER).
- `submitOrderDates.js` **commit_order_dates** — writes approval/commitment dates
  to the live order via ASP.NET postback.
- `order-edit-modal.js` **start_order_edit** — opens a server‑side editable order
  session on the real cart.
- Campaign **run** — bulk outbound against a real audience.
- Shelf **find_phone** / **apply_last_note** — silent contact/order writes from a
  single keypress.

**Recommendation (decision point — confirm before Phase 4):**
1. **Money‑critical verbs are in the vocabulary but never auto‑runnable** by
   either caller. Every execution requires a fresh, explicit human click on a
   preview that shows the exact amount / dates / order — no "remembered"
   authorization, no admin pre‑authorize, no AI auto‑run. (This is option (a)
   from the earlier question, and I recommend it over excluding them entirely so
   an admin setup‑query can still *prepare* a charge for the user to approve.)
2. **Add an explicit admin/consent gate at those call sites.** Right now the only
   admin machinery is `gbRemoteSettingsPolicy`, which governs setting visibility,
   not these handlers. Money verbs should require the same dashboard‑admin proof
   the mockup catalog authoring already uses (`catalogAdminJson`,
   `credentials:'include'`, server authorizes on the admin session).
3. **The anti‑spoof envelope check is load‑bearing here.** Because the visible
   `label` must match the executed `payload`, a money‑critical card can never
   show "charge $5" while executing "charge $500". Keep every money verb on the
   wrapper form so that guard always runs.

The rest of the API inherits the containment that already exists: closed command
set, per‑target param schemas, no raw storage keys, no shipped code, receipt
idempotency, and the `request_data_access` grant for anything that reads user
data.

---

## Appendix A — file map (substrate)

| Concern | File |
|---|---|
| Envelope / wire format | `lib/action-language.js`, `src/lib/actionLanguage.js` |
| Command→handler runtime | `lib/action-runtime.js` |
| Registry validation + effect | `src/lib/helpActionCore.js` |
| Execution + receipt ledger | `src/lib/helpActions.js` (`__gbExecuteActionPayloadOnce`) |
| AI card UI + data‑access grant | `src/ui/components/HelpCompanion.jsx` |
| Notification executor | `src/vanilla/main.js` (`__gbRunNotificationAction`, `GBActionRuntime`) |
| Notification payload shape | `lib/notifications-store.js`, `lib/notifications-poll.js` |
| Registries | `src/lib/flags.js`, `src/lib/devSettings.js`, `src/lib/theme.js`, `src/lib/scales.js`, `src/lib/presetScopes.js` |
| Open‑function contracts | `src/content/*.jsx`, `src/vanilla/main.js` |
| Modal metadata | `docs/inventory.json` |

## Appendix B — the 26 surfaces at a glance

CRM/tasks: `crm_search`, `query_builder`*, `crm_create_contact`, `quick_task`,
`quick_task_popover`*, `task_list`, `call_log`, `watch_list` ·
Email: `email_preview`, `text_preview`, `proposal_email`*, `email_runner`*,
`quick_order_note`, `editor_templates`, `editor_notes`, `editor_signature` ·
Gifting/products: `gift_catalog`, `gift_customize`*, `proposal_checkout`*,
`mockup_studio`, `mockup_catalog_admin`†, `grass_mockup`*, `golfball_viewer`*,
`image_preview`, `submit_proof` ·
Orders/system: `margin_calc`, `order_calendar`, `charge_refund`, `order_edit`,
`campaign_manager`, `notifications`, `actions_shelf`

`*` child surface (no global opener) · `†` admin‑only build.
