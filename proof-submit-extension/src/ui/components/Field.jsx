import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * Field — labelled wrapper. Composes any control with a top label,
 * optional hint, optional required marker, and an error message
 * that slides in (replacing the hint).
 *
 * Props: label, hint, required, error (string), children.
 */
export function Field({ label, hint, required, error, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      {label && (
        <label style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
          color: 'var(--gb-text-muted)',
        }}>
          {label}
          {required && <span style={{ color: 'var(--gb-error)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      {children}
      {!error && hint && (
        <div style={{ fontSize: 10.5, color: 'var(--gb-text-muted)', lineHeight: 1.4 }}>{hint}</div>
      )}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={T.base}
            style={{ fontSize: 10.5, color: 'var(--gb-error-fg)', lineHeight: 1.4, overflow: 'hidden' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
