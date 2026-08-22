import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

const CAPABILITY_TRANSITION = { duration: 0.24, ease: [0.32, 0.72, 0, 1] };

/**
 * Width-aware entrance/exit for controls whose managed capability changes at
 * runtime. The wrapper stays overflow-clipped while neighboring actions glide
 * into the space instead of snapping sideways.
 */
export function CapabilitySlot({ visible, children, grow = false, slotKey = 'capability', style }) {
  const collapsed = { opacity: 0, width: 0, x: -8, scale: 0.96, ...(grow ? { flexGrow: 0 } : {}) };
  const expanded = { opacity: 1, width: 'auto', x: 0, scale: 1, ...(grow ? { flexGrow: 1 } : {}) };
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {visible && (
        <motion.div
          key={slotKey}
          layout
          initial={collapsed}
          animate={expanded}
          exit={collapsed}
          transition={CAPABILITY_TRANSITION}
          style={{
            display: 'flex', overflow: 'hidden', flexShrink: 0,
            ...(grow ? { minWidth: 0, flexBasis: 0 } : {}),
            ...style,
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default CapabilitySlot;
