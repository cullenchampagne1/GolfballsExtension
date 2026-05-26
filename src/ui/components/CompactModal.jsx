import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { T } from '../shared.jsx';

/**
 * CompactModal — a small modal for secondary dialogs: confirmations,
 * quick prompts, single-purpose pickers. A lighter-weight counterpart to
 * the 560px standard modals (SmartModal / AddVariableModal).
 *
 * Like ModalShell it's just the card + portal + backdrop — compose
 * <ModalHeader> / body / <ModalFooter> inside it as children.
 *
 * Works in two modes:
 *   • standalone — full backdrop, like any other modal
 *   • stacked    — opened on top of an already-open modal: a lighter
 *                  scrim (no second blur) and a raised z-index, so it
 *                  layers cleanly over the parent.
 *
 * Mount/unmount it inside an <AnimatePresence> for the exit animation
 * (same convention as SmartModal / SignatureModal).
 *
 * Props:
 *   size            'mini' (340) | 'compact' (400) | number   · default 'compact'
 *   stacked         true when opened over another modal        · default false
 *   onClose         () => void — backdrop click + Escape
 *   closeOnBackdrop dismiss on scrim click                     · default true
 *   style           extra style merged onto the card
 *
 * @example
 *   <AnimatePresence>
 *     {confirming && (
 *       <CompactModal size="mini" stacked onClose={() => setConfirming(false)}>
 *         <ModalHeader icon={<I.trash />} title="Delete template?"
 *           onClose={() => setConfirming(false)} />
 *         <div style={{ padding: 16, fontSize: 12 }}>This can't be undone.</div>
 *         <ModalFooter>
 *           <span style={{ flex: 1 }} />
 *           <Btn variant="ghost" onClick={() => setConfirming(false)}>Cancel</Btn>
 *           <Btn variant="danger" onClick={remove}>Delete</Btn>
 *         </ModalFooter>
 *       </CompactModal>
 *     )}
 *   </AnimatePresence>
 */

const SIZES = { mini: 340, compact: 400 };

// Shared LIFO stack so Escape only closes the topmost CompactModal when
// several are layered (a sub-modal over its parent).
const modalStack = [];

export function CompactModal({
  children,
  size = 'compact',
  stacked = false,
  onClose,
  closeOnBackdrop = true,
  style,
}) {
  const id = useId();

  // Escape closes — but only the modal currently on top of the stack.
  useEffect(() => {
    modalStack.push(id);
    const onKey = (e) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === id) {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.indexOf(id);
      if (i !== -1) modalStack.splice(i, 1);
    };
  }, [id, onClose]);

  const px = typeof size === 'number' ? size : (SIZES[size] || SIZES.compact);
  const cssWidth = `min(${px}px, calc(100vw - 48px))`;

  return createPortal(
    <motion.div
      className="gb-compact-modal"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={T.base}
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0,
        // Stacked: sit above the standard 2147483000 modal layer.
        zIndex: stacked ? 2147483200 : 2147483000,
        // Stacked: a soft scrim only — the parent already dimmed + blurred
        // the page, so a second blur just looks muddy and costs paint.
        background: stacked ? 'rgba(0, 0, 0, 0.35)' : 'var(--gb-backdrop)',
        backdropFilter: stacked ? 'none' : 'blur(6px)',
        WebkitBackdropFilter: stacked ? 'none' : 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -8 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: cssWidth, maxHeight: 'calc(100vh - 48px)',
          background: 'var(--gb-surface-canvas)',
          border: '1px solid var(--gb-border-default)',
          borderRadius: 'var(--gb-r-xl)',
          boxShadow: 'var(--gb-shadow-modal)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          fontFamily: 'var(--gb-font-sans)',
          ...style,
        }}
      >
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
