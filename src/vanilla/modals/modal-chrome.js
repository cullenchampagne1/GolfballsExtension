// modal-chrome.js — shared dismissal for the vanilla overlay modals.
/**
 * @file modal-chrome.js
 * `__gbCloseModal(overlay)` — the animated close the charge and order-edit
 * overlays call from every one of their close paths.
 *
 * It used to live in src/vanilla/notifications.js, which was deleted when the
 * vanilla toast was replaced by the React one (2b7fcd16). Its two callers were
 * not migrated, so from that commit until this file, clicking Close on either
 * overlay threw ReferenceError and left the modal stuck on screen. Restored
 * here, beside the modals that are its only callers.
 *
 * The animation runs through the Web Animations API rather than the
 * `__gbModalFadeOut` / `__gbModalSlideDown` keyframes the original relied on:
 * those went out with the same file, and an overlay that cannot close is not
 * worth re-coupling to a stylesheet a third script has to inject.
 *
 * Closing is also where a surface's usage report ends: an overlay may hang its
 * reporter on `overlay.__gbReportClose` (see usage-report.js) and this calls it
 * once, so every close path reports without each one remembering to.
 */

(function installVanillaModalChrome(root) {
  'use strict';

  if (root.__gbCloseModal) return;

  var FADE_MS = 220;

  root.__gbCloseModal = function closeModal(overlay, ms) {
    if (!overlay || !overlay.isConnected) return;
    var duration = typeof ms === 'number' ? ms : FADE_MS;

    try { overlay.__gbReportClose && overlay.__gbReportClose(); } catch (e) { /* usage never blocks a close */ }

    var card = overlay.firstElementChild;
    try {
      overlay.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: duration, easing: 'ease', fill: 'forwards' },
      );
      if (card) {
        card.animate(
          [{ transform: 'none' }, { transform: 'scale(.96) translateY(12px)' }],
          { duration: duration, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
        );
      }
    } catch (e) {
      // jsdom and very old engines have no element.animate. The overlay still
      // has to go away — an un-animated close beats a stuck modal.
    }

    setTimeout(function removeOverlay() {
      if (overlay.isConnected) overlay.remove();
    }, duration + 20);
  };
})(window);
