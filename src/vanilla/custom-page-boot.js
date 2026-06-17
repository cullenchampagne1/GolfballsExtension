/* ───────────────────────────────────────────────────────────────
   custom-page-boot.js — document_start FOUC guard for the Custom
   Pages engine.

   When a CRM page is enabled for a custom-UI takeover, the real
   takeover can only happen at document_idle (it needs the host DOM
   + the schema engine). That leaves a flash of the original, busy
   CRM page while it loads. This script runs at document_start and,
   if the current URL is a takeover target AND the user has it
   enabled, paints an opaque full-screen cover IMMEDIATELY so the
   old page never shows.

   It can't read chrome.storage synchronously, so it reads a
   host-origin localStorage MIRROR of the enabled set that the
   engine (custom-pages.js) keeps fresh. First-ever load on a fresh
   profile has no mirror → one acceptable flash; every load after is
   clean. The engine removes the cover once its React root mounts
   (or aborts), via window.__gbCustomPageBoot.clear().

   Plain content script (no ESM) — src/vanilla/* is loaded as-is by
   the manifest, not bundled.
─────────────────────────────────────────────────────────────── */
(function () {
  if (window.__gbCustomPageBoot) return;

  var MIRROR_KEY = '__gbCustomPages';
  var BG_KEY = '__gbCustomPageBg';
  var COVER_ID = '__gb-cp-cover';
  var STYLE_ID = '__gb-cp-cover-style';

  /* URL → custom-page id. Mirrors the detectPageType() URL checks in
     src/lib/pageContext.js, but kept here as plain regex so this can
     run at document_start without the engine. Keep in sync. */
  var URL_RULES = [
    { id: 'contact_details', re: /[?&]Page=240\b/i },
    { id: 'account_details', re: /[?&]Page=271\b/i },
  ];

  function enabledSet() {
    try {
      var raw = window.localStorage.getItem(MIRROR_KEY);
      if (!raw) return null;            // no mirror yet → don't pre-hide
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : null;
    } catch (e) { return null; }
  }

  function targetId() {
    var url = '';
    try { url = window.location.href; } catch (e) { url = ''; }
    for (var i = 0; i < URL_RULES.length; i++) {
      if (URL_RULES[i].re.test(url)) return URL_RULES[i].id;
    }
    return null;
  }

  /* Themed background, read synchronously from a localStorage mirror the
     engine keeps in sync with the active theme's --gb-surface-deep. At
     document_start the --gb-* tokens aren't injected yet, so the mirror is
     how we paint the correct (light/dark/etc.) colour with no flash. */
  function coverBg() {
    try {
      var c = window.localStorage.getItem(BG_KEY);
      if (c && /^#|rgb|hsl/i.test(c)) return c;
    } catch (e) {}
    return '#0a0b0c';
  }

  function showCover() {
    if (document.getElementById(COVER_ID)) return;
    var root = document.documentElement;

    // Lock scroll under the cover.
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'html.__gb-cp-locked, html.__gb-cp-locked body { overflow: hidden !important; }';
    root.appendChild(style);
    root.classList.add('__gb-cp-locked');

    // Flat, opaque, THEMED fill. No spinner / rounded children — the cover
    // lives outside the takeover's Shadow DOM, so host (Metronic) CSS would
    // bleed into any styled child (e.g. flatten a spinner's radius). The
    // real themed loading state renders inside the shadow once React mounts;
    // this is just a brief, correct-coloured fill. Below the extension's
    // modal/shelf layers (>=999990) so those still surface during load.
    var cover = document.createElement('div');
    cover.id = COVER_ID;
    cover.setAttribute('aria-hidden', 'true');
    cover.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:' + coverBg(),
    ].join(';');

    // Spinner lives in a shadow root so host (Metronic) CSS can't flatten
    // its rounded shape. Colors are hardcoded (tokens aren't injected yet at
    // document_start); brand green reads fine on both light + dark covers.
    try {
      var sh = cover.attachShadow({ mode: 'open' });
      var st = document.createElement('style');
      st.textContent =
        '@keyframes __gbcp_spin { to { transform: rotate(360deg); } }' +
        ':host { display: flex; align-items: center; justify-content: center; height: 100%; }' +
        '.s { width: 30px; height: 30px; border-radius: 50%;' +
        ' border: 3px solid rgba(128,128,128,0.22); border-top-color: #8fce2e;' +
        ' animation: __gbcp_spin 0.7s linear infinite; }';
      sh.appendChild(st);
      var sp = document.createElement('div');
      sp.className = 's';
      sh.appendChild(sp);
    } catch (e) { /* no shadow support → plain cover, still fine */ }

    root.appendChild(cover);
  }

  function clearCover() {
    var cover = document.getElementById(COVER_ID);
    if (cover) cover.remove();
    var style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    try { document.documentElement.classList.remove('__gb-cp-locked'); } catch (e) {}
  }

  var id = targetId();
  var enabled = enabledSet();
  // Pre-hide only when we KNOW (from the mirror) this page is enabled.
  if (id && enabled && enabled.indexOf(id) !== -1) showCover();

  /* Public surface for the engine: it removes the cover after its
     React takeover mounts, or aborts the pre-hide if the page turns
     out not to be enabled / not detected once storage is read. */
  window.__gbCustomPageBoot = {
    targetId: id,
    preHidden: !!document.getElementById(COVER_ID),
    show: showCover,
    clear: clearCover,
  };
})();
