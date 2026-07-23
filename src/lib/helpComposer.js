/* ───────────────────────────────────────────────────────────────
   helpComposer — auto-grow height resolver for the Help Companion
   composer textarea.

   resolveHelpComposerHeight() is the pure math: clamp a measured
   scrollHeight between MIN (20px, also the empty height) and MAX
   (104px). syncHelpComposerHeight() applies it to a live element —
   it collapses the textarea to height:0 first so scrollHeight
   reflects the content, not the previous explicit height.
─────────────────────────────────────────────────────────────── */

export const HELP_COMPOSER_MIN_HEIGHT = 20;
export const HELP_COMPOSER_MAX_HEIGHT = 104;

export function resolveHelpComposerPrompt({ active = false, submitting = false } = {}) {
  if (active) {
    return {
      placeholder: '',
      overlay: 'Waiting for the current answer…',
    };
  }
  if (submitting) {
    return {
      placeholder: '',
      overlay: 'Sending your question…',
    };
  }
  return {
    placeholder: 'Ask about the Golfballs Toolkit…',
    overlay: '',
  };
}

export function resolveHelpComposerHeight(scrollHeight, hasContent = true) {
  if (!hasContent) return HELP_COMPOSER_MIN_HEIGHT;
  const measured = Number(scrollHeight);
  if (!Number.isFinite(measured)) return HELP_COMPOSER_MIN_HEIGHT;
  return Math.min(
    HELP_COMPOSER_MAX_HEIGHT,
    Math.max(HELP_COMPOSER_MIN_HEIGHT, Math.ceil(measured)),
  );
}

export function syncHelpComposerHeight(element, hasContent = true) {
  if (!element?.style) return HELP_COMPOSER_MIN_HEIGHT;

  if (!hasContent) {
    element.style.height = `${HELP_COMPOSER_MIN_HEIGHT}px`;
    element.scrollTop = 0;
    return HELP_COMPOSER_MIN_HEIGHT;
  }

  // Collapse only for measurement so scrollHeight reflects the content rather
  // than the textarea's previous explicit height.
  element.style.height = '0px';
  const height = resolveHelpComposerHeight(element.scrollHeight, true);
  element.style.height = `${height}px`;
  return height;
}
