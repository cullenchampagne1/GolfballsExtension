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

import { surfaceName } from './usageSurfaces.js';

const MESSAGE = 'gbUsageEvent';

function send(event) {
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
