# Features section + Action Shelf rework

Goal: one place to control, per feature, **whether it's on**, **which surfaces
it appears on** (popup / action shelf), and **which pages** its shelf action
shows on — in a compact, information-rich UI with no jarring state changes.
Plus a forward slot for **custom code-block actions** on the shelf.

## The problem (today)

- A feature's popup-vs-shelf binding is **hardcoded in 3 disconnected places**:
  the `__gbShow*`/`__gbOpen*` popup global (its content script), the
  `ALWAYS_ACTIONS` array (`actions-shelf.jsx:634`), and per-page
  `registerXAction()` gating (`actions-shelf.jsx:518-557`).
- The only user control is the coarse master flag (`featureFlags`, a plain
  `key:bool` map) — no "show in shelf vs popup", **no per-page control**.
- The Features section is full-width `FeatureSpotlight` rows
  (`SettingsPanel.jsx:1487`) — one master toggle each; too tall now that there
  are many features.

## The model — one registry + one config

### 1. Capability registry (new, pure) — `src/lib/features/featureRegistry.js`
Central, static declaration of what each feature CAN do (derived from the 3
hardcoded places). Per feature:
```js
{ key: 'callLogEnabled', id: 'callLog', name, desc, icon, section,
  surfaces: {
    popup: { global: '__gbShowCallLogModal' } | null,     // can be a popup
    shelf: { actions: [{ id:'gb-call-contact', label, icon }], // shelf action(s)
             pages: ['contact','account'] }               | null, // default pages
  } }
```
This is the single source of truth that replaces reading `ALWAYS_ACTIONS` +
`registerXAction` + globals separately.

### 2. Per-feature user config (new store) — `src/lib/features/featureConfig.js`
Bag `chrome.storage.local.featureConfig`: `{ [key]: { showInPopup, showInShelf,
pages: string[] } }`. Defaults derived from the registry (a popup-only feature
can't be shown-in-shelf, etc.). Reuses the exact `useDevSettings` pattern
(`devSettings.js:571`) — async hydrate + `chrome.storage.onChanged` resync — and
rides the existing `GB_FEATURE_FLAGS` broadcast the shelf already watches
(`actions-shelf.jsx:735`). Master on/off stays in `featureFlags` (unchanged) to
avoid a migration; `featureConfig` is a sibling bag.

Page ids come from `PAGE_TYPE` (`constants.js:11`): order · contact · account ·
opportunity · order-index (+ `*` = any). Labels via `listSchemas()`.

## The UI

### A. Features section — compact expandable rows
Swap `FeatureSpotlight` → an **ExpandableFeatureRow** (built on the existing
`ExpandableFeature.jsx`, already used for Power Automate at
`SettingsPanel.jsx:1540`):
- **Collapsed** (dense, default): icon · name · a status chip (`Popup`,
  `Shelf`, `3 pages` — where it currently shows) · master `Switch`. Many fit
  per screen → reclaims vertical space.
- **Expanded** (only when enabled, animates in place):
  - `Show in popup` toggle — only if `surfaces.popup`.
  - `Show in action shelf` toggle — only if `surfaces.shelf`.
  - `Pages` chip multi-select — only when shown-in-shelf (reuses the Custom
    Pages scope pattern, `SettingsPanel.jsx:1602`).
- Grouped by `section` as today. No layout jump: expand/collapse + sub-toggles
  fade/height-animate; the status chip updates live.

### B. Action Shelf registry — a feature × page grid
A dedicated section (its own `CollapsibleSection`): rows = shelf-capable
features, columns = the 5 pages, cells = a small toggle for "show this action
on this page". At-a-glance control of what appears where — the exact gap today.
Reads/writes the same `featureConfig.pages[]`, so it and the per-feature Pages
chips stay in sync.

### C. Custom actions (future slot, scaffolded now)
A `+ New custom action` card in the shelf section. A custom action =
`{ id, label, icon, pages[], code }` stored in `featureConfig.customActions[]`.
The editor reuses the workflow **code engine** (`src/lib/codeEngine/*` —
CodeAutomationPanel/BlocksView/executor) to author a block that runs against
`page.*`/`actions.*`; the shelf registers it via
`actionRegistry.register({ id, label, icon, handler: run(code) })`. Ship the
data shape + a disabled "coming soon" affordance now; wire the editor later.

## Make the shelf honor the config
`actions-shelf.jsx`: replace the imperative `ALWAYS_ACTIONS` + `registerXAction`
gating with a data-driven pass — for each registry feature that is
`enabled && showInShelf && (pages ∋ currentPageType or '*')`, register its
action(s) (handlers unchanged, just their gating). Re-runs on the same
`featureFlags`/`featureConfig` `onChanged` the shelf already listens to.

## Phases
1. **(build now, pure + tested)** `featureRegistry.js` (capabilities) +
   `featureConfig.js` (defaults/merge/`featureShowsOnPage`) — no behavior change.
2. Features section → compact expandable rows with popup/shelf/pages sub-controls
   (reads/writes `featureConfig`).
3. Action Shelf registry grid section (feature × page).
4. Data-drive `actions-shelf.jsx` from `featureConfig` (per-page control takes
   effect). Carefully — this governs what shows on live CRM pages.
5. Custom code-block actions (editor + registry sink) — scaffolded in 1–3.

No feature is removed; the master flags keep working; the new config only adds
surface/page control on top.
