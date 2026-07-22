const ENTER_EASE = Object.freeze([0.22, 1, 0.36, 1]);
const RETURN_EASE = Object.freeze([0.4, 0, 0.2, 1]);

export function resolveShelfPanelHeight(view, actionsHeight, panelHeight) {
  const maximum = Math.max(0, Number(panelHeight) || 0);
  if (view === 'chat') return maximum;
  const measured = Math.max(0, Number(actionsHeight) || 0);
  return measured ? Math.min(measured, maximum) : 'auto';
}

export function shouldConstrainShelfActions(actionsHeight, panelHeight) {
  const measured = Math.max(0, Number(actionsHeight) || 0);
  const maximum = Math.max(0, Number(panelHeight) || 0);
  return measured > 0 && maximum > 0 && measured >= maximum;
}

/**
 * Measure the action destination independently from the animated panel.
 * Using the wrapper's scrollHeight while it is height:100% creates a feedback
 * loop: every animation frame becomes the next target height. Its direct
 * sections expose their natural scroll heights even when the middle list is
 * currently constrained.
 */
export function measureShelfSections(node) {
  const children = Array.from(node?.children || []);
  if (!children.length) return Math.ceil(Math.max(0, Number(node?.scrollHeight) || 0));
  return Math.ceil(children.reduce((height, child) => {
    const content = child?.querySelector?.('[data-shelf-measure-content]');
    const section = content || child;
    return height + Math.max(
      0, Number(section?.scrollHeight) || 0, Number(section?.offsetHeight) || 0,
    );
  }, 0));
}

export function shelfPanelTransition(view) {
  const openingChat = view === 'chat';
  return {
    opacity: { duration: 0.18 },
    y: { duration: 0.22, ease: [0.34, 1.4, 0.64, 1] },
    scale: { duration: 0.2 },
    width: {
      duration: openingChat ? 0.28 : 0.2,
      ease: openingChat ? ENTER_EASE : RETURN_EASE,
    },
    height: {
      duration: openingChat ? 0.28 : 0.18,
      ease: openingChat ? ENTER_EASE : RETURN_EASE,
    },
  };
}
