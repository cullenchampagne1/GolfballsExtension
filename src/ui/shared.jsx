import React, { useState } from 'react';
import { motion } from 'motion/react';

/* ───────────────────────────────────────────────────────────────
   shared.jsx — primitives shared across the component library:
   Motion transition presets, the async-action hook, the input
   shell, status tint families, and the spinner.

   Colors are always --gb-* tokens. Motion transitions can't take
   var(), so the --gb-anim* timings are mirrored here as JS values.
─────────────────────────────────────────────────────────────── */

/**
 * Context published by FloatingPanel. ModalHeader reads it so that, inside
 * a FloatingPanel, the header becomes the drag handle and its close button
 * drives the panel's animated dismiss.
 */
export const FloatingPanelContext = React.createContext(null);

/** JS mirror of the --gb-anim* CSS tokens, for Motion `transition`. */
export const T = {
  fast:   { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
  base:   { duration: 0.18, ease: [0.4, 0, 0.2, 1] },
  bounce: { duration: 0.28, ease: [0.34, 1.4, 0.64, 1] },
};

/** Error shake — keyframes + easing, matches the spec's gb-shake. */
export const SHAKE = [0, -4, 4, -4, 4, 0];
export const SHAKE_T = { duration: 0.35, ease: [0.36, 0.07, 0.19, 0.97] };

/**
 * Status tint families. Each tone maps to its --gb-{tone}-* set:
 *   fg     text/icon color      soft   8%  tint background
 *   bg     15% tint background  strong 25% tint background
 *   bd     30% tint border
 */
export const TINT = {
  neutral: { fg: 'var(--gb-text-tertiary)', bg: 'var(--gb-fill-subtle)',         soft: 'var(--gb-fill-faint)',        strong: 'var(--gb-fill-soft)',           bd: 'var(--gb-border-default)' },
  brand:   { fg: 'var(--gb-brand-label)',   bg: 'var(--gb-brand-tint-medium)',   soft: 'var(--gb-brand-tint-soft)',   strong: 'var(--gb-brand-tint-strong)',   bd: 'var(--gb-brand-tint-border)' },
  error:   { fg: 'var(--gb-error-fg)',      bg: 'var(--gb-error-tint-medium)',   soft: 'var(--gb-error-tint-soft)',   strong: 'var(--gb-error-tint-strong)',   bd: 'var(--gb-error-tint-border)' },
  warning: { fg: 'var(--gb-warning-fg)',    bg: 'var(--gb-warning-tint-medium)', soft: 'var(--gb-warning-tint-soft)', strong: 'var(--gb-warning-tint-strong)', bd: 'var(--gb-warning-tint-border)' },
  success: { fg: 'var(--gb-success-fg)',    bg: 'var(--gb-success-tint-medium)', soft: 'var(--gb-success-tint-soft)', strong: 'var(--gb-success-tint-strong)', bd: 'var(--gb-success-tint-border)' },
  info:    { fg: 'var(--gb-info-fg)',       bg: 'var(--gb-info-tint-medium)',    soft: 'var(--gb-info-tint-soft)',    strong: 'var(--gb-info-tint-strong)',    bd: 'var(--gb-info-tint-border)' },
};

/**
 * Clone an icon element with a resolved pixel size. Non-elements
 * (already-sized nodes, strings) pass straight through.
 */
export function sizeIcon(icon, size) {
  return React.isValidElement(icon) ? React.cloneElement(icon, { size }) : icon;
}

/**
 * Async-action state machine shared by Btn and IconBtn.
 *
 * If the click handler returns a Promise, the control drives itself
 * idle → loading → success | error → idle. A `state` prop, when not
 * 'idle', overrides the internal state for manual control.
 *
 * @returns {[string, (onClick:Function, e:Event) => void]}
 */
export function useAsyncState(stateProp = 'idle') {
  const [auto, setAuto] = useState('idle');
  const effective = stateProp !== 'idle' ? stateProp : auto;

  const run = (onClick, event) => {
    if (effective === 'loading' || !onClick) return;
    const result = onClick(event);
    if (result && typeof result.then === 'function') {
      setAuto('loading');
      result
        .then(() => setAuto('success'), () => setAuto('error'))
        .finally(() => setTimeout(() => setAuto('idle'), 1200));
    }
  };

  return [effective, run];
}

/** Spinning ring — the gb-spin keyframe, expressed with Motion. */
export function Spinner({ size = 12 }) {
  return (
    <motion.span
      style={{
        width: size, height: size, borderRadius: '50%',
        border: '2px solid currentColor', borderTopColor: 'transparent',
        display: 'block', flexShrink: 0,
      }}
      animate={{ rotate: [0, 360] }}
      transition={{ duration: 0.8, ease: 'linear', repeat: Infinity }}
    />
  );
}

/** Shared visual shell for Input / Textarea / Dropdown.
 *  Radius scales with size so the corner ratio stays visually consistent
 *  across sizes — a fixed `var(--gb-r-md)` (8px) on a 28px-tall sm input
 *  reads as proportionally MORE rounded than the same 8px on a 36px lg
 *  input. Matches the same scaling pattern as Btn (xs/sm: r-sm · md/lg:
 *  r-md). Without this, switching a modal from lg → sm visibly grows
 *  every input's corner roundness even though the value is unchanged. */
const INPUT_RADII = { xs: 'var(--gb-r-sm)', sm: 'var(--gb-r-sm)', md: 'var(--gb-r-md)', lg: 'var(--gb-r-md)' };

export function inputBaseStyle({ focused, error, size = 'md' }) {
  const heights = { xs: 24, sm: 28, md: 32, lg: 36 };
  const fontSizes = { xs: 11, sm: 11.5, md: 12, lg: 13 };
  return {
    background: 'var(--gb-surface-2)',
    border: '1px solid ' + (
      focused ? 'var(--gb-brand-label)'
        : error ? 'var(--gb-error)'
          : 'var(--gb-border-default)'
    ),
    borderRadius: INPUT_RADII[size] || INPUT_RADII.md,
    boxShadow: focused ? 'var(--gb-focus-ring)' : 'none',
    height: heights[size],
    fontSize: fontSizes[size],
    fontFamily: 'var(--gb-font-sans)',
    fontWeight: 500,
    color: 'var(--gb-text-primary)',
    transition: 'border-color var(--gb-anim-fast), box-shadow var(--gb-anim-fast)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 10px',
    boxSizing: 'border-box',
  };
}

/* ───────────────────────────────────────────────────────────────
   Marching-ants keyboard-active border.

   Active row indicator for the modal Tab-nav pattern (CallLog quick
   log, QuickTask menu, etc.). Four linear-gradient backgrounds on
   each edge, animated by shifting background-position — produces a
   classic dashed perimeter that walks ("marches") around the
   element. Lighter visual cue than a static ring + carries motion
   so it's immediately readable as "this is what you're aiming at".

   `--gb-march-color` defaults to the brand foreground; consumers can
   override on the element to retint. `--gb-march-dur` (0.7s default)
   controls how fast the ants march.
─────────────────────────────────────────────────────────────── */
const MARCHING_ANTS_STYLE_ID = '__gb-marching-ants';
export function ensureMarchingAntsStyle() {
  if (typeof document === 'undefined' || document.getElementById(MARCHING_ANTS_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = MARCHING_ANTS_STYLE_ID;
  /* TWO distinct kbd-focus visuals so reps can tell at a glance
     whether they're aimed at a one-shot action vs an editable field:

     1) `.gb-kbd-active` — a marching-ants dashed outline drawn via a
        ::after pseudo-element absolutely-positioned just outside the
        host. The pseudo-element approach means inline styles on the
        host (e.g. PresetGridButton's brand-tint background) can't
        clobber the ants. Used on the Quick log + Quick task rows
        when the virtual-focus index (activeQuickIdx / activeRowIdx)
        lands on them. Press Enter to "fire" the row.

     2) `[data-gb-kbd-scope] :focus-visible` — for any real-focused
        element inside a modal scoped with data-gb-kbd-scope: a
        solid brand-fg border + soft brand-tint focus ring. Reads
        as "this is selected, Enter to edit / commit". Distinct from
        the ants so the user immediately knows the difference between
        a one-shot row vs a form field. */
  el.textContent = `
    @keyframes gb-march {
      to {
        background-position:
          16px 0,    -16px 100%,
          0 -16px,   100% 16px;
      }
    }
    /* Quick-action row: an inline SVG rect-with-dashed-stroke, drawn
       to fill the host via background-image so we don't have to mount
       per-row React markup. SVG strokes follow the path's rounded
       corners cleanly (CSS linear-gradient edges can't), and
       stroke-dashoffset animates inside the SVG via SMIL so the
       dashes literally march around the perimeter without browser-
       level animation hooks.

       inset:0 keeps the overlay INSIDE the host so it can't be
       clipped by a scrolling grid parent (CallLog's 168px wrap, the
       QuickTaskMenu's 220px templates list, etc.). The host's solid
       border is suppressed via `border-color: transparent !important`
       below so the dashes are the visible perimeter, not a double
       border. */
    .gb-kbd-active {
      position: relative;
      border-color: transparent !important;
    }
    .gb-kbd-active::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 30' preserveAspectRatio='none'><rect x='1' y='1' width='98' height='28' rx='4' ry='4' fill='none' stroke='%237db82a' stroke-width='2' stroke-dasharray='5 3'><animate attributeName='stroke-dashoffset' from='0' to='-16' dur='0.6s' repeatCount='indefinite'/></rect></svg>");
      background-size: 100% 100%;
      background-repeat: no-repeat;
    }

    /* Form-field focus: solid brand outline + soft focus ring. The
       !important flags override inline styles on Input/Dropdown/etc
       that set their own border-color and box-shadow. */
    [data-gb-kbd-scope] :focus-visible {
      outline: none !important;
      border-color: var(--gb-brand-fg) !important;
      box-shadow: 0 0 0 3px var(--gb-brand-tint-medium), inset 0 0 0 1px var(--gb-brand-fg) !important;
    }
    /* Inputs/textareas don't have a separate border to recolor —
       the entire visible border IS the box-shadow, so the inset ring
       above does the work. The selector below is just a safety net
       that turns off any lingering browser outline on text fields. */
    [data-gb-kbd-scope] input:focus-visible,
    [data-gb-kbd-scope] textarea:focus-visible {
      outline: none !important;
    }
  `;
  document.head.appendChild(el);
}
