import { createRoot } from 'react-dom/client';

/**
 * Mount (or toggle) a FloatingPanel-based modal as a content-script overlay.
 *
 * Each migrated modal's content script calls this from its window.__gbShowX
 * global. Calling it again while the panel is open triggers the panel's
 * *animated* close (via the close fn the panel hands back through `bindClose`).
 *
 * @param {string} id  host element id — also the open/closed guard
 * @param {(hooks: { onClosed: () => void, bindClose: (close: () => void) => void }) => import('react').ReactElement} render
 */
export function mountFloating(id, render) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.__gbClose?.();
    return;
  }
  const host = document.createElement('div');
  host.id = id;
  // Modal mount roots opt in to the "modals" UI-scale slider.
  host.setAttribute('data-gb-scale', 'modals');
  document.body.appendChild(host);

  const root = createRoot(host);
  const onClosed = () => { root.unmount(); host.remove(); };

  root.render(render({
    onClosed,
    bindClose: (close) => { host.__gbClose = close; },
  }));
}
