# Golfballs.com Extension — In-App Documentation & Training Platform

> **Source of truth:** [`docs/inventory.json`](./inventory.json) — the machine-readable inventory of every page, modal, setting, flag, storage key, permission, message handler, service, and user-facing action. All sections below are generated from it; when the extension changes, update the inventory first, then regenerate content.

The platform is a new **Help & Training** view inside the existing editor page (`editor.html`), opened from the Settings menu. It is built entirely from the existing component library (`src/ui`), theme variables, and build system — no new styling systems.

---

## 1. Documentation Information Architecture

Every node below maps to a real feature in the inventory. Nothing is invented.

```
Help & Training (editor.html → "Help" sidebar tab)
│
├── Getting Started
│   ├── What This Extension Does            (orientation: a sales/CRM toolkit layered onto the golfballs.com admin)
│   ├── First Launch                        (where the UI appears: popup, shelf, injected buttons, iframe toolbar)
│   ├── Initial Configuration               (theme, signature, feature toggles, importing a team preset)
│   ├── The Actions Shelf                   (Shift×2; context-aware actions per page type)
│   └── Keyboard Shortcuts                  (Ctrl+K/X/M/Q, '/' composer, 1–9, customizing them)
│
├── Core Features
│   ├── Email
│   │   ├── Email Templates & the Popup     (template matching, live variable resolution, Send)
│   │   ├── Email Thread Preview            (hover previews, case categorization chips, recommended replies)
│   │   ├── Text & Note Preview
│   │   └── How Email Sending Works         (Power Automate vs Outlook fallback; signatures; inline images)
│   ├── Orders & Pricing
│   │   ├── Margin Calculator               (incl. live Dynamics costs, minimum-margin guardrail)
│   │   ├── Charge / Refund
│   │   ├── Order Edit
│   │   ├── Order Date Manager              (approval + commitment dates, auto-push steps)
│   │   ├── Quick Notes                     (iframe toolbar note save)
│   │   ├── Watch List
│   │   ├── Copy Order IDs
│   │   └── Signifyd Glow                   (what the row colors mean)
│   ├── CRM & Contacts
│   │   ├── CRM Search                      (Ctrl+K, filter chips, selections)
│   │   ├── Query Builder                   (advanced)
│   │   ├── New Contact                     (Ctrl+Q)
│   │   ├── Quick Task
│   │   ├── Task List                       (Ctrl+X, bulk actions)
│   │   ├── Call Log
│   │   └── Phone Finder
│   ├── Gifting & Proposals
│   │   ├── Gift Catalog                    (search, filters, full-site index, re-indexing)
│   │   ├── Customizing an Item             (logo / personalized text / monogram, dual-pole)
│   │   ├── Gift Sets                       (packaging upsell, 3D box preview, pricing ladders)
│   │   ├── Custom & Service Items
│   │   ├── Supplier Import (HPG / SnugZ)
│   │   ├── Promo Codes
│   │   └── Building & Emailing a Proposal  (save, track, cart links, 3D snapshots)
│   ├── Art & Proofs
│   │   ├── Image Viewer & Logo Extraction
│   │   ├── Mockup Composer                 (recolor + grass-scene render)
│   │   ├── 3D Product Viewer
│   │   └── Submit Proof
│   └── Campaigns
│       ├── Bulk Email from a Selection     (EmailRunner from Task List / CRM Search)
│       ├── Campaign Manager                (multi-step, conditions, pacing, dry-run)
│       └── Campaign Conditions & Signals
│
├── Settings Reference                      (generated from inventory.settings + featureFlags)
│   ├── Theme & Appearance                  (4 variants, custom colors, per-surface UI scales)
│   ├── Feature Toggles                     (all 23 flags, what each turns on/off)
│   ├── Keyboard Shortcuts
│   ├── Custom CRM Pages
│   ├── Email & Integrations                (sender identity, signature, Power Automate)
│   ├── Developer Settings                  (every dev setting, default, range, impact)
│   └── Presets: Import / Export / Share    (scopes, merge behavior)
│
├── Workflows
│   ├── Beginner
│   │   ├── Send your first templated email
│   │   ├── Log a call and create a follow-up task
│   │   └── Watch an order
│   ├── Intermediate
│   │   ├── Build & send a product proposal
│   │   ├── Triage a case email
│   │   ├── Set order approval & commitment dates
│   │   └── Extract a logo and submit a proof
│   └── Advanced
│       ├── Run a multi-step campaign
│       ├── Import supplier products
│       ├── Build advanced searches with Query Builder
│       └── Share your team's configuration with presets
│
├── Troubleshooting
│   ├── "The Send button opened Outlook instead of sending"      (PA off/URL missing → mailto fallback)
│   ├── "A variable shows as unresolved {{...}}"                 (page context, OR-blocks, code vars)
│   ├── "The Gift Catalog looks stale or is missing items"       (cacheHours, rebuild index)
│   ├── "A modal/button isn't appearing"                          (feature flag off, wrong page type, secret-hidden)
│   ├── "Margin calculator shows no cost"                         (Dynamics session, cost cache)
│   ├── "Date update failed mid-way"                              (postback chain steps, retry)
│   ├── "3D preview is black/blank"                               (known GPU/Windows-ARM issue)
│   └── "My settings vanished"                                    (presets overwrite, remote policy)
│
├── FAQ
│
├── Power User Corner                       (hidden & advanced functionality — discoverable on purpose)
│   ├── Code Variables & Recipes
│   ├── The Modal Playground
│   ├── Managed Settings (authenticated remote policy)
│   └── Debug Storage Keys
│
└── What's New                              (release notes per version; seeded from git history)
```

---

## 2. Content Map

Every article, its audience tiers, and search keywords. **Bold** articles ship with full interactive tutorials (Section 3); the rest are reference articles generated from the inventory.

| # | Article | Section | Tiers | Keywords |
|---|---------|---------|-------|----------|
| 1 | What This Extension Does | Getting Started | B | overview, intro, what is |
| 2 | First Launch | Getting Started | B | install, popup, shelf, where |
| 3 | **Initial Configuration** | Getting Started | B | setup, theme, signature, preset |
| 4 | **The Actions Shelf** | Getting Started | B/I | shelf, shift shift, quick actions, floating |
| 5 | Keyboard Shortcuts | Getting Started | B/I | ctrl k, shortcuts, keybind, rebind |
| 6 | **Email Templates & the Popup** | Email | B/I/A | template, send, variables, popup |
| 7 | Email Thread Preview | Email | B/I | preview, case, categorize, thread |
| 8 | Text & Note Preview | Email | B | sms, chat, note preview |
| 9 | How Email Sending Works | Email | I/A | power automate, outlook, mailto, signature, images, graph, draft |
| 10 | **Margin Calculator** | Orders & Pricing | B/I | margin, markup, profit, cost, ctrl m |
| 11 | Charge / Refund | Orders & Pricing | I | charge, refund, card, adjustment |
| 12 | Order Edit | Orders & Pricing | I | edit order, dates, totals |
| 13 | **Order Date Manager** | Orders & Pricing | B/I | approval date, commitment, calendar, push |
| 14 | Quick Notes | Orders & Pricing | B | note, order note, toolbar |
| 15 | **Watch List** | Orders & Pricing | B | watch, todo, track order, remind |
| 16 | Copy Order IDs | Orders & Pricing | B | copy ids, clipboard, order index |
| 17 | Signifyd Glow | Orders & Pricing | B | fraud, glow, red, score, color |
| 18 | **CRM Search** | CRM & Contacts | B/I/A | search, ctrl k, find contact, account |
| 19 | Query Builder | CRM & Contacts | A | query, solr, advanced search, saved query |
| 20 | New Contact | CRM & Contacts | B | create contact, ctrl q, new customer |
| 21 | **Quick Task** | CRM & Contacts | B/I | task, todo, follow up, due date |
| 22 | **Task List** | CRM & Contacts | B/I | my tasks, ctrl x, bulk, open tabs |
| 23 | **Call Log** | CRM & Contacts | B/I | call, log call, voicemail, activity |
| 24 | Phone Finder | CRM & Contacts | B | phone, find number, missing phone |
| 25 | **Gift Catalog** | Gifting & Proposals | B/I | catalog, gift, products, browse, index |
| 26 | **Customizing an Item** | Gifting & Proposals | I | logo, text, monogram, imprint, dual pole |
| 27 | Gift Sets | Gifting & Proposals | I | gift set, box, sleeve, packaging, upsell |
| 28 | Custom & Service Items | Gifting & Proposals | I | service item, custom item, freight, setup fee |
| 29 | Supplier Import (HPG / SnugZ) | Gifting & Proposals | A | import, hpg, snugz, supplier, markup |
| 30 | Promo Codes | Gifting & Proposals | I | promo, coupon, discount, free quantity |
| 31 | **Building & Emailing a Proposal** | Gifting & Proposals | I/A | proposal, quote, email proposal, cart link |
| 32 | **Image Viewer & Logo Extraction** | Art & Proofs | B/I | logo, image, artwork, download, original |
| 33 | Mockup Composer | Art & Proofs | I | recolor, mockup, grass, render |
| 34 | 3D Product Viewer | Art & Proofs | I | 3d, ball, rotate, preview, gift box |
| 35 | **Submit Proof** | Art & Proofs | B/I | proof, artist, submit, art approval |
| 36 | **Bulk Email from a Selection** | Campaigns | I | bulk, blast, run campaign, selected |
| 37 | **Campaign Manager** | Campaigns | A | campaign, steps, conditions, pacing, dry run |
| 38 | Campaign Conditions & Signals | Campaigns | A | condition, signal, rule, and or |
| 39 | Theme & Appearance | Settings Reference | B | theme, dark, light, color, scale, zoom |
| 40 | Feature Toggles | Settings Reference | B | enable, disable, toggle, flag |
| 41 | Keyboard Shortcuts (settings) | Settings Reference | B | rebind, change shortcut |
| 42 | Custom CRM Pages | Settings Reference | A | custom page, override, dashboard |
| 43 | Email & Integrations | Settings Reference | I/A | signature, power automate url, microsoft, sign in |
| 44 | Developer Settings | Settings Reference | A | dev settings, draggable, cache hours, debug |
| 45 | Shared Settings Templates | Settings Reference | I/A | settings link, URL, import, team, share config |
| 46–53 | Troubleshooting articles (8) | Troubleshooting | B/I/A | per-symptom keywords above |
| 54 | FAQ | FAQ | B/I/A | — |
| 55 | Code Variables & Recipes | Power User Corner | A | code variable, javascript, recipe, oos |
| 56 | The Modal Playground | Power User Corner | A | playground, mock, test |
| 57 | Hidden Settings | Power User Corner | A | secret, hidden, locked |
| 58 | Debug Storage Keys | Power User Corner | A | storage, debug, proposal trace |
| 59 | What's New | What's New | B | release, changelog, version |

Tiers: **B**eginner (plain language), **I**ntermediate (workflows), **A**dvanced (power user). Articles with multiple tiers render as stacked, progressively-disclosed sections (`CollapsibleSection`).

---

## 3. Interactive Tutorial Content

Tutorials are data, not prose pages: each is an array of steps rendered by `TutorialStep` with a progress `InteractiveChecklist`. Below is the full authored content for the flagship tutorials; the same schema covers the rest.

### 3.1 Tutorial schema

```js
{
  id: 'build-proposal',
  title: 'Build & send a product proposal',
  feature: 'gift-catalog',            // links back to inventory feature id
  tier: 'intermediate',
  estMinutes: 6,
  prerequisites: ['On a contact, account, or order page', 'giftCatalogEnabled is on'],
  steps: [{
    action: 'what the user does',
    expected: 'what they should see',
    visualCue: 'where to look',
    commonMistake: 'what goes wrong + fix',   // optional
    tip: 'pro tip',                            // optional → Callout tone=info
    warning: '...'                             // optional → Callout tone=warning
  }],
  related: ['proposals', 'promos', 'gift-sets'],
  faq: [{ q, a }]
}
```

### 3.2 Build & send a product proposal (flagship)

**Overview** — *What:* assemble a priced quote of customized products and email it as a tracked proposal. *Why:* one tool replaces catalog browsing, pricing spreadsheets, mockup requests, and manual quote emails. *When:* any time a customer asks "what would 300 logo balls cost?"

| # | Action | Expected result | Visual cue | Notes |
|---|--------|-----------------|------------|-------|
| 1 | On a contact/account page, double-tap **Shift** and click **Gift Catalog** | Catalog modal opens with product grid | Floating shelf, bottom-right | *Mistake:* shelf doesn't appear → check `actionsShelfEnabled` in Settings → Features |
| 2 | Type a product name or use the category sidebar | Grid filters live; collapsible **Custom Logo** group at top | Search bar, top | *Tip:* first open after 24h re-indexes the whole site — a short delay is normal |
| 3 | Click **Customize** on an item | Customize panel opens with imprint options | Card footer button | Options come from the product's real capabilities; items that can't take a monogram won't offer one |
| 4 | Pick **Logo**, **Text**, or **Monogram**; optionally enable the second pole | Live 3D ball updates with your art | Right-side 3D preview | *Tip:* drag to rotate; wheel to zoom |
| 5 | (Optional) choose a **Gift Set** package | 3D preview swaps to the assembled open box | Packaging section | Pricing recomputes with the verified gift-set ladder |
| 6 | Set quantity; review the price ladder | Per-unit price updates at volume breaks | Quantity stepper | *Warning:* Margin guardrail flags prices under your minimum margin (default 30%) |
| 7 | Click **Add to Quote**, repeat for more items | Proposal sidebar fills with line items + running total | Right sidebar | |
| 8 | (Optional) **Apply promo** | Discount or free-item lines appear | Promo field | Only promos applicable to the cart are offered |
| 9 | Click **Email Proposal** | Proposal Email composer opens with rendered line items and 3D snapshots | | Snapshots render automatically — give it a second |
| 10 | Review recipient/subject/body and **Send** | Toast confirms; proposal is saved server-side and tracked; opportunity value updates | | *Mistake:* if Outlook opens instead, Power Automate is off — see *How Email Sending Works* |

**FAQ:** Where do saved proposals live? (Locally under saved proposals + server-side via the cart it creates — reload one from its cart ID.) · Can I send without a cart link? (The cart link only appears when the cart saved successfully.)

### 3.3 Send your first templated email

1. Open a CRM page (order, case, contact, or account) → click the **extension icon**. *Expect:* popup shows templates matched to this page type. *Mistake:* "No templates" → templates are filtered by page type and rules; check the Template Editor.
2. Pick a template. *Expect:* RESOLVED section streams in live values pulled from the page ({{name}}, {{orderTotal}}…). *Cue:* unresolved variables stay highlighted.
3. Click **Send**. *Expect:* with Power Automate on, it sends silently with your signature and inline images; otherwise Outlook opens pre-filled (plain text, no signature). *Tip:* the From address uses Settings → Email account host.

### 3.4 Log a call + follow-up task (keyboard-first)

1. Contact page → shelf → **Log Call** (or popup → Tools). *Expect:* modal with template filter bar focused.
2. Type to filter templates; press **1–9** or **Enter** to pick. *Expect:* composer pre-fills.
3. Press **/** to enter the composer: set category → direction → voicemail flag → subject → note, advancing with **Enter**. *Cue:* live preview updates on the right.
4. Submit. *Expect:* success toast; the call is in the CRM activity log. *Note:* toasts appear only on errors elsewhere; this flow confirms explicitly.
5. Open **Quick Task** → pick a template → due date accepts `+1d`, `+1w`, or `mm/dd/yy` → submit. *Expect:* task attached to the contact.

### 3.5 Run a bulk campaign

1. **Ctrl+K** → search or apply a saved query → tick rows. *Cue:* selection summary bar appears with a Campaign dropdown.
2. Click **Run Campaign** → Campaign Runner opens. Pick a template → **Preview** one recipient. *Expect:* variables resolved per-contact.
3. **Send All.** *Expect:* per-recipient progress bar; each contact opens in a background tab, resolves, sends, closes, with randomized pacing. *Warning:* keep Chrome open until done. *Mistake:* PA off → every send opens an Outlook window (by design fallback).
4. For multi-step sequences (email → wait → conditional task), use **Campaign Manager**: add steps, set grouped AND/OR conditions, pacing + jitter, then **dry-run** to simulate with zero side effects before running live.

### 3.6 Set order approval & commitment dates

1. Order page → notes iframe toolbar → **calendar button**. *Expect:* Order Date Manager with two mini-calendars.
2. Pick approval date, then commitment date. *Cue:* readouts under each calendar.
3. **Update Dates.** *Expect:* step-by-step progress toast (the save is a 3-step form chain on the admin site). *Mistake:* failure mid-chain shows which step failed — re-open and retry; nothing is half-saved silently.

### 3.7 Extract a logo & submit a proof

1. Hover any product/render image on an order page → click the **expand** button. *Expect:* Image Viewer opens and resolves the best-quality original (direct file → express upload → CDN probe → render fallback).
2. **Shift+click** the injected button downloads immediately; inside the viewer you can zoom/pan, copy URL, download.
3. Optional: **swap colors** → Mockup Composer recolors the logo and renders a 3D grass-scene mockup.
4. **Submit Proof** → form pre-fills order/customer IDs; pick item + artist; add notes; submit. *Expect:* proof appears in the gallery of prior proofs.

### 3.8 Remaining tutorials

Initial Configuration, Actions Shelf, Margin Calculator, Watch List, CRM Search, Task List, Email Preview triage, Gift Sets, Supplier Import, Query Builder, Presets sharing — authored with the same schema (one step row per UI interaction, every step carrying expected/cue, mistakes on every step that has a real failure mode from Troubleshooting).

---

## 4. UI/UX Design Specification

**Placement.** New "Help" tab in the editor sidebar (same mechanism as existing tabs: a `.sb-tab` button in `editor.html`, an `activeTab` switch case, a page component in `src/pages/`). A `?view=help&article=<slug>` query param enables deep links so any modal can link to its own docs.

**Layout (desktop, editor window ~1100×800):**

```
┌────────────┬──────────────────────────────────────────────┐
│  Sidebar   │  Breadcrumbs                     [Search ⌘F] │
│  (nav tree │ ┌──────────────────────────────────────────┐ │
│  from §1,  │ │  Article header (icon, title, tier tags) │ │
│  Collapsi- │ │  Beginner section                        │ │
│  bleSection│ │  ▸ Intermediate (CollapsibleSection)     │ │
│  groups)   │ │  ▸ Advanced (CollapsibleSection)         │ │
│            │ │  Callouts / TutorialSteps / Tables       │ │
│            │ │  Related articles (Card row)             │ │
│            │ └──────────────────────────────────────────┘ │
└────────────┴──────────────────────────────────────────────┘
```

**Design-system rules (all existing, nothing new):**
- Surfaces: sidebar `--gb-surface-1`, article canvas `--gb-surface-canvas`, cards `--gb-surface-2`.
- Typography: `--gb-font-sans`; code/keys in `--gb-font-mono` via `Kbd`.
- Tones: tips `Callout tone=info`, best practices `tone=success`, warnings `tone=warning`, deprecations `tone=error`, pro tips `tone=brand` — all six tones already exist.
- Motion: `--gb-anim` for nav transitions, `--gb-anim-bounce` for search palette.
- Scaling: root carries `data-gb-scale="editor"` so the existing per-surface UI scale applies automatically.
- Themes: nothing to do — all four variants come free from the CSS variables.
- Box-sizing reset already handled by the `[data-gb-scale]` rule in theme.css (host-CSS-bleed lesson).

**Contextual help affordance.** Each documented modal gets a small `IconBtn icon="alert"`-style "?" in its `ModalHeader` that messages the background `openEditor` handler with `?view=help&article=<slug>` — one-line wiring per modal, deferred to Phase 4 of the implementation plan.

---

## 5. Component Architecture

All components live in `src/pages/help/` and compose existing `src/ui` primitives.

| Component | Purpose | Props | State | Built from |
|-----------|---------|-------|-------|------------|
| `HelpPage` | Root view mounted by the editor's tab switch | `initialArticle?` | `activeArticle`, `searchOpen`, `checklistProgress` | — |
| `DocsSidebar` | Nav tree from §1 | `tree`, `active`, `onSelect` | open-group set | `CollapsibleSection`, `SectionLabel`, `Dot` (read-progress) |
| `DocsSearch` | ⌘F command palette over the index | `index`, `onPick` | `query`, `results`, `cursor` | `Input` (leading search icon), `Kbd`, keyboard list pattern from `KeyboardComposer` |
| `DocsBreadcrumbs` | Path within tree | `path[]`, `onNavigate` | — | `Tag` + chevron icons |
| `DocsArticle` | Renders one article record | `article` | — | `CollapsibleSection` per tier, `Callout`, `KeyVal`, `EmailHtmlView`-style safe HTML |
| `DocsCallout` | Thin alias mapping `{tip,warning,bestPractice,proTip,deprecated}` → tones | `kind`, `children` | — | `Callout` |
| `TutorialStep` | One numbered step | `index`, `action`, `expected`, `visualCue`, `commonMistake?`, `tip?` | — | `Card`, `NumberDisplay`, `Callout` |
| `TutorialPlayer` | Step list + progress + "mark done" | `tutorial`, `progress`, `onProgress` | `currentStep` | `TutorialStep`, `InteractiveChecklist`, `Btn` |
| `InteractiveChecklist` | Persistent per-user completion | `items`, `value`, `onChange` | — | `CollapsibleChecklist`; persists to `chrome.storage.local.helpProgress` |
| `FeatureOverview` | Header card: what/why/when + flag + shortcut | `feature` (inventory record) | — | `FeatureSpotlight`, `Tag`, `Kbd` |
| `SettingsReferenceTable` | Auto-generated settings/flags tables | `section` | filter text | `Input`, `KeyVal`, `Switch` (read-only display), `Tag` |
| `FAQSection` | Expandable Q&A | `items` | — | `ExpandableFeature` |
| `ShortcutTable` | Live shortcut listing (reads user's actual bindings) | — | bindings from storage | `Kbd`, `KeyVal` |
| `WhatsNewList` | Release notes | `releases` | — | `Card`, `Tag` |
| `OnboardingFlow` | First-run / what's-new wizard (§7) | `flow`, `onDone` | step index | `ModalShell`, `Segmented`, `TutorialStep` |

**Content pipeline.** `scripts/build-help-content.mjs` compiles `docs/inventory.json` + authored article/tutorial files (`docs/content/*.json`) into `src/lib/helpContent.js` — a static module with `{ tree, articles, tutorials, searchIndex }`. No runtime fetching; the docs ship inside the bundle and the Settings Reference can never drift from the registry because it's generated from the same `devSettings.js`/`flags.js` registries at build time.

---

## 6. Search System

**Categories:** Features · Settings · Tutorials · Workflows · Troubleshooting · FAQ · Shortcuts.

**Index record:**
```js
{ id, category, title, keywords[], description, tier, articleSlug, anchor?,
  flag?,          // jump-to-toggle deep link for settings results
  shortcut? }     // rendered as Kbd in results
```

**Indexed metadata:** article titles, feature names + user-facing synonyms ("blast" → Bulk Email), every setting key *and* its UI label, flag names, shortcut keys, user-action verbs from the inventory (`userActions`), troubleshooting symptom phrases (indexed by what the user would type: "outlook opened", "variable not resolving").

**Ranking:** exact title > title prefix > keyword > description substring (the same prefix/word-boundary scoring already implemented in `crmIndex.js` — reuse that scorer). Settings results render with their current value when readable. Search opens with **⌘F / Ctrl+F** inside Help and from a "Search help…" input in the Settings panel header.

---

## 7. Guided Onboarding

**First-time users** — triggered when `helpProgress` storage key is absent, shown once as an `OnboardingFlow` modal on the editor page (and offered from the popup footer):
1. Welcome — what the extension does in one screen (FeatureSpotlight grid of the 6 feature areas).
2. Where the UI lives — popup / shelf (Shift×2) / injected buttons / iframe toolbar, with illustrations.
3. Make it yours — theme variant picker (live), signature editor link.
4. Pick your starting tutorial — "Send your first templated email" / "Log a call" / "Explore the Gift Catalog".

**Returning users** — when stored `lastSeenVersion` ≠ manifest version: a dismissible `Callout tone=brand` atop Help + popup linking to What's New, listing only the diff.

**Advanced users** — "Power User Corner" is in the nav (not hidden), plus a "Going faster" checklist: rebind shortcuts, learn the `/` composer, save a Query Builder query, create a preset, try a dry-run campaign, meet code variables.

---

## 8. Missing-Documentation Detection (Findings & Recommendations)

Found while auditing — these are gaps in the *product's* self-explanation that the docs platform should patch (and tooltips should eventually fix in-place):

1. **Power Automate is the most consequential setting and the least explained.** It defaults **off**, silently changing Send behavior everywhere (Outlook windows, no signature). → Dedicated article (#9) + a one-time `Callout` in the popup the first time a mailto fallback fires.
2. **The Actions Shelf has no discoverable trigger.** Shift×2 is unguessable. → Onboarding step + tooltip on first shelf appearance.
3. **Remote policy can hide settings from teammates** ("my toggle is gone"). → Troubleshooting explains the administrator-owned configuration and automatic synchronization.
4. **Signifyd glow colors have no legend.** → Article #17 with a color legend; recommend an in-UI legend tooltip.
5. **Watch List auto-delete (5 days) is silent.** → Documented in #15 with the setting reference; recommend a one-line footer note in the modal.
6. **Composer keyboard grammar (`/`, 1–9, Enter)** is powerful and invisible. → Tutorial 3.4 + recommend a `Kbd` hint row in the composer footer.
7. **Date-save step chain** can fail mid-way with no recovery guidance. → Troubleshooting #6.
8. **Catalog re-index delay** on first open reads as a hang. → Tip in tutorial 3.2; recommend a progress toast.
9. **The sender identity must be configured explicitly.** The extension now fails closed when `email.localPart` is blank instead of borrowing an employee identity. → Initial Configuration step 3 makes the field mandatory and explains the validation error.
10. **Retired transports can create misleading setup guidance.** The obsolete Graph/OAuth experiment was deleted from the runtime and manifest. → Keep user documentation limited to the supported Power Automate and Outlook fallback paths.
11. **No-toast-on-success policy** (errors only) reads as "nothing happened" to new users. → FAQ entry; mention in onboarding.
12. **QuickTask return-to-popup mode** exists but popup side isn't wired — exclude from docs until wired (tracked as a known gap, not documented as a feature).

---

## 9. Implementation Plan

| Phase | Scope | Files | Est. |
|-------|-------|-------|------|
| 1. Content pipeline | `scripts/build-help-content.mjs`; author `docs/content/*.json` from §2–§3; generate `src/lib/helpContent.js` (incl. settings/flags tables straight from `devSettings.js`/`flags.js` registries) | scripts/, docs/content/, src/lib | 1–2 d |
| 2. Shell | `HelpPage`, `DocsSidebar`, `DocsArticle`, `DocsBreadcrumbs`; editor tab + `?view=help` routing; Settings menu "Help & Training" entry | editor.html, src/pages/help/, src/content/editor-sidebar.jsx | 1–2 d |
| 3. Search + tutorials | `DocsSearch` (reuse crmIndex scorer), `TutorialPlayer`, `InteractiveChecklist` + `helpProgress` storage | src/pages/help/ | 1–2 d |
| 4. Onboarding + contextual help | `OnboardingFlow`, first-run trigger, `lastSeenVersion` What's-New, "?" buttons in modal headers (one line per modal) | src/pages/help/, src/modals/* | 1 d |
| 5. Polish | Settings reference filters, deep links from popup/shelf, coverage CI check (every flag/setting/modal in inventory must appear in ≥1 article — fail build otherwise) | scripts/ | 1 d |

Build integration: no new manifest entries needed — Help lives inside the existing editor bundle. Remember the campaign-manager OOM precedent: if the editor bundle grows, build with `--max-old-space-size=8192`.

---

## 10. Documentation Coverage Report

| Dimension | In inventory | Covered by content map | Coverage |
|-----------|-------------|------------------------|----------|
| Extension pages | 5 | 5 (sandbox documented as internal in Power User Corner) | 100% |
| Modals / overlays | 21 React + 2 vanilla + iframe toolbar | 24 | 100% |
| Feature flags | 23 | 23 (Feature Toggles + per-feature articles) | 100% |
| Developer settings | 55+ registry entries | all (generated Settings Reference) | 100% |
| Keyboard shortcuts | 8 | 8 | 100% |
| Workflows | 10 | 10 (3 beginner / 4 intermediate / 3 advanced) | 100% |
| Storage keys | ~35 | user-relevant ones in Presets/Troubleshooting; debug keys in Power User Corner | 100% of user-facing |
| External integrations | 7 | Power Automate, icustomize, Dynamics, supplier, geocoding, storefront, and CRM services covered where user-visible | 100% of user-facing |
| Hidden/advanced | 10 items | Power User Corner (5 articles) | 100% |

**Known exclusions (deliberate):** internal message-handler API (developer docs, not user docs — lives in inventory.json), QuickTask return-to-popup (unwired), activity-log campaign signals marked `ready:false` in code.

**Top recommended product improvements** (from §8): first-run sender-identity prompt, Power Automate fallback callout, shelf-discovery tooltip, Signifyd legend, composer keyboard hint row.
