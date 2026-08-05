/* tracker-bridge.js — isolated-world half of the Trackers capture path.

   Two jobs, both of them plumbing:

     1. Hand the main-world hook its match rules. The hook cannot import the
        registry (it shares a world with page code) and a RegExp cannot cross a
        postMessage, so the rules go over as source + flags and are compiled on
        the other side.
     2. Forward what the hook matched to the background worker, which re-matches
        the URL itself and is the only thing that writes.

   The origin check is the whole security value of this file: `window.message`
   is shouted into a room the page is also standing in, so anything not posted
   by this document is not ours. */
(function installTrackerBridge() {
  'use strict';
  if (window.__gbTrackerBridge) return;
  window.__gbTrackerBridge = true;

  var HOOK = 'src/vanilla/tracker-net-hook.js';

  function post(message) {
    try { window.postMessage(message, window.location.origin); } catch (e) { /* */ }
  }

  function sendRules() {
    try {
      chrome.runtime.sendMessage({ action: 'gbTrackerRules' }, function (response) {
        void chrome.runtime.lastError;
        // An EMPTY list is an answer, not a non-answer: it is how a tracker
        // switched off mid-session disarms the hook that is already watching
        // for it. Only a missing/malformed reply (worker restarting) is
        // ignored, because that would disarm on a hiccup.
        if (!response || !Array.isArray(response.rules)) return;
        post({ __gbTrackerRules: true, rules: response.rules });
      });
    } catch (e) { /* worker restarting — the next page load re-arms it */ }
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window || event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || !data.__gbTrackerNet || !data.entry) return;
    try {
      chrome.runtime.sendMessage(
        { action: 'gbTrackerCapture', entry: data.entry },
        function () { void chrome.runtime.lastError; },
      );
    } catch (e) { /* dropped: a capture is never worth surfacing an error */ }
  });

  // The hook is injected at document_start and may compile its rules before
  // this script runs, so the rules are pushed rather than requested.
  sendRules();

  // Turning Trackers — or one individual tracker — on or off mid-session must
  // not require a reload. Per-tracker switches live in the store's state key
  // (gbTrackerState, see lib/tracker-store.js), which is also where the poll
  // cursor lives; re-asking on a cursor write costs one message a quarter hour
  // and keeps this listener from having to understand the value.
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes.featureFlags || changes.gbTrackerState) sendRules();
    });
  } catch (e) { /* storage events unavailable */ }

  void HOOK;
})();
