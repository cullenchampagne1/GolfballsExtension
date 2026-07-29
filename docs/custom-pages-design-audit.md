# Custom Pages design audit

## Enabled surfaces

The extension manifest currently injects four custom-page bundles:

| Surface | Entry | Lab fixture |
| --- | --- | --- |
| Contact details | `src/content/contact-details.jsx` | populated / stress / empty |
| Account details | `src/content/account-details.jsx` | populated / stress / empty |
| Opportunity details | `src/content/opportunity-details.jsx` | populated / stress / empty |
| CRM search | `src/content/crm-search-page.jsx` | populated / stress / empty |

The pages already share the correct architectural boundary:

- `detail-shared.jsx` owns stateless visual primitives, tables, cards, and
  display formatting.
- `crm-detail-shared.jsx` owns the page frame, live-store adapter, shared
  behavior, modals, and CRM transports.
- Each content entry owns only record-specific composition and registration.
- Below-fold panels use `LazySection`/`content-visibility`, and capped datasets
  use themed scroll areas rather than mounting an unbounded page.

## Gaps found

1. There was no way to render the real components without a live CRM page.
2. Alternate lookup records were extracted by the engine but dropped by the
   shared `adapt()` layer, leaving that card empty even with valid source data.
3. The page scale, hero, card headers, stat tiles, table cells, and primary
   layout gaps combined into a low-density, oversized presentation.
4. Contact/account layouts repeated fixed `320px` sidebars and `14px` gaps.
5. CRM Search still calculated available height using the old hardcoded page
   zoom instead of the shared `PAGE_ZOOM` contract.
6. Narrow windows had no common collapse behavior for the record sidebar,
   hero actions, paired cards, or search facets.

## Implemented direction

- The standalone Custom Pages Lab imports the real page entries and supplies
  extensive, deterministic fixtures. Remote CRM requests and navigation are
  disabled there.
- A shared compact layout contract now controls content gaps, sidebars,
  two-column pairs, stack spacing, and responsive collapse behavior.
- Page zoom, hero/avatar scale, section headers, stat tiles, tables, padding,
  glow, elevation, and motion were reduced to create a denser, flatter visual
  hierarchy.
- Reduced-motion behavior is provided at the page root.
- Opportunity and Search accept injected read data/clients for preview and
  testing while retaining their original live defaults.

The lab is the design review source of truth: changes should be made to shared
production primitives or page composition, never to a demo-only copy.
