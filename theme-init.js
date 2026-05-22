// theme-init.js
// Applies saved theme colour overrides before the page first renders,
// preventing a flash of default colours. Referenced by popup.html and editor.html.
// theme.js then takes over for live updates.
(function () {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  chrome.storage.local.get('themeColors', function (data) {
    var ov = data && data.themeColors;
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
