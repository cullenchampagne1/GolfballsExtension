# Golf-ball customizer — print types & controls (LIVE-verified)

**Source:** live inspection of golfballs.com on a golf-ball product
(Titleist Pro V1, `…/Pro-V1-Golf-Balls-2025-Model.htm?modification=Custom%20Logo`),
driving the real **personalization popup** — the "Select a Print Type" editor modal — and
cycling its **Print Type** dropdown through every value. Captured 2026-05-31.

This file replaces the earlier *guessed* / `thumbnail` / `inferred` control sets for the
golf-ball print types. Where the prior design-spec guess was wrong, it's flagged **CORRECTED**.

> Scope note: this covers the **golf-ball** print-type family only (the 10-tile grid).
> Accessory decoration tabs (Stock / Personalized / Custom on hats, towels, tees, bundles)
> are a different UX family and are documented separately. "Golf Towel" / "Golf Hat" from the
> old doc were accessory items, not golf-ball print types — not in scope here.

---

## How the popup is reached (entry flow)

1. Product detail panel → **"Looking for other customization types? View All Options"** button
   reveals an **inline print-type grid** (7 visible tiles: None, Personalized, Custom Logo,
   Custom Player Number, Monogram, AlignXL, Photo + a **"See All Print Options"** tile).
2. **"See All Print Options"** expands the grid to the full **10 tiles** (adds Icons, IDAlign,
   Folds of Honor).
3. Clicking any tile opens the **editor modal** ("the popup"): centered title, a **Print Type**
   dropdown (MUI Select, the 10 options below), a live **preview** of the ball on the left,
   the type-specific controls on the right, and a **Cancel / Save** footer.
4. Inside the modal, the **Print Type** dropdown changes the right-hand controls live — *this is
   the "each change in print type shows the options you have available" behavior.*
5. After saving, the detail panel shows a live **Print Preview** with **"Edit Personalization"**
   and **"Change Print Type"** buttons.

**Reset guard:** **"Change Print Type"** (after a customization exists) pops a confirm —
> **ARE YOU SURE?** Changing your print type will remove your current customization.
> [ No, Keep It ] [ Yes, Start Over ]

**Three print types exit the modal instead of editing in-place** (selecting them dismisses the
popup and applies/!applies on the page):
- **None** (`Stock`) → clears customization.
- **Custom Logo** → hands off to the inline page customizer (the upload flow already built).
- **Folds of Honor** → applies the fixed licensed artwork; there are no user controls.

---

## The 10 print types (golf ball)

`label` is the dropdown text; `value` is the option's `data-value`.

| # | label | value | Editor in modal? | Controls (live) |
|---|-------|-------|------------------|-----------------|
| 1 | None | `Stock` | no (clears) | — |
| 2 | Personalized | `Personalized` | **yes** | 3 text lines · AI suggestions · Color · Font · Size · +$5/dz toggle |
| 3 | Custom Logo | `Custom Logo` | no (inline page) | logo upload · email art · second imprint · volume ladder *(already built)* |
| 4 | Custom Player Number | `Custom Player Number` | **yes** | number 00–99 · +$5/dz toggle |
| 5 | Monogram | `Monogram` | **yes** | style (3/2/1 initials) · Line 1 · Color 1 · Color 2 |
| 6 | AlignXL | `Align XL` | **yes** | alignment-graphic · optional text · Text Color · Line Color · "use same color" |
| 7 | Photo | `Photo` | **yes** | image upload · AI Image Generator · +$5/dz toggle |
| 8 | Icons | `Icon` | **yes** | icon grid (~42) · +$5/dz toggle |
| 9 | IDAlign | `IDAlign` | **yes** | alignment-graphic · initials text · Text Color · Color |
| 10 | Folds of Honor | `Folds of Honor` | no (fixed art) | — |

---

## Per-type control detail

### 2 · Personalized  *(confirmed; fonts CORRECTED)*
- **Heading:** "Personalized Text" + green **"Show AI Suggestions"** button (AI text ideas).
- **Line 1** (required), **(Optional Line 2)**, **(Optional Line 3)** — each `maxlength 17`.
- **Color** — full imprint palette (see below), default **Black**. (Custom `ColorSelectorBar`.)
- **Font** — MUI select, default **Kabel Dm BT**. Options: **Kabel Dm BT, Calibri,
  Lucida Handwriting, Bradley Hand** (4). *(CORRECTED — prior guess Kabel/Block/Script/Serif/Varsity.)*
- **Size** — segmented buttons: **Standard** (default) / **Large** / **Max**.
- **☐ Add Additional Personalization $5.00/dz** — checkbox (adds a second personalization).

### 4 · Custom Player Number  *(CORRECTED — no color control)*
- **Number selector** — values **00, 1 … 99**, default **73**. (Custom dropdown, all values in DOM.)
- **☐ Add Additional Personalization $5.00/dz**.
- *No* color / font / size controls. (Prior guess `numberField/colorPicker` — the colorPicker was wrong.)

### 5 · Monogram  *(confirmed; Color 2 / "Transparent" added)*
- **Monogram Styles**, grouped:
  - **3 Initials** — 3 styles (interlocked circle, block circle, script).
  - **2 Initials** — 3 styles (`M|D` bar, `M/D` stacked-with-rule, `M/D` diagonal).
  - **1 Initial** — 1 style (single letter in circle).
- **Line 1** — the initials text.
- **Color 1** — imprint palette, default **Black**.
- **Color 2** — imprint palette **+ a "Transparent" option**, default **Transparent**
  (for single-color monograms).
- Footnote in modal: *"The design shown in the preview area to the left is what will be printed."*

### 6 · AlignXL  *(CORRECTED)*
- **Alignment Style** — graphic picker (alignment marks; current value e.g. `star`). Custom dropdown.
- **Enter Text (Optional)** — `maxlength 17`.
- **Color Options:** **Text Color** (palette) · **Line Color** (palette) · **☐ Use same Color**
  (toggle to force line color = text color).

### 7 · Photo  *(confirmed)*
- **Upload Image** — dropzone.
- **AI Image Generator** — generate art with AI.
- **☐ Add Additional Personalization $5.00/dz**.

### 8 · Icons  *(CORRECTED — no color control)*
- **Icon grid** — **~42 selectable tiles**, themed:
  - *Dad / Father's Day:* Dad Beer, No. 1 Dad, Tie, Dad Crown, Best Dad by Par
  - *Drinks:* Martini, Old Fashioned, Tom Collins, Bloody Mary, Margarita, Cosmopolitan, Wine Glass, Beer Mug, Cigar
  - *USA / Patriotic:* USA Sunglasses, USA Wordmark, USA Flag, 'Merica
  - *Masters:* Masters Azalea, Masters Sweet Tea, Masters Pimento Cheese, Masters Jumpsuit
  - *Misc:* Four-leaf Clover, Flamingo, Sunglasses, Skull & Crossbones, Ladybug, Bomb, Taco, Dots Green
- **☐ Add Additional Personalization $5.00/dz**.
- *No* color control (icons are pre-colored art). (Prior guess `styleSelector/colorPicker` — colorPicker wrong.)

### 9 · IDAlign  *(CORRECTED)*
- **Alignment** — graphic picker (alignment marks; current value e.g. `quadArrow,quadArrow2`). Custom dropdown.
- **Initials text** input.
- **Text Color** (palette) · **Color** (line color, palette).

### 10 · Folds of Honor  *(confirmed — no controls)*
- Selecting it applies the fixed **Folds of Honor** flag artwork to the ball and closes the modal.
- No text / color / style controls. Treat as a one-click "apply licensed design" tile.

---

## Shared enumerations (reusable across types)

### Imprint color palette — **81 colors**
Rendered as a custom `ColorSelectorBar` (a "common" row first, then the full named set).

**Common row (8):** Black, Red, Green, Blue, Pink, Orange, Purple, Gold.

**Full set (81), in DOM order:**
Black, Red, Green, Blue, Pink, Orange, Purple, Gold, Chili Pepper Red, Persian Red, Red Orange,
Dark Peach, Mulberry, Burnt Pink, Red Pink, Rosy Pink, Purple Iris, Purple Jam, Dark Orchid,
Rich Lilac, Persian Indigo, Blueberry, Dark Lavender, Lavender, Denim Blue, Cerulean Blue,
Moody Blue, Royal Azure, Water Blue, Azure, Crystal Blue, Venice Blue, Bondi Blue, Bright Cerulean,
Picton Blue, Deep Aqua, Teal Blue, Topaz, Aquamarine Blue, Aqua Deep, Pine Green, Teal,
Light Sea Green, Everglade, Fern Green, Green Apple, Pistachio, Green Leaf, Muted Green, Mantis,
Pale Olive, Hazel, Mustard Green, Pear, Golden Sand, Pumpkin, Sunglow, Banana Yellow, Sandy Yellow,
Blaze Orange, Orange Peel, Golden Yellow, Naples Yellow, Deep Orange, Gold Drop, Medium Orange,
Butterscotch, Rusty Red, Reddish Orange, Portland Orange, Coral, English Walnut, Irish Coffee,
Ferra, Pale Oyster, Gunmetal, River Bed, Slate Blue, Cadet Grey, Davy Grey, Regent Grey.

(Each swatch carries its hex via `background-color`; e.g. Black `#000000`, Red `#d2232a`,
Green `#1c4120`, Blue `#0b48a0`, Pink `#ff60b2`, Orange `#ff6a13`, Purple `#582c83`, Gold `#b59f65`.)
**Monogram Color 2** additionally offers **Transparent**.

### Fonts — **4** (Personalized only)
Kabel Dm BT *(default)*, Calibri, Lucida Handwriting, Bradley Hand.

### Size — **3** (Personalized)
Standard *(default)*, Large, Max.

### Number — Custom Player Number
00, then 1 … 99. Default **73**.

### Text limits
Up to **3 lines**, **17 chars** per line (Personalized). AlignXL optional text also 17 chars.

### Fees / add-ons
**"Add Additional Personalization $5.00/dz"** checkbox appears on **Personalized, Custom Player
Number, Photo, Icons**. AI helpers: **Show AI Suggestions** (Personalized text),
**AI Image Generator** (Photo).

---

## Mapping to the design bundle's `CS_*` primitives (for the build)

| Print type | Primitives to compose |
|---|---|
| Personalized | `TextLines` (3, max 17) · AI-suggest button · `ColorPicker`(81) · `FontPicker`(4) · `SizeToggle`(3) · `SecondImprint`($5/dz) |
| Custom Player Number | `NumberField`/number-select (00–99, def 73) · `SecondImprint`($5/dz) |
| Monogram | `StyleSelector` (grouped 3/2/1 initials) · `TextInput` · `ColorPicker`(81) ×2 (Color 2 +Transparent) |
| AlignXL | graphic `StyleSelector` · `TextInput`(opt, 17) · `ColorPicker` ×2 + "use same color" |
| Photo | `ImageUpload`(aiVariant) · `SecondImprint`($5/dz) |
| Icons | icon `StyleSelector` (~42, themed) · `SecondImprint`($5/dz) |
| IDAlign | graphic `StyleSelector` · `TextInput` · `ColorPicker` ×2 |
| Custom Logo | *(already built)* `ImageUpload` · `SecondImprint` · `CommercialBlock` |
| None / Folds of Honor | no controls (tile = apply/clear) |

### Follow-ups (not blocking the build)
- **AlignXL / IDAlign alignment graphics** are an art library (values like `star`, `quadArrow`);
  the exact graphic set wasn't fully enumerated — pull from the customizer's data when wiring art.
- **Icon art** (~42) — exact SVG/PNG assets to be pulled from the site at build time; names above.
- Confirm whether **"Add Additional Personalization"**, when checked, reveals a second set of
  line/color fields (expected) vs. just flags the order.
