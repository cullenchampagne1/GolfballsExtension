/* Workflow Manager presentation bounds. Keeping this normalization outside the
   React modal makes remote/dev-setting values safe and directly testable. */
export const WORKFLOW_MANAGER_SCALE_DEFAULT = 1.2;
export const WORKFLOW_MANAGER_SCALE_MIN = 0.5;
export const WORKFLOW_MANAGER_SCALE_MAX = 2;
export const WORKFLOW_MANAGER_WIDTH = 1280;
export const WORKFLOW_MANAGER_HEIGHT = 760;
export const WORKFLOW_MANAGER_VIEWPORT_GUTTER = 48;

export function normalizeWorkflowManagerScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return WORKFLOW_MANAGER_SCALE_DEFAULT;
  return Math.max(WORKFLOW_MANAGER_SCALE_MIN, Math.min(WORKFLOW_MANAGER_SCALE_MAX, numeric));
}

/* Preserve the editor's 1280×760 layout and uniformly shrink it when a site's
   browser zoom leaves a smaller CSS viewport. This avoids max-width/max-height
   crushing the shell while its fixed sidebars remain full-sized. */
export function fitWorkflowManagerScale(preferred, viewportWidth, viewportHeight) {
  const requested = normalizeWorkflowManagerScale(preferred);
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return requested;
  const fit = Math.min(
    (width - WORKFLOW_MANAGER_VIEWPORT_GUTTER) / WORKFLOW_MANAGER_WIDTH,
    (height - WORKFLOW_MANAGER_VIEWPORT_GUTTER) / WORKFLOW_MANAGER_HEIGHT,
  );
  return Math.min(requested, Math.max(0.1, fit));
}
