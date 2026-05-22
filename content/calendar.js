// calendar.js — full-screen calendar modal + auto-push notification UI
// ALL postback HTTP calls remain in iframe/calendar-bridge.js (correct session cookies).
// This file only:
//   1. Renders the flatpickr UI in the parent page
//   2. Relays GB_CALENDAR_SAVE down to the iframe
//   3. Receives GB_CALENDAR_STEP / GB_CALENDAR_DONE / GB_CALENDAR_ERROR from iframe
//   4. Runs the auto-push notification bar (progress only, postbacks done by iframe)

// ── Inject styles ──────────────────────────────────────────────────────────────
/**
 * Injects the full-screen calendar overlay stylesheet and keyframe animations
 * into the document head. Idempotent.
 */
function __gbInjectCalendarStyles() {
  if (document.getElementById('__gb-cal-css')) return;
  const s = document.createElement('style');
  s.id = '__gb-cal-css';
  s.textContent = `
    @keyframes __gbCalFadeIn  { from{opacity:0}to{opacity:1} }
    @keyframes __gbCalSlideUp { from{opacity:0;transform:translateX(-50%) scale(.95) translateY(10px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)} }
    @keyframes __gbCalSpin    { to{transform:rotate(360deg)} }
    @keyframes __gbCalPop        { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
    @keyframes __gbCalCheckDraw  { to { stroke-dashoffset: 0; } }

    /* ── Modal overlay ── */
    #__gb-fs-calendar {
      position: fixed !important; inset: 0 !important; z-index: 999990 !important;
      background: rgba(0,0,0,.6) !important; 
      backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
      animation: __gbCalFadeIn .18s ease !important;
    }

    /* ── Modal card ── */
    #__gb-fs-card {
      position: absolute !important;
      left: 50% !important; top: 50% !important;
      transform: translate(-50%, -50%) !important;
      background: rgba(17,17,17,.85) !important;
      backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
      border: 1px solid rgba(255,255,255,.08) !important;
      border-radius: 18px !important; width: min(600px, 94vw) !important;
      overflow: hidden !important;
      box-shadow: 0 24px 70px rgba(0,0,0,.9), inset 0 0 0 1px rgba(255,255,255,.03) !important;
      animation: __gbCalSlideUp .3s cubic-bezier(.34,1.56,.64,1) !important;
    }

    /* ── Header ── */
    #__gb-fs-hdr {
      background: rgba(0,0,0,.4) !important; padding: 14px 20px !important;
      display: flex !important; justify-content: space-between !important; align-items: center !important;
      border-bottom: 1px solid rgba(255,255,255,.06) !important;
    }
    #__gb-fs-hdr-icon {
      width: 32px !important; height: 32px !important;
      background: rgba(var(--gb-brand-label-rgb, 125,184,42), .15) !important; 
      border-radius: 8px !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      flex-shrink: 0 !important;
      color: var(--gb-brand-label, #7db82a) !important;
      border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .3) !important;
    }
    #__gb-fs-hdr-icon svg { width: 16px !important; height: 16px !important; display: block !important; }
    #__gb-fs-hdr-text { flex: 1 !important; padding: 0 12px !important; }
    #__gb-fs-hdr-title { color: var(--gb-text-primary, #fff) !important; font-weight: 700 !important; font-size: 14px !important; letter-spacing: .3px !important; }
    #__gb-fs-hdr-sub   { color: rgba(255,255,255,.5) !important; font-size: 11px !important; margin-top: 2px !important; font-weight: 500 !important; }
    #__gb-fs-close {
      background: rgba(255,255,255,.05) !important; color: rgba(255,255,255,.8) !important;
      border: 1px solid rgba(255,255,255,.1) !important; border-radius: 7px !important;
      padding: 6px 12px !important; font-size: 11px !important; font-weight: 600 !important;
      cursor: pointer !important; display: flex !important; align-items: center !important;
      gap: 6px !important; flex-shrink: 0 !important; transition: all .15s !important;
      font-family: inherit !important;
    }
    #__gb-fs-close:hover { background: rgba(255,255,255,.12) !important; color: #fff !important; }

    /* ── Body ── */
    #__gb-fs-body {
      padding: 28px !important; display: grid !important;
      grid-template-columns: 1fr 1fr !important; gap: 24px !important;
    }
    .gb-fs-cal-group {
      display: flex !important; flex-direction: column !important;
      align-items: center !important; gap: 10px !important;
    }
    .gb-fs-cal-label {
      color: rgba(255,255,255,.5) !important; font-size: 10px !important;
      font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: .8px !important;
    }

    /* ── Footer ── */
    #__gb-fs-footer {
      padding: 14px 20px !important; background: rgba(0,0,0,.3) !important;
      border-top: 1px solid rgba(255,255,255,.06) !important;
      display: flex !important; justify-content: flex-end !important; gap: 10px !important;
    }
    #__gb-fs-save {
      background: var(--gb-brand-dark, #5f7d18) !important; color: var(--gb-brand-text, #d8eeaa) !important;
      border: 1px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important; border-radius: 6px !important;
      padding: 8px 24px !important; font-size: 12px !important; font-weight: 600 !important;
      cursor: pointer !important; transition: all .15s !important; display: flex !important; align-items: center !important; gap: 6px !important;
      font-family: inherit !important;
    }
    #__gb-fs-save:hover:not(:disabled) { 
      background: var(--gb-brand, #6e901d) !important; border-color: var(--gb-brand-label, #7db82a) !important; color: #fff !important; 
    }
    #__gb-fs-save:disabled { opacity: .5 !important; cursor: not-allowed !important; pointer-events: none !important; }

    /* ── Progress view ── */
    .gb-fs-progress {
      grid-column: 1/-1 !important; display: flex !important; flex-direction: column !important;
      align-items: center !important; gap: 12px !important; padding: 8px 0 !important;
    }
    .gb-fs-spinner {
      width: 26px !important; height: 26px !important;
      border: 3px solid rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
      border-top-color: var(--gb-brand-label, #7db82a) !important;
      border-radius: 50% !important; animation: __gbCalSpin .8s linear infinite !important;
    }
    #__gb-fs-status { color: var(--gb-brand-label, #7db82a) !important; font-size: 13px !important; font-weight: 600 !important; }
    .gb-fs-steps { display: flex !important; flex-direction: column !important; gap: 4px !important; }
    .gb-fs-step  {
      font-size: 11px !important; display: flex !important; gap: 6px !important;
      align-items: center !important; color: rgba(255,255,255,.3) !important;
      transition: color .2s !important;
    }
    .gb-fs-step.active { color: #fff !important; }
    .gb-fs-step.done   { color: var(--gb-brand-label, #7db82a) !important; }
    .gb-fs-step-dot {
      width: 6px !important; height: 6px !important; border-radius: 50% !important;
      background: currentColor !important; flex-shrink: 0 !important;
    }

    /* ── Scoped dark flatpickr ── */
    #__gb-fs-calendar .flatpickr-calendar {
      opacity: 0 !important; display: none !important; visibility: hidden !important;
      background: transparent !important; border: 0 !important; box-shadow: none !important;
      border-radius: 0 !important; width: 230px !important; box-sizing: border-box !important;
      font-size: 14px !important; line-height: 24px !important;
    }
    #__gb-fs-calendar .flatpickr-calendar.open,
    #__gb-fs-calendar .flatpickr-calendar.inline {
      opacity: 1 !important; visibility: visible !important; max-height: 640px !important;
    }
    #__gb-fs-calendar .flatpickr-calendar.inline {
      display: block !important; position: relative !important; top: 0 !important;
      width: 230px !important;
    }
    #__gb-fs-calendar .flatpickr-months { display: flex !important; background: transparent !important; }
    #__gb-fs-calendar .flatpickr-months .flatpickr-month {
      background: transparent !important; color: var(--gb-text-primary, #fff) !important; fill: var(--gb-text-primary, #fff) !important;
      height: 34px !important; line-height: 1 !important; text-align: center !important;
      position: relative !important; overflow: hidden !important; flex: 1 !important;
    }
    #__gb-fs-calendar .flatpickr-months .flatpickr-prev-month,
    #__gb-fs-calendar .flatpickr-months .flatpickr-next-month {
      cursor: pointer !important; position: absolute !important; top: 0 !important;
      height: 34px !important; padding: 10px !important; z-index: 3 !important;
      color: rgba(255,255,255,.5) !important; fill: rgba(255,255,255,.5) !important;
      transition: all .15s !important;
    }
    #__gb-fs-calendar .flatpickr-months .flatpickr-prev-month:hover,
    #__gb-fs-calendar .flatpickr-months .flatpickr-next-month:hover {
      color: #fff !important; fill: #fff !important;
    }
    #__gb-fs-calendar .flatpickr-current-month {
      font-size: 113% !important; font-weight: 700 !important; color: var(--gb-text-primary, #fff) !important;
      position: absolute !important; width: 86% !important; left: 7% !important;
      height: 34px !important; top: 0 !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      gap: 4px !important; padding: 0 !important;
      white-space: nowrap !important; overflow: visible !important;
    }
    #__gb-fs-calendar .flatpickr-current-month span.cur-month {
      font-weight: 700 !important; color: var(--gb-text-primary, #fff) !important; line-height: 1 !important;
    }
    #__gb-fs-calendar .flatpickr-current-month .numInputWrapper {
      width: 7ch !important; display: flex !important;
      align-items: center !important; flex-shrink: 0 !important;
    }
    #__gb-fs-calendar .flatpickr-current-month input.cur-year {
      background: transparent !important; color: var(--gb-text-primary, #fff) !important;
      border: 0 !important; font-size: inherit !important; font-weight: 700 !important;
      width: 7ch !important; padding: 0 !important; margin: 0 !important;
      line-height: 1 !important; display: block !important;
    }
    #__gb-fs-calendar .flatpickr-weekdays {
      background: transparent !important; width: 230px !important;
      display: flex !important; align-items: center !important; height: 28px !important;
      overflow: hidden !important;
    }
    #__gb-fs-calendar .flatpickr-weekdays .flatpickr-weekdaycontainer {
      display: flex !important; flex: 1 !important;
    }
    #__gb-fs-calendar span.flatpickr-weekday {
      background: transparent !important; color: rgba(255,255,255,.4) !important;
      font-weight: 800 !important; font-size: 9px !important;
      display: block !important; flex: 1 !important; text-align: center !important;
    }
    #__gb-fs-calendar .flatpickr-days {
      position: relative !important; overflow: hidden !important; display: flex !important;
      align-items: flex-start !important; width: 230px !important;
    }
    #__gb-fs-calendar .dayContainer {
      padding: 0 !important; outline: 0 !important; width: 230px !important;
      min-width: 230px !important; max-width: 230px !important;
      box-sizing: border-box !important; display: flex !important;
      flex-wrap: wrap !important; justify-content: space-around !important; opacity: 1 !important;
    }
    #__gb-fs-calendar .flatpickr-day {
      background: none !important; border: 1px solid transparent !important;
      border-radius: 6px !important; box-sizing: border-box !important;
      color: rgba(255,255,255,.85) !important; cursor: pointer !important;
      width: 14.2857143% !important; flex-basis: 14.2857143% !important;
      max-width: 32px !important; height: 32px !important; line-height: 32px !important;
      margin: 0 !important; display: inline-block !important;
      text-align: center !important; font-size: 13px !important; transition: all .15s !important;
    }
    #__gb-fs-calendar .flatpickr-day:hover { 
      background: rgba(255,255,255,.08) !important; border-color: rgba(255,255,255,.15) !important; color: #fff !important; 
    }
    #__gb-fs-calendar .flatpickr-day.today { 
      color: var(--gb-brand-label, #7db82a) !important; font-weight: 800 !important; border-color: transparent !important; 
    }
    #__gb-fs-calendar .flatpickr-day.selected,
    #__gb-fs-calendar .flatpickr-day.selected:hover {
      background: rgba(var(--gb-brand-label-rgb, 125,184,42), .2) !important; 
      border-color: var(--gb-brand-label, #7db82a) !important;
      color: var(--gb-brand-label, #7db82a) !important; 
      box-shadow: 0 0 10px rgba(var(--gb-brand-label-rgb, 125,184,42), .4) !important;
      font-weight: 700 !important;
    }
    #__gb-fs-calendar .flatpickr-day.prevMonthDay,
    #__gb-fs-calendar .flatpickr-day.nextMonthDay { color: rgba(255,255,255,.15) !important; }
    #__gb-fs-calendar .flatpickr-day.flatpickr-disabled { color: rgba(255,255,255,.1) !important; cursor: not-allowed !important; }
    #__gb-fs-calendar .flatpickr-innerContainer { display: flex !important; overflow: hidden !important; }
    #__gb-fs-calendar .flatpickr-rContainer { display: inline-block !important; padding: 0 !important; }
    #__gb-fs-calendar .numInputWrapper { position: relative !important; height: auto !important; }
    #__gb-fs-calendar .numInputWrapper input { width: 100% !important; }
    #__gb-fs-calendar .numInputWrapper span { opacity: 0 !important; }
  `;
  document.head.appendChild(s);
}
__gbInjectCalendarStyles();

// ── Send GB_CALENDAR_SAVE to iframe via background broadcast ──────────────────
// Direct iframe.contentWindow.postMessage is blocked cross-origin in MV3.
// Instead: content script → background → chrome.tabs.sendMessage(allFrames) → iframe.
/**
 * Posts a message to the admin.icustomize.com iframe so the calendar-bridge
 * script inside it can initiate server postbacks.
 * @param {object} msg - The message payload to post.
 */
function __gbPostToIframe(msg) {
  chrome.runtime.sendMessage({ action: 'broadcastToFrames', payload: msg }, (r) => {
    if (chrome.runtime.lastError) {
      console.error('[GB] broadcastToFrames error:', chrome.runtime.lastError.message);
      if (msg.action === 'GB_CALENDAR_SAVE' && window.__gbActiveCalendar) {
        window.__gbActiveCalendar.onError('Could not reach background script. Try reloading.');
        window.__gbActiveCalendar = null;
      }
    }
  });
}

// ── Full-screen calendar modal ─────────────────────────────────────────────────
/**
 * Opens the full-screen date-picker overlay on the order page. Accepts
 * calendar state data from the iframe (current approval/commitment dates)
 * and wires the Save button to trigger the postback chain via the iframe.
 * @param {{orderID:string, calendarUrl:string, defaultApproval:string|null, defaultCommitment:string|null}} data - Calendar initialisation data.
 */
function openFullScreenCalendar(data) {
  const { orderID, defaultApproval, defaultCommitment, calendarUrl } = data;

  document.getElementById('__gb-fs-calendar')?.remove(); // instant — replaced immediately

  const overlay = document.createElement('div');
  overlay.id = '__gb-fs-calendar';

  overlay.innerHTML = `
    <div id="__gb-fs-card">
      <div id="__gb-fs-hdr">
        <div id="__gb-fs-hdr-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="3"/>
            <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        </div>
        <div id="__gb-fs-hdr-text">
          <div id="__gb-fs-hdr-title">Order Date Manager</div>
          <div id="__gb-fs-hdr-sub">Order #${orderID}</div>
        </div>
        <button id="__gb-fs-close">
          <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Close
        </button>
      </div>

      <div id="__gb-fs-body">
        <div class="gb-fs-cal-group">
          <div class="gb-fs-cal-label">Approval Date</div>
          <div id="fs-approval-cal"></div>
        </div>
        <div class="gb-fs-cal-group">
          <div class="gb-fs-cal-label">Commitment Date</div>
          <div id="fs-commitment-cal"></div>
        </div>
      </div>

      <div id="__gb-fs-footer">
        <button id="__gb-fs-save">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Update Dates
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const fpCfg = { inline: true, dateFormat: 'm/d/Y', static: true, monthSelectorType: 'static' };
  const appFp = flatpickr(overlay.querySelector('#fs-approval-cal'),   { ...fpCfg, defaultDate: defaultApproval   || undefined });
  const comFp = flatpickr(overlay.querySelector('#fs-commitment-cal'), { ...fpCfg, defaultDate: defaultCommitment || undefined });

  overlay.querySelector('#__gb-fs-close').onclick = () => { window.__gbActiveCalendar = null; __gbCloseModal(overlay); };
  overlay.addEventListener('click', e => { if (e.target === overlay) { window.__gbActiveCalendar = null; __gbCloseModal(overlay); } });

  overlay.querySelector('#__gb-fs-save').onclick = () => {
    const approvalDate   = appFp.selectedDates[0];
    const commitmentDate = comFp.selectedDates[0];
    if (!approvalDate || !commitmentDate) {
      showGbNotification('Please select both dates before saving.', 'error', 3500);
      return;
    }

    const btnSave = overlay.querySelector('#__gb-fs-save');
    const bodyEl  = overlay.querySelector('#__gb-fs-body');
    btnSave.disabled = true;

    // ── Dev mode: simulate the full success flow without hitting the server ──
    if (!calendarUrl) {
      bodyEl.innerHTML = `
        <div class="gb-fs-progress">
          <div class="gb-fs-spinner"></div>
          <span id="__gb-fs-status">Dev mode — simulating…</span>
          <div class="gb-fs-steps">
            <div class="gb-fs-step" id="__gb-fs-s1"><span class="gb-fs-step-dot"></span>Selecting approval date</div>
            <div class="gb-fs-step" id="__gb-fs-s2"><span class="gb-fs-step-dot"></span>Selecting commitment date</div>
            <div class="gb-fs-step" id="__gb-fs-s3"><span class="gb-fs-step-dot"></span>Saving to server</div>
          </div>
        </div>`;
      let step = 1;
      const fakeStep = setInterval(() => {
        const si = bodyEl.querySelector('#__gb-fs-s' + step);
        if (si) si.className = 'gb-fs-step active';
        if (step > 1) { const prev = bodyEl.querySelector('#__gb-fs-s' + (step-1)); if (prev) prev.className = 'gb-fs-step done'; }
        step++;
        if (step > 3) {
          clearInterval(fakeStep);
          const prev = bodyEl.querySelector('#__gb-fs-s3'); if (prev) prev.className = 'gb-fs-step done';
          setTimeout(() => {
            bodyEl.innerHTML = `
              <div class="gb-fs-progress">
                <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;animation:__gbCalPop .45s cubic-bezier(.34,1.56,.64,1) both;overflow:visible;">
                  <circle cx="24" cy="24" r="22" fill="rgba(var(--gb-brand-label-rgb, 125,184,42),.15)" stroke="var(--gb-brand-label, #7db82a)" stroke-width="2"/>
                  <path d="M14 24.5l7 7 13-14" stroke="var(--gb-brand-label, #7db82a)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"
                    stroke-dasharray="28" stroke-dashoffset="28"
                    style="animation:__gbCalCheckDraw .35s .25s cubic-bezier(.4,0,.2,1) forwards;"/>
                </svg>
                <div style="color:var(--gb-text-primary, #fff) !important;font-size:14px !important;font-weight:700 !important;margin-top:8px;">[DEV] Dates simulated successfully</div>
                <div style="color:rgba(255,255,255,.5) !important;font-size:11.5px !important;margin-top:4px;">
                  <span style="color:var(--gb-brand-label, #7db82a) !important;font-weight:600;">Approval:</span> ${appFp.formatDate(approvalDate,'M j, Y')}
                  &nbsp;&nbsp;·&nbsp;&nbsp;
                  <span style="color:var(--gb-brand-label, #7db82a) !important;font-weight:600;">Commitment:</span> ${comFp.formatDate(commitmentDate,'M j, Y')}
                </div>
              </div>`;
            btnSave.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"><path d="M2 8l4 4 8-8"/></svg>Done`;
            setTimeout(() => __gbCloseModal(overlay, 300), 1600);
          }, 400);
        }
      }, 550);
      return;
    }

    // Switch to progress view
    bodyEl.innerHTML = `
      <div class="gb-fs-progress">
        <div class="gb-fs-spinner"></div>
        <span id="__gb-fs-status">Sending to server…</span>
        <div class="gb-fs-steps">
          <div class="gb-fs-step" id="__gb-fs-s1"><span class="gb-fs-step-dot"></span>Selecting approval date</div>
          <div class="gb-fs-step" id="__gb-fs-s2"><span class="gb-fs-step-dot"></span>Selecting commitment date</div>
          <div class="gb-fs-step" id="__gb-fs-s3"><span class="gb-fs-step-dot"></span>Saving to server</div>
        </div>
      </div>`;

    // ── Register callbacks in the shared module-level object ──────────────────
    // main.js's persistent listener will call these when it receives step messages.
    window.__gbActiveCalendar = {
      onStep: (step, label) => {
        for (let i = 1; i <= 3; i++) {
          const si = bodyEl.querySelector('#__gb-fs-s' + i);
          if (si) si.className = 'gb-fs-step' + (i < step ? ' done' : i === step ? ' active' : '');
        }
        const st = bodyEl.querySelector('#__gb-fs-status');
        if (st && label) st.textContent = label;
      },
      onDone: () => {
        window.__gbActiveCalendar = null;
        bodyEl.innerHTML = `
          <div class="gb-fs-progress">
            <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;animation:__gbCalPop .45s cubic-bezier(.34,1.56,.64,1) both;overflow:visible;">
              <circle cx="24" cy="24" r="22" fill="rgba(var(--gb-brand-label-rgb, 125,184,42),.15)" stroke="var(--gb-brand-label, #7db82a)" stroke-width="2"/>
              <path d="M14 24.5l7 7 13-14" stroke="var(--gb-brand-label, #7db82a)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"
                stroke-dasharray="28" stroke-dashoffset="28"
                style="animation:__gbCalCheckDraw .35s .25s cubic-bezier(.4,0,.2,1) forwards;"/>
            </svg>
            <div style="color:var(--gb-text-primary, #fff) !important;font-size:14px !important;font-weight:700 !important;margin-top:8px;">Dates updated successfully</div>
            <div style="color:rgba(255,255,255,.5) !important;font-size:11.5px !important;margin-top:4px;">
              <span style="color:var(--gb-brand-label, #7db82a) !important;font-weight:600;">Approval:</span> ${appFp.formatDate(approvalDate,'M j, Y')}
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <span style="color:var(--gb-brand-label, #7db82a) !important;font-weight:600;">Commitment:</span> ${comFp.formatDate(commitmentDate,'M j, Y')}
            </div>
          </div>`;
        btnSave.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"><path d="M2 8l4 4 8-8"/></svg>Done`;
        setTimeout(() => __gbCloseModal(overlay, 300), 1600);
      },
      onError: (error) => {
        window.__gbActiveCalendar = null;
        bodyEl.innerHTML = `
          <div class="gb-fs-progress">
            <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;animation:__gbCalPop .4s cubic-bezier(.34,1.56,.64,1) both;overflow:visible;">
              <circle cx="24" cy="24" r="22" fill="rgba(var(--gb-error-rgb, 200,96,96),.15)" stroke="var(--gb-error, #c86060)" stroke-width="2"/>
              <line x1="15" y1="15" x2="33" y2="33" stroke="var(--gb-error, #c86060)" stroke-width="2.8" stroke-linecap="round"
                stroke-dasharray="25" stroke-dashoffset="25"
                style="animation:__gbCalCheckDraw .25s .2s linear forwards;"/>
              <line x1="33" y1="15" x2="15" y2="33" stroke="var(--gb-error, #c86060)" stroke-width="2.8" stroke-linecap="round"
                stroke-dasharray="25" stroke-dashoffset="25"
                style="animation:__gbCalCheckDraw .25s .35s linear forwards;"/>
            </svg>
            <strong style="color:var(--gb-error, #c86060) !important;font-size:14px !important;margin-top:8px;">Update Failed</strong>
            <span style="font-size:11.5px !important;color:rgba(255,255,255,.5) !important;margin-top:4px;">${error || 'Unknown error'}</span>
          </div>`;
        btnSave.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;"><path d="M3 3l10 10M13 3L3 13"/></svg>Retry`;
        btnSave.disabled = false;
      }
    };

    // ── Send save request DOWN to iframe — ALL postbacks happen there ──
    __gbPostToIframe({
      action:           'GB_CALENDAR_SAVE',
      calendarUrl,
      approvalOffset:   String(Math.round((Date.UTC(approvalDate.getFullYear(), approvalDate.getMonth(), approvalDate.getDate()) - Date.UTC(2000,0,1)) / 86400000)),
      commitmentOffset: String(Math.round((Date.UTC(commitmentDate.getFullYear(), commitmentDate.getMonth(), commitmentDate.getDate()) - Date.UTC(2000,0,1)) / 86400000))
    });
  };
}

// ── Auto-push notification (uses shared showGbNotification) ──────────────────
/**
 * Shows a loading toast for the auto-push flow and updates it via message
 * events from the iframe. Delegates entirely to showGbNotification().
 */
function openAutoPushNotification(data) {
  const { daysOut } = data;
  const totalSteps = data.commitmentOffset !== null ? 3 : 2;

  const handle = showGbNotification(
    `Auto Date Push — ${daysOut} day${daysOut !== 1 ? 's' : ''} out`,
    'loading',
    0
  );

  const handler = (event) => {
    const d = event.data;
    if (!d) return;

    if (d.action === 'GB_AUTO_PUSH_STEP') {
      if (d.label) handle.update(d.label);
      if (d.step != null) handle.setProgress(Math.round((d.step / totalSteps) * 100));
    }
    if (d.action === 'GB_DATES_PUSHED') {
      window.removeEventListener('message', handler);
      handle.update('Dates saved — submitting note…', 'success');
      handle.setProgress(100);
      handle.dismiss(2500);
    }
    if (d.action === 'GB_AUTO_PUSH_ERROR') {
      window.removeEventListener('message', handler);
      handle.update('✗ ' + (d.error || 'Failed').slice(0, 55), 'error');
      handle.setProgress(100);
      handle.dismiss(5000);
    }
  };
  window.addEventListener('message', handler);
}