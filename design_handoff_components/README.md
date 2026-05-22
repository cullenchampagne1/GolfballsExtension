# Component Build Spec — Golfballs Extension Design System

## How to use this package

You have **two source-of-truth files**:

1. **`theme.css`** — the token system. Drop in as-is. All four themes (Dark, Midnight, Light, Cream) ship in this one file.
2. **`components-reference.jsx`** — a **working implementation** of every component. Inline styles, but every color reads from the tokens in `theme.css`. **This is the styling reference.** You will rewrite it in your host codebase's idiom (CSS Modules, vanilla-extract, Tailwind, styled-components, etc.) — but the visual output should match this file exactly.

This README sits on top of those two files and adds:
- The prop API contract each component must honor
- Sizes, tones, states (a flat list of what visual variants exist)
- **Animation specs** — what transitions when, durations, easings, the async state-transition rules (`idle → loading → success → idle`)
- Composition patterns (Field+Input, ModalShell+Header+Footer)

**Workflow:**
1. Open `reference/Design System.html` in a browser. Toggle themes. This is what "done" looks like.
2. Read `components-reference.jsx` end-to-end. Each component is ~30–80 lines. Note the visual structure.
3. Read this README's component spec for the same component. Note the prop API + animation rules.
4. Build the production version in your codebase, matching both.
5. Repeat per component, in the order listed below (dependencies flow top-down).

---

## Deliverables

```
your-output/
├── components/
│   ├── Btn.jsx              ← + the component primitives, one per file
│   ├── IconBtn.jsx
│   ├── Tag.jsx
│   ├── … (full list below)
│   ├── icons.jsx            ← shared icon registry
│   └── index.js             ← re-exports everything
└── theme.css                ← copy of the provided theme.css
```

Use `theme.css` exactly as provided. Don't add tokens, don't rename tokens, don't substitute literal hex values anywhere — every color in every component must read from a `--gb-*` CSS variable.

---

## Files in this package

```
design_handoff_components/
├── README.md                                  ← you are here (the spec)
├── theme.css                                  ← THE TOKEN SYSTEM. Copy this in as-is.
├── components-reference.jsx                   ← THE STYLING REFERENCE. Working implementation of every component.
└── reference/
    ├── Design System.html                     ← open in a browser; toggle Dark/Midnight/Light/Cream
    └── system-page.jsx                        ← showcase page that demos every component in context
```

The reference JSX is **inline-styled** for portability — you can drop it into any React project and it just works. In your production build, extract the styles into whatever your host codebase uses (CSS Modules, styled-components, etc.). The **token references must stay intact** — never substitute a literal value where a `var(--gb-*)` appears in the reference.

The **prop API must match exactly** so design intent is preserved across the rewrite.

---

## Setup

### 1. Theme file

Copy `theme.css` into the project. It's self-contained — defines all `--gb-*` tokens for four themes (Dark, Midnight, Light, Cream). Component files must not declare new tokens; if you find a missing token, escalate before adding one.

### 2. Fonts

The theme file imports Geist and Geist Mono from Google Fonts. If your host project ships its own fonts, update the `@import` URL at the top of `theme.css`.

### 3. Base styles

In your host app's root CSS, add:

```css
body {
  font-family: var(--gb-font-sans);
  background: var(--gb-surface-canvas);
  color: var(--gb-text-secondary);
  -webkit-font-smoothing: antialiased;
}
@keyframes gb-spin   { to { transform: rotate(360deg); } }
@keyframes gb-pulse  { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes gb-shake  { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
@keyframes gb-pop    { 0% { transform: scale(.4); } 65% { transform: scale(1.15); } 100% { transform: scale(1); } }
@keyframes gb-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes gb-slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
```

These keyframes are referenced by multiple components.

---

## Animation foundation

The theme exposes three motion tokens. Use them, don't hardcode timing.

| Token | Duration | Easing | Use when |
|---|---|---|---|
| `--gb-anim-fast` | 0.12s | `cubic-bezier(.4,0,.2,1)` | Hover, focus ring, knob slide, chevron rotate |
| `--gb-anim` | 0.18s | `cubic-bezier(.4,0,.2,1)` | Most state transitions: bg, color, border, opacity |
| `--gb-anim-bounce` | 0.28s | `cubic-bezier(.34,1.4,.64,1)` | Modal enter, dropdown menu open, badge appear |

### State-transition rules

The hardest part of UI animation is the **handoff between async states**. Bad implementations swap state instantly; good ones interpolate. Here's the rulebook:

**Idle → Loading**
- Icon swaps to spinner with a 0.12s crossfade
- Label stays in place (don't change the button width on the spinner swap)
- If the button has both an icon and a label, the spinner takes the icon's slot — never both
- Disable the button immediately (`pointer-events: none`), but visually the button doesn't dim until the action completes or fails

**Loading → Success**
- Spinner crossfades to checkmark over 0.18s
- Button background flashes brighter brand for 0.3s (use `--gb-brand-tint-strong` momentarily, then revert)
- If the action completes a multi-step flow, optionally pulse once with `animation: gb-pop .28s` on the checkmark icon
- After 1.0–1.5s, revert to idle state

**Loading → Error**
- Spinner crossfades to alert icon over 0.18s
- Button background shifts to `var(--gb-error-tint-medium)` and stays there
- Horizontal shake: `animation: gb-shake .35s cubic-bezier(.36,.07,.19,.97)`
- Stays in error state until user clicks (then revert to idle) or 3.0s timeout

**Hover**
- Background and border colors transition over `--gb-anim-fast`
- Never animate `transform: translateY()` on buttons — it conflicts with click feedback

**Click / press**
- `transform: scale(.97)` for 0.08s on press, immediately return on release
- Use `:active { transform: scale(.97); transition: transform .08s; }` — don't put scale in a JS handler

**Focus**
- Focus ring (`--gb-focus-ring`) appears with `transition: box-shadow var(--gb-anim-fast)`
- Never animate the ring's spread radius from 0 — looks janky. Just opacity in/out of a fixed-size ring

### What NOT to animate

- Don't animate **width** unless it's a deliberate progress indicator
- Don't animate **font-size** ever
- Don't animate **border-width** — animate `border-color` only
- Don't bounce backgrounds. Bounce is reserved for entrances (modals, menus, badges)

---

## Color picker library — react-beautiful-color

The `Color*` components in `components-reference.jsx` use the native `<input type="color">` so the reference runs in a browser without a build step. In production, swap the native input for [**`react-beautiful-color`**](https://www.npmjs.com/package/react-beautiful-color).

```bash
npm install react-beautiful-color
```

Build a single `SwatchPicker` wrapper that hosts the library inside a popover, then re-use it in all five Color* components wherever the swatch tile lives:

```jsx
import { ColorPicker } from 'react-beautiful-color';

function SwatchPicker({ value, onChange, children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <div ref={ref} onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        {children}
      </div>
      {open && (
        <Popover anchorRef={ref} onClose={() => setOpen(false)} style={{
          boxShadow: 'var(--gb-shadow-popover)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-md)',
          background: 'var(--gb-surface-modal)',
        }}>
          <ColorPicker color={value} onChange={c => onChange(c.hex)} width={220} />
        </Popover>
      )}
    </>
  );
}
```

**Notes:**
- Keep the popover inside an element you control, themed with `--gb-shadow-popover` and `--gb-border-default`.
- The typed hex input below the swatch stays separate — independently editable.
- The Reset button stays — sets `value` back to `defaultValue` regardless of picker implementation.
- Debounce `onChange` by ~50ms before propagating to `theme.css` CSS variables; otherwise dragging produces dozens of state updates per second.
- Components needing the swap: `ColorSpotlight`, `ColorHero`, `ColorPreview`, `ColorBank` (per-row), `ColorStatus`.

---

## Component build list

Components are listed in dependency order — build top-down. Each has the same spec shape:
- **Purpose** · what this primitive owns
- **Props** · the full API
- **States** · what visual states exist
- **Animations** · what transitions per state
- **Tokens used** · the `--gb-*` variables this component reads

### 01 · Icon registry (`icons.jsx`)

The shared inline-SVG library. Every other component pulls from it.

**Export shape:**
```jsx
export const I = {
  mail: (props) => <Icon {...props}><path d="..." /></Icon>,
  card: (props) => <Icon {...props}><rect ... /><path ... /></Icon>,
  // ...28 icons total — see reference file
};

export const Icon = ({ size = 14, strokeWidth = 2, children, style, ...rest }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0, ...style }}
    {...rest}
  >{children}</svg>
);
```

**Required icons** (see reference file for paths): `mail, cog, card, edit, eye, check, send, search, close, plus, chevd, chevr, trash, alert, bolt, copy, user, filter, more, sun, moon`.

**Customization:** Icons inherit `currentColor` and accept `size` and `strokeWidth`. Never set their color directly — let the parent control it via `color`.

---

### 02 · Btn

**Purpose:** The single button primitive. Six visual variants. Status overlay for tinted buttons. Loading and async-state transitions.

**Props:**
```ts
type BtnProps = {
  variant?: 'primary' | 'secondary' | 'tinted' | 'ghost' | 'danger' | 'dashed';  // default 'secondary'
  size?: 'xs' | 'sm' | 'md' | 'lg';                                              // default 'md'
  status?: 'brand' | 'error' | 'warning';                                         // tinted variant only
  state?: 'idle' | 'loading' | 'success' | 'error';                              // async state
  icon?: ReactElement;
  iconRight?: ReactElement;                                                       // icon after the label
  children?: ReactNode;
  full?: boolean;                                                                 // 100% width
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void | Promise<void>;
} & ButtonHTMLAttributes<HTMLButtonElement>;
```

**Sizes** (height / horizontal padding / font-size / gap / iconSize):
- `xs` — 22 / 8 / 10.5 / 4 / 10
- `sm` — 26 / 10 / 11 / 5 / 11
- `md` — 32 / 12 / 12 / 6 / 12
- `lg` — 38 / 16 / 13 / 7 / 13

**Variants — visual map:**

| Variant | Background | Color | Border |
|---|---|---|---|
| `primary` | `linear-gradient(180deg, var(--gb-brand) 0%, var(--gb-brand-dark) 100%)` | `var(--gb-text-on-brand)` | `1px solid var(--gb-brand-border)` |
| `secondary` | `var(--gb-fill-subtle)` | `var(--gb-text-secondary)` | `1px solid var(--gb-border-default)` |
| `tinted` (status=brand) | `var(--gb-brand-tint-medium)` | `var(--gb-brand-label)` | `1px solid var(--gb-brand-tint-border)` |
| `tinted` (status=error) | `var(--gb-error-tint-medium)` | `var(--gb-error-fg)` | `1px solid var(--gb-error-tint-border)` |
| `tinted` (status=warning) | `var(--gb-warning-tint-medium)` | `var(--gb-warning-fg)` | `1px solid var(--gb-warning-tint-border)` |
| `ghost` | `transparent` | `var(--gb-text-tertiary)` | `1px solid transparent` |
| `danger` | `var(--gb-error-tint-medium)` | `var(--gb-error-fg)` | `1px solid var(--gb-error-tint-border)` |
| `dashed` | `var(--gb-brand-tint-soft)` | `var(--gb-brand-label)` | `1px dashed var(--gb-brand-tint-border)` |

**State animations** (the important part):

```jsx
function Btn({ state = 'idle', icon, children, ... }) {
  // Internally controlled state if onClick returns a Promise:
  const [autoState, setAutoState] = useState('idle');
  const effectiveState = state !== 'idle' ? state : autoState;

  const handleClick = async (e) => {
    if (!onClick) return;
    const result = onClick(e);
    if (result?.then) {
      setAutoState('loading');
      try { await result; setAutoState('success'); }
      catch { setAutoState('error'); }
      finally { setTimeout(() => setAutoState('idle'), 1200); }
    }
  };

  // Slot the icon based on state — see animation specs above
  const slotIcon = effectiveState === 'loading' ? <Spinner /> :
                   effectiveState === 'success' ? <I.check /> :
                   effectiveState === 'error'   ? <I.alert /> :
                   icon;
  // The icon container should crossfade — wrap in a key-changing component
}
```

The reference JSX doesn't implement this; the production version should. **The button must internally handle async `onClick` returning a Promise** — that's the contract.

**Animations:**
- Idle → Hover: bg/border `transition: background var(--gb-anim-fast), border-color var(--gb-anim-fast)`
- :active: `transform: scale(.97); transition: transform .08s`
- Icon swap (idle → loading → success/error): wrap icon in a position-relative container, crossfade swapped children over `var(--gb-anim)` (use `key={effectiveState}` + `<AnimatePresence>` or hand-rolled opacity)
- Spinner: `animation: gb-spin .8s linear infinite` on a styled circular border
- Success flash: when entering success, briefly bump background to a brighter tint for 0.3s then settle
- Error shake: `animation: gb-shake .35s cubic-bezier(.36,.07,.19,.97)` triggered when entering error state
- Disabled: `opacity: .5; cursor: not-allowed; pointer-events: none` (no transition needed)
- Loading: button is disabled but **does not reduce opacity** — the spinner already communicates state

**Tokens used:** every brand/error/warning tint family, all text-on-* tokens, all border tokens, `--gb-fill-subtle`, all `--gb-r-*`, `--gb-anim*`, `--gb-focus-ring`.

---

### 03 · IconBtn

**Purpose:** Square icon-only button. Modal close, row actions, header gear, RTE toolbar.

**Props:**
```ts
type IconBtnProps = {
  icon: ReactElement;
  size?: 'xs' | 'sm' | 'md' | 'lg';                            // default 'md' — 22/26/32/38px square
  variant?: 'secondary' | 'ghost';                              // default 'secondary'
  danger?: boolean;                                             // overrides palette to error tones
  active?: boolean;                                             // pressed/selected state
  state?: 'idle' | 'loading' | 'success' | 'error';
  tooltip?: string;
  onClick?: (e: MouseEvent) => void | Promise<void>;
};
```

**Visual:**
- `secondary`: `bg: var(--gb-fill-subtle)`, `color: var(--gb-text-tertiary)`, `border: 1px solid var(--gb-border-default)`
- `ghost`: `bg: transparent`, `color: var(--gb-text-tertiary)`, `border: 1px solid transparent`
- `active`: `bg: var(--gb-brand-tint-medium)`, `color: var(--gb-brand-label)`, `border: 1px solid var(--gb-brand-tint-border)`
- `danger`: `bg: var(--gb-error-tint-soft)`, `color: var(--gb-error-fg)`, `border: 1px solid var(--gb-error-tint-border)`

**Animations:** same as `Btn` (state transitions, hover, click, focus).

---

### 04 · Tag

**Purpose:** Uppercase status badge. Match labels, counts, role chips.

**Props:**
```ts
type TagProps = {
  tone?: 'neutral' | 'brand' | 'error' | 'warning' | 'success' | 'info';   // default 'neutral'
  size?: 'xs' | 'sm' | 'md' | 'lg';
  mono?: boolean;
  icon?: ReactElement;
  onRemove?: () => void;
  pulse?: boolean;                                            // animates with a soft pulse — for "live" badges
  children: ReactNode;
};
```

**Sizes** (font / padding / radius / gap / iconSize):
- `xs` — 9 / 1px 5px / 3 / 3 / 8
- `sm` — 9.5 / 1px 6px / 4 / 4 / 9
- `md` — 10.5 / 2px 7px / 5 / 4 / 10
- `lg` — 11.5 / 3px 9px / 5 / 5 / 11

**Tones:** for each tone, use the 5-token family: `bg = --gb-{tone}-tint-medium`, `color = --gb-{tone}-fg`, `border = 1px solid --gb-{tone}-tint-border`. Neutral uses `--gb-fill-subtle` / `--gb-text-tertiary` / `--gb-border-default`.

**Animations:**
- `pulse={true}` → `animation: gb-pulse 2s ease-in-out infinite`
- On mount (when used as a watch-badge count): `animation: gb-pop .28s cubic-bezier(.34,1.4,.64,1)`
- onRemove × icon hover: bg `transition: background var(--gb-anim-fast)`

**Always uppercase. Always letter-spacing .3px.** No exceptions.

---

### 05 · Chip

**Purpose:** Mixed-case label. Variables (`{{order_id}}`), filter conditions, inline tokens.

**Props:**
```ts
type ChipProps = {
  tone?: 'brand' | 'neutral';                                // default 'brand'
  code?: boolean;                                            // use mono font
  onRemove?: () => void;
  children: ReactNode;
};
```

**Animations:** same hover-only as Tag. No pulse, no pop.

---

### 06 · Dot

**Purpose:** Match indicator. Live status. 6–10px filled circle.

**Props:**
```ts
type DotProps = {
  tone?: 'brand' | 'error' | 'warning' | 'success' | 'muted';   // default 'brand'
  size?: number;                                                  // default 6
  glow?: boolean;                                                 // adds a soft outer glow
  pulse?: boolean;                                                // for "live" indicators
};
```

**Animations:**
- `pulse`: `animation: gb-pulse 1.2s ease-in-out infinite`
- `glow`: `box-shadow: 0 0 ${size}px {color}, 0 0 ${size*2}px {color}33`

---

### 07 · Input · Textarea · Dropdown

**Purpose:** Three controls that share one visual shell. Build them as three components but extract the shell into an internal `inputBaseStyle()` helper.

**Shared visual:**
- Background: `var(--gb-fill-inverse-medium)` (recess effect — works in both light and dark)
- Border: `1px solid var(--gb-border-default)` (idle) / `var(--gb-brand-label)` (focused) / `var(--gb-error)` (error)
- Focus ring: `box-shadow: var(--gb-focus-ring)` when focused
- Radius: `var(--gb-r-md)`
- Padding: `0 10px`
- Heights: `sm: 28`, `md: 32`, `lg: 36`

**Input props:**
```ts
type InputProps = {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  mono?: boolean;
  error?: boolean;
  leading?: ReactElement;        // icon or "$" prefix
  trailing?: ReactElement;       // unit or clear button
  type?: 'text' | 'number' | 'email' | 'tel';
  onChange?: (value: string) => void;          // — emits the value directly, not the event
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
};
```

**Textarea props:** same as Input minus `type`, plus `rows: number` (default 3) and `resize: 'none' | 'vertical'` (default 'none').

**Dropdown props:**
```ts
type DropdownProps = {
  value?: string;
  placeholder?: string;
  options: Array<{ id: string; label: string; disabled?: boolean; group?: string }>;
  size?: 'sm' | 'md' | 'lg';
  leading?: ReactElement;
  searchable?: boolean;
  onChange?: (id: string) => void;
};
```

**Dropdown menu animation:**
- Open: `opacity 0 → 1, transform: translateY(-4px) scaleY(.95) → translateY(0) scaleY(1)` over `var(--gb-anim-bounce)`
- Close: reverse over `var(--gb-anim)`
- Chevron rotation: `transform: rotate(180deg)` over `var(--gb-anim-fast)`
- Menu shadow: `var(--gb-shadow-popover)`
- Menu max-height: 240px, scrollable, hide scrollbar except on hover (`scrollbar-width: thin`)

**Input field state animations:**
- Focus: border-color and box-shadow over `var(--gb-anim-fast)`
- Error: red border + `animation: gb-shake .35s` once when error state changes from `false → true`

---

### 08 · Field

**Purpose:** Labelled wrapper. Composes any control with a top label, optional hint below, optional required marker.

**Props:**
```ts
type FieldProps = {
  label?: string;
  hint?: string;
  required?: boolean;
  error?: string;             // when truthy, shown in place of hint with error color
  children: ReactNode;
};
```

**Visual:**
- Wrapper: `display: flex; flex-direction: column; gap: 5px`
- Label: `9–10px font, weight 700, uppercase, letter-spacing .8px, color: var(--gb-text-muted)`
- Required: red asterisk inline
- Hint: `10.5px, color: var(--gb-text-muted), line-height: 1.4`
- Error message: same shape as hint, color `var(--gb-error-fg)`, slides in over `var(--gb-anim)`

---

### 09 · Switch

**Purpose:** Boolean toggle. For "is this enabled?" — not for list/row selection (use Checkbox for that).

**Props:**
```ts
type SwitchProps = {
  on: boolean;
  size?: 'sm' | 'md' | 'lg';                  // default 'md'
  tone?: 'brand' | 'warning';                  // warning for "experimental" toggles
  disabled?: boolean;
  onChange?: (next: boolean) => void;
};
```

**Sizes** (track w / track h / knob):
- `sm` — 28 / 16 / 12
- `md` — 34 / 20 / 16
- `lg` — 40 / 22 / 18

**Visual:**
- Off: track `var(--gb-fill-inverse-medium)`, knob `var(--gb-text-tertiary)`
- On (brand): track `var(--gb-brand-tint-medium)`, knob `var(--gb-brand-label)`, track border `var(--gb-brand)`
- On (warning): same shape, warning tokens

**Animation:**
- Knob position: `transition: left var(--gb-anim)`
- Knob color: `transition: background var(--gb-anim)`
- Track color: `transition: background var(--gb-anim), border-color var(--gb-anim)`

---

### 10 · PillTag

**Purpose:** Tag that can be on or off — for exclusive selection (radio-style) or toggle (boolean per item). Used in the Submit Proof modal's order-type and flags rows.

**Props:**
```ts
type PillTagProps = {
  on: boolean;
  icon?: ReactElement;
  onClick?: () => void;
  children: ReactNode;
};
```

**Visual:**
- Off: `bg: var(--gb-fill-subtle)`, `color: var(--gb-text-muted)`, `border: 1px solid var(--gb-border-default)`
- On: `bg: var(--gb-brand-tint-medium)`, `color: var(--gb-brand-label)`, `border: 1px solid var(--gb-brand-tint-border)`

**Animation:** bg/color/border transition over `var(--gb-anim)`. No other motion.

---

### 11 · Checkbox

**Purpose:** **Distinct from Switch.** For multi-select lists, table rows, "select all" patterns.

**Props:**
```ts
type CheckboxProps = {
  checked: boolean;
  indeterminate?: boolean;                       // "some selected, not all"
  size?: 'sm' | 'md' | 'lg';                     // 14 / 17 / 20 box
  tone?: 'brand' | 'error';                       // error for destructive "mark as junk" etc
  label?: string;
  hint?: string;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
};
```

**Sizes** (box / check-icon / gap / label-font):
- `sm` — 14 / 9 / 7 / 11.5
- `md` — 17 / 11 / 9 / 12
- `lg` — 20 / 13 / 10 / 13

**Visual:**
- Off: `bg: var(--gb-fill-inverse-medium)`, `border: 1.5px solid var(--gb-border-strong)`
- On: `bg: var(--gb-brand-tint-medium)`, `border: 1.5px solid var(--gb-brand-label)`, check icon `color: var(--gb-brand-label)`
- Indeterminate: same as on, but renders a 2px-tall bar instead of the check icon

**Animation:**
- Check icon enters with `transform: scale(.5) → scale(1)` over `var(--gb-anim-bounce)`
- bg/border transition over `var(--gb-anim)`

---

### 12 · Slider

**Purpose:** Single-thumb range input.

**Props:**
```ts
type SliderProps = {
  value: number;
  min?: number;                                  // default 0
  max?: number;                                  // default 100
  step?: number;                                 // default 1
  unit?: string;                                 // 's' | '%' | '$' — shown in value pill
  showValue?: boolean;                           // default true — value pill on the right
  showRange?: boolean;                           // default false — min/max under the track
  ticks?: number[];                              // optional tick positions
  tone?: 'brand' | 'warning';
  onChange?: (next: number) => void;
};
```

**Visual:**
- Track: 4px height, `var(--gb-fill-inverse-medium)` with subtle border
- Fill: from min to thumb, `var(--gb-brand-label)` with glow shadow
- Thumb: 14px circle, `var(--gb-surface-1)` bg, 2px border in fill color, drop shadow + focus ring
- Value pill: mono font, tint-medium bg, tint-border border, 5px radius

**Animation:**
- Thumb focus ring: appears with opacity over `var(--gb-anim-fast)`
- Thumb drag: no transition (live position)
- Value pill: number rolls — if implementing this, use a tweened counter; otherwise just snap

---

### 13 · RangeSlider

**Purpose:** Two-thumb range. For "filter from X to Y" UIs.

**Props:**
```ts
type RangeSliderProps = {
  values: [number, number];                      // [low, high]
  min?: number; max?: number; step?: number;
  unit?: string;
  showValues?: boolean;                          // default true — pills flank the track
  showRange?: boolean;
  ticks?: number[];
  tone?: 'brand' | 'warning';
  onChange?: (next: [number, number]) => void;
};
```

**Visual:**
- Same as Slider, but two thumbs, and the fill is between the thumbs (not from min)
- Value pills flank the slider (low on the left, high on the right) instead of trailing on one side

**Interaction notes:**
- Each thumb is independently draggable
- Thumbs cannot cross — clamp `low ≤ high`
- Both can be at the same position (zero-width range)

---

### 14 · SwitchTag

**Purpose:** Tag + Switch combined. Inline feature flags, per-row enable controls. Replaces the "label + separate switch row" pattern.

**Props:**
```ts
type SwitchTagProps = {
  on: boolean;
  label: string;
  icon?: ReactElement;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'neutral' | 'brand' | 'warning' | 'error';     // auto: off=neutral, on=brand
  onClick?: () => void;
};
```

**Sizes** (font / padding / switch-w / switch-h / knob):
- `sm` — 10.5 / 3px 7px / 22 / 12 / 8
- `md` — 11.5 / 4px 9px / 26 / 14 / 10
- `lg` — 12.5 / 5px 11px / 30 / 16 / 12

**Visual:**
- Tag chrome same as Tag (uppercase NOT required — labels are sentence-case here since they're feature names)
- Embedded switch is **smaller than the standalone Switch** — proportional to the tag size
- When on: switch track uses the tone's fg color; knob is `var(--gb-surface-1)` (light disc on colored track)

**Animation:**
- Knob position + colors transition over `var(--gb-anim)`
- Tag bg/border transition over `var(--gb-anim)` when toggling

---

### 15 · Callout

**Purpose:** Inline note box. Replaces every `.note-callout` instance. Tone-aware.

**Props:**
```ts
type CalloutProps = {
  tone?: 'info' | 'brand' | 'success' | 'warning' | 'error' | 'neutral';
  title?: string;
  icon?: ReactElement | false;                  // false = no icon. Default icon picked per tone.
  dismissable?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
};
```

**Visual:**
- Padding: 11px 14px
- Background: `var(--gb-{tone}-tint-soft)`
- Border: `1px solid var(--gb-{tone}-tint-border)`
- Left accent border: `3px solid var(--gb-{tone}-fg)`
- Border radius: `var(--gb-r-sm)`
- Icon: 13px, color `var(--gb-{tone}-fg)`, flex-start aligned with first text line

**Animation:**
- On mount: `animation: gb-slideUp .25s var(--gb-anim-bounce)` if appearing in response to an event (e.g. validation error). If static markup, no animation.
- On dismiss: fade out + collapse height over `var(--gb-anim)`

---

### 16 · ModalShell · ModalHeader · ModalFooter

**Purpose:** Three-zone modal pattern. Every injected modal in the extension uses this exact shape.

#### ModalShell

```ts
type ModalShellProps = {
  width: number;                                 // intrinsic width in px
  height?: number | 'auto';
  children: ReactNode;                           // expect [Header, Body, Footer]
};
```

**Visual:** flex column, `var(--gb-surface-canvas)` bg, `1px solid var(--gb-border-default)` border, `var(--gb-r-xl)` radius (14px), `var(--gb-shadow-modal)` shadow.

**Animation on mount:**
- Backdrop: `animation: gb-fadeIn .2s ease`
- Modal: `animation: gb-modalIn .28s var(--gb-anim-bounce)` where modalIn is `from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); }`

#### ModalHeader

```ts
type ModalHeaderProps = {
  icon?: ReactElement;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;                             // extra controls between subtitle and close
  accent?: boolean;                              // default true — icon tile uses brand tint
  onClose?: () => void;
};
```

**Visual:**
- Padding 14px 16px
- Background `var(--gb-fill-inverse-strong)`
- Border-bottom `1px solid var(--gb-border-subtle)`
- Icon tile: 30px square, `var(--gb-r-md)` radius, accent uses brand tint-medium + border, color `var(--gb-brand-label)`. Non-accent uses `var(--gb-fill-subtle)` + `var(--gb-text-tertiary)`.
- Title: 13/700 `var(--gb-text-primary)`
- Subtitle: 11/500 `var(--gb-text-muted)`
- Close: `IconBtn size="sm"` aligned right

#### ModalFooter

```ts
type ModalFooterProps = {
  children: ReactNode;                           // typically: [hint?, ghost-btn, primary-btn]
};
```

**Visual:** Padding 12px, `var(--gb-fill-inverse-strong)` bg, border-top `1px solid var(--gb-border-subtle)`, flex row, gap 8px.

---

### 17 · SectionLabel

**Purpose:** Uppercase section header with optional hairline divider and optional action slot.

**Props:**
```ts
type SectionLabelProps = {
  divider?: boolean;                             // default true — hairline rule to the right
  action?: ReactElement;                          // optional Btn or IconBtn on the far right
  children: ReactNode;
};
```

**Visual:** font 9.5px/700, uppercase, letter-spacing 1.2px, `var(--gb-text-muted)`. Divider is 1px hairline `var(--gb-border-subtle)` that fills the remaining horizontal space.

---

### 18 · Card

**Purpose:** Generic surface container.

**Props:**
```ts
type CardProps = {
  active?: boolean;                              // brand-tinted border + raised surface
  hover?: boolean;                               // bg shifts on hover
  padding?: number | string;                     // default 12
  onClick?: () => void;
  children: ReactNode;
};
```

**Visual:**
- Default: `bg: var(--gb-surface-1)`, `border: 1px solid var(--gb-border-default)`, `radius: var(--gb-r-md)`
- Active: `bg: var(--gb-surface-2)`, `border: 1px solid var(--gb-brand-tint-border)`
- Hover (when `hover={true}`): bg transitions to `var(--gb-surface-2)` over `var(--gb-anim-fast)`

---

### 19 · KeyVal

**Purpose:** Aligned key/value rows in info readouts.

**Props:**
```ts
type KeyValProps = {
  k: string;                                     // label, will be uppercased
  v: ReactNode;
  tone?: 'default' | 'ok' | 'error' | 'warn';
  mono?: boolean;                                // mono font for value
};
```

**Visual:**
- Key column: fixed 58px width, 9px/700 uppercase, `var(--gb-text-muted)`
- Value column: flex 1, 12px, color depends on tone (ok→`--gb-brand-label`, error→`--gb-error`, warn→`--gb-warning-fg`, default→`--gb-text-secondary`)
- Truncate with ellipsis if value overflows

---

## Composite components

The 19 primitives above are the foundation. The components below compose them for higher-level patterns — feature flags, color pickers, notifications. Implement them after the primitives are built.

### 20 · ExpandableFeature

**Purpose:** Toggle with a collapsible sub-settings panel. Header is the click target; body reveals when toggle is on. Used for settings rows that need nested configuration (Power Automate flow URL, Developer Mode test console).

**Props:**
```ts
type ExpandableFeatureProps = {
  on: boolean;
  onChange: (next: boolean) => void;
  name: string;
  desc?: string;
  icon?: ReactElement;
  tone?: 'brand' | 'warning';            // default 'brand'
  defaultExpanded?: boolean;             // default true
  children: ReactNode;                   // body content
};
```

**⚠️ Animation rework needed.** The reference implementation uses `animation: gb-toast-in-top` on the body, which is wrong (toast keyframe used for an inline expand). It also has no exit animation. Replace with a real height transition: either measure-and-animate, CSS-grid `grid-template-rows: 0fr → 1fr`, or Radix UI Collapsible. Duration ~220ms with `--gb-anim` (not bounce). Opacity fades alongside height, both directions.

**Tokens used:** `--gb-brand-tint-soft`, `--gb-brand-tint-border`, `--gb-warning-tint-soft`, `--gb-warning-tint-border`, `--gb-fill-inverse-soft`, all standard.

---

### 21–25 · FeatureToggle variants

Five attention-grabbing feature toggle treatments for when a flag is the center of the screen rather than background config. All share the same prop shape, differ only visually.

**Shared props:**
```ts
type FeatureToggleProps = {
  on: boolean;
  onChange: (next: boolean) => void;
  icon: ReactElement;
  name: string;
  desc?: string;
  experimental?: boolean;                // (Spotlight only) renders amber/warning tint
};
```

**21 · FeatureSpotlight** — 44px icon tile, prominent switch, soft 4px halo when on. Default attention-grabbing variant.

**22 · FeatureHero** — gradient background + radial glow when on, `ACTIVE`/`OFF` tag, large label. Most dramatic; for "headline" features.

**23 · FeaturePreview** — extra prop `preview: ReactNode`. Bottom panel renders example UI; desaturates when off, full color when on. Removes ambiguity about visual effect.

**24 · FeatureBank** — group toggles with master.
```ts
type FeatureBankProps = {
  title: string;
  items: Array<{ id: string; name: string; desc?: string; icon?: ReactElement; on: boolean }>;
  onChange: (nextItems: typeof items) => void;
};
```
Header shows "X/Y enabled" with mixed-state warning. Master switch in header toggles all.

**25 · FeatureStatus** — extra prop `stats: Array<{ label: string; value: string }>`. Live activity stats column with Live/Idle dot. For features with measurable ongoing state (active watches, queued tasks).

**Tokens used:** all brand-tint family, all warning-tint family, `--gb-fill-subtle`, `--gb-fill-inverse-soft`, standard borders.

---

### 26–30 · ColorPicker variants

Mirror the FeatureToggle structure but for color choices. **Production must swap native `<input type="color">` for react-beautiful-color** — see "Color picker library" section above.

**Shared props:**
```ts
type ColorPickerProps = {
  value: string;                          // hex
  defaultValue: string;                   // for the Reset button
  name: string;
  desc?: string;
  varName?: string;                       // CSS variable label, e.g. "--gb-brand-label"
  onChange: (hex: string) => void;
};
```

**26 · ColorSpotlight** — 88px full-height swatch, name + hex + Reset. "EDITED" pill in swatch corner when modified, halo glow on the card.

**27 · ColorHero** — the picked color IS the background. Auto-flips text/control colors for readability based on luminance. For the theme's flagship color.

**28 · ColorPreview** — extra prop `preview: (color: string) => ReactNode`. Bottom panel renders example UI using the live color value.

**29 · ColorBank** — for a palette of related colors.
```ts
type ColorBankProps = {
  title: string;
  palette: Record<string, string>;        // { brand: '#...', error: '#...', ... }
  defaults: Record<string, string>;       // same keys
  onChange: (nextPalette: typeof palette) => void;
};
```
Stacked-swatch preview in header, per-row pickers, "Reset all" when any are modified.

**30 · ColorStatus** — extra prop `contrast: { ratio: number; label: string }`. Shows live WCAG contrast against the surface, color-coded (AA pass / borderline / fail).

**Tokens used:** standard surfaces, borders, brand-tint family for "modified" emphasis.

---

### 31–36 · Notification variants

Six structurally different toast shapes. Pick the right one per intent. All share entrance animation patterns via the existing `gb-toast-in-{top,left,right}` keyframes in your base styles.

**31 · PillToast** — radical minimalism. Dot + message + close in a pill. For *"copied"*, *"saved"*, *"synced"*.
```ts
type PillToastProps = {
  tone?: 'info' | 'success' | 'brand' | 'warning' | 'error';
  message: ReactNode;
  onDismiss?: () => void;
};
```

**32 · ActionToast** — card with primary + secondary buttons baked in. Forces the toast to do work (Undo, Retry, View).
```ts
type ActionToastProps = {
  tone?: 'brand' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  primary: string;                        // primary button label
  secondary?: string;                     // optional secondary
  onPrimary?: () => void;
  onSecondary?: () => void;
  onDismiss?: () => void;
};
```

**33 · StepToast** — multi-step operation feedback. Each step has done/active/pending state. Persists until done.
```ts
type StepToastProps = {
  steps: string[];                        // step labels
  currentStep: number;                    // 0..steps.length (length = all done)
  onDismiss?: () => void;
};
```

**34 · TrayToast** — collapsed badge with counter; click to expand a feed. For background event streams.
```ts
type TrayToastProps = {
  items: Array<{ tone: ToneId; title: string; message: string; time: string }>;
  onDismiss?: () => void;
};
```

**35 · EdgeToast** — hangs down from the top edge of the viewport. Short, single-line, ambient. For *"dev mode active"*, *"connection lost"*.
```ts
type EdgeToastProps = {
  tone?: 'info' | 'success' | 'brand' | 'warning' | 'error';
  message: ReactNode;
  onDismiss?: () => void;
};
```

**36 · BannerToast** — informative, mid-width. Sits between Pill (too small) and Edge (too wide). The default for substantive informative notifications. Supports side variants (left / center / right) that pick the entrance keyframe.
```ts
type BannerToastProps = {
  tone?: 'info' | 'brand' | 'success' | 'warning' | 'error';
  title?: string;
  message: ReactNode;
  side?: 'left' | 'center' | 'right';     // default 'center'
  onDismiss?: () => void;
};
```

**Notification host (your responsibility to build):**

The reference file does NOT include a generic ToastProvider. Build a thin host that:
- Mounts in a `position: fixed` container at one of the three anchors (top-left/center/right)
- Accepts `push({ kind, ...props })` where kind is one of the six variants
- Stacks toasts with 8px gaps
- Times out non-persistent ones based on a duration prop (`duration: 0` = persist)

A toast's lifecycle: appear with the appropriate keyframe → optional progress bar countdown → fade out + height collapse on dismiss.

**Tokens used:** standard surfaces, all tint families, `--gb-shadow-popover`.

---

## When to use what · quick map

| Pattern | Use when |
|---|---|
| **Switch** | Single boolean. Background config. |
| **SwitchTag** | Compact feature flag in a wrap of many. |
| **FeatureSpotlight** | Primary feature user explicitly seeks. |
| **FeatureHero** | The headline feature of a settings panel. |
| **FeaturePreview** | Toggle with downstream visual impact. |
| **FeatureBank** | Grouped flags with a master. |
| **FeatureStatus** | Feature with measurable live activity. |
| **ExpandableFeature** | Feature with nested configuration. |
| **ColorSpotlight** | Color in a list, single attention-worthy. |
| **ColorHero** | The flagship color of a theme. |
| **ColorPreview** | Color with visible downstream effect. |
| **ColorBank** | Coherent palette (statuses, brand family). |
| **ColorStatus** | Accessibility-sensitive color. |
| **PillToast** | Passive confirmation. |
| **BannerToast** | General informative notification. |
| **ActionToast** | Notification that demands an action. |
| **StepToast** | Multi-step operation in progress. |
| **TrayToast** | Background event stream. |
| **EdgeToast** | Ambient status indicator. |

---

## Composition contract

These primitives compose. The host application should never reach inside them — only use them via their public props. Common compositions:

```jsx
<Field label="Email" required hint="We'll send a verification">
  <Input value={email} onChange={setEmail} leading={<I.mail />} />
</Field>

<ModalShell width={520}>
  <ModalHeader
    icon={<I.card />}
    title="Run Payments"
    subtitle="Order #ORD-29481"
    right={<Tag tone="brand">READY</Tag>}
    onClose={close}
  />
  <div className="modal-body">…</div>
  <ModalFooter>
    <Btn variant="ghost" onClick={close}>Cancel</Btn>
    <Btn variant="primary" icon={<I.check />} onClick={confirm}>Confirm</Btn>
  </ModalFooter>
</ModalShell>

<Card hover onClick={open}>
  <KeyVal k="Order" v="#ORD-29481" mono tone="ok" />
  <KeyVal k="Total" v="$1,247.50" mono />
</Card>
```

---

## What "done" looks like

- All 36 component files exist in `components/`, each in its own file
- `theme.css` is in place; no other CSS file declares `--gb-*` tokens
- Every component reads only from `--gb-*` variables — `grep -rn "rgba(\|#[0-9a-f]\{6\}" components/` returns zero results
- Every component matches the prop API spec — TypeScript types or PropTypes both work
- `<Btn onClick={async () => { ... }}>` transitions through idle → loading → success → idle on a real async action, with the visual states described
- `ExpandableFeature` open/close uses a real height transition (NOT the toast keyframe in the reference) — see component 20's note
- All `Color*` swatch pickers use react-beautiful-color in a Popover (NOT native `<input type="color">`)
- Toggling `<html data-theme="light">` re-themes every component without breakage
- A storybook or component playground page exists at `/components-demo` mirroring `reference/Design System.html`
