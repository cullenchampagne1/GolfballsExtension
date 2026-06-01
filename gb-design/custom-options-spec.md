# Golfballs.com Custom-Logo Catalog — Personalization Options Spec

**Audience:** designer (modal redesign) + engineering (data + UI).
**Scope:** every product type the extension pulls into the "Corporate Gifting Catalog" modal (the `/custom-logo` section).
**Status of data:** Layer A (item type → options) = full catalog (969 products, programmatic). Layer B (per-option controls) = live UI inspection of representative products. Items marked _(inferred)_ were not opened directly — flagged honestly below.
**Lens (important):** options are mapped from the **Custom Logo** entry point the extension actually uses (`modificationName_ss:"Custom Logo"`), **not** the bare consumer default that a product URL opens on. This distinction is load-bearing — see **§1.1**.

> ### ⏱ STATUS UPDATE — 2026-05-31 (supersedes "out of scope" / "thumbnail" language below)
> Two things changed since this doc was first written:
> 1. **Scope expanded by the user.** The consumer golf-ball print types (Personalized, Monogram, Photo, Custom Player Number, AlignXL, IDAlign, Icons, Folds of Honor) are **no longer out of scope** — the user wants **full, CSS-built UIs for every print type** that match how the live site builds them. Only Custom Logo has been implemented so far. Where the body below says "out of scope," read it as "in scope, build it."
> 2. **The 5 thumbnail-only types are now live-inspected.** Custom Player Number, AlignXL, IDAlign, Icons, and Folds of Honor were driven live in the customizer popup. Several earlier guesses were **wrong** (see §4, flagged **CORRECTED**). The authoritative capture is **`golf-ball-print-types-live.md`**; machine-readable controls live in **`option-schema.json`** (`"verified": "live"`).
>
> **Heads-up for the build:** the exported design prototype (`custom-spec-data.js` / `custom-spec-controls.jsx`) was authored from the *earlier guessed* data, so its `FontPicker` (Kabel/Block/Script/Serif/Varsity), its colorPicker-on-Number/Icons, and its single-color AlignXL/IDAlign **do not match live**. Build from the live capture, not the prototype's control data.

---

## TL;DR

1. **The site already tells us which options a product supports.** Each product's Solr field `modificationName_ss` is an array of "modifications" (print types). That array **is** the list of option tiles/sections the customizer renders. The extension fetches it today but throws away everything except the count.
2. **The corporate gifting catalog is overwhelmingly one option: "Custom Logo"** (logo upload). ~90% of non-golf-ball items support *only* Custom Logo.
3. **A handful of item types add ONE extra option:** tees add `Tee` (text imprint), poker chips/gift sets add `Poker Chip Second Pole` (second imprint), corporate ball/tee bundles add `Custom Accessory Bundle`, consumer accessories add `Golf Towel` / `Golf Hat`.
4. **Golf balls are the rich outlier — but only their *Custom Logo* flow is in scope.** A ball's bare page shows a 9-tile **consumer** print-type grid (Custom Logo, Personalized, Monogram, Photo, Custom Player Number, AlignXL, IDAlign, Icons, Folds of Honor). The extension pulls balls because they carry **Custom Logo**; the other 8 tiles are consumer single-item flows (your own name/photo/monogram on a dozen) — **treat them as out-of-scope** for the corporate modal unless we deliberately decide to expose them. See §1.1.
5. **There are two distinct customizer UX families** (golf-ball grid vs. accessory inline) — same underlying primitives, different layout.
6. **Every product's bare page defaults to NO customization.** A ball defaults to the "None" tile; an accessory defaults to the "Stock" tab. The Custom Logo flow is always something you navigate *into* — so the option map below is written from the **Custom Logo lens**, not the bare default view. The mechanics (and a golf-ball-only URL shortcut) are in §1.1.

---

## 1. How the site decides which options to show

- Vendor: **icustomize** (`master.api.icustomize.com`). golfballs.com is a front end over it.
- The product feed (Solr) returns, per product, `modificationName_ss: ["Custom Logo", ...]`.
- The customizer renders exactly those modifications as selectable flows. No `modificationName_ss` entry → that flow doesn't appear.
- **In our extension:** `background.js` already fetches this via `fetchGiftCatalog` (PUT `solr-refinement`, `pageKey:'custom-logo'`). But `src/lib/giftCatalog.js` keeps only `mods: doc.modificationName_ss.length` (a count). **To drive a real options UI we need to keep the names**, not the count.

### 1.1 Bare product page vs. the Custom Logo lens (verified)

The same product URL renders **different things** depending on whether you land on the bare page or force the Custom Logo modification — and the mechanism is **not uniform across item types**. Verified live on a ball (Titleist Pro V1) and an accessory (Bridgestone hat):

| Family (~share of catalog) | Bare `….htm` | `….htm?modification=Custom%20Logo` | Differ? |
|---|---|---|---|
| **Golf balls** (grid UX, ~35% = 302 consumer + 37 corporate) | 9-tile grid, **defaults to "None"** (no customization) | **Deep-links straight into the Custom Logo customizer** (logo upload + Second Imprint) | **Yes** |
| **Accessories / everything else** (decoration-tabs UX, ~65%) | Stock / Personalized / **Custom** tabs, **defaults to "Stock"** | **Identical to bare** — the param is ignored, still "Stock" | **No** (by URL) |

Takeaways:
- The `?modification=Custom%20Logo` query param is a **golf-ball-only shortcut**. For accessories it does nothing; the Custom Logo flow lives behind the **"Custom"** tab, which must be clicked.
- **In 100% of cases the bare page lands on a no-customization default** (None / Stock). The Custom Logo options are navigated *into*, never shown by default.
- **Implication for the modal:** opening `{product_url}.htm` (what the modal does today) drops the buyer on None/Stock. To put them in the imprint flow we must drive the Custom Logo flow explicitly — `?modification=Custom%20Logo` for balls **and** an explicit "Custom"-tab selection for accessories (see §7).

---

## 2. Two customizer UX families

### A. Golf balls — "Select a Print Type" grid
- A tile grid (None, Personalized, Custom Logo, Custom Player Number, Monogram, AlignXL, Photo, + "See All Print Options").
- Selecting a tile opens either an **inline panel** (Custom Logo, None) or a **modal with live preview + Cancel/Save** (all the personalization types).
- The modal has a **Print Type dropdown** at the top to switch flows without closing.
- **Defaults to "None"** (no customization). For the extension the only in-scope tile is **Custom Logo**; the rest are consumer flows (§1.1, §4). `?modification=Custom%20Logo` jumps straight to the Custom Logo panel, skipping the grid.

### B. Accessories & other corporate items — inline decoration sections
- **Simple accessory (e.g. hat):** one control, "**Accessory Decoration**", with three tabs:
  - **Stock** — buy as-is, no decoration.
  - **Personalized** — text embroidery (Line 1 + thread color).
  - **Custom** — Custom Logo upload.
- **Bundle (e.g. tee + poker chip):** multiple "**\<Component\> Decoration**" sections stacked on one page, each with its own controls, plus a base-color swatch selector for the physical product.

---

## 3. Item type → which options appear (full catalog, 969 products)

> Counts are products in catalog. Unless noted, the option set is literally just **Custom Logo**.
> For golf balls, the listed extras are the *consumer* print-type grid; only **Custom Logo** is the corporate flow the extension surfaces (see §1.1).

| Item type group | # | Options (`modificationName_ss`) |
|---|---:|---|
| **Golf Balls (consumer)** | 302 | **Custom Logo** _(in scope)_ + 8 consumer-only print types: Personalized, Monogram, Photo, Custom Player Number, AlignXL, IDAlign, Icons, Folds of Honor _(out of scope unless deliberately exposed — §1.1)_ |
| Apparel / Shirts | 101 | Custom Logo |
| Apparel / Hats | 89 | Custom Logo _(+ Stock/Personalized accessory tabs in UI)_ |
| Golf / Golf Bags | 88 | Custom Logo |
| Apparel / Outerwear | 59 | Custom Logo |
| **Golf Balls (corporate)** | 37 | Custom Logo, **Custom Accessory Bundle** |
| Promotional / Drinkware | 36 | Custom Logo |
| Promotional Products | 27 | Custom Logo |
| **Golf / Golf Tees** | 23 | Custom Logo, **Tee**, **Custom Accessory Bundle** |
| Promotional / Electronics | 23 | Custom Logo |
| Divot Tools | 22 | Custom Logo |
| Towels / Golf | 21 | Custom Logo |
| Tournament Awards / Sets | 18 | Custom Logo |
| Apparel / Gloves | 13 | Custom Logo |
| Umbrellas | 12 | Custom Logo |
| Promotional / Bag Tag | 10 | Custom Logo |
| Promotional / Coolers | 10 | Custom Logo |
| **Gift Sets** | 8 | Custom Logo, **Poker Chip Second Pole** |
| Ball Markers | 8 | Custom Logo |
| Promotional / Totes | 7 | Custom Logo |
| **Consumer / Accessories** | 5 | Custom Logo, **Golf Towel** _(inferred)_ |
| Apparel / Socks | 5 | Custom Logo |
| Promotional / Koozies | 5 | Custom Logo |
| **Ball Markers / Poker Chips** | 4 | Custom Logo, **Poker Chip Second Pole** |
| Promotional / Bag Accessories | 4 | Custom Logo |
| Ball Markers / Hat Clips | 4 | Custom Logo |
| Promotional / Office | 3 | Custom Logo |
| Promotional / Drawstring Bags | 3 | Custom Logo |
| Custom Packaging / Box Tops | 3 | Custom Logo |
| Promotional / Money Clip | 3 | Custom Logo |
| Custom Packaging / Sleeves | 3 | Custom Logo |
| Golf / Rangefinders | 3 | Custom Logo |
| Towels | 2 | Custom Logo |
| **Consumer / Apparel** | 1 | Custom Logo, **Golf Hat** _(inferred)_ |
| Custom Packaging / Other | 1 | Custom Logo |
| Golf | 1 | Custom Logo |
| Promotional / Gift Bags | 1 | _(none)_ |
| Promotional / Blankets | 1 | Custom Logo |
| Tournament Awards | 1 | Custom Logo |
| Golf / Training Aids | 1 | Custom Logo |
| Promotional / Flags | 1 | Custom Logo |

**Distinct modifications across the whole catalog (14):** Custom Logo · Personalized · Monogram · Photo · Custom Player Number · AlignXL · IDAlign · Icons · Folds of Honor · Tee · Poker Chip Second Pole · Custom Accessory Bundle · Golf Towel · Golf Hat.

---

## 4. Per-option control specs (Layer B)

### Custom Logo — _universal; the one that matters most_
The default/only option on nearly every corporate item. Observed on both a hat (accessory "Custom" tab) and a golf ball (inline panel):
- **Logo upload** — dropzone: "Upload Your Company Logo / Drag Files Here or Click to Browse".
- **Alt path** — "OR email your logo to art@golfballs.com — we'll contact you after you place your order."
- **Design help** — "Need Design Help? Free Consultation" link.
- **Add Second Imprint (Optional)** — checkbox. On balls it expands to **"Please choose a Second Pole Imprint Type" → [Add a Second Logo] [Add Personalization]**. (This is the "second imprint reveals more options" behavior.)
- **Commercial:** one-time **Setup Fee** (hat showed **$50**), **minimum quantity** (hat showed **12**), and a **volume price ladder** ("price includes application of your custom logo"). Balls instead show a **Service Level** dropdown (e.g. "8 Business Day Standard").

### Personalized (golf ball) — _live-verified_
- **Line 1** (required), **Optional Line 2**, **Optional Line 3** — each **maxlength 17**.
- **Color** — full 81-color imprint palette (custom `ColorSelectorBar`), default **Black**.
- **Font** — MUI select, default **Kabel Dm BT**; options **Kabel Dm BT / Calibri / Lucida Handwriting / Bradley Hand** (4). **CORRECTED** — earlier guess (Kabel/Block/Script/Serif/Varsity) was wrong.
- **Size** toggle: **Standard** (default) **/ Large / Max**.
- **Show AI Suggestions** button (AI-generated text ideas).
- **Add Additional Personalization $5.00/dz** checkbox.
- Live ball preview.

### Personalized (accessory "Personalized" tab) — _different from the ball version_
- **Line 1** (single text line).
- **Thread Color** (dropdown of ~11 swatches: Black, White, Red, Orange, Grey, Navy, Green, Yellow, Blue, Purple, Pink…).
- Live product preview. Per-unit price, **no setup fee** (it's embroidery, not a logo plate).

### Monogram (golf ball) — _live-verified_
- **Monogram Styles**, grouped: **3 Initials** (3 styles: interlocked circle / block circle / script) · **2 Initials** (3 styles: `M|D` bar / `M/D` stacked-with-rule / `M/D` diagonal) · **1 Initial** (1 style: letter in circle).
- **Line 1** (the initials).
- **Color 1** — 81-color palette, default **Black**.
- **Color 2** — 81-color palette **+ a "Transparent" option**, default **Transparent** (for single-color monograms).
- Footnote: _"The design shown in the preview area to the left is what will be printed."_

### Photo (golf ball) — _consumer print type; out of scope for the corporate modal_
- **Upload Image** button + **AI Image Generator** button.
- Image is **required** ("Please upload an image before adding…").
- **Add Additional Personalization $5.00/dz** checkbox.

### Tee
- **Line 1** (text) + **Text Color** (dropdown).
- Live tee preview with size label (2¾").

### Poker Chip Second Pole
- **Add Second Imprint (Optional)** checkbox → adds a second imprint to the chip's back pole.

### Custom Accessory Bundle
- Marks a **bundle** product. The page stacks one decoration section **per component** (e.g. tee text + poker-chip logo), plus a **base-color swatch grid** for the physical item (poker chip colors: Black, Blue, Green, Orange, Pink, Purple, Red, White, Yellow, Gray).

### Custom Player Number (golf ball) — _live-verified; **CORRECTED**_
- **Number** selector — values **00, 1 … 99**, default **73**.
- **Add Additional Personalization $5.00/dz** checkbox.
- _No color/font/size control._ Earlier guess of a colorPicker was **wrong**.

### AlignXL (golf ball) — _live-verified; **CORRECTED**_
- **Alignment Style** — graphic picker (alignment marks; sample value `star`).
- **Enter Text (Optional)** — maxlength 17.
- **Text Color** (81-color palette) · **Line Color** (81-color palette) · **☐ Use same Color** (forces line = text color).
- Earlier guess (single text + single color) was **wrong** — it's a graphic picker + optional text + **two** colors.

### IDAlign (golf ball) — _live-verified; **CORRECTED**_
- **Alignment** — graphic picker (alignment marks; sample value `quadArrow`).
- **Initials** text input.
- **Text Color** (81-color palette) · **Color** = line color (81-color palette).
- Earlier guess (single text + single color) was **wrong** — graphic picker + initials + **two** colors.

### Icons (golf ball) — _live-verified; **CORRECTED**_
- **Icon grid** — **~42 selectable tiles**, themed (Dad/Father's Day, Drinks, USA/Patriotic, Masters, Misc). Names enumerated in `golf-ball-print-types-live.md` / `option-schema.json`.
- **Add Additional Personalization $5.00/dz** checkbox.
- _No color control_ (icons are pre-colored art). Earlier guess of a colorPicker was **wrong**.

### Folds of Honor (golf ball) — _live-verified_
- One-click "apply licensed design": selecting the tile applies the fixed **Folds of Honor** flag artwork and closes the modal. **No** text/color/style controls.

### Golf Towel · Golf Hat — _(inferred; not opened)_
- Appear only on a few consumer items as an add-on modification. Likely "add a matching towel/hat" bundling. **Verify before building UI.**

---

## 5. The reusable control vocabulary (for design + code)

Every option above is built from this small set of primitives:

| # | Primitive | Used by |
|---|---|---|
| 1 | **Image/logo upload** (dropzone + browse + email fallback) | Custom Logo, Photo, Second Logo |
| 2 | **Text line(s)** (1–3) | Personalized, Tee, Monogram (initials) |
| 3 | **Color picker** — single / two-tone / thread-color swatches | Personalized, Tee, Monogram, accessory embroidery |
| 4 | **Font picker** | Personalized (ball) |
| 5 | **Size toggle** (Standard/Large/Max) | Personalized (ball) |
| 6 | **Style / icon selector** (visual tiles) | Monogram, Icons |
| 7 | **Number field** | Custom Player Number |
| 8 | **"Second imprint" toggle** → reveals a nested logo-or-text sub-flow | Custom Logo, Poker Chip Second Pole |
| 9 | **Base product color swatches** (separate from decoration) | Poker chips, bundles |
| 10 | **Commercial block** — min qty, setup fee, volume ladder, service level | Custom Logo |

---

## 6. Commercial mechanics tied to options

- **Custom Logo** is not free-to-personalize like a name: it carries a **one-time setup fee** (~$50), a **minimum order quantity** (~12), and **volume discount tiers**. The displayed unit price already "includes application of your custom logo."
- **Balls** swap the setup-fee block for a **Service Level** dropdown (turnaround time).
- **Personalized text on balls** adds **$5.00/dozen**.
- Accessory **Personalized** embroidery is priced per unit with no setup fee.

---

## 7. What this means for the extension modal

The modal currently shows only "N personalization options available" (a count). To match the site it needs to:

1. **Carry the modification names** per product (not the count).
2. **Render the right control set** per modification, reusing the 10 primitives above.
3. **Open into the Custom Logo flow — not the bare default — and recognize the two layouts.** Every product's bare page lands on None/Stock (no customization). Balls = print-type grid where Custom Logo is one tile (`?modification=Custom%20Logo` jumps straight to it); accessories = decoration tabs where the param is ignored, so select the **"Custom"** tab; everything else = a single Custom Logo decoration block. (See §1.1.) The consumer ball print types (Personalized/Monogram/Photo/etc.) are **not** part of this — exclude them unless we deliberately choose to surface them.
4. **Surface the commercial reality** of Custom Logo: setup fee + min qty + volume ladder, so a corporate buyer sees true cost.
5. **Practical 80/20:** because the corporate catalog is ~90% Custom-Logo-only, shipping a great **Custom Logo** block (upload + optional second imprint + setup/min-qty/volume) covers almost the entire catalog. Tee / Poker Chip Second Pole / bundles are small, targeted add-ons. Golf-ball print types are the large, separate build.

---

## 8. Verified vs. inferred (honesty box)

- **Directly inspected in the live UI:** Custom Logo (hat + ball), accessory Stock/Personalized/Custom tabs, ball Personalized, ball Monogram, ball Photo, Tee, Poker Chip Second Pole, Custom Accessory Bundle (tee+chip), poker-chip base color swatches, thread-color list.
- **Now live-inspected (was thumbnail-only) — 2026-05-31:** Custom Player Number, AlignXL, IDAlign, Icons, Folds of Honor — each driven through the customizer popup; controls captured and several earlier guesses **CORRECTED**. See `golf-ball-print-types-live.md`.
- **Inferred from catalog data only (not seen in UI):** Golf Towel, Golf Hat modifications.
- **Bare-vs-Custom-Logo URL behavior (§1.1):** directly verified on a ball (Titleist Pro V1) and an accessory (Bridgestone Relaxed B hat) — the ball deep-links via `?modification=Custom%20Logo`; the hat ignores the param and stays on Stock until the "Custom" tab is clicked (which then reveals the logo dropzone + volume ladder).
- **Catalog matrix (§3):** programmatic over all 969 products — high confidence.
