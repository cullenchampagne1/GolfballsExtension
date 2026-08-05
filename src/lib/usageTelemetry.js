/**
 * usageTelemetry.js — content-script half of the Toolkit Console's usage blocks.
 *
 * A surface open/close is reported to the service worker, which buffers and
 * flushes it to the backend (see lib/usage-telemetry.js). Content scripts never
 * talk to the backend directly: only the worker holds the installation
 * credential, and only it can batch across the tabs a user has open.
 *
 * CONTENT-FREE BY CONSTRUCTION. The wire carries a surface NAME and a duration
 * and nothing else — no contact, no query, no order, no page URL. A surface
 * that wants to report more has to change this contract deliberately.
 */

import { useEffect } from 'react';

import { surfaceName } from './usageSurfaces.js';

const MESSAGE = 'gbUsageEvent';

function send(event) {
  // The Operator's Guide mounts the REAL modal components as live demos. A
  // page of documentation is not adoption, so it silences the reporter for its
  // whole document rather than each demo remembering to opt out.
  if (globalThis.__gbUsageSilent) return;
  try {
    // A closed/updating worker rejects; usage is never worth surfacing an
    // error to the user or retrying, so the failure ends here.
    chrome.runtime?.sendMessage?.({ action: MESSAGE, event }, () => {
      void chrome.runtime?.lastError;
    });
  } catch { /* worker gone — drop the sample */ }
}

/**
 * Report that a surface opened. Returns a `close(...)` fn that reports the
 * matching close with the time it stayed open; calling it twice is a no-op, so
 * a mount point may wire it to both an explicit close and an unmount.
 */
export function reportSurfaceOpen(id, kind = 'modal') {
  const name = surfaceName(id);
  const at = Date.now();
  send({ kind: 'surface_open', surface: name, surface_kind: kind });
  let closed = false;
  return function reportClose() {
    if (closed) return;
    closed = true;
    send({
      kind: 'surface_close',
      surface: name,
      surface_kind: kind,
      ms: Math.max(0, Date.now() - at),
    });
  };
}

/**
 * Report a surface for as long as this component is mounted (or `active`).
 *
 * For the sub-modals that mount INSIDE another surface's React tree — the
 * query builder over CRM Search, checkout over the catalog — where there is no
 * `mountFloating` host to hang the report on. Effect cleanup is the close, so
 * the surface is reported for exactly the time it was rendered whichever way
 * it was dismissed.
 *
 * @param {string} name    display name, as the Adoption block shows it
 * @param {{ kind?: string, active?: boolean }} [options]
 *        active=false reports nothing — for a sub-modal that is always mounted
 *        and toggled by an `open` prop.
 */
export function useSurfaceUsage(name, { kind = 'modal', active = true } = {}) {
  useEffect(() => {
    if (!active || !name) return undefined;
    return reportSurfaceOpen(name, kind);
  }, [name, kind, active]);
}

/**
 * Report a whole extension document — the toolbar popup, the editor, the guide
 * — for as long as it is open.
 *
 * These have no unmount: the close rides on `pagehide`, exactly as the CRM
 * takeover pages do in src/vanilla/custom-pages.js. Calling it twice for one
 * document is a no-op, so a re-entrant mount cannot double-count.
 */
export function trackDocumentSurface(name, kind = 'page') {
  if (typeof window === 'undefined' || window.__gbSurfaceTracked) return;
  window.__gbSurfaceTracked = true;
  const reportClose = reportSurfaceOpen(name, kind);
  window.addEventListener('pagehide', reportClose, { once: true });
}
