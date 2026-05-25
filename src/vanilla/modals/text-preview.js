// text-preview.js — Chat viewer modal & case routing for CRM
// Intercepts clicks on Case History rows, fetches the case details, 
// and routes to either the Email modal, the Chat modal, or a Notes Preview.

(function () {
  'use strict';

  // ── State & Data ─────────────────────────────────────────────────────────────
  const _cache = {};

  const _CASE_CATS = {
    'Order Status Update':          ['Lost Package','Carrier Issue','Tracking Update','Out of Stock','Drop Ships','Late Ship','Misunderstanding'],
    'Place an Order':               [],
    'Product Inquiry':              ['Sale Made - Yes','Sale Made - No'],
    'Transfer':                     ['Custom Logo','Retail','Human Resources','Direct Transfer'],
    'Returns/Reprint':              ['Wrong Item Ordered (Customer Error)','Wrong Item Shipped (GBC Error)','Shipped qty error (GBC error)','Drop Ship Error (Man. Error)','Drop Ship Error (GBC Error)','Manufacture Error/Defect','Lost in Transit (Courier Error)','Printing Defects - GBC PRODUCTION (BOH Error)','Printing Defects - GBC CSR Error','Printing Defects - Customer Error','Incorrect Product Customized','Production Defects','Quality of Print','Damaged Package Courier Error'],
    'Charge Error':                 ['Fixed - System did not charge','Fixed - System failed to attach charge','Actual Charge Error - Resolved by Customer','Actual Charge Error - Resolved by CSR','Fraud','Card did not populate'],
    'Fraud Inquiry':                [],
    'International Orders':         [],
    'Profanity':                    [],
    'Order Change':                 ['Quantity','Personalization Edit','Shipping Address','Billing Address Change','Shipping Method Change','Product Change','Payment Method','System Error'],
    'Cancelation':                  ['Out of Stock','Customer Changed Mind','Delivery Delays','Expected Delivery Date Changed','Alternative available found better price','Alternative available found better quality','Subscribe and Score'],
    'Website Concerns':             ['User Experience','Cannot Load cart','Cannot Login','Cannot Check out','Subscribe and Score','Cannot Cancel Order','Site Navigation','Promo Codes','Price Variance','Shipping Address would not populate','PO Box'],
    'General Inquiry':              ['Shipping options available','General website guidance / use'],
    'CSAT':                         ['CSAT Note','Detractor'],
    'Other - Details must be provided': [],
  };

  // ── Modal Builder ────────────────────────────────────────────────────────────

  function _buildChatModal(isCasePage) {
    document.getElementById('__gb-chat-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = '__gb-chat-modal';
    modal.style.cssText = `
      position:fixed!important;inset:0!important;z-index: 999990 !important;
      display:flex!important;align-items:center!important;justify-content:center!important;
      background:rgba(0,0,0,.6)!important;
      backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;
    `;

    // Dynamic width based on context
    const cardWidth = isCasePage ? 'min(1280px,calc(100vw - 24px))' : 'min(700px,calc(100vw - 24px))';

    modal.innerHTML = `
      <style>
        @keyframes __gbChFadeIn  { from{opacity:0}to{opacity:1} }
        @keyframes __gbChSlideUp { from{opacity:0;transform:scale(.92) translateY(16px)}to{opacity:1;transform:none} }
        @keyframes __gbChSpin    { to{transform:rotate(360deg)} }
        #__gb-chat-modal { animation:__gbChFadeIn .16s ease!important; }

        #__gb-ch-card {
          background:rgba(17,17,17,.85)!important;
          backdrop-filter:blur(16px)!important;-webkit-backdrop-filter:blur(16px)!important;
          border:1px solid rgba(255,255,255,.08)!important;
          border-radius: 18px !important;
          box-shadow:0 24px 70px rgba(0,0,0,.9),inset 0 0 0 1px rgba(255,255,255,.03)!important;
          width:${cardWidth}!important;
          height:min(860px,calc(100vh - 40px))!important;
          display:flex!important;flex-direction:column!important;
          overflow:hidden!important;
          animation:__gbChSlideUp .3s cubic-bezier(.34,1.56,.64,1)!important;
          box-sizing:border-box!important;
          transition: width 0.3s cubic-bezier(.34,1.56,.64,1)!important;
        }

        /* Header */
        #__gb-ch-hdr {
          background:rgba(0,0,0,.4)!important;
          border-bottom:1px solid rgba(255,255,255,.06)!important;
          padding:14px 20px!important;
          display:flex!important;align-items:center!important;gap:12px!important;
          flex-shrink:0!important;
        }
        #__gb-ch-hdr-icon {
          width:32px!important;height:32px!important;
          background:rgba(var(--gb-brand-label-rgb, 125,184,42), .15)!important;
          border-radius:8px!important;
          display:flex!important;align-items:center!important;justify-content:center!important;
          flex-shrink:0!important;color:var(--gb-brand-label,#7db82a)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3)!important;
        }
        #__gb-ch-title-wrap { flex:1!important;min-width:0!important;display:flex!important;flex-direction:column!important; }
        #__gb-ch-title {
          font-size:14px!important;font-weight:700!important;
          color:var(--gb-text-primary,#fff)!important;
          white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
        }
        #__gb-ch-sub {
          font-size:11px!important;font-weight:500!important;color:var(--gb-text-muted,#888)!important;
          margin-top:2px!important;
        }
        #__gb-ch-close {
          background:rgba(255,255,255,.05)!important;color:rgba(255,255,255,.8)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:6px!important;
          padding:6px 12px!important;font-size:11px!important;font-weight:600!important;
          cursor:pointer!important;display:flex!important;align-items:center!important;
          gap:6px!important;flex-shrink:0!important;transition:all .2s!important;
        }
        #__gb-ch-close:hover { background:rgba(255,255,255,.12)!important;color:#fff!important; }

        /* Split Content */
        #__gb-ch-content {
          display:flex!important;flex:1!important;overflow:hidden!important;min-height:0!important;
        }

        /* Left side: Chat */
        #__gb-ch-left {
          flex:1!important;min-width:0!important;display:flex!important;flex-direction:column!important;
          ${isCasePage ? 'border-right:1px solid rgba(255,255,255,.06)!important;' : ''}
          overflow:hidden!important;
        }

        #__gb-ch-body {
          flex:1!important;position:relative!important;overflow-y:auto!important;
          padding:20px!important;display:flex!important;flex-direction:column!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
        }

        /* Chat Bubbles & Notes */
        .gb-chat-row { display:flex!important;flex-direction:column!important;margin-bottom:16px!important;width:100%!important; }
        .gb-chat-row.visitor { align-items:flex-start!important; }
        .gb-chat-row.agent { align-items:flex-end!important; }
        .gb-chat-row.system { align-items:center!important;margin:8px 0 16px!important; }
        .gb-chat-row.note { align-items:flex-start!important; }

        .gb-chat-meta {
          font-size:10px!important;font-weight:600!important;color:rgba(255,255,255,.4)!important;
          margin-bottom:4px!important;display:flex!important;gap:6px!important;
        }
        
        .gb-chat-bubble {
          padding:11px 15px!important;border-radius:14px!important;
          max-width:85%!important;font-size:13.5px!important;line-height:1.55!important;
          word-break:break-word!important;box-shadow:0 4px 15px rgba(0,0,0,.2)!important;
        }
        
        .gb-chat-row.visitor .gb-chat-bubble {
          background: transparent !important; 
          border: 1px solid var(--gb-border-standard, #333333) !important;
          color: var(--gb-text-primary, #ffffff) !important; 
          border-bottom-left-radius: 4px !important;
        }
        
        .gb-chat-row.agent .gb-chat-bubble {
          background: color-mix(in srgb, var(--gb-brand-label, #22c55e) 8%, transparent) !important;
          border: 1px solid color-mix(in srgb, var(--gb-brand-label, #22c55e) 30%, transparent) !important;
          color: var(--gb-text-primary, #ffffff) !important;
          border-bottom-right-radius: 4px !important;
        }

        .gb-chat-row.system .gb-chat-bubble {
          background:transparent!important;box-shadow:none!important;border:none!important;
          padding:4px 12px!important;font-size:11px!important;font-style:italic!important;
          color:rgba(255,255,255,.35)!important;text-align:center!important;
        }

        .gb-chat-row.note .gb-chat-bubble {
          background: rgba(255,255,255,.03) !important;
          border: 1px solid rgba(255,255,255,.08) !important;
          color: var(--gb-text-secondary, #cccccc) !important;
          max-width: 100% !important;
          border-radius: 8px !important;
        }

        /* Action Footer */
        #__gb-ch-footer {
          padding:14px 20px!important;background:rgba(0,0,0,.3)!important;
          border-top:1px solid rgba(255,255,255,.06)!important;
          display:flex!important;justify-content:flex-end!important;flex-shrink:0!important;
        }
        .gb-ch-btn {
          background:var(--gb-brand-dark,#5f7d18)!important;color:var(--gb-brand-text,#d8eeaa)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4)!important;border-radius:6px!important;
          padding:8px 18px!important;font-size:12px!important;font-weight:600!important;
          cursor:pointer!important;transition:all .2s!important;display:flex!important;align-items:center!important;gap:6px!important;
          text-decoration:none!important;
        }
        .gb-ch-btn:hover { background:var(--gb-brand,#6e901d)!important;border-color:var(--gb-brand-label,#7db82a)!important;color:#fff!important; }

        /* Right side: Categories */
        #__gb-ch-cats {
          width:400px!important;flex-shrink:0!important;display:${isCasePage ? 'flex' : 'none'}!important;flex-direction:column!important;
          background:rgba(0,0,0,.25)!important;overflow:hidden!important;
        }
        #__gb-ch-cats-hdr {
          padding:14px 16px 12px!important;flex-shrink:0!important;
          border-bottom:1px solid rgba(255,255,255,.06)!important;
        }
        #__gb-ch-cats-hdr-title {
          font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;
          letter-spacing:.8px!important;color:rgba(255,255,255,.5)!important; margin-bottom:10px!important;
        }

        .gb-ch-dd-row { margin-bottom:6px!important; }
        .gb-ch-dd-wrap { position:relative!important; }
        .gb-ch-dd-input {
          width:100%!important;background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;
          color:#fff!important;font-size:13px!important;font-weight:500!important;
          padding:10px 12px!important;font-family:inherit!important;outline:none!important;
          box-sizing:border-box!important;transition:border-color .15s,box-shadow .15s!important;
          height:40px!important;
        }
        .gb-ch-dd-input:focus {
          border-color:var(--gb-brand-label,#7db82a)!important;
          box-shadow:0 0 0 2px rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
        }
        .gb-ch-dd-input::placeholder { color:rgba(255,255,255,.3)!important; }
        
        .gb-ch-dd-menu {
          position:absolute!important;top:calc(100% + 3px)!important;left:0!important;right:0!important;
          background:var(--gb-surface-elevated,#171717)!important;
          border:1px solid rgba(255,255,255,.1)!important;border-radius:8px!important;
          z-index:999!important;max-height:180px!important;overflow-y:auto!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
          display:none!important;
          box-shadow:0 8px 24px rgba(0,0,0,.6)!important;
        }
        .gb-ch-dd-menu.open { display:block!important; }
        .gb-ch-dd-opt {
          padding:7px 10px!important;font-size:12px!important;cursor:pointer!important;
          color:var(--gb-text-secondary,#ccc)!important;transition:background .1s!important;
          border-bottom:1px solid rgba(255,255,255,.05)!important;
        }
        .gb-ch-dd-opt:last-child { border-bottom:none!important; }
        .gb-ch-dd-opt:hover { background:rgba(255,255,255,.08)!important; }
        .gb-ch-dd-opt.selected { background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;color:var(--gb-brand-label,#7db82a)!important; }

        .gb-ch-submit-row { display:flex!important;gap:6px!important; }
        .gb-ch-submit-btn {
          flex:1!important;background:var(--gb-brand-dark,#5f7d18)!important;color:var(--gb-brand-text,#d8eeaa)!important;
          border:1px solid rgba(var(--gb-brand-label-rgb,125,184,42),.3)!important;border-radius:6px!important;
          padding:6px 0!important;font-size:11px!important;font-weight:700!important;cursor:pointer!important;
          font-family:inherit!important;transition:background .15s!important;display:flex!important;
          align-items:center!important;justify-content:center!important;gap:5px!important;
        }
        .gb-ch-submit-btn:hover { background:var(--gb-brand,#6e901d)!important; }
        .gb-ch-submit-btn:disabled { opacity:.5!important;cursor:not-allowed!important;pointer-events:none!important; }

        /* Scrollable category list */
        #__gb-ch-cats-list {
          flex:1!important;overflow-y:auto!important;padding:10px 14px 16px!important;
          scrollbar-width:thin!important;scrollbar-color:rgba(255,255,255,.1) transparent!important;
        }
        
        .gb-ch-cat-section { margin-bottom:10px!important;border-radius:8px!important;transition:background .2s ease,box-shadow .2s ease!important;padding:4px 4px 6px!important; }
        .gb-ch-cat-section.active {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.1)!important;
          box-shadow:inset 0 0 0 1px rgba(var(--gb-brand-label-rgb,125,184,42),.25)!important;
        }
        @keyframes __gbCatPop { 0%{transform:scale(1)} 40%{transform:scale(1.015)} 100%{transform:scale(1)} }
        .gb-ch-cat-section.pop { animation:__gbCatPop .22s cubic-bezier(.34,1.4,.64,1)!important; }
        .gb-ch-cat-name {
          font-size:11.5px!important;font-weight:800!important;text-transform:uppercase!important;
          letter-spacing:.5px!important;color:rgba(255,255,255,.5)!important;
          margin-bottom:7px!important;padding:5px 2px 0!important;
          display:flex!important;align-items:center!important;justify-content:space-between!important;
        }
        .gb-ch-cat-name-text { flex:1!important;min-width:0!important; }
        .gb-ch-cat-tab-badge {
          font-size:9px!important;font-weight:700!important;letter-spacing:.5px!important;
          background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;
          border-radius:5px!important;padding:2px 5px!important;
          color:rgba(255,255,255,.5)!important;flex-shrink:0!important;
          transition:all .18s!important;
        }
        .gb-ch-cat-section.active .gb-ch-cat-tab-badge {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.2)!important;
          border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.5)!important;
          color:var(--gb-brand-label,#7db82a)!important;
        }
        .gb-ch-cat-section.active .gb-ch-cat-name-text { color:var(--gb-brand-label,#7db82a)!important; }
        .gb-ch-num-badge {
          font-size:9px!important;font-weight:700!important;
          background:rgba(0,0,0,.3)!important;
          border:1px solid rgba(255,255,255,.1)!important;
          border-radius:4px!important;padding:1px 4px!important;
          color:rgba(255,255,255,.5)!important;margin-right:4px!important;
          flex-shrink:0!important;line-height:1.4!important;
        }
        .gb-ch-cat-tags { display:flex!important;flex-direction:column!important;gap:3px!important; }
        .gb-ch-cat-tag {
          background:rgba(0,0,0,.2)!important;
          border:1px solid rgba(255,255,255,.08)!important;
          border-radius:7px!important;
          font-size:13.5px!important;font-weight:500!important;color:var(--gb-text-secondary,#ccc)!important;
          cursor:pointer!important;text-align:left!important;line-height:1.4!important;
          transition:all .15s!important;font-family:inherit!important;padding:9px 10px!important;min-height:40px!important;
        }
        .gb-ch-cat-tag:hover {
          background:rgba(var(--gb-brand-label-rgb,125,184,42),.15)!important;
          border-color:rgba(var(--gb-brand-label-rgb,125,184,42),.4)!important;
          color:var(--gb-brand-label,#7db82a)!important;
        }
        .gb-ch-cat-tag.loading { opacity:.5!important;cursor:not-allowed!important;pointer-events:none!important; }
        .gb-ch-cat-tag.done {
          background:rgba(var(--gb-success-rgb,56,176,0),.15)!important;
          border-color:rgba(var(--gb-success-rgb,56,176,0),.4)!important;
          color:var(--gb-success,#38b000)!important;
        }
      </style>

      <div id="__gb-ch-card">
        <div id="__gb-ch-hdr">
          <div id="__gb-ch-hdr-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div id="__gb-ch-title-wrap">
            <span id="__gb-ch-title">Case Notes</span>
            <span id="__gb-ch-sub">Loading details...</span>
          </div>
          <button id="__gb-ch-close">
            <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close
          </button>
        </div>

        <div id="__gb-ch-content">
          <div id="__gb-ch-left">
            <div id="__gb-ch-body"></div>
            <div id="__gb-ch-footer">
              <a id="__gb-ch-btn-case" class="gb-ch-btn" href="#" target="_blank">
                Open Full Case
                <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
          
          <div id="__gb-ch-cats">
            <div id="__gb-ch-cats-hdr">
              <div id="__gb-ch-cats-hdr-title">Categorise</div>
              <div class="gb-ch-dd-row">
                <div class="gb-ch-dd-wrap" id="__gb-ch-cat-dd-wrap">
                  <input class="gb-ch-dd-input" id="__gb-ch-cat-input" type="text" placeholder="Category…" autocomplete="off">
                  <div class="gb-ch-dd-menu" id="__gb-ch-cat-dd-menu"></div>
                </div>
              </div>
              <div class="gb-ch-dd-row">
                <div class="gb-ch-dd-wrap" id="__gb-ch-subcat-dd-wrap">
                  <input class="gb-ch-dd-input" id="__gb-ch-subcat-input" type="text" placeholder="Subcategory…" autocomplete="off">
                  <div class="gb-ch-dd-menu" id="__gb-ch-subcat-dd-menu"></div>
                </div>
              </div>
              <div class="gb-ch-submit-row">
                <button class="gb-ch-submit-btn" id="__gb-ch-cat-submit">
                  <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                  Apply
                </button>
              </div>
            </div>
            <div id="__gb-ch-cats-list"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function _closeChatModal() {
    const m = document.getElementById('__gb-chat-modal');
    if (!m) return;
    if (m._removeKeyNav) m._removeKeyNav();
    m.style.opacity = '0';
    m.style.transition = 'opacity .18s ease';
    setTimeout(() => m.remove(), 200);
  }

  // ── CRM API & Updates ────────────────────────────────────────────────────────

  async function _getEmployeeId() {
    const el = document.getElementById('tbCurrentAdmin');
    if (el?.value?.trim()) return el.value.trim();
    if (window.Case?.ClosedBy) return String(window.Case.ClosedBy);
    if (window.__gbEmployeeId) return String(window.__gbEmployeeId);
    try {
      const data = await new Promise(res => chrome.storage.local.get(['gbEmployeeId','featureFlags'], res));
      const id = data?.gbEmployeeId || data?.featureFlags?.gbEmployeeId;
      if (id) return String(id);
    } catch (_) {}
    return null;
  }

  async function _submitCategoryUpdate(triggerEl, category, subcategory, caseId) {
    if (!caseId) { 
        if (typeof showGbNotification === 'function') showGbNotification('No caseID found.', 'error', 3000); 
        return; 
    }

    triggerEl.classList.add('loading');

    const send = (msg) => new Promise(res => {
      try { chrome.runtime.sendMessage(msg, r => { if (chrome.runtime.lastError) res(null); else res(r); }); }
      catch (_) { res(null); }
    });

    try {
      const getResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Get.ajax?${caseId}` });
      let caseData = {};
      try { caseData = JSON.parse(getResp?.text || '{}'); } catch (_) {}
      if (!caseData.caseID) throw new Error('Could not read case data.');

      const employeeId = await _getEmployeeId();
      const payload = {
        Name:        caseData.Name        || '',
        Direction:   caseData.Direction   || 'In',
        Channel:     caseData.Channel     || 'Email',
        Category:    category,
        Subcategory: subcategory || category,
        Owner:       String(caseData.OwnerID || '1'),
        caseID:      String(caseId),
        Department:  String(caseData.DepartmentID || '2'),
        Status:      3,
      };
      if (employeeId) payload.ClosedBy = String(employeeId);

      const upResp = await send({ action: 'fetchRaw', url: `https://api.golfballs.com/golfballs/crm/Admin/MyCase/Update.ajax?${JSON.stringify(payload)}` });
      let result = {};
      try { result = JSON.parse(upResp?.text || '{}'); } catch (_) {}

      const ok = result.caseID === parseInt(caseId) || /success|ok/i.test(upResp?.text || '');
      if (!ok && upResp?.text && upResp.text.length < 200) throw new Error(upResp.text);

      triggerEl.classList.remove('loading');
      triggerEl.classList.add('done');
      if (typeof showGbNotification === 'function') showGbNotification(`Categorised: ${category} → ${subcategory}`, 'success', 3000);
      
      setTimeout(() => {
        _closeChatModal();
        location.reload(); 
      }, 600);

    } catch (err) {
      triggerEl.classList.remove('loading');
      if (typeof showGbNotification === 'function') showGbNotification('Update failed: ' + (err.message || 'Unknown error'), 'error', 4000);
    }
  }

  // ── Chat Parser ──────────────────────────────────────────────────────────────

  function _parseAndRenderChatHtml(rawText, containerEl) {
    containerEl.innerHTML = '';
    if (!rawText || !rawText.trim()) {
      containerEl.innerHTML = `<div style="text-align:center;color:#888;margin-top:40px;">No transcript or notes found for this case.</div>`;
      return;
    }

    const lines = rawText.split(/<br\s*\/?>|\n/i);
    let htmlOutput = '';

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      const standardMatch = cleanLine.match(/^\((.*?)\)\s*<b>(.*?)<\/b>\s*(.*)$/);
      
      if (standardMatch) {
        const [_, time, name, msg] = standardMatch;
        const isVisitor = name.toLowerCase() === 'visitor';
        const cssClass = isVisitor ? 'visitor' : 'agent';
        
        if (msg.startsWith('[') && msg.endsWith(']')) {
          htmlOutput += `<div class="gb-chat-row system"><div class="gb-chat-bubble">${msg}</div></div>`;
        } else {
          htmlOutput += `
            <div class="gb-chat-row ${cssClass}">
              <div class="gb-chat-meta"><span>${name}</span> &bull; <span>${time}</span></div>
              <div class="gb-chat-bubble">${msg}</div>
            </div>`;
        }
      } else if (cleanLine.toLowerCase().startsWith('see https://')) {
        const linkMatch = cleanLine.match(/(https:\/\/[^\s]+)/);
        const link = linkMatch ? linkMatch[1] : '#';
        htmlOutput += `
          <div class="gb-chat-row system">
            <div class="gb-chat-bubble">
              <a href="${link}" target="_blank" style="color:var(--gb-brand-label,#7db82a);">View full transcript on SnapEngage</a>
            </div>
          </div>`;
      } else {
        htmlOutput += `<div class="gb-chat-row note"><div class="gb-chat-bubble">${cleanLine}</div></div>`;
      }
    });

    containerEl.innerHTML = htmlOutput;
    setTimeout(() => { containerEl.scrollTop = containerEl.scrollHeight; }, 50);
  }

  // ── Category Builder ─────────────────────────────────────────────────────────

  function _wireUpCategories(modal, caseId) {
    const catList = modal.querySelector('#__gb-ch-cats-list');
    let catSections = [];
    const catEntries = Object.entries(_CASE_CATS);
    let activeCatIdx = -1;

    for (let ci = 0; ci < catEntries.length; ci++) {
      const [cat, subs] = catEntries[ci];
      if (subs.length === 0) continue;

      const groups = [];
      for (let gi = 0; gi < subs.length; gi += 10) groups.push(subs.slice(gi, gi + 10));

      groups.forEach((group, gIdx) => {
        const sec = document.createElement('div');
        sec.className = 'gb-ch-cat-section';

        const nameEl = document.createElement('div');
        nameEl.className = 'gb-ch-cat-name';
        const nameText = document.createElement('span');
        nameText.className = 'gb-ch-cat-name-text';
        nameText.textContent = groups.length > 1 ? cat + ' (' + (gIdx+1) + '/' + groups.length + ')' : cat;
        nameEl.appendChild(nameText);
        const tabBadge = document.createElement('span');
        tabBadge.className = 'gb-ch-cat-tab-badge';
        tabBadge.textContent = 'TAB';
        nameEl.appendChild(tabBadge);

        const tagsEl = document.createElement('div');
        tagsEl.className = 'gb-ch-cat-tags';

        group.forEach((sub, si) => {
          const tag = document.createElement('button');
          tag.className = 'gb-ch-cat-tag';
          const nb = document.createElement('span');
          nb.className = 'gb-ch-num-badge';
          nb.textContent = si === 9 ? '0' : String(si + 1);
          tag.appendChild(nb);
          tag.appendChild(document.createTextNode(sub));
          tag.addEventListener('click', () => _submitCategoryUpdate(tag, cat, sub, caseId));
          tagsEl.appendChild(tag);
        });

        sec.appendChild(nameEl);
        sec.appendChild(tagsEl);
        catList.appendChild(sec);
        catSections.push({ sec, cat, subs: group });
      });
    }

    // ── Keyboard navigation ────────────────────────────────────────────────
    function _activateCat(idx) {
      if (catSections.length === 0) return;
      const prev = catSections[activeCatIdx];
      if (prev) prev.sec.classList.remove('active');
      activeCatIdx = ((idx % catSections.length) + catSections.length) % catSections.length;
      const cur = catSections[activeCatIdx];
      if (!cur) return;
      cur.sec.classList.add('active');
      cur.sec.classList.remove('pop');
      void cur.sec.offsetWidth;
      cur.sec.classList.add('pop');
      
      const listEl = cur.sec.closest('#__gb-ch-cats-list');
      if (listEl) {
        const secRect  = cur.sec.getBoundingClientRect();
        const listRect = listEl.getBoundingClientRect();
        const relTop   = secRect.top - listRect.top + listEl.scrollTop;
        const targetTop = relTop - Math.floor(listEl.clientHeight * 0.20);
        listEl.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
      }
    }

    function _onKeyNav(e) {
      const focused = document.activeElement;
      if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA')) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        _activateCat(e.shiftKey ? activeCatIdx - 1 : activeCatIdx + 1);
        return;
      }

      const numMatch = e.key.match(/^([0-9])$/);
      if (numMatch && activeCatIdx >= 0) {
        const n  = parseInt(numMatch[1]);
        const si = n === 0 ? 9 : n - 1;
        const cur = catSections[activeCatIdx];
        if (!cur || si >= cur.subs.length) return;
        const tagEls = cur.sec.querySelectorAll('.gb-ch-cat-tag');
        if (tagEls[si]) {
          e.preventDefault();
          _submitCategoryUpdate(tagEls[si], cur.cat, cur.subs[si], caseId);
        }
      }
    }

    document.addEventListener('keydown', _onKeyNav);
    modal._removeKeyNav = () => document.removeEventListener('keydown', _onKeyNav);

    // ── Category + subcategory text inputs ─────────────────
    const catInput  = modal.querySelector('#__gb-ch-cat-input');
    const catMenu   = modal.querySelector('#__gb-ch-cat-dd-menu');
    const subInput  = modal.querySelector('#__gb-ch-subcat-input');
    const subMenu   = modal.querySelector('#__gb-ch-subcat-dd-menu');
    const submitBtn = modal.querySelector('#__gb-ch-cat-submit');

    const allCats = Object.keys(_CASE_CATS);

    function _buildOpts(menu, items, onSelect) {
      menu.innerHTML = '';
      items.forEach(item => {
        const opt = document.createElement('div');
        opt.className = 'gb-ch-dd-opt';
        opt.textContent = item;
        opt.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onSelect(item);
          menu.classList.remove('open');
        });
        menu.appendChild(opt);
      });
    }

    function _filterMenu(menu, input, allItems) {
      const q = input.value.trim().toLowerCase();
      const opts = menu.querySelectorAll('.gb-ch-dd-opt');
      let shown = 0;
      opts.forEach(opt => {
        const show = !q || opt.textContent.toLowerCase().includes(q);
        opt.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      menu.classList.toggle('open', shown > 0 && document.activeElement === input);
    }

    function _updateSubOpts(cat) {
      const subs = _CASE_CATS[cat] || allCats; 
      _buildOpts(subMenu, subs.length ? subs : [cat], (sub) => {
        subInput.value = sub;
        subMenu.classList.remove('open');
      });
    }

    _buildOpts(catMenu, allCats, (cat) => {
      catInput.value = cat;
      catMenu.classList.remove('open');
      _updateSubOpts(cat);
      subInput.value = '';
      subInput.focus();
    });
    _updateSubOpts('');

    catInput.addEventListener('input', () => _filterMenu(catMenu, catInput, allCats));
    catInput.addEventListener('focus', () => {
      _buildOpts(catMenu, allCats, (cat) => { catInput.value = cat; catMenu.classList.remove('open'); _updateSubOpts(cat); subInput.value = ''; subInput.focus(); });
      _filterMenu(catMenu, catInput, allCats);
    });
    catInput.addEventListener('blur', () => setTimeout(() => catMenu.classList.remove('open'), 150));
    catInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { subInput.focus(); }
      if (e.key === 'Escape') { catMenu.classList.remove('open'); }
    });

    subInput.addEventListener('input', () => {
      const cat = catInput.value.trim();
      const subs = _CASE_CATS[cat] || allCats;
      _filterMenu(subMenu, subInput, subs);
    });
    subInput.addEventListener('focus', () => {
      const cat = catInput.value.trim();
      const subs = _CASE_CATS[cat] || allCats;
      _buildOpts(subMenu, subs.length ? subs : allCats, (sub) => { subInput.value = sub; subMenu.classList.remove('open'); });
      _filterMenu(subMenu, subInput, subs.length ? subs : allCats);
    });
    subInput.addEventListener('blur', () => setTimeout(() => subMenu.classList.remove('open'), 150));
    subInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const c = catInput.value.trim();
        const s = subInput.value.trim();
        if (c && s) _submitCategoryUpdate(submitBtn, c, s, caseId);
      }
      if (e.key === 'Escape') { subMenu.classList.remove('open'); }
    });

    submitBtn.addEventListener('click', () => {
      const c = catInput.value.trim();
      const s = subInput.value.trim();
      if (!c) { catInput.style.setProperty('border-color', 'var(--gb-error,#c86060)', 'important'); catInput.focus(); return; }
      if (!s) { subInput.style.setProperty('border-color', 'var(--gb-error,#c86060)', 'important'); subInput.focus(); return; }
      _submitCategoryUpdate(submitBtn, c, s, caseId);
    });
  }

  // ── Fetching & Routing ───────────────────────────────────────────────────────

  function _handleCaseClick(caseId, caseHref, targetMeta) {
    if (_cache[caseId]) {
      _routeParsedCase(_cache[caseId], caseId, caseHref, targetMeta);
      return;
    }

    const absoluteUrl = new URL(caseHref, window.location.href).href;
    
    chrome.runtime.sendMessage({ action: 'fetchRaw', url: absoluteUrl }, resp => {
      if (chrome.runtime.lastError || !resp || !resp.text) {
        window.location.href = caseHref; 
        return;
      }
      
      const doc = new DOMParser().parseFromString(resp.text, 'text/html');
      _cache[caseId] = doc;
      _routeParsedCase(doc, caseId, caseHref, targetMeta);
    });
  }

  function _routeParsedCase(doc, caseId, caseHref, targetMeta) {
    const emailLink = doc.querySelector('a[href*="Page=268"][href*="MessageID="]');
    if (emailLink && typeof window.__gbOpenEmailPreview === 'function') {
      const href = emailLink.getAttribute('href');
      const idM = href.match(/[?&]MessageID=([^&]+)/i);
      const guidM = href.match(/[?&]MessageGUID=([^&]+)/i);
      
      if (idM) {
        window.__gbOpenEmailPreview({
          messageId: idM[1],
          messageGuid: guidM ? guidM[1] : '',
          meta: targetMeta
        });
        return;
      }
    }

    const channelEl = doc.getElementById('Channel');
    const channelText = channelEl ? channelEl.textContent.trim().toLowerCase() : '';
    const isChat = channelText === 'chat' || channelText.includes('live chat');
    
    const tbNotes = doc.getElementById('tbNotes');
    let rawChatStr = '';

    if (tbNotes && tbNotes.value) {
      try {
        const notesObj = JSON.parse(tbNotes.value);
        Object.values(notesObj).forEach(val => {
          if (typeof val === 'string') {
             if (isChat || val.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/.test(val)) {
                rawChatStr += val + '<br />';
             } else {
                rawChatStr += val + '<br /><br />';
             }
          }
        });
      } catch (e) {
        rawChatStr = tbNotes.value;
      }
    }

    const isCasePage = /[?&]caseID=/i.test(window.location.href) || !!document.getElementById('tbCaseId');
    const modal = _buildChatModal(isCasePage);
    const bodyEl = modal.querySelector('#__gb-ch-body');
    
    let modalTitle = 'Case Notes Preview';
    if (isChat || rawChatStr.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/.test(rawChatStr)) {
        modalTitle = 'Live Chat Transcript';
    } else if (channelText === 'email') {
        modalTitle = 'Email Notes (No Message ID Found)';
    }

    modal.querySelector('#__gb-ch-title').textContent = modalTitle;
    modal.querySelector('#__gb-ch-sub').textContent = targetMeta.subject ? `Case #${caseId} — ${targetMeta.subject}` : `Case #${caseId}`;
    modal.querySelector('#__gb-ch-btn-case').href = caseHref;
    
    modal.querySelector('#__gb-ch-close').addEventListener('click', _closeChatModal);
    modal.addEventListener('click', e => { if (e.target === modal) _closeChatModal(); });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        _closeChatModal();
      }
    });

    _parseAndRenderChatHtml(rawChatStr, bodyEl);

    if (isCasePage) {
        _wireUpCategories(modal, caseId);
    }
  }

  // ── Scanner ──────────────────────────────────────────────────────────────────

  function __gbTextPreviewScan() {
    if (window.__gbFeatureFlags?.emailPreviewEnabled === false) return;

     // Edge case: ensure customerID exists in query params
    const params = new URLSearchParams(window.location.search);
    if (!params.has("customerID")) return;

    if (!document.getElementById('__gb-tp-row-styles')) {
      const s = document.createElement('style');
      s.id = '__gb-tp-row-styles';
      const rgb = getComputedStyle(document.documentElement).getPropertyValue('--gb-brand-label-rgb').trim() || '125,184,42';
      s.textContent = `
        tr[data-gbtp]:hover > td, tr[data-gbtp]:hover > th { background-color: rgba(${rgb},.15) !important; cursor: pointer !important; transition: background-color .15s ease !important; }
        tr[data-gbtp]:hover > td:first-child, tr[data-gbtp]:hover > th:first-child { border-left: 3px solid rgba(${rgb},.9) !important; }
      `;
      document.head.appendChild(s);
    }

    // 1. Standard Case Rows in tables
    document.querySelectorAll('tr').forEach(row => {
      if (row.__gbTpAttached) return;

      const caseLink = row.querySelector('a[href*="caseID="], a[href*="CaseID="]');
      if (!caseLink) return;

      if (row.querySelector('a[href*="MessageID="]')) return;

      const match = caseLink.getAttribute('href').match(/[?&]caseID=(\d+)/i);
      if (!match) return;
      
      const caseId = match[1];

      const htmlContent = row.innerHTML.toLowerCase();
      const textContent = row.textContent.toLowerCase(); 
      
      const isEmail = htmlContent.includes('icon-envelope') || textContent.includes('email');
      const isChat = htmlContent.includes('icon-comments-alt') || textContent.includes('chat');

      if (!isEmail && !isChat) return;

      row.__gbTpAttached = true;
      row.setAttribute('data-gbtp', '1');

      const cells = row.querySelectorAll('td');
      let subject = `Case #${caseId}`;
      if (cells.length > 4 && cells[4].textContent.trim()) {
         subject = cells[4].textContent.trim(); 
      } else if (cells.length >= 3 && cells[2].textContent.trim()) {
         subject = cells[2].textContent.trim(); 
      }

      const meta = { subject };

      row.addEventListener('click', (e) => {
        if (e.target.closest('a') && e.target.closest('a') !== caseLink) return;
        if (e.button === 1 || e.ctrlKey || e.metaKey) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        _handleCaseClick(caseId, caseLink.getAttribute('href'), meta);
      });
    });

    // 2. Local Notes Rows on the Case Details page
    document.querySelectorAll('tbody#Notes tr').forEach(row => {
      if (row.__gbTpAttached) return;

      const htmlContent = row.innerHTML;
      const isChat = htmlContent.includes('<b>Visitor</b>') || /\(\d{2}:\d{2}:\d{2}\)\s*<b>/i.test(htmlContent) || htmlContent.toLowerCase().includes('live chat');

      if (!isChat) return;

      const caseIdInput = document.getElementById('tbCaseId');
      if (!caseIdInput) return;
      const caseId = caseIdInput.value;

      row.__gbTpAttached = true;
      row.setAttribute('data-gbtp', '1');

      const meta = { subject: `Case #${caseId} — Chat Notes` };

      row.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        if (e.button === 1 || e.ctrlKey || e.metaKey) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (!_cache[caseId]) {
          _cache[caseId] = document;
        }
        
        _handleCaseClick(caseId, window.location.href, meta);
      });
    });
  }

  window.__gbTextPreviewScan = __gbTextPreviewScan;
  window.__gbOpenTextPreview = _handleCaseClick;

  setInterval(__gbTextPreviewScan, 1500);

})();