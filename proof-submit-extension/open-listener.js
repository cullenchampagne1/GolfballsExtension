/* open-listener.js — receives the runtime message the background
   sends when the toolbar icon is clicked and opens the image
   viewer on the current tab. The React content scripts (loaded
   above this in the manifest) install __gbOpenImagePreview on
   window during their first run, so all we have to do is call it. */

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.action === 'openImagePreview') {
    if (typeof window.__gbOpenImagePreview === 'function') {
      window.__gbOpenImagePreview(msg.opts || {});
    }
  }
});
