import React from 'react';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * ModalShell — the modal card. Expects [ModalHeader, body, ModalFooter]
 * as children. Animates in (and out, when wrapped in <AnimatePresence>).
 *
 * Props: width (px), height (px | 'auto'), children.
 */
export function ModalShell({ children, width, height = 'auto', style, className }) {
  return (
    <motion.div
      className={'gb-modal ' + (className || '')}
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={T.bounce}
      style={{
        width, height,
        // Skin seam: --gb-modal-* reskin the shell (glass, blur, radius).
        background: 'var(--gb-modal-bg, var(--gb-surface-canvas))',
        backdropFilter: 'var(--gb-modal-blur, none)', WebkitBackdropFilter: 'var(--gb-modal-blur, none)',
        border: 'var(--gb-modal-border, 1px solid var(--gb-border-default))',
        borderRadius: 'var(--gb-modal-radius, var(--gb-r-xl))',
        boxShadow: 'var(--gb-modal-shadow, var(--gb-shadow-modal))',
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
