import { createRoot } from 'react-dom/client';
import { applyFloatingHostScale } from './floatingHost.js';
import { reportSurfaceOpen } from './usageTelemetry.js';

/**
 * Mount (or toggle) a FloatingPanel-based modal as a content-script overlay.
 *
 * Each migrated modal's content script calls this from its window.__gbShowX
 * global. Calling it again while the panel is open triggers the panel's
 * *animated* close (via the close fn the panel hands back through `bindClose`).
 *
 * @param {string} id  host element id — also the open/closed guard
 * @param {(hooks: { onClosed: () => void, bindClose: (close: () => void) => void }) => import('react').ReactElement} render
 * @param {{ scaleCategory?: string | null, surface?: string }} options
 *        scaleCategory null when the mounted surface owns its own independent
 *        scale; surface overrides the name usage telemetry reports (defaults
 *        to the host id's entry in usageSurfaces.js)
 */
export function mountFloating(id, render, { scaleCategory = 'modals', surface } = {}) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.__gbClose?.();
    return;
  }
  const host = document.createElement('div');
  host.id = id;
  // Most roots use the shared Modals slider. Large purpose-built surfaces may
  // opt out so their own dev setting is not multiplied by an async root zoom.
  applyFloatingHostScale(host, scaleCategory);
  document.body.appendChild(host);

  // Every floating modal in the extension mounts through here, so this one
  // call is what the console's Adoption and Presence blocks are built from.
  // The close is reported from onClosed rather than the panel's animation
  // start, so the recorded duration is how long it was actually on screen.
  const reportClose = reportSurfaceOpen(surface || id, 'modal') || (() => {});

  const root = createRoot(host);
  const onClosed = () => { reportClose(); root.unmount(); host.remove(); };

  root.render(render({
    onClosed,
    bindClose: (close) => { host.__gbClose = close; },
  }));
}
