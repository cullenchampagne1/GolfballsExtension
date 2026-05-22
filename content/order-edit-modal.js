// order-edit-modal.js — order edit iframe modal + order summary sidebar
// Depends on: smart-detection.js (smartMessageId)

// ═══════════════════════════════════════════════════════
  // ORDER EDIT MODAL
  // ═══════════════════════════════════════════════════════

  /**
   * Builds and displays the in-page order-edit modal overlay. Reads the
   * current message ID from the page, pre-fills the form with existing order
   * notes, and submits changes directly to the icustomize order edit API.
   */
  function __gbShowOrderEditModal() {
    if (document.getElementById('__gb-oe-overlay')) return;

    // Inject Styles
    if (!document.getElementById('__gb-oe-css')) {
      const style = document.createElement('style');
      style.id = '__gb-oe-css';
      style.textContent = `
        @keyframes __gbOeFadeIn { 
          from { opacity: 0; } 
          to { opacity: 1; } 
        }

        @keyframes __gbOeSlideUp { 
          from { opacity: 0; transform: scale(.97) translateY(16px); } 
          to { opacity: 1; transform: scale(1) translateY(0); } 
        }

        @keyframes __gbOeSpin { 
          to { transform: rotate(360deg); } 
        }

        #__gb-oe-overlay { 
          position: fixed !important; 
          inset: 0 !important; 
          z-index: 999990 !important; 
          display: flex !important; 
          align-items: center !important; 
          justify-content: center !important; 
          background: rgba(0, 0, 0, .6) !important; 
          backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; 
          animation: __gbOeFadeIn .18s ease !important; 
          padding: 36px !important; 
          transition: all .15s !important; 
        }

        #__gb-oe-shell { 
          display: flex !important; 
          gap: 16px !important; 
          width: 90% !important; 
          height: 90% !important; 
          max-width: 90vw !important; 
          max-height: 90vh !important; 
          margin: auto !important; 
          animation: __gbOeSlideUp .25s cubic-bezier(.34, 1.4, .64, 1) !important; 
          transition: all .15s !important; 
        }

        /* Glassmorphic Panels */
        .gb-oe-panel {
          background: rgba(17, 17, 17, .85) !important; 
          backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
          border: 1px solid rgba(255, 255, 255, .08) !important; 
          border-radius: 18px !important; 
          overflow: hidden !important; 
          display: flex !important; 
          flex-direction: column !important; 
          box-shadow: 0 24px 70px rgba(0, 0, 0, .9), inset 0 0 0 1px rgba(255, 255, 255, .03) !important; 
        }

        #__gb-oe-iframe-panel { 
          flex: 1 1 auto !important; 
          min-width: 0 !important; 
        }

        #__gb-oe-stats-panel { 
          width: 280px !important; 
          flex-shrink: 0 !important; 
        }

        /* Headers */
        .gb-oe-hdr { 
          background: rgba(0, 0, 0, .4) !important; 
          padding: 14px 20px !important; 
          display: flex !important; 
          align-items: center !important; 
          gap: 12px !important; 
          border-bottom: 1px solid rgba(255, 255, 255, .06) !important; 
          flex-shrink: 0 !important; 
        }

        #__gb-oe-iframe-hdr-icon { 
          width: 32px !important; 
          height: 32px !important; 
          background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
          border-radius: 8px !important; 
          display: flex !important; 
          align-items: center !important; 
          justify-content: center !important; 
          color: var(--gb-brand-label, #7db82a) !important;
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
          flex-shrink: 0 !important;
        }

        #__gb-oe-iframe-title { 
          font-size: 14px !important; 
          font-weight: 700 !important; 
          color: var(--gb-text-primary, #fff) !important; 
        }

        #__gb-oe-iframe-sub { 
          font-size: 11px !important; 
          font-weight: 500 !important;
          color: rgba(255, 255, 255, .5) !important; 
          margin-top: 2px !important; 
        }

        #__gb-oe-close-btn { 
          margin-left: auto !important; 
          background: rgba(255, 255, 255, .05) !important; 
          color: rgba(255, 255, 255, .8) !important; 
          border: 1px solid rgba(255, 255, 255, .1) !important; 
          border-radius: 7px !important; 
          padding: 6px 12px !important; 
          font-size: 11px !important; 
          font-weight: 600 !important; 
          cursor: pointer !important; 
          display: flex !important; 
          align-items: center !important; 
          gap: 6px !important; 
          transition: all .15s !important; 
          font-family: inherit !important;
        }

        #__gb-oe-close-btn:hover { 
          background: rgba(255, 255, 255, .12) !important; 
          color: #fff !important;
        }

        /* Iframe Area */
        #__gb-oe-iframe-wrap { 
          flex: 1 !important; 
          overflow: hidden !important; 
          position: relative !important; 
          background: #fff !important; 
        }

        #__gb-oe-iframe { 
          width: 100% !important; 
          height: 100% !important; 
          border: none !important; 
          display: block !important; 
        }

        #__gb-oe-iframe-loading { 
          position: absolute !important; 
          inset: 0 !important; 
          display: flex !important; 
          flex-direction: column !important; 
          align-items: center !important; 
          justify-content: center !important; 
          background: rgba(17,17,17,.95) !important; 
          gap: 14px !important; 
          z-index: 10 !important; 
          transition: opacity .3s !important; 
        }

        #__gb-oe-iframe-loading.done { 
          opacity: 0 !important; 
          pointer-events: none !important; 
        }

        #__gb-oe-load-spin, #__gb-oe-stats-spin { 
          width: 28px !important; 
          height: 28px !important; 
          border: 3px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
          border-top-color: var(--gb-brand-label, #7db82a) !important; 
          border-radius: 50% !important; 
          animation: __gbOeSpin .8s linear infinite !important; 
        }

        #__gb-oe-load-text, #__gb-oe-stats-spin-label { 
          font-size: 13px !important; 
          font-weight: 500 !important;
          color: rgba(255,255,255,.6) !important; 
        }

        /* Stats Sidebar */
        #__gb-oe-stats-title { 
          font-size: 10px !important; 
          font-weight: 800 !important; 
          text-transform: uppercase !important; 
          letter-spacing: .8px !important; 
          color: rgba(255, 255, 255, .5) !important; 
        }

        #__gb-oe-stats-body { 
          flex: 1 !important; 
          overflow-y: auto !important; 
          padding: 16px !important; 
          scrollbar-width: thin !important; 
          scrollbar-color: rgba(255,255,255,.1) transparent !important; 
        }

        #__gb-oe-stats-spin-wrap { 
          display: flex !important; 
          flex-direction: column !important; 
          align-items: center !important; 
          justify-content: center !important; 
          height: 100% !important; 
          gap: 14px !important; 
        }

        .gb-oe-section { 
          background: rgba(0, 0, 0, .25) !important; 
          border: 1px solid rgba(255, 255, 255, .05) !important; 
          border-radius: 12px !important; 
          padding: 14px !important; 
          margin-bottom: 12px !important; 
        }

        .gb-oe-section:last-child { margin-bottom: 0 !important; }

        .gb-oe-section-title { 
          font-size: 9.5px !important; 
          font-weight: 800 !important; 
          text-transform: uppercase !important; 
          letter-spacing: .6px !important; 
          color: rgba(255,255,255,.4) !important; 
          margin-bottom: 12px !important; 
        }

        .gb-oe-section-divider { display: none !important; }

        .gb-oe-row { 
          display: flex !important; 
          justify-content: space-between !important; 
          align-items: flex-start !important; 
          gap: 12px !important; 
          margin-bottom: 8px !important; 
        }

        .gb-oe-row:last-child { margin-bottom: 0 !important; }

        .gb-oe-key { 
          font-size: 10px !important; 
          color: rgba(255,255,255,.5) !important; 
          font-weight: 600 !important; 
          text-transform: uppercase !important; 
          letter-spacing: .4px !important; 
          flex-shrink: 0 !important; 
          padding-top: 2px !important; 
        }

        .gb-oe-val { 
          font-size: 12.5px !important; 
          font-weight: 500 !important;
          color: var(--gb-text-secondary, #ccc) !important; 
          text-align: right !important; 
          word-break: break-word !important; 
          flex: 1 !important; 
        }

        .gb-oe-val.highlight { color: var(--gb-brand-label, #7db82a) !important; font-weight: 700 !important; }
        .gb-oe-val.muted { color: rgba(255,255,255,.3) !important; font-style: italic !important; }
        .gb-oe-val.warn { color: var(--gb-error, #c86060) !important; font-weight: 600 !important; }

        .gb-oe-total-row { 
          display: flex !important; 
          justify-content: space-between !important; 
          align-items: center !important; 
          background: rgba(var(--gb-brand-label-rgb, 125,184,42), .1) !important; 
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
          border-radius: 8px !important; 
          padding: 12px 14px !important; 
          margin-top: 6px !important; 
        }

        .gb-oe-total-key { 
          font-size: 11px !important; 
          font-weight: 800 !important; 
          text-transform: uppercase !important; 
          letter-spacing: .5px !important; 
          color: var(--gb-brand-label, #7db82a) !important; 
        }

        .gb-oe-total-val { 
          font-size: 16px !important; 
          font-weight: 800 !important; 
          color: var(--gb-text-primary, #fff) !important; 
        }

        .gb-oe-ship-pill { 
          display: inline-flex !important; 
          align-items: center !important; 
          gap: 6px !important; 
          background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important; 
          border-radius: 6px !important; 
          padding: 4px 10px !important; 
          font-size: 11.5px !important; 
          color: var(--gb-brand-label, #7db82a) !important; 
          font-weight: 700 !important; 
          margin-bottom: 8px !important; 
        }

        .gb-oe-ship-rates { 
          display: flex !important; 
          flex-direction: column !important; 
          gap: 4px !important; 
          margin-top: 10px !important; 
        }

        .gb-oe-ship-rate-row { 
          display: flex !important; 
          justify-content: space-between !important; 
          font-size: 11.5px !important; 
          color: rgba(255,255,255,.4) !important; 
          padding: 5px 0 !important; 
          border-bottom: 1px solid rgba(255,255,255,.05) !important; 
        }

        .gb-oe-ship-rate-row:last-child { border-bottom: none !important; }
        .gb-oe-ship-rate-row.active { color: var(--gb-brand-label, #7db82a) !important; font-weight: 600 !important; }

        #__gb-oe-stats-error { 
          padding: 14px !important; 
          margin: 12px 0 !important; 
          background: rgba(var(--gb-error-rgb, 200,96,96), .1) !important; 
          border: 1px solid rgba(var(--gb-error-rgb, 200,96,96), .3) !important; 
          border-radius: 8px !important; 
          font-size: 12px !important; 
          color: var(--gb-error, #c86060) !important; 
          line-height: 1.5 !important; 
          display: none; 
        }
      `;
      document.head.appendChild(style);
    }

    const messageId = smartMessageId();
    if (!messageId) {
      alert('Could not find a messageID on this order page. Order Edit is only available for orders placed on the new site.');
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = '__gb-oe-overlay';
    overlay.innerHTML = `
      <div id="__gb-oe-shell">
        <div id="__gb-oe-iframe-panel" class="gb-oe-panel">
          <div class="gb-oe-hdr" id="__gb-oe-iframe-hdr">
            <div id="__gb-oe-iframe-hdr-icon">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </div>
            <div>
              <div id="__gb-oe-iframe-title">Order Edit</div>
              <div id="__gb-oe-iframe-sub">Loading cart&hellip;</div>
            </div>
            <button id="__gb-oe-close-btn">
              <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Close
            </button>
          </div>
          <div id="__gb-oe-iframe-wrap">
            <div id="__gb-oe-iframe-loading">
              <div id="__gb-oe-load-spin"></div>
              <div id="__gb-oe-load-text">Initiating order edit&hellip;</div>
            </div>
            <iframe id="__gb-oe-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"></iframe>
          </div>
        </div>
        
        <div id="__gb-oe-stats-panel" class="gb-oe-panel">
          <div class="gb-oe-hdr" id="__gb-oe-stats-hdr">
            <div id="__gb-oe-stats-title">Order Summary</div>
          </div>
          <div id="__gb-oe-stats-body">
            <div id="__gb-oe-stats-spin-wrap">
              <div id="__gb-oe-stats-spin"></div>
              <div id="__gb-oe-stats-spin-label">Fetching order data&hellip;</div>
            </div>
            <div id="__gb-oe-stats-error"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // --- Hover fade logic ---
    const shell = document.getElementById('__gb-oe-shell');
    
    // When the mouse leaves the modal: drop opacity to 20% and clear the dark background
    shell.addEventListener('mouseleave', () => {
      shell.style.setProperty('opacity', '0.15', 'important');
      overlay.style.setProperty('background', 'rgba(0,0,0,0)', 'important');
      overlay.style.setProperty('backdrop-filter', 'blur(0px)', 'important');
      overlay.style.setProperty('-webkit-backdrop-filter', 'blur(0px)', 'important');
    });
    
    // When the mouse re-enters the modal: restore 100% opacity and the dark background
    shell.addEventListener('mouseenter', () => {
      shell.style.setProperty('opacity', '1', 'important');
      overlay.style.setProperty('background', 'rgba(0,0,0,.6)', 'important');
      overlay.style.setProperty('backdrop-filter', 'blur(8px)', 'important');
      overlay.style.setProperty('-webkit-backdrop-filter', 'blur(8px)', 'important');
    });

    overlay.addEventListener('click', e => { if (e.target === overlay) __gbCloseModal(overlay); });
    document.getElementById('__gb-oe-close-btn').addEventListener('click', () => __gbCloseModal(overlay));


      /**
   * Submits the order-edit form data to the icustomize order API and
   * handles the success/error response.
   * @returns {Promise<void>}
   */
  async function callEditOrder() {
      const loadText  = document.getElementById('__gb-oe-load-text');
      const statsBody = document.getElementById('__gb-oe-stats-body');

        /**
   * Fetches the current cart/order data from the icustomize API and
   * populates the order-edit modal form with the existing values.
   */
  function loadCart() {
        const iframe = document.getElementById('__gb-oe-iframe');
        if (!iframe) return;
        iframe.addEventListener('load', () => {
          const loading = document.getElementById('__gb-oe-iframe-loading');
          if (loading) loading.classList.add('done');
        }, { once: true });
        iframe.src = `https://www.golfballs.com/cart?editOrderMessageID=${encodeURIComponent(messageId)}`;
      }

      try {
        if (loadText) loadText.textContent = 'Calling editOrder API\u2026';

        // Route through background chargeApiProxy so the request runs from the
        // admin.icustomize.com iframe context where the adminsession JWT lives.
        const proxyResp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'chargeApiProxy',
            url: 'https://master.api.icustomize.com/admin/editOrder',
            method: 'PUT',
            body: { messageID: messageId }
          }, resp => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            resolve(resp);
          });
        });

        if (!proxyResp || !proxyResp.ok) {
          const detail = proxyResp?.error || ('HTTP ' + (proxyResp?.status || '?'));
          throw new Error('editOrder API failed: ' + detail);
        }

        const data  = JSON.parse(proxyResp.text);
        const order = data.newOrder        || {};
        const info  = data.orderEditInfo   || {};

        const sub = document.getElementById('__gb-oe-iframe-sub');
        if (sub) sub.textContent = 'www.golfballs.com/cart';
        if (loadText) loadText.textContent = 'Opening cart\u2026';
        loadCart();

        // Charge rows come from the Order Charges portlet already on the page —
        // no separate API call needed.
        const domChargeRows = (typeof smartPageChargeRows === 'function')
          ? smartPageChargeRows() : [];

        // --- build stats ---
        const shipping  = order.shippingAddress || {};
        const billing   = order.billingAddress  || {};
        const promo     = order.promotion       || {};
        const rates     = order.shippingRates   || [];
        const selMethod = order.shippingMethod  || '';
        const salesTax  = parseFloat(order.salesTax     || 0);
        const orderTot  = parseFloat(order.orderTotal   || 0);
        const giftCert  = parseFloat(order.giftCertTotal|| 0);
        const dropShip  = parseFloat(order.dropShipFee  || 0);
        const selRate   = rates.find(r => r.method === selMethod);
        const shipCost  = selRate ? parseFloat(selRate.price?.Amount || 0) : 0;

          /**
   * Formats a numeric value as a USD dollar string.
   * @param {number|string} n - The value to format.
   * @returns {string} Dollar-formatted string (e.g. "$12.50").
   */
  function fmt(n) { return '$' + parseFloat(n || 0).toFixed(2); }
          /**
   * Generates an HTML string for a summary table row with a key, value, and
   * optional CSS class applied to the value cell.
   * @param {string} k - The row label.
   * @param {string} v - The row value.
   * @param {string} [cls=''] - Optional CSS class for the value cell.
   * @returns {string} HTML string for a `<tr>` element.
   */
  function row(k, v, cls) {
          return `<div class="gb-oe-row"><span class="gb-oe-key">${k}</span><span class="gb-oe-val ${cls||''}">${v || '<span style="color:rgba(255,255,255,.2)">\u2014</span>'}</span></div>`;
        }

        const ratesHtml = rates.length ? `<div class="gb-oe-ship-rates">${rates.map(r => {
          const act  = r.method === selMethod ? 'active' : '';
          const pr   = parseFloat(r.price?.Amount || 0);
          const free = promo.freeShipping && r.method === selMethod;
          return `<div class="gb-oe-ship-rate-row ${act}"><span>${r.method}</span><span>${free ? 'FREE' : fmt(pr)}${r.estimatedDelivery ? ' \u00b7 ' + r.estimatedDelivery : ''}</span></div>`;
        }).join('')}</div>` : '';

        const cardsHtml = (info.billingOptions || []).map(c => {
          const exp = c.ccExpiration ? c.ccExpiration.slice(0,2) + '/' + c.ccExpiration.slice(2) : '';
          return row('\u2022\u2022\u2022\u2022 ' + (c.ccLastNumbers || '????'), (c.ccName || '') + (exp ? ' \u00b7 ' + exp : ''));
        }).join('');

        const productSubtotal = orderTot - salesTax - (promo.freeShipping ? 0 : shipCost) - dropShip;

        // ── Charges block ──────────────────────────────────────────────────
        let chargesHtml = '';
        if (domChargeRows.length > 0) {
          const totalCharged = domChargeRows.reduce((s, r) => s + r.amount, 0);
          const balance      = orderTot - totalCharged;
          const balColor     = Math.abs(balance) < 0.005 ? 'rgba(255,255,255,.4)'
                             : balance > 0 ? 'var(--gb-error, #c86060)' : 'var(--gb-brand-label, #7db82a)';
          const balLabel     = Math.abs(balance) < 0.005 ? 'Settled'
                             : balance > 0 ? fmt(balance) + ' owed'
                             : fmt(Math.abs(balance)) + ' over';

          const rowsHtml = domChargeRows.map(r => {
            const method = [r.type, r.last4 ? `····${r.last4}` : '', r.cardHolder]
              .filter(Boolean).join('  ');
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.05);border-radius:8px !important;margin-bottom:6px;">
              <svg width="14" height="14" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" style="flex-shrink:0;"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              <span style="font-size:11.5px;font-weight:500;color:rgba(255,255,255,.6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${method.replace(/</g,'&lt;') || r.note.replace(/</g,'&lt;')}</span>
              <span style="font-size:12px;font-weight:700;color:var(--gb-brand-label, #7db82a);flex-shrink:0;">${fmt(r.amount)}</span>
            </div>`;
          }).join('');

          chargesHtml = `
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Charges</div>
            ${row('Order Sub', fmt(productSubtotal), 'highlight')}
            ${row('Order Total', fmt(orderTot))}
            ${row('Total Charged', fmt(totalCharged), totalCharged > 0 ? 'highlight' : '')}
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);border-radius:8px !important;padding:10px 14px;margin-top:6px;margin-bottom:12px;">
              <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.5);">Balance</span>
              <span style="font-size:14px;font-weight:700;color:${balColor};">${balLabel}</span>
            </div>
            <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:rgba(255,255,255,.4);margin-bottom:8px;">Payment Method</div>
            ${rowsHtml}
          </div>`;
        }
        // ───────────────────────────────────────────────────────────────────

        statsBody.innerHTML = `
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Financials</div>
            ${row('Subtotal', fmt(productSubtotal), 'highlight')}
            ${row('Shipping', promo.freeShipping ? '<span style="color:var(--gb-brand-label, #7db82a);font-weight:700;">FREE</span> <span style="color:rgba(255,255,255,.3);font-size:10px;font-weight:500;">(' + fmt(promo.shippingDiscount||0) + ' off)</span>' : fmt(shipCost))}
            ${row('Tax', fmt(salesTax))}
            ${(promo.totalDiscount||0) > 0 ? row('Promo Disc', '-' + fmt(promo.totalDiscount), 'warn') : ''}
            ${giftCert > 0 ? row('Gift Cert', '-' + fmt(giftCert), 'warn') : ''}
            ${dropShip > 0 ? row('Drop Ship', fmt(dropShip)) : ''}
            <div class="gb-oe-total-row">
              <span class="gb-oe-total-key">Order Total</span>
              <span class="gb-oe-total-val">${fmt(orderTot)}</span>
            </div>
          </div>
          ${promo.promo ? `
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Promotion</div>
            ${row('Code', promo.promo)}
            ${row('Type', (promo.promoType||'').replace(/_/g,' '))}
            ${row('Desc', promo.promoDescription||'')}
          </div>` : ''}
          ${chargesHtml}
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Shipping</div>
            <div class="gb-oe-ship-pill">
              <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M16 3h4l2 4v5h-6V3zM5.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 21a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
              ${selMethod || 'Standard'}
            </div>
            ${row('Name', (shipping.firstName||'') + ' ' + (shipping.lastName||''))}
            ${row('Address', (shipping.address1||'') + (shipping.address2 ? ' ' + shipping.address2 : ''))}
            ${row('City', (shipping.city||'') + ', ' + (shipping.stateProvince||'') + ' ' + (shipping.postal||''))}
            ${row('Phone', shipping.phone||'')}
            ${ratesHtml}
          </div>
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Billing</div>
            ${billing.useShippingAddress
              ? row('Address', 'Same as shipping', 'muted')
              : row('Name', (billing.firstName||'') + ' ' + (billing.lastName||'')) +
                row('Address', (billing.address1||'') + (billing.address2 ? ' ' + billing.address2 : '')) +
                row('City', (billing.city||'') + ', ' + (billing.stateProvince||'') + ' ' + (billing.postal||''))
            }
            ${row('Email', shipping.email || billing.email || '')}
          </div>
          ${cardsHtml ? `
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Cards on File</div>
            ${cardsHtml}
          </div>` : ''}
          <hr class="gb-oe-section-divider">
          <div class="gb-oe-section">
            <div class="gb-oe-section-title">Order Info</div>
            ${row('Payment', order.paymentType||'')}
            ${row('Delivery', order.deliveryMethod||'')}
            ${row('MessageID', '<span style="font-size:9.5px;word-break:break-all;color:rgba(255,255,255,.4)">' + messageId + '</span>')}
          </div>
        `;

      } catch(err) {
        console.error('[GB OrderEdit]', err);
        if (loadText) loadText.textContent = 'API error \u2014 loading cart anyway\u2026';
        loadCart();
        const statsBody = document.getElementById('__gb-oe-stats-body');
        if (statsBody) statsBody.innerHTML = `<div id="__gb-oe-stats-error" style="display:block">Failed to load order summary:<br>${err.message}</div>`;
      }
    }

    setTimeout(callEditOrder, 80);
  }