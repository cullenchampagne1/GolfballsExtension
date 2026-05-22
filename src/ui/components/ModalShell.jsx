import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * ModalShell — the modal card. Expects [ModalHeader, body, ModalFooter]
 * as children. Animates in (and out, when wrapped in <AnimatePresence>).
 *
 * Props: width (px), height (px | 'auto'), children.
 */
export function ModalShell({ children, width, height = 'auto', style }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={T.bounce}
      style={{
        width, height,
        background: 'var(--gb-surface-canvas)',
        border: '1px solid var(--gb-border-default)',
        borderRadius: 'var(--gb-r-xl)',
        boxShadow: 'var(--gb-shadow-modal)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
