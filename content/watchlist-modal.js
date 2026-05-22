// watchlist-modal.js — in-page watch list overlay (same pattern as charge-modal.js)

function __gbShowWatchListModal() {
  if (document.getElementById('__gb-wl-overlay')) {
    document.getElementById('__gb-wl-overlay').remove();
  }

  // ── Inject styles ──────────────────────────────────────────────────────────
  if (!document.getElementById('__gb-wl-css')) {
    const style = document.createElement('style');
    style.id = '__gb-wl-css';
    style.textContent = `
      @keyframes __gbWlFadeIn  { from{opacity:0} to{opacity:1} }
      @keyframes __gbWlSlideUp { from{opacity:0;transform:translateY(16px) scale(.92)} to{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes __gbWlItemIn  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
      @keyframes __gbWlPulseRed { 0%,100%{opacity:1} 50%{opacity:.48} }
      @keyframes __gbWlShake {
        0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)}
        40%{transform:translateX(5px)}   60%{transform:translateX(-3px)} 80%{transform:translateX(3px)}
      }
      @keyframes __gbWlResolveOut {
        to { opacity:0; transform:translateX(14px); max-height:0; padding:0; margin:0; overflow:hidden; }
      }

      #__gb-wl-overlay {
        position: fixed !important; inset: 0 !important; z-index: 999990 !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        background: rgba(0,0,0,.6) !important;
        backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        animation: __gbWlFadeIn .18s ease !important;
      }

      #__gb-wl-card {
        background: rgba(17,17,17,.85) !important;
        backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255,255,255,.08) !important;
        border-radius: 18px !important;
        width: min(780px, calc(100vw - 24px)) !important;
        max-height: 82vh !important;
        display: flex !important; flex-direction: column !important;
        box-shadow: 0 24px 70px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important;
        animation: __gbWlSlideUp .3s cubic-bezier(.34,1.56,.64,1) !important;
        overflow: hidden !important;
      }

      /* ── Header ── */
      #__gb-wl-hdr {
        background: rgba(0,0,0,.4) !important;
        padding: 14px 20px !important;
        display: flex !important; align-items: center !important; gap: 12px !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important;
        flex-shrink: 0 !important;
      }
      .__gb-wl-hdr-icon {
        width: 32px !important; height: 32px !important; 
        background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
        border-radius: 8px !important;
        display: flex !important; align-items: center !important; justify-content: center !important; 
        flex-shrink: 0 !important;
        color: var(--gb-brand-label, #7db82a) !important;
        border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
      }
      .__gb-wl-hdr-icon svg { width: 16px !important; height: 16px !important; }
      
      .__gb-wl-hdr-text { flex: 1 !important; min-width: 0 !important; display: flex !important; flex-direction: column !important; }
      .__gb-wl-hdr-title { font-size: 14px !important; font-weight: 700 !important; color: #fff !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      .__gb-wl-hdr-sub   { font-size: 11px !important; font-weight: 500 !important; color: rgba(255,255,255,.5) !important; margin-top: 2px !important; }
      
      .__gb-wl-hdr-count {
        font-size: 10.5px !important; font-weight: 800 !important;
        background: rgba(0,0,0,.3) !important;
        color: rgba(255,255,255,.75) !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 6px !important; padding: 4px 10px !important;
        transition: background .25s, color .25s !important;
        flex-shrink: 0 !important;
      }
      .__gb-wl-hdr-count.crit {
        background: rgba(var(--gb-error-rgb, 200,96,96), .15) !important;
        color: var(--gb-error, #c86060) !important;
        border-color: rgba(var(--gb-error-rgb, 200,96,96), .3) !important;
      }

      .__gb-wl-close-btn {
        background: rgba(255,255,255,.05) !important; color: rgba(255,255,255,.8) !important;
        border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
        padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important;
        cursor: pointer !important; white-space: nowrap !important; flex-shrink: 0 !important;
        display: flex !important; align-items: center !important; gap: 6px !important;
        font-family: inherit !important; transition: all .15s !important; margin-left: auto !important;
      }
      .__gb-wl-close-btn:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

      /* ── Legend bar ── */
      .__gb-wl-legend {
        display: flex !important; gap: 12px !important; align-items: center !important;
        padding: 10px 20px !important;
        background: rgba(0,0,0,.2) !important;
        border-bottom: 1px solid rgba(255,255,255,.06) !important;
        flex-shrink: 0 !important;
      }
      .__gb-wl-legend-item {
        display: flex !important; align-items: center !important; gap: 6px !important;
        font-size: 9.5px !important; font-weight: 800 !important; letter-spacing: .5px !important;
        text-transform: uppercase !important; color: rgba(255,255,255,.4) !important;
      }
      .__gb-wl-dot { width: 6px !important; height: 6px !important; border-radius: 50% !important; flex-shrink: 0 !important; }
      .__gb-wl-dot.normal   { background: var(--gb-brand-label, #7db82a) !important; }
      .__gb-wl-dot.moderate { background: var(--gb-warning, #e0a030) !important; }
      .__gb-wl-dot.high     { background: #e07b30 !important; }
      .__gb-wl-dot.critical { background: var(--gb-error, #c86060) !important; }
      .__gb-wl-legend-sep   { flex: 1 !important; height: 1px !important; background: rgba(255,255,255,.06) !important; }

      /* ── Body scroll ── */
      .__gb-wl-body {
        flex: 1 !important; overflow-y: auto !important; overflow-x: hidden !important;
        padding: 16px 20px !important;
        scrollbar-width: thin !important;
        scrollbar-color: rgba(255,255,255,.1) transparent !important;
      }

      /* ── Empty state ── */
      .__gb-wl-empty {
        display: flex !important; flex-direction: column !important; align-items: center !important;
        padding: 40px 20px !important; gap: 12px !important; text-align: center !important;
        color: rgba(255,255,255,.5) !important;
      }
      .__gb-wl-empty-icon {
        width: 44px !important; height: 44px !important;
        background: rgba(255,255,255,.05) !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 12px !important;
        display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 4px !important;
      }
      .__gb-wl-empty-icon svg { width: 20px !important; height: 20px !important; color: rgba(255,255,255,.6) !important; }
      .__gb-wl-empty strong { color: #fff !important; font-size: 14px !important; font-weight: 700 !important; display: block !important; }
      .__gb-wl-empty p { font-size: 13px !important; line-height: 1.6 !important; max-width: 250px !important; margin: 0 !important; }

      /* ── Item card ── */
      .__gb-wl-item {
        background: rgba(0,0,0,.2) !important;
        border: 1px solid rgba(255,255,255,.08) !important;
        border-radius: 12px !important;
        padding: 10px 12px 10px 14px !important;
        margin-bottom: 8px !important;
        animation: __gbWlItemIn .22s ease both !important;
        transition: opacity .22s, transform .22s, border-color .3s, background .3s !important;
        display: flex !important; align-items: center !important; gap: 12px !important;
      }
      .__gb-wl-item:hover {
        background: rgba(255,255,255,.03) !important;
        border-color: rgba(255,255,255,.15) !important;
      }
      .__gb-wl-item:last-child { margin-bottom: 0 !important; }
      .__gb-wl-item.resolving {
        animation: __gbWlResolveOut .25s ease forwards !important;
        pointer-events: none !important;
      }
      .__gb-wl-item.crit-item {
        border-color: rgba(var(--gb-error-rgb, 200,96,96), .3) !important;
        background: rgba(var(--gb-error-rgb, 200,96,96), .05) !important;
      }
      .__gb-wl-item.crit-item:hover {
        background: rgba(var(--gb-error-rgb, 200,96,96), .1) !important;
        border-color: rgba(var(--gb-error-rgb, 200,96,96), .4) !important;
      }

      /* left: order id + reason inline */
      .__gb-wl-left {
        flex: 1 !important; min-width: 0 !important;
        font-size: 13px !important; line-height: 1.5 !important;
        color: rgba(255,255,255,.7) !important;
        word-break: break-word !important;
        display: flex !important; align-items: center !important;
        flex-wrap: wrap !important; gap: 0 8px !important;
      }

      .__gb-wl-order-link {
        font-size: 13px !important; font-weight: 700 !important;
        color: var(--gb-brand-label, #7db82a) !important;
        text-decoration: none !important; letter-spacing: .2px !important;
        cursor: pointer !important; transition: color .15s !important;
        border: none !important; background: none !important;
        padding: 0 !important; font-family: inherit !important;
        flex-shrink: 0 !important;
      }
      .__gb-wl-order-link:hover { color: #fff !important; text-decoration: underline !important; }
      .__gb-wl-order-plain {
        font-size: 13px !important; font-weight: 700 !important;
        color: #fff !important;
        flex-shrink: 0 !important;
      }

      /* right: resolve button only */
      .__gb-wl-right {
        display: flex !important; align-items: center !important;
        flex-shrink: 0 !important;
      }

      .__gb-wl-timer {
        font-size: 10px !important; font-weight: 800 !important; letter-spacing: .5px !important;
        padding: 3px 8px !important; border-radius: 7px !important;
        font-variant-numeric: tabular-nums !important;
        border: 1px solid transparent !important;
        white-space: nowrap !important; flex-shrink: 0 !important;
        transition: color .6s, background .6s, border-color .6s !important;
      }
      .__gb-wl-timer.normal {
        color: var(--gb-brand-text, #d8eeaa) !important;
        background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important;
        border-color: rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
      }
      .__gb-wl-timer.moderate {
        color: #fce8b2 !important;
        background: rgba(224,160,48,.15) !important;
        border-color: rgba(224,160,48,.3) !important;
      }
      .__gb-wl-timer.high {
        color: #fcdab2 !important;
        background: rgba(224,123,48,.15) !important;
        border-color: rgba(224,123,48,.3) !important;
      }
      .__gb-wl-timer.critical {
        color: #fdd !important;
        background: rgba(var(--gb-error-rgb, 200,96,96), .15) !important;
        border-color: rgba(var(--gb-error-rgb, 200,96,96), .3) !important;
        animation: __gbWlPulseRed 1.9s ease-in-out infinite !important;
      }

      .__gb-wl-resolve {
        background: transparent !important;
        color: rgba(255,255,255,.35) !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 6px !important; padding: 5px 10px !important;
        font-size: 11px !important; font-weight: 600 !important; cursor: pointer !important;
        display: inline-flex !important; align-items: center !important; gap: 5px !important;
        font-family: inherit !important; white-space: nowrap !important;
        transition: background .15s, border-color .15s, color .15s !important;
      }
      .__gb-wl-resolve:hover {
        background: rgba(255,255,255,.06) !important;
        border-color: rgba(255,255,255,.22) !important;
        color: rgba(255,255,255,.75) !important;
      }
      .__gb-wl-resolve:active { transform: scale(.97) !important; }
      .__gb-wl-resolve svg { width: 11px !important; height: 11px !important; }

      .__gb-wl-reason-inline {
        font-size: 13px !important; font-weight: 500 !important;
        color: rgba(255,255,255,.5) !important;
      }

      /* ── Entity type badge ── */
      .__gb-wl-type-badge {
        font-size: 9px !important; font-weight: 800 !important;
        letter-spacing: .6px !important; text-transform: uppercase !important;
        padding: 2px 6px !important; border-radius: 4px !important;
        flex-shrink: 0 !important; line-height: 1.4 !important;
        border: 1px solid transparent !important;
      }
      .__gb-wl-type-badge.type-order {
        background: rgba(125,184,42, .12) !important;
        color: var(--gb-brand-label, #7db82a) !important;
        border-color: rgba(125,184,42, .3) !important;
      }
      .__gb-wl-type-badge.type-contact {
        background: rgba(96,150,200, .12) !important;
        color: #60a0d8 !important;
        border-color: rgba(96,150,200, .3) !important;
      }
      .__gb-wl-type-badge.type-account {
        background: rgba(180,120,220, .12) !important;
        color: #b87cdc !important;
        border-color: rgba(180,120,220, .3) !important;
      }

      /* ── Bottom bar ── */
      .__gb-wl-bar {
        padding: 12px 20px !important;
        border-top: 1px solid rgba(255,255,255,.06) !important;
        display: flex !important; align-items: center !important; gap: 10px !important;
        flex-shrink: 0 !important;
        background: rgba(0,0,0,.3) !important;
      }
      .__gb-wl-bar-hint {
        flex: 1 !important; font-size: 11px !important; font-weight: 500 !important;
        color: rgba(255,255,255,.4) !important;
        display: flex !important; align-items: center !important; gap: 6px !important;
      }
      .__gb-wl-bar-hint svg { width: 12px !important; height: 12px !important; flex-shrink: 0 !important; }
      
      .__gb-wl-clear {
        background: transparent !important; color: rgba(255,255,255,.5) !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 6px !important; padding: 6px 14px !important;
        font-size: 11.5px !important; font-weight: 600 !important; cursor: pointer !important;
        font-family: inherit !important;
        transition: background .15s, color .15s, border-color .15s !important;
      }
      .__gb-wl-clear:hover {
        background: rgba(var(--gb-error-rgb, 200,96,96), .15) !important;
        color: var(--gb-error, #c86060) !important;
        border-color: rgba(var(--gb-error-rgb, 200,96,96), .3) !important;
      }
      .__gb-wl-clear.hidden { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getTimerInfo(addedAt) {
    const ms = Date.now() - addedAt;
    const s  = Math.floor(ms / 1000);
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    const text = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sc}s` : `${sc}s`;
    const urgency = ms >= 6*3600000 ? 'critical' : ms >= 4*3600000 ? 'high' : ms >= 3600000 ? 'moderate' : 'normal';
    return { text, urgency };
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtDate(ts) {
    const d = new Date(ts), now = new Date();
    const t = d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
    return d.toDateString() === now.toDateString()
      ? `Today ${t}`
      : `${d.toLocaleDateString([], { month:'short', day:'numeric' })} ${t}`;
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.id = '__gb-wl-overlay';

  overlay.innerHTML = `
    <div id="__gb-wl-card">
      <div id="__gb-wl-hdr">
        <div class="__gb-wl-hdr-icon">
          <svg fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="__gb-wl-hdr-text">
          <div class="__gb-wl-hdr-title">Watch List</div>
          <div class="__gb-wl-hdr-sub">Orders, contacts &amp; accounts needing follow‑up</div>
        </div>
        <span id="__gb-wl-count" class="__gb-wl-hdr-count">0 orders</span>
        <button class="__gb-wl-close-btn" id="__gb-wl-close">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>

      <div class="__gb-wl-legend">
        <div class="__gb-wl-legend-item"><span class="__gb-wl-dot normal"></span>&lt;1 hour</div>
        <div class="__gb-wl-legend-item"><span class="__gb-wl-dot moderate"></span>1-4 hours</div>
        <div class="__gb-wl-legend-item"><span class="__gb-wl-dot high"></span>4-6 hours</div>
        <div class="__gb-wl-legend-item"><span class="__gb-wl-dot critical"></span>6+ hours</div>
        <div class="__gb-wl-legend-sep"></div>
      </div>

      <div class="__gb-wl-body" id="__gb-wl-body"></div>

      <div class="__gb-wl-bar">
        <div class="__gb-wl-bar-hint">
          <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Sorted oldest first
        </div>
        <button class="__gb-wl-clear hidden" id="__gb-wl-clear">Clear all</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // ── Render items ───────────────────────────────────────────────────────────

  let watchList = [];
  let timerInterval = null;

  function renderItems() {
    const body      = document.getElementById('__gb-wl-body');
    const countEl   = document.getElementById('__gb-wl-count');
    const clearBtn  = document.getElementById('__gb-wl-clear');
    if (!body) return;

    const count   = watchList.length;
    const hasCrit = watchList.some(i => (Date.now() - i.addedAt) >= 6*3600000);

    countEl.textContent = count === 0 ? 'Empty' : count === 1 ? '1 item' : `${count} items`;
    countEl.classList.toggle('crit', hasCrit);
    clearBtn.classList.toggle('hidden', count === 0);

    if (count === 0) {
      body.innerHTML = `
        <div class="__gb-wl-empty">
          <div class="__gb-wl-empty-icon">
            <svg fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </div>
          <div>
            <strong>Nothing on the watch list</strong>
            <p>Use <em>Watch Order</em>, <em>Watch Contact</em>, or <em>Watch Account</em> in the extension popup to flag items that need follow‑up.</p>
          </div>
        </div>`;
      stopTimers();
      return;
    }

    const sorted = [...watchList].sort((a, b) => a.addedAt - b.addedAt);

    // Helpers for entity-aware link and badge building
    function buildEntityLink(item) {
      const type = item.entityType || 'order';
      const id   = item.orderId || '';

      // Prefer stored URL; for older entries without entityType, fall back to orderUrl
      let url = item.orderUrl || '';
      if (!url && id) {
        if (type === 'contact') url = `https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=${id}`;
        else if (type === 'account') url = `https://api.golfballs.com/golfballs/adminNew/default.aspx?Page=271&accountID=${id}`;
      }

      let label = 'Item';
      if (type === 'order')   label = id ? `#${id}` : 'Order';
      if (type === 'contact') label = id ? `Contact ${id}` : 'Contact';
      if (type === 'account') label = id ? `Account ${id}` : 'Account';

      if (url) return `<a class="__gb-wl-order-link" href="${url}" target="_blank">${escHtml(label)}</a>`;
      return `<span class="__gb-wl-order-plain">${escHtml(label)}</span>`;
    }

    function buildTypeBadge(item) {
      const type = item.entityType || 'order';
      const labels = { order: 'Order', contact: 'Contact', account: 'Account' };
      return `<span class="__gb-wl-type-badge type-${type}">${labels[type] || 'Order'}</span>`;
    }

    body.innerHTML = sorted.map((item, idx) => {
      const { text, urgency } = getTimerInfo(item.addedAt);
      const isCrit  = urgency === 'critical';
      const idHtml  = buildEntityLink(item);
      const badgeHtml = buildTypeBadge(item);

      return `
        <div class="__gb-wl-item${isCrit ? ' crit-item' : ''}"
             data-id="${item.id}"
             style="animation-delay:${idx * 0.045}s">
          <div class="__gb-wl-left">
            <span class="__gb-wl-timer ${urgency}"
                  id="__gb-wl-t-${item.id}"
                  data-urgency="${urgency}">${escHtml(text)}</span>
            ${badgeHtml}${idHtml}<span class="__gb-wl-reason-inline">${escHtml(item.reason)}</span>
          </div>
          <div class="__gb-wl-right">
            <button class="__gb-wl-resolve" data-id="${item.id}">
              <svg fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Resolve
            </button>
          </div>
        </div>`;
    }).join('');

    body.querySelectorAll('.__gb-wl-resolve').forEach(btn => {
      btn.addEventListener('click', () => resolveItem(btn.dataset.id));
    });

    startTimers();
  }

  // ── Resolve ────────────────────────────────────────────────────────────────

  function resolveItem(id) {
    const el = document.querySelector(`.__gb-wl-item[data-id="${id}"]`);
    if (el) el.classList.add('resolving');
    setTimeout(() => {
      watchList = watchList.filter(i => i.id !== id);
      chrome.storage.local.set({ watchList });
      renderItems();
    }, 270);
  }

  // ── Clear all (two-tap confirm) ────────────────────────────────────────────

  const clearBtn = document.getElementById('__gb-wl-clear');
  clearBtn.addEventListener('click', () => {
    if (clearBtn.dataset.confirm !== '1') {
      clearBtn.textContent = 'Confirm clear all';
      clearBtn.style.cssText += 'color: var(--gb-error, #c86060) !important; border-color: rgba(var(--gb-error-rgb, 200,96,96), .4) !important; background: rgba(var(--gb-error-rgb, 200,96,96), .15) !important;';
      clearBtn.dataset.confirm = '1';
      setTimeout(() => {
        if (clearBtn.dataset.confirm === '1') {
          clearBtn.textContent = 'Clear all';
          clearBtn.style.color = '';
          clearBtn.style.borderColor = '';
          clearBtn.style.background = '';
          clearBtn.dataset.confirm = '';
        }
      }, 2500);
      return;
    }
    watchList = [];
    chrome.storage.local.set({ watchList });
    renderItems();
  });

  // ── Live timers ────────────────────────────────────────────────────────────

  function tickTimers() {
    watchList.forEach(item => {
      const el = document.getElementById(`__gb-wl-t-${item.id}`);
      if (!el) return;
      const { text, urgency } = getTimerInfo(item.addedAt);
      if (el.textContent !== text) el.textContent = text;
      const prev = el.dataset.urgency || '';
      if (prev !== urgency) {
        el.className = `__gb-wl-timer ${urgency}`;
        el.dataset.urgency = urgency;
        const card = document.querySelector(`.__gb-wl-item[data-id="${item.id}"]`);
        if (card) card.classList.toggle('crit-item', urgency === 'critical');
      }
    });
    // Keep header count badge in sync
    const hasCrit = watchList.some(i => (Date.now() - i.addedAt) >= 6*3600000);
    const countEl = document.getElementById('__gb-wl-count');
    if (countEl) countEl.classList.toggle('crit', hasCrit && watchList.length > 0);
  }

  function startTimers() { stopTimers(); timerInterval = setInterval(tickTimers, 1000); }
  function stopTimers()  { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }

  // ── Close ──────────────────────────────────────────────────────────────────

  function closeModal() {
    stopTimers();
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .18s ease';
    setTimeout(() => overlay.remove(), 200);
  }

  document.getElementById('__gb-wl-close').addEventListener('click', closeModal);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
  });

  // ── Load & render ──────────────────────────────────────────────────────────

  chrome.storage.local.get('watchList', data => {
    watchList = data.watchList || [];
    renderItems();
  });

  // Live-sync if storage changes while modal is open
  chrome.storage.onChanged.addListener(function onWlChange(changes, area) {
    if (area === 'local' && changes.watchList) {
      watchList = changes.watchList.newValue || [];
      if (document.getElementById('__gb-wl-overlay')) renderItems();
      else chrome.storage.onChanged.removeListener(onWlChange);
    }
  });
}