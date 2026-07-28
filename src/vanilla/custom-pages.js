/* ───────────────────────────────────────────────────────────────
   custom-pages.js — the Custom Pages engine.

   Consumes the "Custom Pages" setting (Settings → Custom Pages,
   chrome.storage.local.customPages = { crm: ['contact_details', …] })
   and, on a matching + enabled CRM page, REPLACES the screen with a
   custom React UI instead of the original page.

   Strategy: OVERLAY, don't destroy. The host Default.aspx page still
   loads underneath (we need its DOM for data extraction via the
   schema engine, and its AJAX/session for write actions later). We
   mount a full-screen opaque React root ON TOP and lock host scroll.
   The host keeps running (its DataTables still populate), so the
   engine can re-extract as late rows arrive.

   Page UIs register themselves on window.__gbCustomPages:
     window.__gbCustomPages['contact_details'] = {
       render(rootEl, ctx) { … return optional cleanup fn … }
     }
   ctx = { pageId, store: { get(), subscribe(cb) } }  — a live data
   store backed by the schema engine + a debounced host observer.

   Detection lives HERE (one place, in sync with pageContext.js) so a
   page UI only has to render. Plain content script (no ESM) — runs
   after page-engine.js (for window.__gbPageEngine) and after the page
   UI bundles register, before main.js.
─────────────────────────────────────────────────────────────── */
(function () {
  if (window.__gbCustomPagesEngineReady) return;
  window.__gbCustomPagesEngineReady = true;

  window.__gbCustomPages = window.__gbCustomPages || {};

  var STORAGE_KEY = 'customPages';
  var MIRROR_KEY = '__gbCustomPages';
  var ROOT_ID = '__gb-custom-page';

  /* The takeover renders inside a Shadow DOM so the host page's CSS
     (Bootstrap 2 / Metronic ships aggressive element + reset rules that
     flatten our corners and kill transitions) CANNOT bleed in. Only this
     stylesheet + our inline styles apply inside the shadow. The --gb-*
     design tokens still resolve because custom properties inherit across
     the shadow boundary from <html>; the Geist @font-face is document-
     global so it's available too. Keyframes are tree-scoped, so the ones
     our UI references must be (re)declared HERE. */
  var SHADOW_CSS =
    ':host { display: block; height: 100%; font-family: var(--gb-font-sans); color: var(--gb-text-secondary); }' +
    '* , *::before, *::after { box-sizing: border-box; }' +
    /* No default scrollbars ANYWHERE in the takeover — every scrollable
       region gets the thin themed bar. */
    '* { scrollbar-width: thin; scrollbar-color: var(--gb-border-default) transparent; }' +
    '::-webkit-scrollbar { width: 9px; height: 9px; }' +
    '::-webkit-scrollbar-track { background: transparent; }' +
    '::-webkit-scrollbar-thumb { background: var(--gb-border-default); border-radius: 99px; border: 2px solid transparent; background-clip: padding-box; }' +
    '::-webkit-scrollbar-thumb:hover { background: var(--gb-border-strong); background-clip: padding-box; }' +
    '::-webkit-scrollbar-corner { background: transparent; }' +
    '@keyframes gb-fade-slide { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }' +
    '@keyframes gb-spin { to { transform: rotate(360deg); } }' +
    '@keyframes gb-pulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }';

  function engine() { return window.__gbPageEngine || null; }

  /* id → detector. Mirrors detectPageType()'s URL/DOM checks in
     src/lib/pageContext.js (kept here so the engine owns gating and
     page UIs stay render-only). Add a row per supported page id. */
  var DETECTORS = {
    contact_details: function (doc) {
      var e = engine();
      if (!e) return false;
      return e.detectPageType(doc) === (e.PAGE_TYPE ? e.PAGE_TYPE.CONTACT : 'contact');
    },
    account_details: function (doc) {
      var e = engine();
      if (!e) return false;
      return e.detectPageType(doc) === (e.PAGE_TYPE ? e.PAGE_TYPE.ACCOUNT : 'account');
    },
    opportunity_details: function (doc) {
      var e = engine();
      if (!e) return false;
      return e.detectPageType(doc) === (e.PAGE_TYPE ? e.PAGE_TYPE.OPPORTUNITY : 'opportunity');
    },
  };

  // ── enabled-set helpers ──────────────────────────────────────
  function flatten(pages) {
    // { crm: ['contact_details', …], … } → ['contact_details', …]
    var out = [];
    if (!pages) return out;
    Object.keys(pages).forEach(function (section) {
      var ids = pages[section];
      if (Array.isArray(ids)) ids.forEach(function (id) { if (out.indexOf(id) === -1) out.push(id); });
    });
    return out;
  }

  function readEnabled() {
    return new Promise(function (resolve) {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage) { resolve([]); return; }
        chrome.storage.local.get(STORAGE_KEY, function (d) {
          resolve(flatten(d && d[STORAGE_KEY]));
        });
      } catch (e) { resolve([]); }
    });
  }

  /* Keep the host-origin localStorage mirror fresh so the
     document_start boot script (custom-page-boot.js) can pre-hide
     the right pages on the NEXT load without waiting for async
     chrome.storage. */
  function writeMirror(enabled) {
    try { window.localStorage.setItem(MIRROR_KEY, JSON.stringify(enabled || [])); } catch (e) {}
  }

  /* Mirror the active theme's deep-surface colour so the document_start
     boot cover (custom-page-boot.js) paints the right background before
     the --gb-* tokens are injected. */
  function writeThemeBg() {
    try {
      var cs = getComputedStyle(document.documentElement);
      var bg = cs.getPropertyValue('--gb-surface-deep').trim();
      var ac = cs.getPropertyValue('--gb-brand-label').trim();
      if (bg) window.localStorage.setItem('__gbCustomPageBg', bg);
      if (ac) window.localStorage.setItem('__gbCustomPageAccent', ac);
    } catch (e) {}
  }

  // ── live data store (schema engine + debounced host observer) ──
  function extract() {
    var e = engine();
    if (!e || typeof e.runEngine !== 'function') return null;
    try {
      // clearCache(doc) is a no-op without the doc arg — runEngine caches
      // per-document, and the host DOM mutates as DataTables load.
      if (typeof e.clearCache === 'function') e.clearCache(document);
      var res = e.runEngine(document);
      return res ? res.data : null;
    } catch (err) { return null; }
  }

  /* Structural equality for extracted data. Emits fire from mutation
     bursts AND fixed backstop timers, so once the host settles most
     re-extracts are identical — comparing here lets the store keep the
     SAME object reference, which is what useSyncExternalStore keys
     re-renders off. */
  function deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
      return a !== a && b !== b; // NaN
    }
    var aArr = Array.isArray(a);
    if (aArr !== Array.isArray(b)) return false;
    if (aArr) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) { if (!deepEqual(a[i], b[i])) return false; }
      return true;
    }
    var ak = Object.keys(a);
    var bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (var j = 0; j < ak.length; j++) {
      var k = ak[j];
      if (!Object.prototype.hasOwnProperty.call(b, k) || !deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  // Test hook — the unit suite imports this file with stubbed globals and
  // exercises the pure store helpers through here.
  window.__gbCustomPagesInternals = { deepEqual: deepEqual };

  function createStore() {
    var data = extract();
    var subs = [];
    var timer = null;
    var observer = null;

    function emit() {
      var next = extract();
      // Unchanged extract → keep the old reference and DON'T notify, so
      // React never re-renders for a no-op host mutation / backstop timer.
      if (deepEqual(next, data)) return;
      data = next;
      for (var i = 0; i < subs.length; i++) { try { subs[i](data); } catch (e) {} }
    }

    try {
      observer = new MutationObserver(function () {
        // Debounced — one re-extract per burst (matches main.js's 200ms).
        if (timer) clearTimeout(timer);
        timer = setTimeout(emit, 250);
      });
      // Observe the HOST body only. Our React root mounts on
      // <html> (outside body), so its own renders never feed back here.
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}

    /* Some portlets (notably Email History) AJAX-load and get their rows
       stamped by the host's own JS AFTER first paint, which a single
       mutation burst can miss. Re-extract on a few delays as a backstop so
       late-arriving sections (emails, opportunities) fill in. */
    [600, 1500, 3500, 6000].forEach(function (ms) { setTimeout(emit, ms); });

    return {
      get: function () { return data; },
      subscribe: function (cb) {
        subs.push(cb);
        return function () { var i = subs.indexOf(cb); if (i !== -1) subs.splice(i, 1); };
      },
      _dispose: function () {
        if (timer) clearTimeout(timer);
        if (observer) observer.disconnect();
        subs.length = 0;
      },
    };
  }

  // ── takeover ─────────────────────────────────────────────────
  var active = null; // { rootEl, store, cleanup, prevOverflow }

  function takeover(pageId, mod) {
    if (active) return;
    var store = createStore();

    var rootEl = document.createElement('div');
    rootEl.id = ROOT_ID;
    // Plain viewport container. The React UI renders inside a Shadow DOM
    // attached here so host (Metronic/Bootstrap) CSS can't bleed in.
    // z-index ABOVE the host page (Metronic tops out ~10k) but BELOW the
    // extension's own modal/shelf/toast layers (>=999990) so Quick Actions,
    // CRM Search, toasts etc. still surface ON TOP of the takeover.
    rootEl.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:100000',
      'overflow:hidden', 'background:var(--gb-surface-deep,#0a0b0c)',
    ].join(';');
    // Mount on <html>, not <body>, so the store's body-observer never
    // sees our own React mutations.
    document.documentElement.appendChild(rootEl);

    // Shadow root = full CSS isolation from the host page. Inject our
    // minimal stylesheet (reset + keyframes); --gb-* tokens + Geist
    // still reach in via inheritance / document-global @font-face.
    var mountTarget = rootEl;
    try {
      var shadow = rootEl.attachShadow({ mode: 'open' });
      var sheet = document.createElement('style');
      sheet.textContent = SHADOW_CSS;
      shadow.appendChild(sheet);
      var mount = document.createElement('div');
      mount.style.height = '100%';
      shadow.appendChild(mount);
      mountTarget = mount;
    } catch (e) { /* attachShadow unsupported → render directly (no isolation) */ }

    // Lock host scroll via an INLINE style we own — independent of the
    // boot cover's stylesheet, which clear() (below) removes.
    var prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    var cleanup = null;
    try {
      cleanup = mod.render(mountTarget, { pageId: pageId, store: store });
    } catch (e) {
      // Render blew up — abort cleanly back to the host page.
      try { rootEl.remove(); } catch (e2) {}
      document.documentElement.style.overflow = prevOverflow;
      store._dispose();
      revealHost();
      return;
    }

    active = { rootEl: rootEl, store: store, cleanup: cleanup, prevOverflow: prevOverflow };

    // Our fixed root (z above the cover) now paints — drop the plain
    // document_start cover.
    if (window.__gbCustomPageBoot) { try { window.__gbCustomPageBoot.clear(); } catch (e) {} }
  }

  function revealHost() {
    // No takeover (page disabled / not detected) — remove any
    // document_start pre-hide so the original page shows through.
    if (window.__gbCustomPageBoot) { try { window.__gbCustomPageBoot.clear(); } catch (e) {} }
  }

  // ── boot ─────────────────────────────────────────────────────
  function boot() {
    readEnabled().then(function (enabled) {
      writeMirror(enabled);
      writeThemeBg();

      // Find the first enabled page id whose detector matches AND has a
      // registered UI. First match wins.
      var chosen = null;
      var registry = window.__gbCustomPages || {};
      for (var i = 0; i < enabled.length; i++) {
        var id = enabled[i];
        var det = DETECTORS[id];
        var mod = registry[id];
        if (det && mod && typeof mod.render === 'function' && det(document)) { chosen = { id: id, mod: mod }; break; }
      }

      if (chosen) takeover(chosen.id, chosen.mod);
      else revealHost();
    });
  }

  // Keep the mirror current for future loads when the setting changes.
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes[STORAGE_KEY]) {
          writeMirror(flatten(changes[STORAGE_KEY].newValue));
        }
      });
    }
  } catch (e) {}

  boot();
})();
