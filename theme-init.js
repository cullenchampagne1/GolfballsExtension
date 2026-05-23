// theme-init.js
// Applies saved theme colour overrides before the page first renders,
// preventing a flash of default colours. Referenced by popup.html and editor.html.
// theme.js / src/lib/theme.js then take over for live updates.
//
// Reads BOTH `gbTheme` (the React Settings shape) and the legacy
// `themeColors` (older user data) so customized colors paint correctly
// on first frame regardless of which writer set them last.
(function () {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.get(['gbTheme', 'themeColors'], function (data) {
    var ov = (data && data.gbTheme && data.gbTheme.colors) || (data && data.themeColors) || null;
    if (!ov || !Object.keys(ov).length) return;
    var root = document.documentElement;
    var rgbMap = {
      '--gb-brand':           '--gb-brand-rgb',
      '--gb-brand-label':     '--gb-brand-label-rgb',
      '--gb-error':           '--gb-error-rgb',
      '--gb-success':         '--gb-success-rgb',
      '--gb-admin-btn':       '--gb-admin-rgb',
      '--gb-admin-btn-saved': '--gb-admin-saved-rgb',
    };
    for (var k in ov) {
      root.style.setProperty(k, ov[k]);
      if (rgbMap[k]) {
        var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(ov[k]);
        if (m) root.style.setProperty(rgbMap[k],
          parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16));
      }
    }
  });
}());
