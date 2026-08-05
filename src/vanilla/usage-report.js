// usage-report.js — surface reporting for the non-ESM vanilla content scripts.
/**
 * @file usage-report.js
 * The vanilla half of the Toolkit Console's Adoption/Presence blocks.
 *
 * The React modals report through src/lib/usageTelemetry.js, which they can
 * import. The vanilla overlays (charge, order edit) are plain content scripts
 * in the manifest's `js` array with no module system, so they get the same
 * contract off `window` instead. Listed BEFORE the modals that use it.
 *
 * CONTENT-FREE, same as every other reporter here: a surface name and a
 * duration. Nothing on this wire can carry an order, a customer, or an amount.
 */

(function installVanillaUsageReport(root) {
  'use strict';

  if (root.__gbReportSurface) return;

  function send(event) {
    try {
      // A closed or updating worker rejects. Usage is never worth surfacing an
      // error to the user, and never worth a retry, so the failure ends here.
      chrome.runtime.sendMessage({ action: 'gbUsageEvent', event: event }, function () {
        void chrome.runtime.lastError;
      });
    } catch (e) { /* worker gone — drop the sample */ }
  }

  /**
   * Report that a surface opened; returns the matching close reporter.
   * Calling the returned fn twice is a no-op, so an overlay may wire it to
   * both its close button and its escape/backdrop paths.
   *
   * @param {string} name display name, as the Adoption block shows it
   * @param {string} [kind] modal | page | popup
   * @returns {() => void}
   */
  root.__gbReportSurface = function reportSurface(name, kind) {
    var surface = String(name || '').trim() || 'Unknown';
    var surfaceKind = kind || 'modal';
    var openedAt = Date.now();
    var closed = false;
    send({ kind: 'surface_open', surface: surface, surface_kind: surfaceKind });
    return function reportClose() {
      if (closed) return;
      closed = true;
      send({
        kind: 'surface_close',
        surface: surface,
        surface_kind: surfaceKind,
        ms: Math.max(0, Date.now() - openedAt),
      });
    };
  };
})(window);
