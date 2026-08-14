# Custom Actions — authoring plan

Let a rep write a small script (the same code-blocks engine workflows use) and
have it appear as an **Action Shelf** item (and optionally a popup button). The
canonical example: *"create a script that makes 5 tasks"* → it shows up in the
action menu on contact pages; clicking it runs the script against the live page
(behind the same confirm gate workflows use).

This mirrors the existing **template pages**: a sidebar-listed sub-page in the
Manage window whose *body* is the Code/Blocks editor instead of a rich-text box,
plus **title / description / icon** inputs and a **page-type** selector chosen up
front (which scopes what `page.*` exposes, exactly like workflows).

---

## 1. The two things we build on (already exist)

**Template-page pattern** (`src/pages/TemplateEditor.jsx` + `src/content/editor-templates.jsx` + `src/content/editor-bridge.jsx`):
- The "Manage" window (`editor.html`) is sibling host `<div>`s (`#ed-form`, `#ed-note-form`, `#ed-settings`, …) + a persistent sidebar. A plain-JS **bridge** (`editor-bridge.jsx`) owns view-switching (toggling a `hidden` class), `chrome.storage.local` persistence, and a `window.__gb*` API the React roots call.
- Each page auto-saves (debounced 500 ms → `window.__gbSaveTemplate(build())`); no Save button. Header = shared `EditorHeader` (icon tile · title · type badge · enable switch · Delete). Fields = `Field`+`Input`/`Segmented`. Body = `RichTextEditor`.
- Sidebar (`editor-sidebar.jsx`) lists items per tab and opens one via `window.openTemplate(id)`.

**Code engine** (`src/lib/codeEngine/*` + `src/ui/components/CodeAutomationPanel.jsx`, `BlocksView.jsx`, `CodeDocsSidebar.jsx`, `CodeVarEditor.jsx`):
- `CodeAutomationPanel` is a **controlled display** — the parent owns code + sim state and feeds it `value/onChange`, `blocks/errors/blockCount` (from `translateProgram(source)`), `view/onView`, `onContext`, `bindings`, and the sim outputs `trace/runningId/done/result/error/simStatus`. It renders the Code⇆Blocks switch and cross-fades `CodeVarEditor`↔`BlocksView`.
- `simulateProgram(source, page, { run, user, executor })` → `{ ok, trace, calls, error, result }`. Dry when `executor` is null; performs real writes when an executor is passed. Browser realm = `makeSandboxRunner({ exec: runInSandbox })` (opaque-origin iframe — works in the Manage window with **no CRM page present**).
- `page` preserves the full schema extracted by `runEngine(document)` — including orders, items, activities, proofs, stats, account, ids, and future registered fields. Workflows and live custom actions share one page-model shaper; only `contact`, `contacts`, and `tasks` receive execution-control overlays. Authoring uses a representative sample fixture per page type. `page.tasks.open[i].complete()`, direct approved task-field assignment, and `page.contact.field = v` all use grouped, confirm-gated writes.
- Contracts (all **confirm**-gated today) include email, task, call, contact,
  opportunity, and catalog proposal operations. In particular,
  `ensureOpenOpportunity`, `createProposalFromOrder`, and `createProposal`
  let a contact action reuse or create an opportunity and save a fully editable
  Gift Catalog proposal from either the newest reusable order or current SKUs.
  `APPROVED_CONTACT_FIELDS` and `APPROVED_TASK_FIELDS` remain explicit
  allowlists. A custom action reuses the same `makeExecutor(deps)` and inherits
  these gates.
- **No raw-DOM page context exists today.** Page types are fixed to order/contact/account/opportunity. A read-only DOM escape hatch (`h.dom/h.domAll/h.domText/h.doc`) exists in `page-engine/code-runtime.js` but is NOT on the workflow `page` surface — we'd wire a `page.dom` for the "custom" type.

---

## 2. Data model

New store `chrome.storage.local['gbCustomActions']` (array), with a `customActions.js` lib mirroring `customItems.js` (load/save/normalize/CRUD). One record:

```js
{
  id: 'ca_<base36>',          // stable
  name: 'Create 5 tasks',     // title  → shelf/popup label
  description: 'Adds five follow-up tasks to this contact', // → shelf hint
  icon: 'check',              // key from the `I` icon registry (icon picker)
  pageType: 'contact',        // 'order' | 'contact' | 'account' | 'custom'
  source: '…code…',           // the script (Code/Blocks share this string)
  entryPoints: [],            // optional provider ids / CSS selectors
  enabled: true,              // master on/off
  pages: ['contact'],         // shelf page scope — defaults from pageType, editable in the table
  showInShelf: true,
  showInPopup: false,
  updatedAt: 1690000000000,
}
```

- Custom actions carry their **own** `pages/showInShelf/showInPopup` (NOT `featureConfig`, which is keyed by feature flags). This is exactly why they belong in the Settings *table* and built-in features do not — the table edits these fields directly.
- `entryPoints` is optional. Values such as `modal:task-list` or
  `.gb-task-list-modal` keep the action hidden until that surface is mounted.
  Multiple values are OR-matched.
- Registers into `presetScopes.js` (`keys: ['gbCustomActions']`) so it rides settings export/import like templates.

---

## 3. Where it lives (mirror the template pages)

**A new Manage-window sub-page**, reached two ways:
- The **Settings → Custom Actions** table (built already) — its `+` opens a **blank** action; a row's edit pencil opens that action.
- A new **"Actions" tab** in the editor sidebar (optional but consistent — makes custom actions first-class alongside Templates/Notes).

Wiring (copy the template recipe):
1. `editor.html`: add `<div class="ed-form hidden view-animate" id="ed-action-form"></div>` + `<script src="react-dist/content/editor-actions.js"></script>` (after the bridge).
2. `src/content/editor-actions.jsx`: mount recipe (idempotent guard, `ensureTheme`, `createRoot(#ed-action-form)`), installs `window.__gbOpenAction`.
3. `editor-bridge.jsx`: `customActions` array + storage key; `openAction(id)` / `newAction()` / `deleteActionById(id)` / `applyActionPatch(rec)`; expose `window.openAction/newAction/__gbSaveAction/__gbCurrentAction`; hide/show `#ed-action-form` in the view switch.
4. `editor-sidebar.jsx`: an "Actions" section/tab that lists `gbCustomActions` and calls `window.openAction/newAction`.

The **Settings `+`** simply calls `window.newAction()` (and fix the current icon bug: `IconBtn` takes `icon={<I.plus/>}` as a **prop**, not children — that's why it renders blank).

---

## 4. The authoring sub-page (`src/pages/CustomActionEditor.jsx`)

Layout, top → bottom (centered `.ed-form` column like TemplateEditor, but the body fills like the workflow editor):

1. **Header** — reuse `EditorHeader`: chosen icon tile · `name` · `pageType` badge · enable switch · **Delete**.
2. **Meta row** — `Field`s:
   - **Title** (`Input`).
   - **Description** (`Input`/`Textarea`, one line) → becomes the shelf action's hint.
   - **Icon** (new `IconPicker` — a compact grid of curated `I` glyphs; stores the icon key).
   - **Page type** (`Segmented`: Order · Contact · Account · Custom). Changing it: (a) sets the sample fixture + `page.*` scope, (b) sets the CodeVarEditor `typeId`, (c) resets the default `pages` for the shelf (`contact`→`['contact']`, `custom`→`['*']`).
3. **Body** — `CodeAutomationPanel` (Code⇆Blocks), filling to the bottom, with a **contextual right sidebar** = `CodeDocsSidebar` (Code) — same as workflows. Source is auto-saved (debounced) via `window.__gbSaveAction(build())`.
4. **Test toolbar** (trimmed workflow `TopBar`): a **"Simulate"** button that runs `simulateProgram(source, samplePage, { run: makeSandboxRunner({exec: runInSandbox}), user })` **dry** and lights up the blocks/trace — no writes, no live page needed. (No audience/real-run here; the real run happens from the shelf.) A page-type-appropriate **sample fixture** drives it.

Sample fixtures (`src/lib/codeEngine/samplePages.js`): representative `{ contact, tasks, … }` per page type so blocks render and helpers resolve during authoring.

---

## 5. Page-type scoping + the "custom" mode

- **order / contact / account** → `page.*` scoped to that type (same object the workflow engine builds). At authoring time it's the sample fixture; at **run** time it's `runEngine(document)` of the live page. Default shelf `pages` = that type.
- **custom** → runs on **any page** with `page.*` (where available) + the gated `actions.*` library. Default shelf `pages` = `['*']`.
  - **Raw DOM access is DEFERRED (architectural).** Scripts execute inside an opaque-origin sandbox iframe (read-only, isolated) so they cannot query the live CRM DOM at run time — even a live run records intent in the sandbox and replays writes content-side. Giving a custom action real `page.dom(...)` access would require running it **content-side, outside the sandbox** (arbitrary code with page + network access) — a security-posture change held for an explicit decision. Until then "custom" = any-page + `actions.*`/`page.*`.

### Entry-point context

Mounted tools can register a lazy, serializable context provider through
`customActionEntryPoints`. A matching action receives:

```js
page.entryPoint       // first matching { id, label, token, data }
page.entryPoints      // every matching provider/selector
```

CSS-only matches receive `data: null`; registered providers can supply
structured data without granting raw DOM access. Task List registers
`task-list`, `modal:task-list`, and `.gb-task-list-modal` aliases and exposes
all loaded task rows plus unique contacts, current filters, visibility, and
selection state. The provider snapshot is resolved only after the action is
clicked.

Task List rows are available as both `page.entryPoint.data.tasks` and the
convenience collection `page.tasks.items`. Assigning `subject`, `description`
(`body` alias), `liveDate`, `dueDate`, `categoryId`, or `priority` directly on
a row stages one grouped task update. Snake-case aliases are accepted. The
same proxy is installed on workflow `page.tasks.open` / `done`, so code can
move between custom actions and workflows without changing its task logic.
See `docs/examples/task-list-live-date-action.js` for a complete bulk date
action.

For bulk task creation, `actions.createTask` accepts optional `contactId`,
`contactName`, and `accountId` routing fields. The remote-effect confirmation
gate is unchanged; routing fields select the target context and are not written
into the CRM task template.

---

## 6. Registration + execution (the shelf)

`actions-shelf.jsx` already data-drives from a registry. Add custom actions alongside:
- Load `gbCustomActions`; keep live via `storage.onChanged`.
- In `syncContext(pageType)`, for each **enabled** action where `pageApplies(rec.pages, pageType)`, `rec.showInShelf`, and any configured entry point is active, register a shelf action `{ id: 'ca_…', label: rec.name, icon: iconFor(rec.icon), hint: rec.description, smartFor: rec.pages, handler: runCustomAction(rec) }`.
- **`runCustomAction(rec)`** (the gated, money-touching part):
  1. Freshly extract `runEngine(document)` and shape it through the shared full-schema page model.
  2. Dry preview: `simulateProgram(rec.source, page, { run: makeSandboxRunner({exec: runInSandbox}), user })` → `planRun(trace)`.
  3. If it has effects → show a **confirm** (reuse the workflow `ConfirmRunModal` / a lightweight page-mounted confirm) summarizing e.g. "Will create 5 tasks."
  4. On confirm → `simulateProgram(rec.source, page, { …, executor: makeExecutor(liveDeps) })` where `liveDeps` = the real writers (`emailSender.sendEmail`, `submitQuickTask`, `submitCallLog`, `completeTaskById`, `updateTaskById`, `crmUpdateContact`) + `ctx` ids from the page — the exact wiring `makeContactExecutor` already does.
- **Popup**: actions with `showInPopup` join the popup Tools list; the button launches via the existing `GB_RUN_SHELF_ACTION` bridge (already built), which runs the registered handler on the tab.

The Settings **Custom Actions table** manages `enabled` / `pages` / `showInShelf` / `showInPopup` per action (the grid's `onToggleCell` writes `rec.pages` via `togglePage`).

---

## 7. Build phases

- **5a — Model + store (pure, tested):** `customActions.js` (load/save/normalize/CRUD, `ca_` ids) + `samplePages.js` fixtures + `presetScopes` entry. Unit tests.
- **5b — Icon picker + editor page:** `IconPicker.jsx`; `CustomActionEditor.jsx` (header, meta, page-type, `CodeAutomationPanel` body, docs sidebar, Simulate toolbar, auto-save). `EmptyState`.
- **5c — Manage-window wiring:** `editor.html` host+script, `editor-actions.jsx`, `editor-bridge.jsx` globals + view switch, sidebar "Actions" tab.
- **5d — Settings table + button:** fix `IconBtn` icon; refactor `FeatureShelfGrid` to take custom-action records; list `gbCustomActions`; `+`→`newAction()`, row→`openAction(id)`, delete.
- **5e — Shelf registration + gated execution:** `actions-shelf.jsx` loads + registers custom actions; `runCustomAction` dry→confirm→execute; page-mounted confirm. **Money-touching — do carefully, held for explicit go-ahead.**
- **5f — Popup surface (optional):** custom actions with `showInPopup` in the popup Tools.

Build the source, `npm run build`, keep the suite green, and commit per phase.

---

## 8. Decisions to confirm before building

1. **Editor home:** Manage-window sub-page + a new sidebar **"Actions" tab** (mirrors templates), with the Settings table `+`/rows as the other entry. OK?
2. **"Custom" mode = read-only DOM** (`page.dom`) + gated `actions.*` writes (recommended, safe). Or do you want true raw read+write DOM behind a hard gate?
3. **Execution:** one click → **confirm dialog** for any remote/money effect (reuse the workflow confirm), then run. OK?
4. **Scope config** lives on the action record (`pages/showInShelf/showInPopup`), edited in the Settings table + the row's editor. OK?
5. **Icon set:** a curated subset of the existing `I` glyphs. OK, or do you want image/emoji icons too?
