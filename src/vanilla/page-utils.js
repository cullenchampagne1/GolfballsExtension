if (window.__gbLoaded_pageUtils) {} else { window.__gbLoaded_pageUtils = true;
// page-utils.js — element picker, Signifyd fraud glow, order-ID copy button

// ── ELEMENT PICKER ──────────────────────────────────────────────────────────

let pickActive = false;
  let hoveredEl  = null;

  /**
   * Activates the element-picker overlay, injecting styles and the pick
   * banner, and attaching the mouse/keyboard event listeners needed to
   * highlight and capture elements.
   */
  function enterPickMode() {
    if (pickActive) return;
    pickActive = true;
    injectStyles();
    injectBanner();
    document.addEventListener('mouseover', onHover,   true);
    document.addEventListener('mouseout',  onUnhover, true);
    document.addEventListener('click',     onPick,    true);
    document.addEventListener('keydown',   onKeydown, true);
  }

  /**
   * Deactivates the element-picker, removes injected styles and the banner,
   * and optionally sends a `cancelPick` message to the background script.
   * @param {boolean} cancelled - True when the user pressed Escape or clicked Cancel.
   */
  function exitPickMode(cancelled) {
    if (!pickActive) return;
    pickActive = false;
    if (hoveredEl) { hoveredEl.classList.remove('__gb-hover'); hoveredEl = null; }
    document.removeEventListener('mouseover', onHover,   true);
    document.removeEventListener('mouseout',  onUnhover, true);
    document.removeEventListener('click',     onPick,    true);
    document.removeEventListener('keydown',   onKeydown, true);
    document.getElementById('__gb-style')?.remove();
    document.getElementById('__gb-banner')?.remove();
    document.getElementById('__gb-tip')?.remove();
    if (cancelled) chrome.runtime.sendMessage({ action: 'cancelPick' });
  }

  /**
   * Injects the `.__gb-hover` highlight rule and picker-UI element styles
   * into a `<style>` tag in the document head. Idempotent.
   */
  function injectStyles() {
    if (document.getElementById('__gb-style')) return;
    const s = document.createElement('style');
    s.id = '__gb-style';
    /* Floating pill banner that matches the design system's modal /
       popover surfaces. Sits 16px below the top of the viewport with
       margin on each side, rounded corners, frosted glass, and the
       brand-tinted border the rest of the UI uses. data-gb-scale is
       set on the host element (injectBanner) so the UI-scale slider
       picks it up. */
    s.textContent = `
      .__gb-hover { outline: 2px solid var(--gb-brand) !important; outline-offset: 2px !important;
        cursor: crosshair !important; background-color: color-mix(in srgb, var(--gb-brand) 10%, transparent) !important; }
      #__gb-banner {
        position: fixed !important;
        top: 16px !important; left: 50% !important;
        transform: translateX(-50%) !important;
        z-index: 2147483647 !important;
        max-width: min(560px, calc(100vw - 32px)) !important;
        padding: 10px 14px !important;
        background: color-mix(in srgb, var(--gb-surface-modal) 92%, transparent) !important;
        color: var(--gb-text-primary) !important;
        border: 1px solid var(--gb-border-default) !important;
        border-radius: var(--gb-r-lg) !important;
        backdrop-filter: blur(14px) saturate(160%) !important;
        -webkit-backdrop-filter: blur(14px) saturate(160%) !important;
        box-shadow: var(--gb-shadow-popover) !important;
        font: 500 12.5px/1.4 var(--gb-font-sans, -apple-system, sans-serif) !important;
        display: flex !important; align-items: center !important; gap: 10px !important;
        animation: __gbPickBannerIn .18s cubic-bezier(.4,0,.2,1) !important;
      }
      @keyframes __gbPickBannerIn {
        from { opacity: 0; transform: translate(-50%, -8px); }
        to   { opacity: 1; transform: translate(-50%,  0); }
      }
      #__gb-banner .__gb-pick-icon {
        width: 22px !important; height: 22px !important;
        display: inline-flex !important; align-items: center !important; justify-content: center !important;
        background: var(--gb-brand-tint-medium) !important;
        border: 1px solid var(--gb-brand-tint-border) !important;
        border-radius: var(--gb-r-sm) !important;
        color: var(--gb-brand-label) !important;
        flex-shrink: 0 !important;
      }
      #__gb-banner .__gb-pick-text { flex: 1 !important; min-width: 0 !important; }
      #__gb-banner kbd {
        background: var(--gb-surface-2) !important;
        border: 1px solid var(--gb-border-default) !important;
        color: var(--gb-text-secondary) !important;
        padding: 1px 6px !important;
        border-radius: var(--gb-r-xs) !important;
        font-family: var(--gb-font-mono, ui-monospace, monospace) !important;
        font-size: 10.5px !important;
      }
      #__gb-cancel-btn {
        background: var(--gb-surface-2) !important;
        color: var(--gb-text-secondary) !important;
        border: 1px solid var(--gb-border-default) !important;
        padding: 4px 10px !important;
        border-radius: var(--gb-r-sm) !important;
        cursor: pointer !important;
        font: 600 11.5px/1 var(--gb-font-sans, inherit) !important;
        transition: background .12s, color .12s, border-color .12s !important;
        flex-shrink: 0 !important;
      }
      #__gb-cancel-btn:hover {
        background: var(--gb-fill-hover) !important;
        color: var(--gb-text-primary) !important;
        border-color: var(--gb-border-strong) !important;
      }
      #__gb-tip { position: fixed !important; z-index: 2147483646 !important;
        background: var(--gb-surface-modal) !important; color: var(--gb-text-secondary) !important;
        font: 11px/1.5 var(--gb-font-mono, ui-monospace, monospace) !important;
        padding: 6px 9px !important;
        border-radius: var(--gb-r-sm) !important;
        border: 1px solid var(--gb-border-default) !important;
        box-shadow: var(--gb-shadow-popover) !important;
        pointer-events: none !important;
        max-width: 340px !important; word-break: break-all !important;
        display: none !important;
      }
    `;
    document.head.appendChild(s);
  }

  /**
   * Creates and prepends the floating "Click any element" pill banner
   * and a tooltip element to the document body. Banner is themed and
   * opted-in to the popovers UI-scale slider via data-gb-scale. */
  function injectBanner() {
    if (document.getElementById('__gb-banner')) return;
    const b = document.createElement('div');
    b.id = '__gb-banner';
    b.className = 'gb-pick-banner';
    b.setAttribute('data-gb-scale', 'popovers');
    b.innerHTML = `
      <span class="__gb-pick-icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      </span>
      <span class="__gb-pick-text">Click any element to capture its value &nbsp;·&nbsp; <kbd>Esc</kbd> to cancel</span>
      <button id="__gb-cancel-btn" type="button">Cancel</button>
    `;
    document.body.appendChild(b);
    document.getElementById('__gb-cancel-btn').addEventListener('click', () => exitPickMode(true));

    const tip = document.createElement('div');
    tip.id = '__gb-tip';
    document.body.appendChild(tip);
    document.addEventListener('mousemove', (e) => {
      const t = document.getElementById('__gb-tip');
      if (t) { t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY + 14) + 'px'; }
    });
  }

  /**
   * mouseover handler for pick mode. Highlights the hovered element and
   * updates the floating tooltip with its text content and CSS selector.
   * @param {MouseEvent} e - The mouseover event.
   */
  let _hoverTimer = null;
  function onHover(e) {
    if (isPickerUI(e.target)) return;
    if (hoveredEl) hoveredEl.classList.remove('__gb-hover');
    hoveredEl = e.target;
    hoveredEl.classList.add('__gb-hover');
    const txt = getTextOf(hoveredEl).slice(0, 80);
    const tip = document.getElementById('__gb-tip');
    if (tip) {
      tip.textContent = `"${txt}" · ${generateSelector(hoveredEl)}`;
      tip.style.setProperty('display', 'block', 'important');
    }
    clearTimeout(_hoverTimer);
    _hoverTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'pickHover', text: txt });
    }, 80);
  }

  /**
   * mouseout handler for pick mode. Hides the floating tooltip.
   */
  function onUnhover() {
    const tip = document.getElementById('__gb-tip');
    if (tip) tip.style.setProperty('display', 'none', 'important');
  }

  /**
   * click handler for pick mode. Captures the clicked element's selector and
   * text value, exits pick mode, and sends the result to the background script.
   * @param {MouseEvent} e - The click event.
   */
  function onPick(e) {
    if (isPickerUI(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const el  = e.target;
    const sel = generateSelector(el);
    const txt = getTextOf(el);
    exitPickMode(false);
    chrome.runtime.sendMessage({ action: 'elementPicked', selector: sel, text: txt });
  }

  /**
   * keydown handler for pick mode. Exits pick mode when Escape is pressed.
   * @param {KeyboardEvent} e - The keydown event.
   */
  function onKeydown(e) { if (e.key === 'Escape') exitPickMode(true); }

  /**
   * Returns true when an element is part of the picker UI overlay (banner or
   * tooltip), so pick-mode handlers can ignore clicks on the UI itself.
   * @param {Element} el - The element to test.
   * @returns {boolean}
   */
  function isPickerUI(el) {
    return el?.id === '__gb-banner' || el?.closest?.('#__gb-banner') || el?.id === '__gb-tip';
  }

  /**
   * Returns the visible text content of a DOM element, trimmed and
   * whitespace-collapsed. Falls back to the `value` attribute for inputs.
   * @param {Element} el - The element to read text from.
   * @returns {string} The normalised text content.
   */
  function getTextOf(el) {
    return (el.innerText || el.textContent || el.getAttribute?.('value') || '')
      .trim().replace(/\s+/g, ' ');
  }

  // ── CSS Selector generator ────────────────────────────────────────────────

  /**
   * Generates the shortest CSS selector that uniquely identifies the given
   * element, favouring ID selectors and stopping early when the selector
   * already resolves to a single node.
   * @param {Element} el - The element to generate a selector for.
   * @returns {string} A unique CSS selector string.
   */
  function generateSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement && cur.nodeType === 1) {
      if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      let part = cur.tagName.toLowerCase();
      const cls = [...(cur.classList || [])]
        .filter(c => c && !c.startsWith('__gb') && c.length < 40 && !/^\d/.test(c))
        .slice(0, 2);
      if (cls.length) part += '.' + cls.map(c => CSS.escape(c)).join('.');
      if (cur.parentNode) {
        const sibs = [...cur.parentNode.children].filter(s => s.tagName === cur.tagName);
        if (sibs.length > 1) part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      try { if (document.querySelectorAll(parts.join(' > ')).length === 1) break; } catch {}
      cur = cur.parentNode;
    }
    const sel = parts.join(' > ');
    try { if (document.querySelector(sel) === el) return sel; } catch {}
    return nthPath(el);
  }

  /**
   * Generates an absolute nth-child selector path from the document root
   * to the element, used as a reliable fallback when generateSelector cannot
   * produce a stable short form.
   * @param {Element} el - The element to generate a path for.
   * @returns {string} A fully-qualified nth-child CSS selector string.
   */
  function nthPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement && cur.nodeType === 1) {
      const idx = cur.parentNode ? [...cur.parentNode.children].indexOf(cur) + 1 : 1;
      parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
      cur = cur.parentNode;
    }
    return parts.join(' > ');
  }


// ── SIGNIFYD FRAUD TAG GLOW ─────────────────────────────────────────────────

// FRAUD TAG GLOW EFFECT
  // ═══════════════════════════════════════════════════════

  /**
   * Adds or removes a red inset-glow overlay on the order page when the
   * page contains a `SignifydFailed` fraud tag, providing a strong visual
   * warning to staff. Updates the overlay position on window resize.
   */
  function __gbApplySignifydGlow() {
    const url = window.location.href;
    if (url.includes("https://api.golfballs.com/golfballs/adminnew/default.aspx?folder=Orders&page=ViewOrder&")) {
      const tags = document.querySelectorAll('a.btn.blue.mini, span[id^="CurrentTag-"]');
      const hasFailedTag = Array.from(tags).some(el => el.textContent.trim().includes('SignifydFailed'));

      let glow = document.getElementById('__gb-signifyd-glow');

      if (hasFailedTag) {
        // Create it if it doesn't exist
        if (!glow) {
          glow = document.createElement('div');
          glow.id = '__gb-signifyd-glow';
          
          // Fixed keeps it locked to the screen vertically.
          // top: -3px covers your top margin gap!
          glow.style.cssText = `
            position: fixed;
            top: -3px;
            margin-top: 55px;
            bottom: 0;
            pointer-events: none;
            box-shadow: inset 0 0 60px 20px rgba(var(--gb-fraud-rgb), 0.35);
            z-index: 2147483646;
            transition: opacity 0.5s ease-in-out;
          `;
          document.body.appendChild(glow);
          
          // Ensure it recalculates if the user resizes the window
          window.addEventListener('resize', __gbApplySignifydGlow);
        }

        // Snap the fixed element to the exact horizontal coordinates of the container
        const targetContainer = document.querySelector('#form1 > div.page-container.row-fluid > div.page-content > div');
        if (targetContainer) {
          const rect = targetContainer.getBoundingClientRect();
          glow.style.left = Math.round(rect.left) + 'px';
          glow.style.width = Math.round(rect.width) + 'px';
        } else {
          // Fallback just in case
          glow.style.left = '0px';
          glow.style.width = '100%';
        }
        
      } else if (!hasFailedTag && glow) {
        // Clean up when the tag is removed
        glow.remove();
        window.removeEventListener('resize', __gbApplySignifydGlow);
      }
    }
  }

  // ═══════════════════════════════════════════════════════

// ── ORDER ID COPY BUTTON ────────────────────────────────────────────────────

// ORDER ID COPY BUTTON
  // ═══════════════════════════════════════════════════════

  /**
   * Injects the shared `.gb-modern-btn` stylesheet into the document head.
   * Idempotent — only injects once per page load.
   */
  function __gbInjectModernButtonStyles() {
    if (document.getElementById('__gb-modern-styles')) return;
    const style = document.createElement('style');
    style.id = '__gb-modern-styles';
    style.textContent = `
      .gb-modern-btn { background: linear-gradient(180deg, var(--gb-page-btn, #008000) 0%, var(--gb-page-btn-dark, #004b23) 100%) !important; color: var(--gb-page-btn-text, #d4ffdc) !important; border: 1px solid var(--gb-page-btn-border, #026e23) !important; padding: 4px 9px !important; border-radius: 6px !important; cursor: pointer !important; font: 600 11px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; position: relative !important; overflow: hidden !important; transition: all 0.25s ease !important; text-align: center !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; user-select: none !important; }
      .gb-modern-btn:hover { box-shadow: 0 4px 10px rgba(var(--gb-page-btn-rgb, 0,128,0), 0.4), 0 0 8px rgba(var(--gb-page-btn-rgb, 0,128,0), 0.2) !important; transform: translateY(-1px) !important; }
      .gb-modern-btn:active { transform: translateY(1px) !important; box-shadow: 0 1px 2px rgba(0,0,0,0.15) !important; }
      .gb-modern-btn.is-saving { background: linear-gradient(180deg, var(--gb-page-btn-saving, #2a2a2a) 0%, var(--gb-page-btn-saving, #2a2a2a) 100%) !important; border-color: var(--gb-page-btn-border, #026e23) !important; color: var(--gb-page-btn-text, #d4ffdc) !important; opacity: 0.6 !important; pointer-events: none !important; }
      .gb-modern-btn.is-saved { background: linear-gradient(180deg, var(--gb-page-btn-saved, #004b23) 0%, var(--gb-page-btn-saved, #004b23) 100%) !important; border-color: var(--gb-page-btn-border, #026e23) !important; color: var(--gb-page-btn-text, #d4ffdc) !important; box-shadow: 0 0 14px rgba(var(--gb-page-btn-saved-rgb, 0,75,35), 0.6) !important; pointer-events: none !important; }
      .gb-btn-text-wrapper { display: grid !important; align-items: center !important; justify-items: center !important; }
      .gb-text-normal, .gb-text-state { grid-area: 1 / 1 !important; transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease !important; }
      .gb-text-state { transform: translateY(-150%) !important; opacity: 0 !important; }
      .gb-modern-btn.show-state .gb-text-normal { transform: translateY(150%) !important; opacity: 0 !important; }
      .gb-modern-btn.show-state .gb-text-state { transform: translateY(0) !important; opacity: 1 !important; }
    `;
    document.head.appendChild(style);
  }

  /**
   * Appends a "Copy" button to the "Order List" portlet title bar that
   * writes all order IDs in the table as rich HTML links to the clipboard,
   * with a plain-text fallback for environments that do not support
   * ClipboardItem.
   */
  function __gbAddCopyIdsButton() {
    if (document.getElementById('__gb-copy-ids-btn')) return;

    // Find the "Order List" portlet title
    const captions = Array.from(document.querySelectorAll('.portlet-title .caption'));
    const orderListCaption = captions.find(el => el.textContent.trim() === 'Order List');
    if (!orderListCaption) return;
    
    const portletTitle = orderListCaption.closest('.portlet-title');
    if (!portletTitle) return;

    __gbInjectModernButtonStyles();

    const btn = document.createElement('button');
    btn.id = '__gb-copy-ids-btn';
    btn.className = 'gb-modern-btn';
    btn.style.cssText = 'float: left; margin-left: 10px; margin-top: 1px';
    
    btn.innerHTML = `
      <span class="gb-btn-text-wrapper">
        <span class="gb-text-normal">Copy</span>
        <span class="gb-text-state">Copied ✓</span>
      </span>
    `;

    btn.onclick = async (e) => {
      e.preventDefault();
      
      const rows = document.querySelectorAll('table.table-advance tbody tr');
      let htmlContent = '';
      let plainContent = '';

      rows.forEach(row => {
        const link = row.querySelector('td:nth-child(2) a');
        if (link) {
          const id = link.textContent.trim();
          const url = link.href;
          
          // Use <div> wrapping to force strict new lines in MS Teams/Outlook
          htmlContent += `<div><a href="${url}">${id}</a> - </div>`;
          // Use \r\n for the plain text fallback to ensure Windows treats it as a true new line
          plainContent += `${id} - \r\n`;
        }
      });

      if (!htmlContent) return;

      try {
        const clipboardItem = new ClipboardItem({
          'text/html': new Blob([htmlContent], { type: 'text/html' }),
          'text/plain': new Blob([plainContent], { type: 'text/plain' })
        });
        await navigator.clipboard.write([clipboardItem]);

        btn.classList.add('show-state', 'is-saved');
        setTimeout(() => btn.classList.remove('show-state', 'is-saved'), 2000);
      } catch (err) {
        console.error('[GB] Clipboard write failed:', err);
        const ta = document.createElement('textarea');
        ta.value = plainContent;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        
        btn.classList.add('show-state', 'is-saved');
        setTimeout(() => btn.classList.remove('show-state', 'is-saved'), 2000);
      }
    };

    portletTitle.appendChild(btn);
  }


}