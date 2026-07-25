# Code‑First Automation Engine — Architecture & Phase 1

> Replace the block‑based Campaign Manager with a **code‑first** engine: you
> write ordinary JS (`if`/`for`/`switch`, action calls), it renders as blocks
> and branches with the existing run/simulation animation, and every extension
> action is a callable object‑oriented contract. The JSON payload API and this
> engine are two front‑ends onto **one internal control surface**.

---

## 0. TL;DR — the pieces already fit

The research found that **most of the engine already exists**; the redesign
mostly *rewires* it, and adds one new translator.

| Concern | Today | Redesign |
|---|---|---|
| **Execution** | `runCampaign()` (pure, callback‑driven) walks a flat `steps[]` and calls `runStepAction()` per step | keep the engine; the "steps" now come from parsed code, not a hand‑built list |
| **Actions** | `runStepAction` dispatches kind→`sendEmail`/`submitCallLog`/`submitQuickTask`, **with a `dryRun` short‑circuit before any side effect** | promote this into a **contract registry** shared with the JSON verbs |
| **Sandbox** | custom code runs in an opaque‑origin iframe; **the code only *decides*, the engine *executes*** | keep exactly — this is the security spine |
| **Simulation / animation** | two‑phase evaluate→replay + a `pending/running/ran/skipped/failed/cut` state machine, keyed by a `{stepId,status}` trace | keep; re‑key the trace by **AST node id** |
| **Code box** | `CodeVarEditor` (CodeMirror 6, JS highlight/lint/autocomplete) for variable code | reuse as the authoring surface, extend autocomplete with the action library |
| **Authoring** | flat `steps[]` + `parentId`/`branch`/`group`, rendered as SVG connectors — *the confusing part* | **replaced**: code is the source of truth; blocks are a rendered projection of its AST |

**The one genuinely new thing:** a **code ↔ blocks translator** that walks the
editor's JS syntax tree and renders it as the block/branch view, tied to the run
trace so the same animation lights up the blocks.

**The one hard limit the research surfaced:** the page engine is strictly
**read‑only DOM→JSON** — there is no object construction anywhere. Email/task/call
for the current contact work with existing contracts (Phase 1). The *complex*
chain you described — create opportunity → build item objects → proposal builder
→ execute on account → payment link → proposal template → email → send — is
**partly net‑new** (see §5); two links in it exist only as UI stubs today.

---

## 1. What we keep (the reusable substrate)

- **`src/lib/campaign/engine.js` `runCampaign({campaign, audience, lookupTemplate,
  deps, control, on})`** — pure logic; the UI drives it via injected `control`
  (pause/stop) and `on` callbacks (`contactStart`/`stepResult`/`contactDone`/
  `progress`/`complete`). Audience ordering, pacing/jitter, suppression, send cap
  all live here and are authoring‑agnostic.
- **`src/lib/campaign/actions.js` `runStepAction(step, template, ctx, {dryRun})`**
  → normalizes every action to `{ ok, transport?, detail?, error?, kill? }`.
  **Dry‑run returns `{transport:'dry', detail:'Would …'}` before touching
  anything.** This uniform return + the dry‑run gate is the contract shape the
  whole engine standardizes on.
- **The sandbox** — `src/lib/page-engine/sandbox-bridge.js` +
  `src/sandbox/sandbox-eval.entry.js`: user code runs in an opaque‑origin iframe
  (MV3's only `unsafe‑eval` context) with **no `chrome`, no DOM**; privileged
  calls are proxied out as `hcall` and serviced against an explicit allowlist.
  Today custom code returns only a control signal (`'kill'`); **the engine does
  the side effects.** This is the boundary we extend, not replace.
- **The simulation/run machine** — `src/modals/CampaignManager.jsx`: two‑phase
  `startSim()` (evaluate with `dryRun:true`, collect a `trace` of
  `{stepId,status,reason}`, then replay at 750 ms), the per‑unit state machine
  (`pending/running/ran/skipped/failed/cut`), the full‑audience row machine
  (`queued/sending/sent/stopped/skipped/suppressed/failed`), and the CSS
  keyframes. **All of it keys off step ids + status** — so it transfers to the
  new view by re‑keying on AST node ids.
- **`CodeVarEditor`** (`src/ui/components/CodeVarEditor.jsx`) — a self‑contained
  CodeMirror 6 surface: `{value, onChange, typeId, varNames, placeholder,
  hideActions}`, JS highlight, `ctx.`/`vars.`/`h.` autocomplete via a
  `completionSource`, inline Lezer‑based lint, "test on page". Reused verbatim;
  the action library is added to the completion namespaces.
- **The action contracts** (§4) and **the JSON payload API** (`openParamRules.js`,
  `helpActions.js`, `action-language.js`, `action-runtime.js`).

## 2. What we replace

The block‑authoring model: a flat `steps[]` where structure is *inferred* from
array order + `parentId` (branch child), `branch` (a flag, not a kind), and
`group` (mutual exclusion) — then drawn as SVG connectors in the `Timeline`
render loop. Three implicit systems layered on one list is exactly the
"confusing bridge/grouping" to retire. **Code makes the structure explicit;** an
`if` is a branch, a `for`/`for‑of` is a loop, a `switch` is cases — no
`parentId`/`group` bookkeeping.

## 3. The unified model

```
 AUTHOR                 VISUALIZE                 EXECUTE                    ANIMATE
 ┌────────────┐  Lezer  ┌──────────────┐  run in  ┌──────────────────┐  trace  ┌──────────────┐
 │ CodeVarEd. │────────▶│ AST → block  │─────────▶│ sandbox runs code│────────▶│ existing sim │
 │ (JS text)  │  syntax │ IR (node ids)│  sandbox │ actions.* proxied│ {nodeId,│ /run machine │
 │            │◀────────│ StepCard view│          │ → gated registry │  status}│ lights blocks│
 └────────────┘         └──────────────┘          └──────────────────┘         └──────────────┘
        code is the source of truth; every layer is a projection of it
```

- **Author** — you type JS in the code box. Same editor as image‑variable code.
- **Visualize** — the editor's **Lezer JS syntax tree** (already parsed for
  highlight/lint — no new parser dependency) is walked into a **block IR**: each
  action call and control‑flow node gets a stable **node id**, rendered with the
  existing `StepCard`/connector visuals. `if`→branch, `for`/`for‑of`→loop,
  `switch`→cases, an action call → a typed block showing its **evaluate →
  execute** stages (e.g. "build email from page" → "send email").
- **Execute** — the code runs in the sandbox as an `AsyncFunction`. Injected
  `actions.*` (and `page`, `ctx`) are **proxies**: calling `await
  actions.sendEmail(email)` emits an `hcall` that the bridge routes to the gated
  contract registry. In **dry‑run** the proxy records the intended call (no side
  effect); in a **real run** it executes with effect‑class gating. Each call
  emits a trace event keyed by its **node id**.
- **Animate** — the existing sim/run state machine consumes those trace events by
  node id and highlights the corresponding blocks. `startSim()` becomes "run the
  code once with `dryRun:true` and replay the node trace"; the audience run is the
  same over every contact.

**Why this is safe:** the sandbox never gains raw side‑effect power. Code
*computes and orders* calls; every side effect leaves the sandbox through the one
`hcall`→registry chokepoint, where the effect‑class gate applies (money never
auto‑runs, outward‑facing confirms, etc.). This is the existing "code decides,
engine executes" pattern, generalized so the decision can *name* any action
instead of only returning `kill`.

## 4. The contract registry (the callable action library)

One registry, two front‑ends: a `actions.<name>(input)` call from code, and a
`command`/`target` verb from a JSON payload. Every contract declares:

```
{ name, input: <typed schema>, returns: <shape>, effect: read|local|remote|outward|money,
  gate: auto|confirm|hard, run(input, ctx, {dryRun}) → { ok, transport, detail, error, kill } }
```

The uniform return + `dryRun` flag are lifted straight from `runStepAction`.
Contracts that exist today, ready to register:

| Object | Contract (file) | Effect |
|---|---|---|
| task | `submitQuickTask({template,context})` (`submitQuickTask.js:122`) | remote |
| task | `completeContactTasks(contactId,{mode})` (`crmTasks.js`) | remote |
| call | `submitCallLog({template,context})` (`submitCallLog.js:96`) | remote |
| order note | `submitOrderNote(template)` (`submitOrderNote.js:33`) | remote |
| order dates | `submitOrderDates({calendarUrl,approval,commitment})` (`submitOrderDates.js:34`) | **money** |
| email | `sendEmail({from,to,subject,htmlBody,…})` (`emailSender.js:134`) | outward |
| email | `sendThreadReply(...)` (`emailReply.js:35`) | outward |
| proposal | `buildProposalLines` → `saveProposalToOpportunity(...)` (`saveProposal.js:574`) | **money** |
| proposal | `buildEmailSourceFromCartIds(cartIds,meta)` (`proposalEmailSource.js:149`) | read |
| proposal | `cartLinkOf(cartId)` (`proposalEmailSource.js:133`) | read |
| context | `readTaskContext()` / `readCallContext()` | read |

Two contracts must be **extracted from React handlers into lib functions** before
they can be registered: `submitNewContact(payload)` (currently inline in
`CRMCreateContact.jsx:279`) and `saveContactPhone(phone)` (a closure in
`actions-shelf.jsx:270`). Both should also be normalized onto the `fetchRaw`
bridge (they use raw `fetch` with `credentials:'include'` today).

**Naming parity with the JSON verbs.** The verb `open_modal quick_task {subject}`
opens the composer for the rep to submit; the code contract `actions.createTask(...)`
performs the write directly. Both name the same object; the difference is the
*gate* (confirm‑in‑UI vs. engine‑executed with dry‑run). The registry is where
they converge, so `send_email` the verb and `actions.sendEmail` the call resolve
to one implementation.

## 5. The object model & the construction gap

The page engine (`runEngine(document)`) surfaces read‑only, id‑bearing objects
from the current page: `account`, `contact`, `order` (+ `order.customer`,
`order.totals`, `order.items[]`), `opportunities[]`, `items[]`, `tasks`,
`activities[]`, `emails[]`. These become the first‑class objects code reads:
`page.contact.email`, `page.order.totals.total`, `for (const o of page.opportunities)`.

**But there is no object *construction* today.** The engine only projects a page
into JSON; there is no builder/factory, no write path, no "new object." Mapping
your complex chain against reality:

| Step | Status |
|---|---|
| create opportunity | **missing** — only `fetchOpportunitiesForAccount` (read); create is a UI toast stub (`GiftCatalog.jsx:3401`) |
| build item objects | data shape exists; **no public constructor** — built inline in the catalog |
| proposal builder | ✅ `buildProposalLines` / `assembleLine` |
| execute on account | ✅ `saveProposalToOpportunity` → `{cartID}` |
| payment link | ✅ `cartLinkOf(cartId)` |
| proposal → email source | ✅ `buildEmailSourceFromCartIds` |
| render template → HTML | ✅ pure `tpl*` builders, but **assembly + `{{CART_LINK}}` substitution live inside `ProposalEmailComposer`** — need extraction into `renderProposalEmail(source,{templateId}) → html` |
| append proposal HTML to an email | **missing** — today it only copies to clipboard / server‑tracks; the insert‑into‑email seam is a placeholder (`savedProposalPlaceholder()` → "Not implemented yet") |
| send | ✅ `sendEmail` |

So the middle of the chain is already callable; the **two ends** (create
opportunity, proposal‑HTML→email‑object) are net‑new. That work is **Phase 3**,
not Phase 1.

## 6. Security model

1. **Code is never eval'd with side‑effect power.** It runs in the read‑only
   sandbox; the only way to affect the world is to call an `actions.*` proxy,
   which leaves through the single `hcall`→registry chokepoint.
2. **Every side effect is gated by its effect class** at that chokepoint — the
   same matrix as the payload API. `money` contracts (order dates, proposal save)
   **never auto‑run**; they require an explicit human confirmation and, per the
   payload‑API §9, an admin gate. `outward` (send email) confirms.
3. **Dry‑run is a first‑class mode**, already modeled in `actions.js`: simulation
   runs the whole program with side effects suppressed, so a run is a faithful
   preview before anything commits.
4. **Idempotency** via the existing receipt ledger (`gbHelpActionReceiptsV1`) for
   any contract exposed to a payload; a real audience run tracks per‑contact
   completion so a re‑run doesn't double‑send.
5. **The sandbox blocklist stays a tripwire, not the boundary** — the boundary is
   that the sandbox has no `chrome`/DOM and side effects are allowlisted proxies.
   A synchronous infinite loop is still only bounded by the timeout, so the
   editor keeps the length cap + lint.

## 7. The code ↔ blocks translator

- **Parse:** walk the editor's **Lezer JS syntax tree** (already available for
  highlighting) — no runtime parser, CSP‑safe. Assign each mappable node a stable
  id derived from its source span.
- **Map a known subset to blocks:**
  - `await actions.X(...)` / `const y = await actions.X(...)` → an **action block**
    (typed, showing evaluate→execute).
  - `if/else` → **branch**; `for`/`for‑of`/`while` → **loop**; `switch` → **cases**
    (your "cases can go against arrays").
  - top‑level statements → the linear step list.
  - Anything outside the subset → a **raw code block** (rendered as a code chip,
    still executed) — so arbitrary JS never breaks the view, it just isn't
    decomposed.
- **Direction:** Phase 1 is **one‑directional (code→blocks render)** with code as
  the source of truth — this matches "natural language switched to blocks." Editing
  a block writes back to code is a later enhancement (bidirectional is the hard
  part and not required to ship).
- **NL → blocks:** the assistant emits code (it already emits action payloads);
  the same translator renders that code as blocks. So "natural language switched
  to blocks" is: AI writes JS into the box → translator shows blocks → run/sim.

## 8. Phase plan

**Phase 1 — the code/blocks view + email/task/call (your stated scope).**
1. Register the three contact/order contracts (`sendEmail`, `submitQuickTask`/
   `createTask`, `submitCallLog`/`logCall`) in the new registry with dry‑run +
   effect gates.
2. Add an `actions.*` proxy surface inside the sandbox (mirroring the read‑only
   `hcall` proxy) so code can call them; wire the bridge to the registry.
3. Build the Lezer→block IR translator for the subset above; render with the
   existing `StepCard`/connector components.
4. Emit a `{nodeId,status}` trace from the sandbox run; re‑key the existing
   sim/run state machine on node ids so the animation lights up the blocks.
5. Author in `CodeVarEditor` with action autocomplete; ship an editor mode toggle
   (code ↔ blocks). Keep `runCampaign`'s pacing/suppression/cap around the run.

**Phase 2 — conditions & control as code + object reads.** Replace the
matchEngine condition trees with `if (page.order.count > 3)` in code (the `var`
condition source already runs code, so the plumbing exists); full page‑engine
object model available; `switch` over arrays.

**Phase 3 — object construction & the proposal chain (net‑new).** Build
`createOpportunity`, an item/proposal object constructor, extract
`renderProposalEmail`, and the proposal‑HTML→email‑object seam — closing the two
gaps in §5 so the full "opportunity → proposal → payment link → email → send"
program runs.

**Phase 4 — bidirectional blocks** (edit a block → rewrite code) and persistence
migration off the old `steps[]` model.

## 9. Relation to the JSON payload API

They are the **same control surface** from two directions. A code call
`await actions.sendEmail(email)` and a payload verb `{command:'send_email', …}`
resolve to one registered contract with one effect gate. The payload API is
"serialized single calls into the registry"; the code engine is "a program of
calls into the registry." Sharing the registry keeps naming/semantics identical
(the user's "json payloads play off this internal control api with similar name
semantics") and means every safety property — effect‑class gating, receipts,
dry‑run, the anti‑spoof envelope — holds for both.

---

## Appendix — substrate file map

| Concern | File |
|---|---|
| Run engine | `src/lib/campaign/engine.js` (`runCampaign`) |
| Action dispatch + dry‑run | `src/lib/campaign/actions.js` (`runStepAction`) |
| Sim/run UI + state machine | `src/modals/CampaignManager.jsx` (`startSim`, `useCampaignRunner`) |
| Sandbox | `src/lib/page-engine/sandbox-bridge.js`, `src/sandbox/sandbox-eval.entry.js` |
| Code runtime | `src/lib/page-engine/code-runtime.js` |
| Code box | `src/ui/components/CodeVarEditor.jsx` |
| Page object model | `src/lib/page-engine/{index,extract,resolve}.js`, `src/lib/page-schemas/*` |
| Email/proposal contracts | `src/lib/{emailSender,emailReply,saveProposal,proposalEmailSource,cartSerializer}.js` |
| Payload API (shared registry) | `src/lib/{openParamRules,helpActions}.js`, `lib/action-language.js`, `lib/action-runtime.js` |
| Persistence | `src/lib/campaign/store.js` (`campaigns` key) |
