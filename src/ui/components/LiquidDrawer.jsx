import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/* ── LiquidDrawer ────────────────────────────────────────────────
   A frosted-glass capsule that slides open from an icon-only toggle
   and reveals a strip of icon-only item buttons. A single white
   "selection pip" slides between the toggle and the items to
   indicate active state — clicking the active item slides the pip
   back to the toggle and closes the drawer (one continuous motion,
   no abrupt closes).

   Design rules:
     • Closed → capsule is the toggle's size; only the toggle is
       visible (items are tucked under the toggle with opacity 0).
     • Opening → capsule grows along the long axis to expose items;
       items fade in WITHOUT shifting the toggle (absolute layout
       inside the capsule, so the toggle never moves).
     • Selecting an item → pip slides from its current slot to the
       new slot via a layout animation (single shared element).
     • Re-clicking active item OR clicking the toggle while open →
       pip slides back to the toggle's slot, drawer closes.
     • No outlines on items. Idle icons are gb-text-secondary,
       hover gb-text-primary, the icon under the pip is pure white.
     • Capsule background is theme-tinted glass (color-mix on
       --gb-surface-canvas + backdrop-filter blur).
     • Corner radius is squircle-ish (~14px), NOT full pill (999px).

   Layout:
     anchor = 'top-left'    → toggle at top, items slide down
     anchor = 'bottom-right'→ toggle at bottom, items slide up

   Props:
     anchor:        'top-left' | 'bottom-right'
     open:          bool — controlled
     onOpenChange:  (bool) => void
     toggleIcon:    node
     items:         [{ key, icon }]  (active is derived from `activeKey`)
     activeKey:     string | null    (which item shows the pip; null = pip on toggle)
     onPick:        (key) => void    (clicked an item; parent decides what to do)
     ariaLabel:     string
*/

const SLOT_SIZE = 30;
const SLOT_GAP  = 2;
const PAD       = 3;
const RADIUS    = 14; // squircle-ish — fits a 30px slot nicely

const GLASS_BG = 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)';
const GLASS_BG_FALLBACK = 'rgba(20, 22, 26, 0.62)';
const GLASS_BORDER = 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)';
const GLASS_FILTER = 'blur(18px) saturate(160%)';
const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 };

export function LiquidDrawer({
  anchor = 'top-left',
  open,
  onOpenChange,
  toggleIcon,
  items,
  activeKey,
  onPick,
  ariaLabel,
}) {
  const isDown = anchor === 'top-left';
  const itemCount = items.length;

  // Capsule dimensions. The closed dimension is just a slot; open
  // exposes the toggle + every item. SLOT_GAP separates each.
  const lenClosed = SLOT_SIZE + PAD * 2;
  const lenOpen   = SLOT_SIZE * (1 + itemCount) + SLOT_GAP * itemCount + PAD * 2;
  const breadth   = SLOT_SIZE + PAD * 2;

  // Slot index → offset along the long axis (top-down for the
  // top-left anchor, or bottom-up for bottom-right; we apply the
  // offset to whichever edge css property matches the anchor).
  // Slot 0 = toggle (sits at the anchor edge); 1..N = items.
  const slotEdgeOffset = (slot) => PAD + slot * (SLOT_SIZE + SLOT_GAP);

  // Pip rides on a single animated absolute element. activeKey ===
  // null → pip is over the toggle (slot 0); otherwise it's over
  // whichever item slot matches.
  const activeSlot = activeKey
    ? items.findIndex((it) => it.key === activeKey) + 1
    : 0;
  const pipEdge = slotEdgeOffset(activeSlot);

  const onToggleClick = () => onOpenChange(!open);

  return (
    <div
      data-viewer-ui="true"
      style={{
        position: 'absolute',
        ...(isDown ? { top: 8, left: 8 } : { bottom: 8, right: 8 }),
        zIndex: 6,
        pointerEvents: 'none',
      }}
    >
      <motion.div
        initial={false}
        animate={{ height: open ? lenOpen : lenClosed }}
        transition={SPRING}
        style={{
          position: 'relative',
          width: breadth,
          minHeight: lenClosed,
          borderRadius: RADIUS,
          background: GLASS_BG_FALLBACK,
          backgroundImage: GLASS_BG,
          backdropFilter: GLASS_FILTER,
          WebkitBackdropFilter: GLASS_FILTER,
          border: `1px solid ${GLASS_BORDER}`,
          boxShadow: '0 6px 18px -8px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
          overflow: 'hidden',
          pointerEvents: 'auto',
        }}
        aria-label={ariaLabel}
      >
        {/* Selection pip — a single floating rounded square that
            slides between the toggle slot and item slots via a
            spring `top`/`bottom` animation. Pure white frosted
            highlight so the icon ON TOP of it reads as bright. */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{ [isDown ? 'top' : 'bottom']: pipEdge }}
          transition={SPRING}
          style={{
            position: 'absolute',
            left: PAD,
            width: SLOT_SIZE, height: SLOT_SIZE,
            borderRadius: RADIUS - 4, // a touch tighter than the capsule
            // The pip only shows when the drawer is open OR something
            // is selected — otherwise the closed-state toggle looks
            // weird with a permanent white pill behind it.
            opacity: (open || activeKey) ? 1 : 0,
            background: 'rgba(255,255,255,0.20)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset, 0 0 14px -2px rgba(255,255,255,0.35)',
            pointerEvents: 'none',
          }}
        />

        {/* Toggle slot — always at offset 0 from the anchor edge. */}
        <SlotButton
          style={{ position: 'absolute', left: PAD, [isDown ? 'top' : 'bottom']: PAD }}
          icon={toggleIcon}
          // Toggle icon goes white whenever the drawer is OPEN or
          // a real item isn't selected (i.e. pip is over the toggle).
          white={open || !activeKey}
          onClick={onToggleClick}
          ariaExpanded={open}
        />

        {/* Item slots — pinned at their fixed offsets. We render them
            always (so the toggle never reflows when items mount),
            and fade them in/out with the drawer's open state. */}
        {items.map((it, i) => {
          const offset = slotEdgeOffset(i + 1); // +1 to skip the toggle slot
          const isActive = activeKey === it.key;
          return (
            <SlotButton
              key={it.key}
              style={{
                position: 'absolute',
                left: PAD,
                [isDown ? 'top' : 'bottom']: offset,
              }}
              icon={it.icon}
              white={isActive}
              onClick={() => onPick?.(it.key)}
              fadeOpen={open}
            />
          );
        })}
      </motion.div>
    </div>
  );
}

/* SlotButton — icon-only square. The pip is rendered separately so
   each button is just an outline-free icon container with hover
   tinting. `white` overrides the color to pure white when this
   button is the active one (the pip is under it). `fadeOpen` (only
   used for item slots) controls whether the button is visible. */
function SlotButton({ icon, white, onClick, ariaExpanded, fadeOpen, style }) {
  const [hovered, setHovered] = useState(false);
  const isFadeable = fadeOpen !== undefined;
  const color = white
    ? '#ffffff'
    : (hovered ? 'var(--gb-text-primary)' : 'var(--gb-text-secondary)');
  return (
    <motion.button
      type="button"
      data-viewer-ui="true"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      whileTap={{ scale: 0.9 }}
      aria-expanded={ariaExpanded}
      initial={false}
      animate={isFadeable ? { opacity: fadeOpen ? 1 : 0, scale: fadeOpen ? 1 : 0.85 } : { opacity: 1 }}
      transition={SPRING}
      style={{
        width: SLOT_SIZE, height: SLOT_SIZE,
        padding: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: RADIUS - 4,
        cursor: 'pointer',
        color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color .14s ease',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        // Hide pointer events on faded-out items so they don't
        // catch clicks while invisible.
        pointerEvents: isFadeable && !fadeOpen ? 'none' : 'auto',
        ...style,
      }}
    >
      {icon}
    </motion.button>
  );
}

// Used internally — exported for tests / external consumers if needed.
export { SLOT_SIZE, RADIUS };
