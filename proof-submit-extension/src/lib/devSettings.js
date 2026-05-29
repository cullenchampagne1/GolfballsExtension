/* ───────────────────────────────────────────────────────────────
   devSettings.js — STUB for the proof-submit-extension client
   build. The full extension reads these from chrome.storage and
   exposes a Settings panel; this build ships no settings UI and
   has no need to persist, so we return hardcoded defaults
   matching the keys the proof flow actually reads.

   useSettingNotification / useDevSettings aren't called from this
   build's import tree, so only useDevSetting is exported.
─────────────────────────────────────────────────────────────── */

const DEFAULTS = {
  'imageViewer.draggable':          true,
  'submitProof.draggable':          true,
  'submitProof.useMock':            false,
  'golfballViewer.showDebugHud':    false,
  'golfballViewer.ballScale':       1,
  'golfballViewer.ballRotX':        0,
  'golfballViewer.ballRotY':        0,
  'golfballViewer.ballRotZ':        0,
  'numberDisplay.enabled':          true,
  'numberDisplay.durationMs':       400,
};

export function useDevSetting(key) {
  return DEFAULTS[key];
}

/* GolfballViewer destructures [dev] = useDevSettings() and indexes
   it for the initial ball framing. No setter; ignore writes. */
export function useDevSettings() {
  return [DEFAULTS, () => {}];
}
