// call-log-early.js — document_start structural injection for Quick Log panel.
// Runs before the browser's first paint. Injects the portlet shell synchronously
// inside a MutationObserver microtask so the layout is correct from the first frame.
// No chrome.storage calls — pure DOM work only.

(function () {
  if (!/[?&]Page=240\b/i.test(window.location.href)) return;
  if (window.__gbCallLogEarlyDone) return;

  // ── Minimal structural CSS — flex layout and holder positioning only ──
  // Visual styles (portlet colours, buttons) are handled by call-log-panel.js.
  function injectEarlyStyles() {
    if (document.getElementById('__gb-cl-css-early')) return;
    const st = document.createElement('style');
    st.id = '__gb-cl-css-early';
    st.textContent = `
      .gb-safe-flex-row {
        display: flex !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        overflow: visible !important;
      }
      .gb-safe-flex-row::before,
      .gb-safe-flex-row::after { display: none !important; }
      .gb-safe-flex-row > div[class*="span"] {
        float: none !important;
        flex: 1 1 0% !important;
        width: auto !important;
        min-width: 0 !important;
        margin-left: 1.5% !important;
        box-sizing: border-box !important;
      }
      .gb-safe-flex-row > div[class*="span"]:first-child { margin-left: 0 !important; }
      #__gb-cl-portlet-holder {
        flex: 1 1 0% !important;
        margin-left: 1.5% !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }
    `;
    // Append to head if available, else to documentElement
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Synchronous injection — runs inside MutationObserver microtask ──
  function inject() {
    if (document.getElementById('__gb-cl-portlet-holder')) return true;

    const altPortlet = [...document.querySelectorAll('.portlet-title .caption')]
      .find(el => el.textContent.trim().includes('Alternate Lookups'))
      ?.closest('.portlet');
    if (!altPortlet) return false;

    const altPortletCol = altPortlet.closest('[class*="span"]');
    if (!altPortletCol) return false;

    injectEarlyStyles();

    altPortletCol.parentElement.classList.add('gb-safe-flex-row');

    const holder = document.createElement('div');
    holder.id = '__gb-cl-portlet-holder';
    holder.className = altPortletCol.className;
    holder.innerHTML = `
      <div id="__gb-cl-portlet" class="portlet box custom-theme">
        <div class="portlet-title"><div class="caption">Quick Log</div></div>
        <div class="portlet-body">
          <div id="__gb-cl-btn-grid"><span class="gb-cl-empty">Loading…</span></div>
        </div>
      </div>`;

    altPortletCol.parentElement.insertBefore(holder, altPortletCol);
    window.__gbCallLogEarlyDone = true;
    return true;
  }

  // Try immediately in case the DOM is already partially built
  if (inject()) return;

  // Otherwise observe from documentElement — body may not exist yet at document_start
  const mo = new MutationObserver(() => {
    if (inject()) mo.disconnect();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  // Disconnect after 15s as a safety net — page should have loaded by then
  setTimeout(() => mo.disconnect(), 15000);
})();
