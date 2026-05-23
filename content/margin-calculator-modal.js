// margin-calculator-modal.js — Full-screen margin & profit calculator.
// Draggable, pass-through background, quantity multiplier.

if (!window.__gbMarginCalcLoaded) {
  window.__gbMarginCalcLoaded = true;

  // ── Styles ────────────────────────────────────────────────────────────────────
  (function injectStyles() {
    if (document.getElementById('__gb-mc-css')) return;
    const st = document.createElement('style');
    st.id = '__gb-mc-css';
    st.textContent = `
      #__gb-mc-overlay {
        position: fixed !important; inset: 0 !important; z-index: 999990 !important;
        backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
        background: rgba(0,0,0,.35) !important; 
        pointer-events: none !important; 
        animation: __gbMcFade .18s ease !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      }
      @keyframes __gbMcFade { from { opacity:0; } to { opacity:1; } }
  
      #__gb-mc-card {
        pointer-events: auto !important; 
        position: absolute !important; 
        background: var(--gb-surface, #1a1a1a) !important;
        border: 1px solid rgba(255,255,255,.09) !important;
        border-radius: 18px !important;
        width: min(520px, calc(100vw - 32px)) !important;
        display: flex !important; flex-direction: column !important; overflow: hidden !important;
        box-shadow: 0 32px 80px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important;
        animation: __gbMcUp .28s cubic-bezier(.34,1.3,.64,1) !important;
      }
      @keyframes __gbMcUp { from { opacity:0; transform:scale(.95); } to { opacity:1; transform:none; } }
  
      /* Header (Drag Handle) */
      #__gb-mc-hdr {
        padding: 16px 20px 14px !important; flex-shrink: 0 !important;
        background: rgba(0,0,0,.4) !important;
        border-bottom: 1px solid rgba(255,255,255,.07) !important;
        display: flex !important; align-items: center !important; gap: 14px !important;
        cursor: grab !important; 
        user-select: none !important;
      }
      #__gb-mc-hdr:active { cursor: grabbing !important; }
      
      #__gb-mc-hdr-icon {
        width: 36px !important; height: 36px !important; border-radius: 10px !important; flex-shrink: 0 !important;
        background: rgba(var(--gb-brand-label-rgb, 125,184,42), .12) !important;
        border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .25) !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        color: var(--gb-brand-label, #7db82a) !important;
      }
      #__gb-mc-hdr-icon svg { width: 18px !important; height: 18px !important; }
      #__gb-mc-hdr-title { font: 700 16px/1 inherit !important; color: #fff !important; letter-spacing: 0.3px !important; }
      #__gb-mc-hdr-sub { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.45) !important; margin-top: 4px !important; }
      
      /* X Icon Close Button */
      #__gb-mc-close {
        margin-left: auto !important; background: rgba(255,255,255,.05) !important;
        border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
        color: rgba(255,255,255,.8) !important; cursor: pointer !important; 
        width: 32px !important; height: 32px !important; padding: 0 !important;
        display: flex !important; align-items: center !important; justify-content: center !important; 
        transition: all .15s !important; box-sizing: border-box !important;
      }
      #__gb-mc-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }
      #__gb-mc-close svg { width: 14px !important; height: 14px !important; pointer-events: none !important; }
  
      /* Body & Grid */
      #__gb-mc-body {
        padding: 24px 24px 12px 24px !important;
        display: flex !important; flex-direction: column !important; gap: 16px !important;
      }
      
      .mc-row { display: flex !important; gap: 16px !important; }
      .mc-input-group { flex: 1 !important; display: flex !important; flex-direction: column !important; gap: 6px !important; position: relative !important; }
      .mc-label { font-size: 11.5px !important; font-weight: 600 !important; color: rgba(255,255,255,.6) !important; text-transform: uppercase !important; letter-spacing: 0.5px !important; }
      .mc-input-wrapper { position: relative !important; display: flex !important; align-items: center !important; }
      .mc-symbol { position: absolute !important; left: 12px !important; font-size: 14px !important; font-weight: 600 !important; color: rgba(255,255,255,.3) !important; pointer-events: none !important; }
      .mc-symbol.right { left: auto !important; right: 12px !important; }
      
      .mc-input {
        width: 100% !important; height: 42px !important; box-sizing: border-box !important; margin: 0 !important;
        background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 8px !important; color: #fff !important; font: 600 15px inherit !important;
        outline: none !important; transition: border-color .15s, box-shadow .15s, background .15s, color .15s !important;
      }
      .mc-input.curr { padding: 0 14px 0 28px !important; }
      .mc-input.pct { padding: 0 28px 0 14px !important; }
      .mc-input.qty { padding: 0 14px !important; }
      
      .mc-input:focus:not(.readonly) {
        border-color: var(--gb-brand-label, #7db82a) !important;
        background: rgba(var(--gb-brand-label-rgb, 125,184,42), .03) !important;
        box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important;
      }
      .mc-input::placeholder { color: rgba(255,255,255,.2) !important; font-weight: 500 !important; }

      .mc-input.readonly {
        background: rgba(255,255,255,.03) !important;
        border-color: transparent !important;
        color: var(--gb-brand-label, #7db82a) !important;
        cursor: default !important;
      }
      .mc-input.readonly:focus { box-shadow: none !important; }

      .mc-divider { height: 1px !important; background: rgba(255,255,255,.06) !important; margin: 4px 0 !important; }
      
      /* Footer */
      #__gb-mc-footer { padding: 14px 24px 20px !important; display: flex !important; justify-content: space-between !important; align-items: center !important; }
      #__gb-mc-clear {
        background: transparent !important; border: none !important; color: rgba(255,255,255,.4) !important;
        font: 500 12px inherit !important; cursor: pointer !important; transition: color .15s !important; padding: 0 !important;
      }
      #__gb-mc-clear:hover { color: #fff !important; }
      #__gb-mc-shortcut-hint {
        font-size: 10.5px !important; color: rgba(255,255,255,.2) !important;
      }
    `;
    document.head.appendChild(st);
  })();

  // ── Math Engine ───────────────────────────────────────────────────────────────
  function parseVal(str) {
    const parsed = parseFloat((str + '').replace(/[^0-9.-]+/g, ''));
    return isNaN(parsed) ? null : parsed;
  }

  function formatVal(val) {
    if (val === null || val === undefined) return '';
    return Number.isInteger(val) ? val.toString() : parseFloat(val.toFixed(4)).toString();
  }

  function calculateMargin(sourceInput) {
    const els = {
      cost:        document.getElementById('mc-cost'),
      price:       document.getElementById('mc-price'),
      profit:      document.getElementById('mc-profit'),
      margin:      document.getElementById('mc-margin'),
      markup:      document.getElementById('mc-markup'),
      qty:         document.getElementById('mc-qty'),
      totalProfit: document.getElementById('mc-total-profit'),
    };
    if (!els.cost) return;

    let c   = parseVal(els.cost.value);
    let p   = parseVal(els.price.value);
    let pr  = parseVal(els.profit.value);
    let mrg = parseVal(els.margin.value);
    let mkp = parseVal(els.markup.value);

    let qStr = els.qty.value.trim();
    let q    = parseVal(qStr);
    if (qStr === '') q = 1;
    if (q === null)  q = 0;

    switch (sourceInput) {
      case 'cost':
      case 'price':
        if (c !== null && p !== null) {
          pr  = p - c;
          mrg = p !== 0 ? (pr / p) * 100 : 0;
          mkp = c !== 0 ? (pr / c) * 100 : 0;
          els.profit.value = formatVal(pr);
          els.margin.value = formatVal(mrg);
          els.markup.value = formatVal(mkp);
        }
        break;
      case 'margin':
        if (mrg !== null) {
          if (c !== null) {
            p   = mrg >= 100 ? 0 : c / (1 - mrg / 100);
            pr  = p - c;
            mkp = c !== 0 ? (pr / c) * 100 : 0;
            els.price.value  = formatVal(p);
            els.profit.value = formatVal(pr);
            els.markup.value = formatVal(mkp);
          } else if (p !== null) {
            c   = p * (1 - mrg / 100);
            pr  = p - c;
            mkp = c !== 0 ? (pr / c) * 100 : 0;
            els.cost.value   = formatVal(c);
            els.profit.value = formatVal(pr);
            els.markup.value = formatVal(mkp);
          }
        }
        break;
      case 'markup':
        if (mkp !== null && c !== null) {
          pr  = c * (mkp / 100);
          p   = c + pr;
          mrg = p !== 0 ? (pr / p) * 100 : 0;
          els.price.value  = formatVal(p);
          els.profit.value = formatVal(pr);
          els.margin.value = formatVal(mrg);
        }
        break;
      case 'profit':
        if (pr !== null && c !== null) {
          p   = c + pr;
          mrg = p !== 0 ? (pr / p) * 100 : 0;
          mkp = c !== 0 ? (pr / c) * 100 : 0;
          els.price.value  = formatVal(p);
          els.margin.value = formatVal(mrg);
          els.markup.value = formatVal(mkp);
        }
        break;
      case 'qty':
        // falls through — just recalc total profit below
        break;
    }

    // Always update Total Profit
    // re-read pr in case it was set above via switch
    const latestPr = parseVal(els.profit.value);
    if (latestPr !== null) {
      els.totalProfit.value = formatVal(latestPr * q);
    } else {
      els.totalProfit.value = '';
    }
  }

  // ── Build & open the modal ────────────────────────────────────────────────────
  function __gbShowMarginCalcModal() {
    if (document.getElementById('__gb-mc-overlay')) return;

    // Read current shortcut hint for the subtitle (empty = disabled).
    chrome.storage.local.get('keyboardShortcuts', ({ keyboardShortcuts }) => {
      const raw = keyboardShortcuts?.marginCalc;
      const keyLetter = (raw === undefined ? 'm' : raw).toUpperCase();
      _openMarginModal(keyLetter ? `Ctrl+${keyLetter}` : '');
    });
  }

  function _openMarginModal(shortcutHint) {
    const overlay = document.createElement('div');
    overlay.id = '__gb-mc-overlay';

    overlay.innerHTML = `
      <div id="__gb-mc-card">
        <div id="__gb-mc-hdr">
          <div id="__gb-mc-hdr-icon">
            <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"/>
              <rect x="8" y="8" width="8" height="2"/>
              <path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/>
              <path d="M8 16h.01"/><path d="M12 16h.01"/><path d="M16 16h.01"/>
            </svg>
          </div>
          <div>
            <div id="__gb-mc-hdr-title">Margin Calculator</div>
            <div id="__gb-mc-hdr-sub">Enter any two variables to auto-calculate the rest</div>
          </div>
          <button id="__gb-mc-close" title="Close (Esc)">
            <svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
  
        <div id="__gb-mc-body">
          <div class="mc-row">
            <div class="mc-input-group">
              <label class="mc-label">Item Cost</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol">$</span>
                <input type="text" id="mc-cost" class="mc-input curr" placeholder="0.00" autocomplete="off">
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-label">Selling Price</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol">$</span>
                <input type="text" id="mc-price" class="mc-input curr" placeholder="0.00" autocomplete="off">
              </div>
            </div>
          </div>
          
          <div class="mc-divider"></div>

          <div class="mc-row">
            <div class="mc-input-group">
              <label class="mc-label">Gross Margin</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol right">%</span>
                <input type="text" id="mc-margin" class="mc-input pct" placeholder="0.00" autocomplete="off">
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-label">Markup</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol right">%</span>
                <input type="text" id="mc-markup" class="mc-input pct" placeholder="0.00" autocomplete="off">
              </div>
            </div>
          </div>

          <div class="mc-row">
            <div class="mc-input-group" style="flex: 0.6;">
              <label class="mc-label">Qty</label>
              <div class="mc-input-wrapper">
                <input type="text" id="mc-qty" class="mc-input qty" placeholder="1" value="1" autocomplete="off">
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-label">Unit Profit</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol">$</span>
                <input type="text" id="mc-profit" class="mc-input curr" placeholder="0.00" autocomplete="off">
              </div>
            </div>
            <div class="mc-input-group">
              <label class="mc-label">Total Profit</label>
              <div class="mc-input-wrapper">
                <span class="mc-symbol">$</span>
                <input type="text" id="mc-total-profit" class="mc-input curr readonly" placeholder="0.00" readonly tabindex="-1">
              </div>
            </div>
          </div>
        </div>
        
        <div id="__gb-mc-footer">
          <button id="__gb-mc-clear">Clear All</button>
          <span id="__gb-mc-shortcut-hint">${shortcutHint} to toggle</span>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const card = document.getElementById('__gb-mc-card');
    const hdr  = document.getElementById('__gb-mc-hdr');

    // ── Center on open ──────────────────────────────────────────────────────
    requestAnimationFrame(() => {
      const r = card.getBoundingClientRect();
      card.style.left = Math.max(0, (window.innerWidth  - r.width)  / 2) + 'px';
      card.style.top  = Math.max(0, (window.innerHeight - r.height) / 2) + 'px';
    });

    // ── Drag ─────────────────────────────────────────────────────────────────
    let dragging = false, sx, sy, il, it;

    hdr.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = card.getBoundingClientRect();
      il = r.left; it = r.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      card.style.left = `${il + e.clientX - sx}px`;
      card.style.top  = `${it + e.clientY - sy}px`;
    }
    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }

    // ── Wire inputs ───────────────────────────────────────────────────────────
    ['cost','price','margin','markup','profit','qty'].forEach(f => {
      const input = document.getElementById(`mc-${f}`);
      if (!input) return;
      input.addEventListener('input', () => calculateMargin(f));
      if (f !== 'qty') input.addEventListener('focus', () => input.select());
    });

    document.getElementById('__gb-mc-clear')?.addEventListener('click', () => {
      ['cost','price','margin','markup','profit','total-profit'].forEach(f =>
        document.getElementById(`mc-${f}`).value = '');
      document.getElementById('mc-qty').value = '1';
      document.getElementById('mc-cost').focus();
    });

    // ── Close ─────────────────────────────────────────────────────────────────
    const close = () => {
      overlay.style.transition = 'opacity .15s';
      overlay.style.opacity    = '0';
      setTimeout(() => overlay.remove(), 160);
      document.removeEventListener('keydown', onKey);
    };

    document.getElementById('__gb-mc-close')?.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    setTimeout(() => document.getElementById('mc-cost')?.focus(), 50);
  }

  // ── Configurable keyboard shortcut (default Ctrl+M) ──────────────────────────
  (function registerShortcut() {
    chrome.storage.local.get(['keyboardShortcuts','featureFlags'], ({ keyboardShortcuts, featureFlags }) => {
      // `undefined` = never customised → use default. `''` = explicitly
      // cleared in Settings → keep the shortcut disabled.
      const raw = keyboardShortcuts?.marginCalc;
      const key = (raw === undefined ? 'm' : raw).toLowerCase();
      if (!key) return;

      document.addEventListener('keydown', e => {
        if (!e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.key.toLowerCase() !== key) return;
        if ((featureFlags || {}).marginCalcEnabled === false) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
        e.preventDefault();
        const existing = document.getElementById('__gb-mc-overlay');
        if (existing) {
          existing.style.transition = 'opacity .15s';
          existing.style.opacity    = '0';
          setTimeout(() => existing.remove(), 160);
        } else {
          __gbShowMarginCalcModal();
        }
      });
    });
  })();

  window.__gbShowMarginCalcModal = __gbShowMarginCalcModal;

} // end guard
