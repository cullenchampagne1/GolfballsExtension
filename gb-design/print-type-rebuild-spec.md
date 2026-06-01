# Golf-Ball Print Types — Rebuild Spec
### Live-matched: real SVG graphics · full color (hex) · exact fields per type · what to change, where, how

**Source of truth:** live golfballs.com Titleist Pro V1 customizer popup, driven print-type by
print-type on 2026-05-31 (every dropdown + color bar + style picker opened and scraped).
Raw captures: `colors-live.json` (81 imprint colors w/ hex) and `live-graphics.json`
(every style option's asset URL + per-type field layout).

**Companion:** `print-type-graphics-preview.html` renders all of the SVGs + color swatches below
so you can see them exactly as the selector should look.

---

## 0 · The gaps & misjudgments in the current design spec

The exported design prototype (`custom-spec-*.{js,jsx}`) was built **before** the consumer print
types were inspected, and from the old "Custom-Logo-only is in scope" framing. Three classes of
problem, all of which break the selectors:

1. **Whole families are stubbed as "out of scope."** Personalized, Monogram, Photo, Custom Player
   Number, AlignXL, IDAlign, Icons, Folds of Honor render as **dimmed tiles / compact cards** with
   no real UI (`page.jsx` §3 `CompactModCard`, `blocks.jsx` `PrintTypeGrid` dims them + shows
   "Out of corporate scope"). You now want **all of them fully built**.

2. **Colors are abstract, not the real UI.** The prototype's `ColorPicker` is a **mode toggle**
   — *Single / Two-tone / Thread* — over ~4–11 placeholder swatches. The real customizer never
   shows a mode toggle. It shows a **single 81-color imprint `ColorSelectorBar`**, and for the
   two-color types it shows **two labeled bars — "Text Color" + "Line Color"** (AlignXL adds a
   *"Use same Color"* checkbox; Monogram's second bar adds *Transparent*). "Thread 11" is a
   **separate accessory-embroidery palette** that must NOT appear on golf-ball types at all.

3. **Style options have no real graphics.** `StyleSelector` draws glyphs (`◆ ★ ⚑`) and letters
   (`ABC`) as placeholders, so the tile can't show what you're actually choosing. Every style
   option on the live site is a **real raster thumbnail** (monogram layouts, alignment lines,
   icons). This spec supplies **clean SVG recreations** for the monogram + alignment styles and
   the **real PNG URLs** for the 30 icons.

Plus point fixes: wrong fonts; phantom color pickers on Custom Player Number and Icons; single
generic color on AlignXL/IDAlign.

---

## 1 · Exactly what to change — where — how

Keyed to the four bundle files. (Recreate in React for the extension; this maps prototype→correct.)

### `custom-spec-data.js` — `window.SPEC`

| Where | Now (wrong) | Change to (live) |
|---|---|---|
| `mods['Custom Player Number'].controls` | `['numberField','colorPicker']` | `['numberSelect','secondImprint']` — **remove colorPicker** (no color control exists). number = `00, 1–99`, default `73`. |
| `mods['AlignXL'].controls` | `['textLine','colorPicker']` | `['graphicSelect','textLineOptional','textColor','lineColor','useSameColor']` — graphic picker (8 styles), text max 17, **two** color bars. |
| `mods['IDAlign'].controls` | `['textLine','colorPicker']` | `['graphicSelect','initials','textColor','lineColor']` — graphic picker (12 styles), initials max 3, **two** color bars. |
| `mods['Icons'].controls` | `['styleSelector','colorPicker']` | `['iconGrid','secondImprint']` — **remove colorPicker** (icons are pre-colored art). 30 icons. |
| `mods['Monogram'].controls` | `['styleSelector','textLine','colorPicker']` | `['monogramStyle','initials','color1','color2']` — grouped graphic styles (7), **two** color bars (Color 2 adds Transparent). initials max 3. |
| `mods['Personalized'].controls` | `['textLine','colorPicker','fontPicker','sizeToggle']` | shape OK. Lines = 3 × max 17; color = imprint-81; **font options corrected** (below); size `Standard/Large/Max`. |
| `mods['Folds of Honor'].verified` | `'thumbnail'` | `'live'`, controls `[]` (one-click licensed art). |
| `mods` verified flags | `'thumbnail'` on Number/AlignXL/IDAlign/Icons/Folds | all → `'live'`. |
| `outScope` array | lists the 8 consumer types | **delete** — they're all in scope now. Render full, not compact. |
| `primitives` list | 10 abstract keys | replace per §2: split `colorPicker`→`colorBar`; add `graphicSelect`, `iconGrid`; `numberField`→`numberSelect`. |

### `custom-spec-controls.jsx` — the primitive components

| Where | Now (wrong) | Change to (live) |
|---|---|---|
| `FontPicker` `fonts` (line ~167) | `Kabel, Block, Script, Serif, Varsity` | `Kabel Dm BT` (default), `Calibri`, `Lucida Handwriting`, `Bradley Hand`. Render each name in its own face. |
| `ColorPicker` (lines ~109–143) | mode toggle Single/Two-tone/Thread + ~4–11 swatches | **Replace with `ColorBar`**: one scrollable swatch grid bound to a **palette prop** + a `label`. Imprint palette = the 81 in §4. Optional `transparent` swatch. No mode toggle. |
| (new) dual color | — | Compose **two `ColorBar`s** ("Text Color" + "Line Color") for AlignXL/IDAlign and ("Color 1"/"Color 2") for Monogram. AlignXL adds a `Use same Color` checkbox that mirrors Text→Line. |
| `StyleSelector` icons variant (lines ~202–209) | glyphs `◆ ★ ⚑ ☼ ♣ ✈` | **`iconGrid`**: 30 real PNGs (§6), 4-col grid, single-select. |
| `StyleSelector` monogram variant | text `ABC / A B / A` | **`monogramStyle`**: 7 SVG tiles (§5.1), grouped 3 / 2 / 1 Initials. |
| (new) `graphicSelect` | — | dropdown/grid of alignment-line SVG tiles — AlignXL 8 (§5.2), IDAlign 12 (§5.3). Shows the selected graphic in the trigger. |
| `NumberField` (line ~238) | free stepper, starts 73 | **`numberSelect`**: enumerated `00, 1…99`, default `73`. |

### `custom-spec-blocks.jsx`

| Where | Now (wrong) | Change to (live) |
|---|---|---|
| `PrintTypeGrid` tiles (lines ~114–123) | 8 tiles, abstract circles, consumer dimmed | 10 real tiles: None, Personalized, Custom Logo, Custom Player Number, Monogram, AlignXL, Photo, Icons, IDAlign, Folds of Honor (+ "See All Print Options" expander). Use the real `data-value`s (§3 table). |
| `PrintTypeGrid` (lines ~142, 162–168) | `opacity:.5` on consumer; "Out of corporate scope" message | remove dimming; **every tile opens its real assembled modal** (live preview left, controls right, Cancel/Save). |
| `ModAssembly` special-cases (lines ~52–60) | `colorPicker mode="single"`, `StyleSelector icons` | drive off the new control keys; render `graphicSelect`/`iconGrid`/dual `colorBar` per type. |

### `custom-spec-page.jsx`

| Where | Now (wrong) | Change to (live) |
|---|---|---|
| `Modifications` (lines ~199–207) | "Out of scope · consumer" + Inferred sections render compact | render the 8 consumer types as **full `ModCard`s** (assembled controls), same as corporate. |
| honesty box (lines ~367–369) | AlignXL/IDAlign/Icons/Number/Folds = "thumbnail only / not opened" | now **live-inspected** — update copy + badges to `live`. |

---

## 2 · The corrected control vocabulary

| key | component | notes |
|---|---|---|
| `imageUpload` | dropzone + email-art + design-help | Custom Logo, Photo (Photo adds *AI Image Generator*). |
| `textLine` | single-line input, `maxLength` | Personalized 3×17; AlignXL 1×17 (optional); Monogram/IDAlign "initials" ×3. |
| `colorBar` | **one** swatch grid; props: `palette`, `label`, `transparent?`, `default` | replaces the mode-toggle ColorPicker. Imprint-81 for balls; thread-11 only for accessory tab. |
| `fontSelect` | 4 imprint fonts, rendered in-face | Personalized only. |
| `sizeToggle` | segmented Standard / Large / Max | Personalized only. |
| `monogramStyle` | grouped SVG tile grid (3/2/1 Initials) | §5.1. |
| `graphicSelect` | alignment-line SVG tiles | AlignXL §5.2, IDAlign §5.3. |
| `iconGrid` | 30 PNG tiles, themed | §6. |
| `numberSelect` | enumerated 00, 1–99 (def 73) | Custom Player Number. |
| `secondImprint` | "Add Additional Personalization $5.00/dz" checkbox | Personalized, Custom Player Number, Photo, Icons. (Custom Logo's is the second-imprint→logo/text sub-flow.) |

---

## 3 · Exact fields, per print type

`value` = the Print Type dropdown `data-value`.

| # | Type (`value`) | In-modal editor? | Fields (in order) |
|---|---|---|---|
| 1 | None (`Stock`) | no — clears | — |
| 2 | Personalized (`Personalized`) | yes | Line 1* · Optional Line 2 · Optional Line 3 (each max 17) · **Color** (imprint-81, def Black) · **Font** (4, def Kabel Dm BT) · **Size** (Standard/Large/Max) · ☐ Add Additional Personalization $5.00/dz · *Show AI Suggestions* |
| 3 | Custom Logo (`Custom Logo`) | no — inline page | logo upload · email art · Second Imprint → (Second Logo / Personalization) · commercial block *(already built)* |
| 4 | Custom Player Number (`Custom Player Number`) | yes | **Number** (00, 1–99, def 73) · ☐ Add Additional Personalization $5.00/dz · **no color** |
| 5 | Monogram (`Monogram`) | yes | **Monogram Style** (7, grouped 3/2/1) · Line 1 (initials, max 3) · **Color 1** (imprint-81, def Black) · **Color 2** (imprint-81 **+ Transparent**, def Transparent) · footnote |
| 6 | AlignXL (`Align XL`) | yes | **Alignment Style** (8 graphics, def star) · Enter Text (optional, max 17) · **Text Color** (imprint-81, def Black) · **Line Color** (imprint-81) · ☐ Use same Color |
| 7 | Photo (`Photo`) | yes | image upload · *AI Image Generator* · ☐ Add Additional Personalization $5.00/dz |
| 8 | Icons (`Icon`) | yes | **Icon** grid (30, themed) · ☐ Add Additional Personalization $5.00/dz · **no color** |
| 9 | IDAlign (`IDAlign`) | yes | **Alignment** (12 graphics, def quadArrow) · Initials (max 3) · **Text Color** (imprint-81, def Black) · **Color**=line (imprint-81, def Black) |
| 10 | Folds of Honor (`Folds of Honor`) | no — fixed art | — |

> Footnote shown on Monogram: *"The design shown in the preview area to the left is what will be printed."*

---

## 4 · Full color (hex)

### 4.1 Imprint palette — 81 colors (golf-ball types: Personalized, Monogram ×2, AlignXL ×2, IDAlign ×2)
DOM order; first 8 = the "common" quick row. Default selection = **Black**.

```
 1 Black            #000000     28 Royal Azure       #013088     55 Golden Sand     #dde774
 2 Red              #d2232a     29 Water Blue        #1976d3     56 Pumpkin         #f47f16
 3 Green            #1c4120     30 Azure             #2196f3     57 Sunglow         #f9c031
 4 Blue             #0b48a0     31 Crystal Blue      #64b5f6     58 Banana Yellow   #ffeb3c
 5 Pink             #ff60b2     32 Venice Blue       #035697     59 Sandy Yellow    #fcf274
 6 Orange           #ff6a13     33 Bondi Blue        #0288d1     60 Blaze Orange    #ff6f00
 7 Purple           #582c83     34 Bright Cerulean   #02a9f5     61 Orange Peel     #ffa101
 8 Gold             #b59f65     35 Picton Blue       #4fc2f8     62 Golden Yellow   #fec107
 9 Chili Pepper Red #b61c19     36 Deep Aqua         #035f60     63 Naples Yellow   #fdd450
10 Persian Red      #d32f2e     37 Teal Blue         #0098a7     64 Deep Orange     #e65101
11 Red Orange       #f24334     38 Topaz             #01bcd3     65 Gold Drop       #f67b00
12 Dark Peach       #e57373     39 Aquamarine Blue   #4dd0e2     66 Medium Orange   #ff9700
13 Mulberry         #880d52     40 Aqua Deep         #014b3f     67 Butterscotch    #ffb64d
14 Burnt Pink       #c2175b     41 Pine Green        #00796a     68 Rusty Red       #bf360c
15 Red Pink         #eb1d63     42 Teal             #009788     69 Reddish Orange   #e64a15
16 Rosy Pink        #f06292     43 Light Sea Green   #4ab5a7     70 Portland Orange #fe5722
17 Purple Iris      #49148d     44 Everglade        #184d33     71 Coral           #ff8964
18 Purple Jam       #7a1fa2     45 Fern Green       #3b8c40     72 English Walnut   #3c2623
19 Dark Orchid      #9c28b1     46 Green Apple      #4cb050     73 Irish Coffee     #5d4038
20 Rich Lilac       #b968c7     47 Pistachio       #80c77f     74 Ferra            #765647
21 Persian Indigo   #301b90     48 Green Leaf      #33681e     75 Pale Oyster      #a0887e
22 Blueberry        #512da7     49 Muted Green     #699d3a     76 Gunmetal         #273238
23 Dark Lavender    #653bb7     50 Mantis         #8bc24a     77 River Bed         #465967
24 Lavender         #9675ce     51 Pale Olive     #acd683     78 Slate Blue        #5f7d8a
25 Denim Blue       #1c227f     52 Hazel          #817716     79 Cadet Grey        #90a4ad
26 Cerulean Blue    #4050b5     53 Mustard Green  #b0b42a     80 Davy Grey         #525252
27 Moody Blue       #7986cc     54 Pear           #cddc39     81 Regent Grey       #969696
```
**Monogram Color 2** additionally offers **Transparent** (default), for single-color monograms.

### 4.2 Thread palette — 11 (ACCESSORY EMBROIDERY ONLY — not golf balls)
Only the accessory "Personalized" decoration tab. Do **not** show on golf-ball print types.
Names (live): Black, White, Red, Orange, Grey, Navy, Green, Yellow, Blue, Purple, Pink.
*(Hex to be captured from an accessory product; the golf-ball spec doesn't use these.)*

---

## 5 · SVG graphics — monogram + alignment styles

Clean monochrome recreations using `currentColor` (so they take the swatch/preview color),
viewBox `0 0 84 48`, sized for a selector tile. Exact source art = the referenced PNG (§6).
Sample initials use **A B C** (3), **M D** (2), **A** (1).

### 5.1 Monogram styles (7) — grouped

**3 Initials**

`circle` · "Circle Monograms" *(default)* — `…/dropdown-personalization/thumb-monogram-circle.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Circle Monograms"><circle cx="42" cy="24" r="19" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="42" y="30" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="17" fill="currentColor">ABC</text></svg>
```
`hex` · "HMHexagramsWhite" — `…/thumb-monogram-hex.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Hexagram Monogram"><polygon points="42,6 60,15 60,33 42,42 24,33 24,15" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="42" y="29" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="currentColor">ABC</text></svg>
```
`gardenia` · "Gardenia" — `…/thumb-initials-gardenia.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Gardenia Monogram"><path d="M16,24q6,-7 12,0q-6,7 -12,0Z" fill="currentColor" opacity=".45"/><path d="M68,24q-6,-7 -12,0q6,7 12,0Z" fill="currentColor" opacity=".45"/><text x="42" y="31" text-anchor="middle" font-family="'Brush Script MT',cursive" font-style="italic" font-size="20" fill="currentColor">ABC</text></svg>
```

**2 Initials** (split)

`vertical` · "Initials Vertical" — `…/thumb-initials-split-vertical.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Initials split vertical"><text x="30" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="currentColor">M</text><line x1="42" y1="10" x2="42" y2="38" stroke="currentColor" stroke-width="1.4"/><text x="54" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="currentColor">D</text></svg>
```
`horizontal` · "Initials Horizontal" — `…/thumb-initials-split-horizontal.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Initials split horizontal"><text x="42" y="20" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="currentColor">M</text><line x1="28" y1="24" x2="56" y2="24" stroke="currentColor" stroke-width="1.4"/><text x="42" y="40" text-anchor="middle" font-family="Georgia,serif" font-size="15" fill="currentColor">D</text></svg>
```
`diagonal` · "Initials Diagonal" — `…/thumb-initials-split-diagonal.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Initials split diagonal"><text x="28" y="34" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="currentColor">M</text><line x1="58" y1="10" x2="26" y2="38" stroke="currentColor" stroke-width="1.4"/><text x="56" y="24" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="currentColor">D</text></svg>
```

**1 Initial**

`circle` · "Simple Circle" — `…/thumb-initials-circle.png`
```svg
<svg viewBox="0 0 84 48" role="img" aria-label="Single initial in circle"><circle cx="42" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="42" y="31" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="currentColor">A</text></svg>
```

### 5.2 AlignXL alignment styles (8) — `…/images/IDalign/align-xl-*.png`
A horizontal alignment band; the style = the band treatment. Default = `star`.
```svg
<!-- star  align-xl-icons-stars.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Star align line"><g fill="currentColor"><polygon points="14,18 15.8,22.1 20.2,22.1 16.6,24.7 17.9,28.9 14,26.4 10.1,28.9 11.4,24.7 7.8,22.1 12.2,22.1"/><polygon points="42,18 43.8,22.1 48.2,22.1 44.6,24.7 45.9,28.9 42,26.4 38.1,28.9 39.4,24.7 35.8,22.1 40.2,22.1"/><polygon points="70,18 71.8,22.1 76.2,22.1 72.6,24.7 73.9,28.9 70,26.4 66.1,28.9 67.4,24.7 63.8,22.1 68.2,22.1"/></g></svg>
<!-- Thin  align-xl-thin.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Thin align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
<!-- Medium  align-xl-medium.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Medium align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>
<!-- Thick  align-xl-thick.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Thick align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>
<!-- dot  align-xl-icons-dots.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Dot align line"><line x1="9" y1="24" x2="75" y2="24" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.5 11"/></svg>
<!-- skull  align-xl-icons-skulls.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Skull align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="1.6" fill="none"><line x1="37" y1="19" x2="47" y2="29"/><line x1="47" y1="19" x2="37" y2="29"/></g><circle cx="42" cy="24" r="4.5" fill="currentColor"/></svg>
<!-- martini  align-xl-icons-martini.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Martini align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M36,18 L48,18 L42,25 Z"/><line x1="42" y1="25" x2="42" y2="31"/><line x1="37" y1="31" x2="47" y2="31"/></g></svg>
<!-- wineglass  align-xl-icons-wine.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Wine glass align line"><line x1="8" y1="24" x2="76" y2="24" stroke="currentColor" stroke-width="2"/><g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M38,15 a4,5 0 0,0 8,0 Z"/><line x1="42" y1="20" x2="42" y2="31"/><line x1="37" y1="31" x2="47" y2="31"/></g></svg>
```

### 5.3 IDAlign alignment styles (12) — `…/images/IDalign/*.png`
Putting-alignment marks in a horizontal row. Default = `quadArrow`.
```svg
<!-- quadArrow  quadArrow.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Quad arrow"><g stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">{12,18 L18,24 L12,30} repeated at x-offsets 0,16,32,48 → use:</g><g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14,18 20,24 14,30"/><path d="M30,18 36,24 30,30"/><path d="M46,18 52,24 46,30"/><path d="M62,18 68,24 62,30"/></g></svg>
<!-- doubleRow  doubleRow.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Double row"><g stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 6"><line x1="10" y1="20" x2="74" y2="20"/><line x1="10" y1="28" x2="74" y2="28"/></g></svg>
<!-- chevron  chevron.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Chevron"><g stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M28,16 40,24 28,32"/><path d="M40,16 52,24 40,32"/></g></svg>
<!-- line  line.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Line"><line x1="10" y1="24" x2="74" y2="24" stroke="currentColor" stroke-width="2"/></svg>
<!-- skulls  skulls.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Skulls"><g><g stroke="currentColor" stroke-width="1.4" fill="none"><line x1="23" y1="20" x2="31" y2="28"/><line x1="31" y1="20" x2="23" y2="28"/><line x1="55" y1="20" x2="63" y2="28"/><line x1="63" y1="20" x2="55" y2="28"/></g><circle cx="27" cy="24" r="4" fill="currentColor"/><circle cx="42" cy="24" r="4" fill="currentColor"/><circle cx="59" cy="24" r="4" fill="currentColor"/></g></svg>
<!-- arrowStyled  arrowStyled.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Styled arrow"><g stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="24" x2="60" y2="24"/><path d="M52,16 64,24 52,32"/></g></svg>
<!-- solidArrow  solidArrow.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Solid arrow"><line x1="18" y1="24" x2="56" y2="24" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><polygon points="54,17 68,24 54,31" fill="currentColor"/></svg>
<!-- solidDots  solidDots.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Solid dots"><g fill="currentColor"><circle cx="20" cy="24" r="3.5"/><circle cx="31" cy="24" r="3.5"/><circle cx="42" cy="24" r="3.5"/><circle cx="53" cy="24" r="3.5"/><circle cx="64" cy="24" r="3.5"/></g></svg>
<!-- solidLine  solidLine.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Solid line"><line x1="10" y1="24" x2="74" y2="24" stroke="currentColor" stroke-width="6" stroke-linecap="round"/></svg>
<!-- solidStars  solidStars.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Solid stars"><g fill="currentColor"><polygon points="24,18 25.8,22.1 30.2,22.1 26.6,24.7 27.9,28.9 24,26.4 20.1,28.9 21.4,24.7 17.8,22.1 22.2,22.1"/><polygon points="42,18 43.8,22.1 48.2,22.1 44.6,24.7 45.9,28.9 42,26.4 38.1,28.9 39.4,24.7 35.8,22.1 40.2,22.1"/><polygon points="60,18 61.8,22.1 66.2,22.1 62.6,24.7 63.9,28.9 60,26.4 56.1,28.9 57.4,24.7 53.8,22.1 58.2,22.1"/></g></svg>
<!-- martiniGlasses  martiniGlasses.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Martini glasses"><g stroke="currentColor" stroke-width="1.5" fill="none">{bowl/stem/base repeated at cx 27,42,57}<path d="M22,17 32,17 27,24 Z"/><line x1="27" y1="24" x2="27" y2="31"/><line x1="23" y1="31" x2="31" y2="31"/><path d="M37,17 47,17 42,24 Z"/><line x1="42" y1="24" x2="42" y2="31"/><line x1="38" y1="31" x2="46" y2="31"/><path d="M52,17 62,17 57,24 Z"/><line x1="57" y1="24" x2="57" y2="31"/><line x1="53" y1="31" x2="61" y2="31"/></g></svg>
<!-- wine  wine.png -->
<svg viewBox="0 0 84 48" role="img" aria-label="Wine glasses"><g stroke="currentColor" stroke-width="1.5" fill="none"><path d="M23,15 a4,5 0 0,0 8,0 Z"/><line x1="27" y1="20" x2="27" y2="31"/><line x1="23" y1="31" x2="31" y2="31"/><path d="M38,15 a4,5 0 0,0 8,0 Z"/><line x1="42" y1="20" x2="42" y2="31"/><line x1="38" y1="31" x2="46" y2="31"/><path d="M53,15 a4,5 0 0,0 8,0 Z"/><line x1="57" y1="20" x2="57" y2="31"/><line x1="53" y1="31" x2="61" y2="31"/></g></svg>
```

> The `quadArrow` and `martiniGlasses` snippets above contain a shorthand comment for the repeat;
> the rendered, de-duplicated versions are in `print-type-graphics-preview.html`.

---

## 6 · Icons (30) — real PNG assets (themed)

Host: `https://static.golfballs.com/A/icons/`. These are detailed color illustrations — **use the
real PNGs** (hotlink or download), don't hand-trace. Single-select grid, 4 columns.

| Theme | Icons (`alt` = file.png) |
|---|---|
| Dad / Father's Day (5) | Dad Beer `dad-beer` · No. 1 Dad `no-1-dad` · Tie `tie` · Dad Crown `dad-crown` · Best Dad by Par `best-dad-by-par` |
| Drinks (9) | Martini `martini2` · Old Fashioned `old-fashioned` · Tom Collins `tom-collins` · Bloody Mary `bloody-mary` · Margarita `margarita` · Cosmopolitan `cosmopolitan` · Wine Glass `wine-glass` · Beer Mug `beer-mug-colored` · Cigar `cigar` |
| USA / Patriotic (4) | USA Sunglasses `usa-sunglasses` · USA Wordmark `usa-wordmark` · USA Flag `usa-flag` · Merica `merica` |
| Masters (4) | Masters Azalea `masters-azalea` · Masters Sweet Tea `masters-sweet-tea` · Masters Pimento Cheese `masters-pimento-cheese` · Masters Jumpsuit `masters-jumpsuit` |
| Misc (8) | Four-leaf Clover `fourleafclover-full-color` · Flamingo `flamingo-colored` · Sunglasses `sunglasses` · Skull & Crossbones `skullandcrossbones` · Ladybug `ladybug-color` · Bomb `bomb` · Taco `taco` · Dots Green `dots-green` |

### Asset hosts (reference)
- Monogram thumbs: `https://d1tp32r8b76g0z.cloudfront.net/images/productPage/dropdown-personalization/`
- Alignment graphics (AlignXL + IDAlign): `https://d1tp32r8b76g0z.cloudfront.net/images/IDalign/`
- Icons: `https://static.golfballs.com/A/icons/`
