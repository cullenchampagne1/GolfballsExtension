// charge-modal.js — in-page charge customer modal

  // ═══════════════════════════════════════════════════════
  // CHARGE IN-PAGE MODAL (MIGRATED FROM SEPARATE WINDOW)
  // ═══════════════════════════════════════════════════════
  /**
   * Builds and displays the in-page charge/refund modal overlay. Renders
   * existing charge rows, computes the outstanding balance, and wires the
   * Run Charge / Refund button to the background-proxied payment API calls.
   * @param {{orderId:string, userId:string, pageTotal:number, captured:number, diffAmount:number, isRefund:boolean, isZeroDiff:boolean, chargeRows:Array}} ctx - Order context data from the popup.
   */
  function __gbShowChargeModal(ctx) {
    if (document.getElementById('__gb-charge-overlay')) return;

    // 1. Inject Styles
    if (!document.getElementById('__gb-charge-css')) {
      const style = document.createElement('style');
      style.id = '__gb-charge-css';
      style.textContent = `
        @keyframes __gbChFadeIn  { from{opacity:0}to{opacity:1} }
        @keyframes __gbChSlideUp { from{opacity:0;transform:scale(.92) translateY(16px)}to{opacity:1;transform:none} }
        @keyframes __gbChSpin    { to{transform:rotate(360deg)} }
        @keyframes __gbChPop     { 0%{transform:scale(0.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }

        .__gb-charge-overlay { 
          position: fixed; inset: 0; z-index: 999990 !important; 
          display: flex; align-items: center; justify-content: center; 
          background: rgba(0,0,0,.6) !important; 
          backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important; 
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important; 
          animation: __gbChFadeIn .16s ease !important; 
        }
        
        .__gb-charge-card { 
          background: rgba(17,17,17,.85) !important; 
          backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important; 
          border: 1px solid rgba(255,255,255,.08) !important; 
          border-radius: 18px !important; 
          width: min(520px, calc(100vw - 24px)) !important; 
          display: flex; flex-direction: column; 
          box-shadow: 0 24px 70px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important; 
          animation: __gbChSlideUp .3s cubic-bezier(.34,1.56,.64,1) !important; 
          overflow: hidden !important; 
        }
        
        .__gb-charge-hdr { 
          background: rgba(0,0,0,.4) !important; 
          padding: 14px 20px !important; 
          display: flex !important; align-items: center !important; 
          border-bottom: 1px solid rgba(255,255,255,.06) !important; 
          gap: 12px !important; flex-shrink: 0 !important;
        }
        .gb-charge-hdr-icon { 
          width: 32px !important; height: 32px !important; 
          background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
          border-radius: 8px !important; 
          display: flex !important; align-items: center !important; justify-content: center !important; 
          flex-shrink: 0 !important; color: var(--gb-brand-label, #7db82a) !important;
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
        }
        
        .__gb-charge-body { 
          padding: 22px !important; display: flex !important; flex-direction: column !important; 
          gap: 18px !important; position: relative !important; 
        }
        
        .__gb-charge-footer { 
          padding: 14px 20px !important; background: rgba(0,0,0,.3) !important; 
          border-top: 1px solid rgba(255,255,255,.06) !important; 
          display: flex !important; justify-content: flex-end !important; gap: 12px !important; flex-shrink: 0 !important;
        }

        /* Buttons */
        .gb-btn-primary { 
          background: var(--gb-brand-dark, #5f7d18) !important; color: var(--gb-brand-text, #d8eeaa) !important; 
          border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; 
          padding: 8px 24px !important; border-radius: 6px !important; font-size: 12px !important; 
          font-weight: 600 !important; cursor: pointer !important; transition: all 0.2s !important; 
          display: flex !important; align-items: center !important; justify-content: center !important; gap: 6px !important;
          font-family: inherit !important;
        }
        .gb-btn-primary:hover:not(:disabled) { 
          background: var(--gb-brand, #6e901d) !important; border-color: var(--gb-brand-label, #7db82a) !important; color: #fff !important; 
        }
        .gb-btn-primary:disabled { 
          opacity: 0.5 !important; cursor: not-allowed !important; pointer-events: none !important;
        }
        
        .gb-btn-close { 
          margin-left: auto !important; background: rgba(255,255,255,.05) !important; color: rgba(255,255,255,.8) !important; 
          border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important; 
          padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important; 
          cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important; gap: 6px !important;
        }
        .gb-btn-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

        /* Inputs */
        .gb-input { 
          background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; 
          color: #fff !important; padding: 10px 14px !important; border-radius: 8px !important; 
          width: 100% !important; box-sizing: border-box !important; font-family: inherit !important; 
          font-size: 13px !important; font-weight: 500 !important; height: 40px !important; outline: none !important;
          transition: border-color .15s, box-shadow .15s !important; color-scheme: dark !important;
        }
        .gb-input:focus { 
          border-color: var(--gb-brand-label, #7db82a) !important; 
          box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
        }
        .gb-input:disabled { opacity: 0.5 !important; cursor: not-allowed !important; pointer-events: none !important; }
        .gb-input::placeholder { color: rgba(255,255,255,.3) !important; }

        /* Dropdowns */
        .gb-dropdown-wrap { position: relative; width: 100%; }
        .gb-dropdown-btn {
          width: 100% !important; background: rgba(0,0,0,.3) !important; border: 1px solid rgba(255,255,255,.1) !important; 
          border-radius: 8px !important; padding: 10px 32px 10px 14px !important; font-size: 13px !important; 
          font-weight: 500 !important; color: #fff !important; cursor: pointer !important; text-align: left !important; 
          display: flex !important; align-items: center !important; position: relative !important;
          height: 40px !important; box-sizing: border-box !important; font-family: inherit !important; transition: all .15s !important;
        }
        .gb-dropdown-btn:hover { background: rgba(255,255,255,.05) !important; border-color: rgba(255,255,255,.2) !important; }
        .gb-dropdown-btn.open { 
          border-color: var(--gb-brand-label, #7db82a) !important; background: rgba(255,255,255,.05) !important; 
          box-shadow: 0 0 0 2px rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
        }
        .gb-dropdown-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; pointer-events: none !important; }
        
        .gb-btn-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .gb-dropdown-chevron { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,.4); pointer-events: none; transition: transform .22s cubic-bezier(.34,1.56,.64,1), color .2s; }
        .gb-dropdown-btn.open .gb-dropdown-chevron { transform: translateY(-50%) rotate(180deg); color: var(--gb-brand-label, #7db82a); }

        .gb-dropdown-menu {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0;
          background: var(--gb-surface-elevated, #171717) !important; border: 1px solid rgba(255,255,255,.1) !important; 
          border-radius: 9px !important; z-index: 999995 !important; max-height: 180px !important; overflow-y: auto !important; 
          scrollbar-width: thin !important; scrollbar-color: rgba(255,255,255,.1) transparent !important;
          opacity: 0; transform: translateY(-5px) scaleY(.95); transform-origin: top center; pointer-events: none; 
          transition: opacity .16s ease, transform .18s cubic-bezier(.34,1.4,.64,1);
          box-shadow: 0 10px 30px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.03) !important;
        }
        .gb-dropdown-menu.open { opacity: 1; transform: translateY(0) scaleY(1); pointer-events: auto; }
        .gb-dropdown-option { 
          padding: 10px 14px !important; font-size: 12.5px !important; cursor: pointer !important; 
          color: var(--gb-text-secondary, #ccc) !important; transition: background .1s !important; 
          border-bottom: 1px solid rgba(255,255,255,.05) !important; display: flex !important; align-items: center !important; gap: 9px !important;
        }
        .gb-dropdown-option:last-child { border-bottom: none !important; }
        .gb-dropdown-option:hover { background: rgba(255,255,255,.08) !important; color: #fff !important; }
        .gb-dropdown-option.selected { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; color: var(--gb-brand-label, #7db82a) !important; font-weight: 500 !important; }

        .gb-methods-list-container {
          padding: 2px 4px 2px 0; max-height: 260px; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.1) transparent;
        }

        /* Payment Method Rows */
        .gb-method-row { 
          display: flex !important; align-items: center !important; padding: 12px 14px !important; 
          background: rgba(0,0,0,.2) !important; border: 1px solid rgba(255,255,255,.08) !important; 
          border-radius: 12px !important; cursor: pointer !important; transition: all 0.2s !important; margin-bottom: 8px !important; 
        }
        .gb-method-row:last-child { margin-bottom: 0 !important; }
        .gb-method-row:hover { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .1) !important; border-color: rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; }
        .gb-method-row.selected { background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; border-color: var(--gb-brand-label, #7db82a) !important; }
        .gb-method-row.succeeded { border-color: var(--gb-success, #38b000) !important; background: rgba(var(--gb-success-rgb, 56,176,0), 0.1) !important; pointer-events: none !important; }
        .gb-method-row.failed { border-color: var(--gb-error, #c86060) !important; background: rgba(var(--gb-error-rgb, 200,96,96), 0.1) !important; pointer-events: none !important; }

        /* Method Row Badges */
        .gb-badge { 
          width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; 
          border-radius: 50% !important; background: rgba(255,255,255,.1) !important; color: rgba(255,255,255,.6) !important; 
          display: flex !important; align-items: center !important; justify-content: center !important; 
          margin-right: 12px !important; flex-shrink: 0 !important; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) !important; 
          position: relative !important; overflow: hidden !important; 
        }
        .gb-method-row.selected .gb-badge { background: var(--gb-brand-label, #7db82a) !important; color: #111 !important; transform: scale(1.08) !important; box-shadow: 0 0 10px rgba(var(--gb-brand-label-rgb, 125,184,42), 0.4) !important; }
        .gb-method-row.succeeded .gb-badge { background: var(--gb-success, #38b000) !important; color: #111 !important; transform: scale(1.08) !important; box-shadow: 0 0 10px rgba(var(--gb-success-rgb, 56,176,0), 0.4) !important; }
        .gb-method-row.failed .gb-badge { background: var(--gb-error, #c86060) !important; color: #111 !important; transform: scale(1.08) !important; box-shadow: 0 0 10px rgba(var(--gb-error-rgb, 200,96,96), 0.4) !important; }

        .gb-badge-svg { width: 14px; height: 14px; position: absolute; }
        .gb-badge-svg path, .gb-badge-svg text {
          fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
          transform-origin: 12px 12px; transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .gb-badge-svg text { fill: currentColor; stroke: none; font-size: 13px; font-weight: 800; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

        /* State Morphing Logic */
        .badge-minus { opacity: 1; transform: scale(1) rotate(0deg); }
        .badge-num, .badge-check, .badge-cross { opacity: 0; transform: scale(0.3) rotate(-90deg); }

        .gb-method-row.selected .badge-minus { opacity: 0; transform: scale(0.3) rotate(90deg); }
        .gb-method-row.selected .badge-num { opacity: 1; transform: scale(1) rotate(0deg); }

        .gb-method-row.succeeded .badge-minus, .gb-method-row.succeeded .badge-num { opacity: 0; transform: scale(0.3) rotate(90deg); }
        .gb-method-row.succeeded .badge-check { opacity: 1; transform: scale(1.1) rotate(0deg); }

        .gb-method-row.failed .badge-minus, .gb-method-row.failed .badge-num { opacity: 0; transform: scale(0.3) rotate(90deg); }
        .gb-method-row.failed .badge-cross { opacity: 1; transform: scale(1.1) rotate(0deg); }

        .gb-method-info { flex: 1; min-width: 0; }
        .gb-method-name { font-size: 13.5px; color: var(--gb-text-secondary, #ccc); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        /* Animated Status Area */
        .gb-method-status { display: flex; align-items: center; gap: 8px; justify-content: flex-end; font-size: 11.5px; color: rgba(255,255,255,.5); }
        .gb-msg { display: flex; align-items: center; gap: 6px; }
        .gb-status-icon { width: 16px; height: 16px; animation: __gbChPop .4s cubic-bezier(.34,1.56,.64,1) both; }
        
        .gb-spin-small { 
          width: 16px; height: 16px; 
          border: 2px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
          border-top-color: var(--gb-brand-label, #7db82a) !important; 
          border-radius: 50% !important; 
          box-sizing: border-box !important; 
          animation: __gbChSpin .8s linear infinite !important; 
          display: none; 
        }
        .gb-spin-small.active { display: block; }

        /* Refund theme overrides */
        .gb-btn-primary.refund { 
          background: rgba(var(--gb-error-rgb, 200,96,96), .2) !important; 
          color: #fdd !important; 
          border: 1px solid rgba(var(--gb-error-rgb, 200,96,96), 0.4) !important;
        }
        .gb-btn-primary.refund:hover:not(:disabled) { 
          background: rgba(var(--gb-error-rgb, 200,96,96), .3) !important; color: #fff !important; border-color: var(--gb-error, #c86060) !important;
        }
        .__gb-charge-hdr.refund-hdr { background: rgba(var(--gb-error-rgb, 200,96,96), .15) !important; }
        .__gb-charge-hdr.refund-hdr .gb-charge-hdr-icon { background: rgba(255,255,255,.12) !important; color: #fdd !important; border-color: rgba(255,255,255,.2) !important; }
      `;
      document.head.appendChild(style);
    }

    // 2. Build DOM overlay
    const overlay = document.createElement('div');
    overlay.id = '__gb-charge-overlay';
    overlay.className = '__gb-charge-overlay';
    overlay.innerHTML = `
      <div class="__gb-charge-card">
        <div class="__gb-charge-hdr" id="__gb-charge-hdr">
          <div class="gb-charge-hdr-icon" id="__gb-charge-hdr-icon">
            <svg id="__gb-charge-hdr-svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div style="flex:1; min-width:0; display:flex; flex-direction:column;">
            <span id="__gb-charge-title" style="font-size:14px; font-weight:700; color:var(--gb-text-primary,#fff); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Charge Customer</span>
            <span style="font-size:11px; font-weight:500; color:rgba(255,255,255,.5); margin-top:2px;">Order #${ctx.orderId || 'Unknown'}</span>
          </div>
          <button type="button" id="__gb-charge-close" class="gb-btn-close">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Close
          </button>
        </div>
        
        <div class="__gb-charge-body">
          <div style="display: grid; grid-template-columns: 1fr 1.2fr 1.5fr; gap: 14px;">
            <div>
              <label style="font-size:9px; font-weight:800; color:rgba(255,255,255,.5); margin-bottom:6px; display:block; text-transform:uppercase; letter-spacing:0.8px;">Amount</label>
              <input type="number" id="__gb-f-amount" class="gb-input" step="0.01" placeholder="0.00" value="${ctx.diffAmount != null ? Math.abs(ctx.diffAmount).toFixed(2) : (ctx.pageTotal ? ctx.pageTotal.toFixed(2) : '')}">
            </div>
            
            <div>
              <label style="font-size:9px; font-weight:800; color:rgba(255,255,255,.5); margin-bottom:6px; display:block; text-transform:uppercase; letter-spacing:0.8px;">Reason</label>
              <div class="gb-dropdown-wrap" id="__gb-reason-wrap">
                <button type="button" class="gb-dropdown-btn" id="__gb-reason-btn">
                  <span class="gb-btn-label" id="__gb-reason-label">Order Edit</span>
                  <svg class="gb-dropdown-chevron" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="gb-dropdown-menu" id="__gb-reason-menu">
                  <div class="gb-dropdown-option selected" data-value="Order Edit">Order Edit</div>
                  <div class="gb-dropdown-option" data-value="Shipping Upgrade">Shipping Upgrade</div>
                  <div class="gb-dropdown-option" data-value="Other">Other</div>
                </div>
              </div>
              <input type="hidden" id="__gb-f-reason" value="Order Edit">
            </div>

            <div>
              <label style="font-size:9px; font-weight:800; color:rgba(255,255,255,.5); margin-bottom:6px; display:block; text-transform:uppercase; letter-spacing:0.8px;">Note</label>
              <input type="text" id="__gb-f-note" class="gb-input" value="Order Charge">
            </div>
          </div>

          <div id="__gb-charge-err" style="display:none; color:var(--gb-error,#c86060); font-size:13px; font-weight:500; background:rgba(var(--gb-error-rgb, 200,96,96),0.15); padding:14px 16px; border-radius:10px; border:1px solid rgba(var(--gb-error-rgb, 200,96,96),0.3); line-height:1.5;"></div>

          <div style="margin-top: 4px;">
            <div style="font-size:9px; font-weight:800; color:rgba(255,255,255,.5); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.8px;">Payment Methods</div>
            <div class="gb-methods-list-container" id="__gb-methods-list">
               <div style="text-align:center; padding:35px 20px; color:rgba(255,255,255,.6); font-size:13px; font-weight: 500; display:flex; flex-direction:column; align-items:center; gap:14px;">
                 <div class="gb-spin-small active" style="width:24px !important; height:24px !important; border-width:3px !important;"></div>
                 Fetching secure methods...
               </div>
            </div>
          </div>
        </div>
        
        <div class="__gb-charge-footer">
          <button type="button" class="gb-btn-primary" id="__gb-btn-run" disabled>
            ${ctx.isRefund ? 'Refund' : 'Run Charge'}
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    // 3. Attach Custom Dropdown Listeners
    const wrapElement = document.getElementById('__gb-reason-wrap');
    const btnElement = document.getElementById('__gb-reason-btn');
    const menuElement = document.getElementById('__gb-reason-menu');
    const labelElement = document.getElementById('__gb-reason-label');
    const hiddenInput = document.getElementById('__gb-f-reason');
    const options = menuElement.querySelectorAll('.gb-dropdown-option');

    // Toggle Menu
    btnElement.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btnElement.disabled) return;
        const isOpen = menuElement.classList.contains('open');
        if (isOpen) {
            menuElement.classList.remove('open');
            btnElement.classList.remove('open');
        } else {
            menuElement.classList.add('open');
            btnElement.classList.add('open');
        }
    });

    // Select Option
    options.forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.getAttribute('data-value');
            
            // Update UI & Hidden Input
            labelElement.textContent = val;
            hiddenInput.value = val;
            
            // Manage Selected State
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            // Close
            menuElement.classList.remove('open');
            btnElement.classList.remove('open');
        });
    });

    // Close on Outside Click
    document.addEventListener('click', (e) => {
        if (!wrapElement.contains(e.target)) {
            menuElement.classList.remove('open');
            btnElement.classList.remove('open');
        }
    });

    // 4. Logic Configuration
    const PRIVATE_API = 'https://production-private-api.icustomize.com';
    const MASTER_API  = 'https://master.api.icustomize.com';
    const PROCESSOR   = 'USIO';
    const ACCOUNT_TYPE = 'CONSUMER';

    let methods = [];
    let selection = [];
    let running = false;
    let allDone = false;

    const $ = id => overlay.querySelector('#' + id);
    const btnClose = $('__gb-charge-close');
    const btnRun   = $('__gb-btn-run');
    const list     = $('__gb-methods-list');
    const errBox   = $('__gb-charge-err');

    // Close logic
    const closeOverlay = () => { if (!running) __gbCloseModal(overlay); };
    btnClose.onclick = closeOverlay;

    // Helper: Pass API call to the Background Script proxy
      /**
   * Sends an authenticated API request through the background script iframe
   * relay. Returns the parsed JSON response.
   * @param {string} url - API endpoint URL.
   * @param {string} [method='POST'] - HTTP method.
   * @param {object} [body] - Request body (will be JSON-stringified).
   * @returns {Promise<object>} Parsed JSON response.
   */
  async function apiCall(url, method = 'POST', body) {
      const resp = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'chargeApiProxy', url, method, body }, resolve);
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.text?.slice(0, 200) || resp.error}`);
      try { return JSON.parse(resp.text); } catch { return resp.text; }
    }

      /**
   * Displays an error message in the charge modal's error area.
   * @param {string} msgTxt - The error text to display.
   */
  function showError(msgTxt) {
      errBox.textContent = msgTxt;
      errBox.style.display = 'block';
      list.innerHTML = '';
    }

      /**
   * Re-evaluates the charge form and enables or disables the Run Charge
   * button based on current method selection and amount validity.
   */
  function updateRunBtn() {
      if (allDone) return;
      // Refund mode and zero-diff mode keep the button permanently disabled
      if (ctx.isRefund || ctx.isZeroDiff) { btnRun.disabled = true; return; }
      btnRun.disabled = selection.length === 0;
    }

      /**
   * Renders payment-method rows inside the charge modal, including card
   * type icons, last-four digits, and amount input fields.
   */
  function renderMethods() {
      list.innerHTML = '';
      methods.forEach(m => {
        const row = document.createElement('div');
        row.className = 'gb-method-row';
        row.dataset.id = m.billingID;
        row.innerHTML = `
          <div class="gb-badge">
            <svg class="gb-badge-svg" viewBox="0 0 24 24">
              <path class="badge-minus" d="M6 12h12" />
              <path class="badge-check" d="M4 12l5 5L20 7" />
              <path class="badge-cross" d="M6 6l12 12M18 6L6 18" />
              <text class="badge-num" x="12" y="12" text-anchor="middle" dominant-baseline="central"></text>
            </svg>
          </div>
          <div class="gb-method-info">
            <div class="gb-method-name">${String(m.Name || 'Unknown Card').replace(/</g, '&lt;')}</div>
          </div>
          <div class="gb-method-status">
            <div class="gb-spin-small"></div>
            <span class="gb-msg"></span>
          </div>
        `;

        row.onclick = () => {
          if (running || allDone || row.classList.contains('failed') || row.classList.contains('succeeded')) return;
          
          const idx = selection.indexOf(m.billingID);
          if (idx === -1) selection.push(m.billingID);
          else selection.splice(idx, 1);

          // Update Selection Badges
          methods.forEach(mm => {
            const r = list.querySelector(`[data-id="${mm.billingID}"]`);
            const pos = selection.indexOf(mm.billingID);
            
            if (pos === -1) {
              r.querySelector('.badge-num').textContent = '';
              r.classList.remove('selected');
            } else {
              r.querySelector('.badge-num').textContent = pos + 1;
              r.classList.add('selected');
            }
          });
          updateRunBtn();
        };
        list.appendChild(row);
      });
    }

      /**
   * Fetches the available payment methods for the current order from the
   * icustomize API and populates the modal with rendered rows.
   * @returns {Promise<void>}
   */
  async function loadMethods() {
      if (!ctx.orderId) {
        showError('No order ID found. Cannot load methods. Open from an order page.');
        return;
      }
      try {
        const data = await apiCall(
          `${PRIVATE_API}/API/User/PaymentCreditCard/GetUserPaymentMethods`,
          'POST',
          { orderId: parseInt(ctx.orderId, 10), processor: PROCESSOR, accountType: ACCOUNT_TYPE }
        );
        methods = (data.paymentMethods || []);
        if (methods.length === 0) {
          showError('No payment methods found on file for this customer.');
          return;
        }
        renderMethods();
      } catch (err) {
        showError('Failed to load methods: ' + err.message);
      }
    }

      /**
   * Updates the visual state badge on a payment-method row.
   * @param {string} billingId - The billing ID of the row to update.
   * @param {'idle'|'processing'|'success'|'error'} state - The new state.
   * @param {string} [detailText] - Optional detail message.
   */
  function setMethodState(billingId, state, detailText) {
      const row = list.querySelector(`[data-id="${billingId}"]`);
      if (!row) return;
      const spin = row.querySelector('.gb-spin-small');
      const msg  = row.querySelector('.gb-msg');
      
      if (state === 'loading') {
        spin.classList.add('active');
        row.classList.remove('failed', 'succeeded');
        msg.innerHTML = `<span>${detailText || 'Processing...'}</span>`;
        msg.style.color = 'rgba(255,255,255,.6)';
      } else {
        spin.classList.remove('active');
        if (state === 'success') {
            row.classList.add('succeeded');
            msg.style.color = 'var(--gb-brand-label, #7db82a)';
            msg.innerHTML = `
              <svg class="gb-status-icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              <span>${detailText || 'Approved'}</span>
            `;
        }
        if (state === 'fail') {
            row.classList.add('failed');
            msg.style.color = 'var(--gb-error, #c86060)';
            msg.innerHTML = `
              <svg class="gb-status-icon fail" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>${detailText || 'Failed'}</span>
            `;
        }
        if (state === 'warn') {
            row.classList.add('succeeded');
            msg.style.color = 'var(--gb-warning, #e0a030)';
            msg.innerHTML = `
              <svg class="gb-status-icon warn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style="font-size:10.5px">${detailText || 'Charged — record not saved'}</span>
            `;
        }
      }
    }

      /**
   * Saves the charge adjustment record to the server after a successful or
   * failed processor response.
   * @param {string} billingId - The billing ID.
   * @param {number} amount - The charged amount.
   * @param {string} transactionId - Processor transaction ID.
   * @param {string} responseMessage - Human-readable processor response.
   * @param {string} responseCode - Processor response code.
   * @returns {Promise<void>}
   */
  async function saveAdjustment(billingId, amount, transactionId, responseMessage, responseCode) {
      const reasonText = $('__gb-f-reason').value.trim() || 'Order Edit';
      const noteText   = $('__gb-f-note').value.trim()   || 'Order Charge';
      
      // Return the result so callers can check for SaveAdjustment errors
      return await apiCall(
        `${PRIVATE_API}/API/User/PaymentOrderCharge/SaveAdjustment`,
        'POST',
        {
          transactionId,
          orderId: String(ctx.orderId),
          amount: String(amount.toFixed(2)),
          previousAmount: 0,
          type: { Name: 'Charge', id: 1 },
          reason: { Name: reasonText, id: -1, adminReason: '' },
          note: noteText,
          inventoryEffected: false,
          inventoryDetails: '',
          userId: String(ctx.userId || ''),
          paymentResult: { responseCode: responseCode || '', responseMessage, transactionId: transactionId || '' },
          billingId,
          accountType: ACCOUNT_TYPE,
          heartlandAccount: ACCOUNT_TYPE
        }
      );
    }

      /**
   * Executes a single charge or refund for one payment method, wiring
   * through the icustomize payment API.
   * @param {string} billingId - The billing ID to charge.
   * @param {number} amount - Dollar amount (positive = charge, negative = refund).
   * @returns {Promise<void>}
   */
  async function chargeOne(billingId, amount) {
      setMethodState(billingId, 'loading', 'Fetching info…');
      try {
        let billing = await apiCall(
          `${PRIVATE_API}/API/User/CreditCardInfo/GetBillingInfoByBillingRequest`,
          'POST',
          { orderId: parseInt(ctx.orderId, 10), billingID: billingId, processor: PROCESSOR, accountType: ACCOUNT_TYPE }
        );

        if (!billing.token) {
          setMethodState(billingId, 'loading', 'Verifying card…');
          try {
            await apiCall(`${MASTER_API}/user/billingVerify`, 'PUT', {
              billingId: billing.billingId, customerId: billing.customerId, address: billing.address,
              accountType: ACCOUNT_TYPE, contact: billing.contact, processor: PROCESSOR
            });
          } catch (e) { console.warn(e); }

          setMethodState(billingId, 'loading', 'Getting token…');
          billing = await apiCall(
            `${PRIVATE_API}/API/User/CreditCardInfo/GetBillingInfoByBillingRequest`,
            'POST',
            { orderId: parseInt(ctx.orderId, 10), billingID: billingId, processor: PROCESSOR, accountType: ACCOUNT_TYPE }
          );
        }

        if (!billing.token) {
          await saveAdjustment(billingId, amount, null, 'No token available').catch(()=>{});
          setMethodState(billingId, 'fail', 'No token available');
          return false;
        }

        setMethodState(billingId, 'loading', 'Charging…');
        const chargeResult = await apiCall(`${MASTER_API}/user/chargeCard`, 'PUT', {
          token: billing.token, amount: amount.toFixed(2), expDate: billing.expDate,
          accountType: ACCOUNT_TYPE, processor: PROCESSOR
        });

                const txn   = chargeResult?.transaction || {};
        const txRef  = txn.transactionReference || {};
        const txId   = txRef.transactionId || '';
        // responseCode: ISO 8583 bank decision code. '00' = approved.
        // Must be forwarded to SaveAdjustment so the server can commit the adjustment.
        const txCode = txn.responseCode || txRef.responseCode || '';

        // USIO decline codes follow the pattern "D####:## Description" e.g. "D2026:05 Do not honor".
        // The code can appear in any nested field depending on the decline path, so we walk
        // the entire response object rather than guessing the exact key.
          /**
   * Recursively searches a nested object for a Usio processor response code.
   * @param {object} obj - Object to search.
   * @param {number} [depth=0] - Current recursion depth (max 5).
   * @returns {string|null} Found code or null.
   */
  function _findUsioCode(obj, depth) {
          if (depth > 5) return null;
          if (typeof obj === 'string') {
            return /^[DA]\d{4}:\d{2}\b/i.test(obj.trim()) ? obj.trim() : null;
          }
          if (obj && typeof obj === 'object') {
            for (const v of Object.values(obj)) {
              const hit = _findUsioCode(v, depth + 1);
              if (hit) return hit;
            }
          }
          return null;
        }

        const _usioCode     = _findUsioCode(chargeResult, 0);
        const _transportMsg = txRef.responseMessage || txn.responseMessage || 'success';

        // When declined (no txId), prefer the USIO code found anywhere in the response,
        // then any non-'success' field, then fall back to the transport-level message.
        let txMsg;
        if (!txId) {
          const _fallback = [
            txRef.responseMessage, txRef.responseCode,
            txn.responseCode, chargeResult?.responseMessage, chargeResult?.responseCode
          ].map(v => (v || '').trim()).find(v => v && v.toLowerCase() !== 'success');
          txMsg = _usioCode || _fallback || _transportMsg;
        } else {
          txMsg = _usioCode || _transportMsg;
        }

        // responseCode '00' is the ISO 8583 bank approval code - the authoritative signal.
        // txMsg 'success' is only USIO's transport-layer ack and must not be used alone.
        const isOk = txCode === '00' && !!txId;

        setMethodState(billingId, 'loading', 'Saving record…');
        // SaveAdjustment returns plain-text "Success" on success, or a plain-text error
        // string like "Payment adjustment result was not successful. Code: X Message: Y".
        // IMPORTANT: a SaveAdjustment failure does NOT mean the charge failed.
        // When isOk=true the customer's card was already debited — we must return
        // true so the loop stops and we don't charge another card.
        let saveResult;
        try {
          saveResult = await saveAdjustment(billingId, amount, txId || null, txMsg, txCode);
        } catch (saveErr) {
          saveResult = saveErr.message;
        }
        // The server returns plain-text "Success" (not empty/null) on a successful save.
        // Any other non-empty string is an actual error message.
        const saveFailed = typeof saveResult === 'string' && saveResult.trim().length > 0 && saveResult.trim().toLowerCase() !== 'success';

        // Strip the boilerplate prefix and the 'Code: X Message:' segment so we
        // show just the meaningful part e.g. 'D2026:05 Do not honor'.
          /**
   * Strips HTML and trims a raw server response for safe display.
   * @param {string} raw - Raw response string.
   * @returns {string} Cleaned plain-text message.
   */
  function _cleanSaveMsg(raw) {
          return (raw || '')
            .replace(/Payment adjustment result was not successful\.\s*/i, '')
            .replace(/^Code:\s*\S*\s*Message:\s*/i, '')
            .trim().slice(0, 60);
        }

        if (isOk) {
          if (saveFailed) {
            // CRITICAL: card was debited (responseCode 00, txId confirmed) but the
            // adjustment record failed to save. The charge is unassociated — it won't
            // move the order and notes won't update. Retry once automatically.
            setMethodState(billingId, 'loading', 'Save failed — retrying…');
            let retryResult;
            try {
              retryResult = await saveAdjustment(billingId, amount, txId, txMsg, txCode);
            } catch (re) {
              retryResult = re.message;
            }
            const retryFailed = typeof retryResult === 'string' && retryResult.trim().length > 0 && retryResult.trim().toLowerCase() !== 'success';
            if (retryFailed) {
              // Both attempts failed — surface a loud warning. The charge went through
              // but the record needs manual intervention before closing this order.
              setMethodState(billingId, 'warn',
                `CHARGED $${ amount.toFixed(2) } — ID: ${txId} — RECORD NOT SAVED`);
            } else {
              setMethodState(billingId, 'success', `ID: ${txId}`);
            }
          } else {
            setMethodState(billingId, 'success', txId ? `ID: ${txId}` : 'Approved');
          }
          return true;
        } else {
          // Charge declined — use the SaveAdjustment echo message since it reflects
          // the actual bank reason (e.g. 'D2026:05 Do not honor'), otherwise txMsg.
          const failMsg = saveFailed
            ? (_cleanSaveMsg(saveResult) || txMsg.slice(0, 60) || 'Declined')
            : (txMsg.slice(0, 60) || 'Declined');
          setMethodState(billingId, 'fail', failMsg);
          return false;
        }
      } catch (err) {
        const msgTxt = err.message.slice(0, 45);
        try { await saveAdjustment(billingId, amount, null, msgTxt, ''); } catch (_) {}
        setMethodState(billingId, 'fail', msgTxt || 'Declined');
        return false;
      }
    }

    btnRun.onclick = async () => {
      if (running || allDone || selection.length === 0) return;
      const amount = parseFloat($('__gb-f-amount').value);
      if (!amount || amount <= 0) { alert('Please enter a valid amount.'); return; }

      // Lock UI
      running = true;
      btnRun.disabled = true;
      btnRun.textContent = 'Running…';
      btnClose.style.display = 'none'; // Hide close button while running to prevent mid-charge exit
      
      $('__gb-f-amount').disabled = true;
      $('__gb-f-reason').disabled = true;
      $('__gb-f-note').disabled = true;

      // Execute Chain
      let successHit = false;
      for (const billingId of selection) {
        if (successHit) break;
        const ok = await chargeOne(billingId, amount);
        if (ok) successHit = true;
      }

      // Finish State
      running = false;
      allDone = true;
      btnRun.disabled = false;
      btnRun.textContent = 'Done';
      btnRun.onclick = () => __gbCloseModal(overlay);
      btnClose.style.display = 'flex'; 
    };

    // ── Apply diff-based theme ───────────────────────────────────────────────
    // ctx.isRefund  = diff < 0  → red header, refund button (disabled — logic TBD)
    // ctx.isZeroDiff = diff === 0 → run button stays permanently disabled
    if (ctx.isRefund) {
      overlay.querySelector('#__gb-charge-hdr').classList.add('refund-hdr');
      overlay.querySelector('#__gb-charge-title').textContent = 'Refund Customer';
      // Swap card icon to a refund arrow
      overlay.querySelector('#__gb-charge-hdr-svg').innerHTML = `
        <path d="M3 9l4-4 4 4M7 5v10M21 15l-4 4-4-4M17 19V9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      btnRun.classList.add('refund');
      btnRun.disabled = true; // Refund logic not yet implemented
    }

    // Kickoff
    loadMethods();
  }


