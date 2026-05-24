import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/* ── LiquidDrawer ────────────────────────────────────────────────
   A frosted-glass dropdown/dropup used for the in-viewer scene
   picker + fun menu. Visual language is Apple-liquid-ish: no chip
   outlines, just an icon-only toggle that, when opened, EXPANDS
   into a tinted capsule whose backdrop-filter blurs whatever's
   behind it. The tint pulls from --gb-surface-canvas via
   color-mix so it adapts to the active theme (light → light glass,
   dark → dark glass) without per-variant CSS overrides.

   States per item:
     • idle      → icon at gb-text-secondary, no fill
     • hover     → icon brightens to gb-text-primary
     • active    → icon goes PURE WHITE, capsule shows a soft white
                   inset highlight behind that item

   Layout:
     anchor = 'top-left'    → toggle pinned top-left, opens DOWNWARD
     anchor = 'bottom-right'→ toggle pinned bottom-right, opens UPWARD
   In either case the toggle stays "pinned" and the items grow toward
   the inside of the canvas.

   Animation:
     • Closed → only the toggle button shows.
     • Opening → the capsule expands from the toggle's size to its
       full size (width or height depending on orientation), and
       items fade + slightly slide into view.
     • Closing → reverse, with a soft spring.

   The whole capsule has pointer-events disabled outside the actual
   buttons so blurry corners don't catch clicks.

   Props:
     anchor:   'top-left' | 'bottom-right'
     open:     bool — controlled
     onOpenChange: (bool) => void
     toggleIcon:   node
     items:    [{ key, icon, active }]
     onPick:   (key) => void
*/

const TOGGLE_SIZE = 30;
const ITEM_SIZE   = 30;
const GAP         = 2;
const PAD         = 3;

/* Tinted glass background. color-mix lets us reach into whichever
   theme is live and pull its canvas color, then dilute it to
   ~62% opacity so backdrop-filter does the heavy lifting. Falls
   back to a neutral dark translucent on browsers that don't grok
   color-mix (none we ship to, but a belt-and-suspenders default). */
const GLASS_BG = 'color-mix(in srgb, var(--gb-surface-canvas) 62%, transparent)';
const GLASS_BG_FALLBACK = 'rgba(20, 22, 26, 0.62)';
const GLASS_BORDER = 'color-mix(in srgb, var(--gb-text-primary) 12%, transparent)';
const GLASS_FILTER = 'blur(18px) saturate(160%)';

export function LiquidDrawer({
  anchor = 'top-left',
  open,
  onOpenChange,
  toggleIcon,
  items,
  onPick,
  ariaLabel,
}) {
  const isVertical = true; // both supported anchors are vertical strips
  const isDown = anchor === 'top-left';

  // Capsule extents. When open, the long axis = toggle + items;
  // when closed, the capsule collapses to just the toggle.
  const itemCount = items.length;
  const longAxisOpen = TOGGLE_SIZE + (itemCount * (ITEM_SIZE + GAP)) + (PAD * 2);
  const longAxisClosed = TOGGLE_SIZE + (PAD * 2);
  const shortAxis = TOGGLE_SIZE + (PAD * 2);

  // For top-left: items appear BELOW the toggle. For bottom-right:
  // items appear ABOVE the toggle. We pin the position so the
  // toggle stays put as the capsule grows.
  const positionStyle = isDown
    ? { top: 8, left: 8 }
    : { bottom: 8, right: 8 };

  return (
    <div
      data-viewer-ui="true"
      style={{
        position: 'absolute',
        ...positionStyle,
        zIndex: 6,
        pointerEvents: 'none', // children re-enable
      }}
    >
      <motion.div
        layout
        initial={false}
        animate={{
          width: shortAxis,
          height: open ? longAxisOpen : longAxisClosed,
        }}
        transition={SPRING}
        style={{
          position: 'relative',
          padding: PAD,
          borderRadius: 999, // pill — the long axis grows but corners stay round
          background: GLASS_BG_FALLBACK,
          backgroundImage: GLASS_BG, // overrides fallback where supported
          backdropFilter: GLASS_FILTER,
          WebkitBackdropFilter: GLASS_FILTER,
          border: `1px solid ${GLASS_BORDER}`,
          // Soft outer shadow gives the capsule a bit of float
          boxShadow: '0 4px 14px -6px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset',
          overflow: 'hidden',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          // For dropups we want the toggle at the bottom; for
          // dropdowns it stays at the top. We render in DOM order
          // and flip via flex direction.
          justifyContent: isDown ? 'flex-start' : 'flex-end',
        }}
        aria-label={ariaLabel}
      >
        {/* Toggle pinned at the anchor end of the capsule. We render
            it before items for the dropdown case, after for the
            dropup. AnimatePresence handles the items mount/unmount. */}
        {isDown && (
          <DrawerButton
            icon={toggleIcon}
            active={open}
            onClick={() => onOpenChange(!open)}
            ariaExpanded={open}
            isToggle
          />
        )}

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="items"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: GAP,
                marginTop: isDown ? GAP : 0,
                marginBottom: isDown ? 0 : GAP,
                width: ITEM_SIZE,
              }}
            >
              {items.map((it, i) => (
                <ItemSlot key={it.key} index={i} isDown={isDown}>
                  <DrawerButton
                    icon={it.icon}
                    active={!!it.active}
                    onClick={() => onPick?.(it.key)}
                  />
                </ItemSlot>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {!isDown && (
          <DrawerButton
            icon={toggleIcon}
            active={open}
            onClick={() => onOpenChange(!open)}
            ariaExpanded={open}
            isToggle
          />
        )}
      </motion.div>
    </div>
  );
}

/* Per-item slide+fade. Each item enters from the toggle side with a
   small offset, staggered so the list visibly cascades open.
   isDown=true → items come from above (negative Y for dropdown);
   isDown=false → items come from below (positive Y for dropup). */
function ItemSlot({ children, index, isDown }) {
  const fromY = isDown ? -6 : 6;
  return (
    <motion.div
      initial={{ opacity: 0, y: fromY }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: fromY }}
      transition={{
        ...SPRING,
        delay: 0.02 * index,
      }}
      style={{ display: 'flex', justifyContent: 'center' }}
    >
      {children}
    </motion.div>
  );
}

/* The icon-only button used for both the toggle and each item.
   - No outline ever.
   - Idle color: --gb-text-secondary
   - Hover: --gb-text-primary
   - Active: pure white + a soft white inset highlight behind the icon
     so the "selected" item reads as filled glass. */
function DrawerButton({ icon, active, onClick, ariaExpanded, isToggle }) {
  const [hovered, setHovered] = useState(false);
  const color = active
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
      aria-pressed={!isToggle ? active : undefined}
      aria-expanded={ariaExpanded}
      style={{
        position: 'relative',
        width: ITEM_SIZE, height: ITEM_SIZE,
        padding: 0,
        background: 'transparent',
        border: 'none',
        borderRadius: 999,
        cursor: 'pointer',
        color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color .14s ease',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Active-state highlight — sits BEHIND the icon, brand-tinted
          white frost so the chosen item glows softly. Animates in
          via opacity + scale so it doesn't pop. */}
      <AnimatePresence>
        {active && (
          <motion.span
            key="hi"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={SPRING}
            style={{
              position: 'absolute', inset: 3,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.18)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.22) inset, 0 0 12px -2px rgba(255,255,255,0.35)',
              pointerEvents: 'none',
            }}
          />
        )}
      </AnimatePresence>
      <span style={{ position: 'relative', display: 'flex' }}>
        {icon}
      </span>
    </motion.button>
  );
}

const SPRING = { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 };
