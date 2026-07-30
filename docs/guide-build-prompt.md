# BUILD PROMPT — Golfballs Extension Operator's Guide (standalone page)

> Copy everything below this line into a fresh Claude Code session in this repo.

---

Build the **Operator's Guide**: a standalone extension page (its own tab, like the playground) opened from a button in the Settings panel. It is NOT a view inside the editor and NOT help-inside-settings — it's a separate `guide.html` page.

You are bridging two assets that already exist in this repo:

1. **The design** — `docs/design-reference/guide/` — a working interactive mockup (open `Golfballs Extension Guide.html` in a browser to experience it). Its **look, layout, navigation structure, and interaction patterns are the target**. Its **written content is NOT trustworthy** — it was generated without access to the codebase and invents facts.
2. **The verified content** — `docs/content/*.json` (65 articles + 12 tutorials at control-level depth, audited against the code), `docs/inventory.json` (machine-readable feature/settings/modal inventory), and the registries `src/lib/flags.js` + `src/lib/devSettings.js`. **Every factual claim in the finished guide must come from these**, never from the design's prose. `npm run help-content` regenerates `src/lib/helpContent.js` from them with a build-breaking coverage check — use that module as the guide's data source for reference tables and search.

## The accuracy rule (why this prompt exists)

Treat the design as a **wireframe with placeholder text**. Concrete examples of what it gets wrong, so you calibrate:

- Its Query Builder page invents fields ("Industry", "Employee range", "Customer type", "LinkedIn URL", "City"). The real fields (see `docs/content/crm-contacts.json` → `query-builder`): Record Type, Sales Rep, Role, Pod ID, Contact/Account Name, Account ID, Email, Phone, Order Count, Last Order Date, Next Task Date, Prior Year Revenue, YTD Revenue.
- Its New Contact form shows Job title / Address / City / Country / LinkedIn. The real form: account search + first name, last name, email, phone, company (`new-contact` article).
- Its call-log demos use invented categories ("Callback requested", "Discussed pricing"). The real 24-category list is in the `call-log` article.
- It never documents the real keyboard shortcuts (Ctrl/Cmd+K/X/M/Q, Shift×2, the `/` composer grammar) — see `keyboard-shortcuts` and `quick-task` articles.

**Process per page:** take the design page's *structure* (which TourBoxes, which demos, what order), then rewrite every sentence, list, table, demo label, sample value, and step caption from the matching `docs/content` article(s). When the design demos a flow the articles describe differently, the articles win. When unsure, read the actual source file (the articles cite surfaces; `docs/inventory.json` maps modal → file).

## Architecture

- **Page**: new top-level `guide.html` (copy the pattern of `playground.html`): loads `theme-init.js`, a `react-dist/guide/guide.js` bundle, root div. No CDN scripts — the design's unpkg React/Babel/framer-motion tags violate MV3 CSP; we bundle React via Vite like every other entry. Source lives in `src/guide/` (e.g. `src/guide/guide.jsx` entry + `src/guide/pages/*.jsx` + `src/guide/lib/*.jsx`). Register the entry in `build.js` the same way playground is registered, and add `guide.html` to the build's static expectations if needed. Check `react-dist/playground/` wiring for the exact pattern.
- **Opening it**: a prominent card/button in `src/pages/SettingsPanel.jsx` (e.g. top of the panel or its own "Help" section): "Operator's Guide — interactive walkthrough of every tool" → `chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') })` (background handler optional; a focus-or-create handler like background.js's `openEditor` is nicer — reuse that pattern with a `guideTabId`). Deep links: `guide.html#popup` etc. (hash router, as in the design).
- **Theme & scale**: `ensureTheme()` + the existing `[data-theme]` variants — the design's theme switcher (Dark/Light/Midnight/Cream) maps 1:1 to our real variants (`src/lib/theme.js`); wire it to the REAL stored theme (`gbTheme`) so the guide previews and persists the user's actual theme, not a local copy. Root carries `data-gb-scale="editor"` (or add a `guide` surface to `src/lib/scales.js` if trivial). Reuse `src/ui/theme.css` tokens; port the design's `docs.css` class vocabulary (`.prose`, `.eyebrow`, `.title`, `.lede`, `.sec`, `.docnote`, `.cardgrid`, `.featurecard`, `.tourbox*`, `.gb-ls-*`, sidebar/topbar classes) into a `src/guide/guide.css` rewritten on top of our tokens — the design's `gb-tokens.css` is a stale copy of our theme; do not ship it.
- **Components**: use the real `src/ui` library (`Btn`, `IconBtn`, `Tag`, `Kbd`, `Callout`, `Card`, `Input`, `Dropdown`, `Segmented`, `KeyVal`, `SectionLabel`, `TemplatePicker`, `Dot`, toasts…). The design's `lib/gb-kit-core.jsx` / `gb-kit-pickers.jsx` are hand-rolled replicas of these — discard them; they exist only because the mockup had to be standalone. Same for `lib/mock-chrome.js` → replace with lightweight mock props/data the way the demo surfaces do (the `forceMockData` dev setting precedent).

## What to port from the design (faithfully)

These are the design's good ideas — keep their behavior and feel:

1. **App shell** (`lib/app.jsx`): fixed sidebar (logo, "Golfballs Extension / Operator's Guide · v3.3" — read the version from the manifest), search box with `/` focus hotkey and keyword index, grouped nav with active state and "soon" mini-badges for unbuilt pages, topbar with breadcrumbs ("Group / Page"), "Guide home" link, theme switcher; hash routing with scroll-to-top; `.page-enter` transition.
2. **LiveStage** (`lib/demo-engine.jsx`): the signature pattern. A framed live UI ("device frame" with browser-chrome dots + URL label) with three modes — **Tour** (numbered pins over `data-demo` targets + hover-linked legend sidebar), **Play walkthrough** (synthetic cursor glides between targets, highlight ring, step captions with progress bar, play/pause/reset), **Try it** (hands-on with reset, "wired to sample data, nothing affects a real order" note). Port this component nearly verbatim (it's self-contained: measures `[data-demo]` rects, retries while layout settles, in-stage toasts) — swap `window.Motion` for our bundled `motion/react` and the GB kit for `src/ui`.
3. **TourBox / MiniFrame / TabbedTour** (`lib/tourbox.jsx`): prose-beside-live-snippet units with numbered eyebrow headers, `flip`/`wide`/`stack` variants; MiniFrame auto-zooms down to fit. Port verbatim.
4. **Prose patterns** (`docs.css` + `page-popup.jsx` as the exemplar): eyebrow → h1 title → lede paragraph; `docnote` callouts (info/brand tones) → use our `Callout`; `featurecard` grids for cross-links; "Missing a button?" flag-gating note at page bottom (this one's accurate — keep the pattern, link to Settings).
5. **WIP placeholder page** (`WipPage` in app.jsx): ship unbuilt sections as styled "in progress" pages with links back — lets you build incrementally across sessions without dead nav.

## Navigation & content mapping

Keep the design's grouping (it reads well); correct and extend it with our content. Per page: design file = layout reference, listed slugs = the facts (from `docs/content/`, via `helpContent.js`'s `getArticle()`).

| Nav group | Page (design id) | Design reference | Content source (article slugs) |
|---|---|---|---|
| Overview | Getting Started (`start`) | `pages/page-getting-started.jsx` | `what-this-extension-does`, `first-launch`, `initial-configuration` |
| Daily Driver | The Popup (`popup`) | `pages/page-popup.jsx` (the exemplar) | `email-templates-popup`, `how-email-sending-works` |
| Daily Driver | Email Templates (`templates`) | `pages/page-templates.jsx` | `template-editor`, `template-variables`, `note-templates` |
| Daily Driver | Charge & Refund (`charge`, WIP in design) | — | `charge-refund`, `order-edit` |
| Daily Driver | Submit Proof (`proof`, WIP) | — | `submit-proof` |
| Configuration | Settings & Manager (`settings`) | `pages/page-settings.jsx` + `lib/settings-live.jsx` | `feature-toggles`, `theme-appearance`, `email-integrations`, `presets`, `custom-crm-pages`, `developer-settings` (generated tables from helpContent) |
| Configuration | Themes & UI Scale (`themes`, WIP) | — | `theme-appearance` |
| Configuration | Keyboard Shortcuts (`shortcuts`, WIP) | — | `keyboard-shortcuts`, `shortcuts-settings` (render live bindings from storage like `ShortcutTable` idea) |
| Stay Organized | Watch List / Tasks / Quick Task / Call Log / Calendar | `pages/page-organize.jsx` | `watch-list`, `task-list`, `quick-task`, `call-log`, `order-date-manager` — fix all invented categories/fields |
| Find People | CRM Search / Query Builder / New Contact | `pages/page-crm.jsx` | `crm-search`, `query-builder`, `new-contact`, `phone-finder` — replace invented Solr fields/form fields |
| On-page Helpers | Email/Chat Viewer, Image Viewer, 3D Viewer, Margin Calc | `pages/page-viewers.jsx`, `page-viewers-2.jsx` | `email-thread-preview`, `text-note-preview`, `image-viewer`, `3d-product-viewer`, `mockup-composer`, `margin-calculator` |
| Catalog & Art | Gift Catalog & Proposals (`catalog`, WIP) | — | `gift-catalog`, `customizing-item`, `gift-sets`, `proposal-panel`, `proposal-breakdown`, `custom-service-items`, `supplier-import`, `promo-codes`, `build-email-proposal`, `gifting-glossary` — big section, likely 2–3 pages |
| **Workflows (ADD — missing from design)** | Quick Send + Workflow Manager | follow design's page style | `bulk-email-selection`, `workflow-manager`, `workflow-conditions` |
| **Reference (ADD)** | Troubleshooting + FAQ | `WipPage`-style simple prose pages | all 8 `ts-*` articles, `faq` |
| **Power User (ADD)** | Code Variables, Hidden Settings | simple prose pages | `code-variables`, `hidden-settings`, `modal-playground`, `debug-storage` |
| For Developers | Wiring Audit (`audit`) | — | drop it, or point at `docs/inventory.json` |

Search: replace the design's hand-written `SEARCH_KEYWORDS` with `HELP_SEARCH_INDEX` from `helpContent.js` (165 records with keywords already authored), mapped to guide routes.

## Live demo policy

- **Replica surfaces** (popup, settings strip): the design's `lib/popup-live.jsx` / `lib/settings-live.jsx` approach is right — small purpose-built replicas driven by sample data, instrumented with `data-demo` attributes and an imperative api ref for Play steps. Rebuild them with real `src/ui` components; sample data must be realistic per the articles (real category names, real field names, real button labels).
- **Real components where cheap**: `TemplatePicker`, `KeyVal`, `Btn`, pickers, `MarginCalc`-style pure-math UIs can be mounted directly in MiniFrames with props — no chrome needed.
- **Heavy modals** (Gift Catalog, Workflow Manager, Image Viewer 3D): do NOT wire live; use static MiniFrame compositions or screenshots-as-images later. A wrong-but-clickable demo is worse than an honest static one.
- Every demo's visible strings (labels, categories, statuses, prices) must match the articles. Demo captions/steps are content too — rewrite them from the tutorials in `docs/content/tutorials.json` (12 authored walkthroughs with action/expected/cue per step — these map directly onto LiveStage `steps`).

## Build order (one page fully done beats five stubs)

1. Shell + routing + theme + search + WipPage stubs for everything; Settings button + (optional) background focus-or-create handler. Verify open-from-settings.
2. Port LiveStage + TourBox + MiniFrame + guide.css onto our tokens/components.
3. **The Popup** page complete (design's exemplar, corrected content + popup replica with real sample data).
4. Settings & Manager, Email Templates (these have design pages to correct), then Stay Organized + Find People (heavy correction), then Viewers.
5. New sections: Catalog & Proposals, Workflows, Troubleshooting/FAQ, Power User.
6. Polish: deep links from `?page=` too, manifest version in sidebar, `npm run help-content && npm run build` green.

Acceptance: opens in its own tab from Settings; sidebar/search/theme work; no CDN scripts; every visible factual claim traceable to `docs/content` or the registries; all four theme variants render; Popup + Settings + Templates pages fully built with at least one LiveStage each; remaining nav shows styled WIP pages, not dead links.
