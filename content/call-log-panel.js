// call-log-panel.js — Optimized Quick Call Log panel on CRM contact pages (Page=240).
// Seamlessly animates layout injection without flashing, clipping, or breaking Bootstrap grids.

if (!window.__gbCallLogPanelLoaded) {
window.__gbCallLogPanelLoaded = true;

(function initCallLogPanel() {
  if (!/[?&]Page=240\b/i.test(window.location.href)) return;

  const BASE = 'https://api.golfballs.com';

  // ── Styles — Protected Grid Math & Crisp Button Typography ──
  (function injectStyles() {
    if (document.getElementById('__gb-cl-css')) return;
    const st = document.createElement('style');
    st.id = '__gb-cl-css';
    st.textContent = `
      /* 1. Safe Flex Container - Overrides Bootstrap Floats without breaking */
      .gb-safe-flex-row {
        display: flex !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
        overflow: visible !important;
      }
      
      /* 2. CRITICAL: Kill Bootstrap clearfixes so they don't become invisible flex items */
      .gb-safe-flex-row::before,
      .gb-safe-flex-row::after {
        display: none !important;
      }

      /* 3. Target all existing columns to shrink proportionately */
      .gb-safe-flex-row > div[class*="span"] {
        float: none !important;
        flex: 1 1 0% !important; /* Force equal dynamic distribution */
        width: auto !important;
        min-width: 0 !important; /* Prevents text from forcing column out of bounds */
        margin-left: 1.5% !important;
        box-sizing: border-box !important;
        transition: flex 0.4s ease, margin 0.4s ease !important;
      }
      .gb-safe-flex-row > div[class*="span"]:first-child {
        margin-left: 0 !important;
      }

      /* 4. Holder shell — sized by call-log-early.js at document_start, no animation needed */
      #__gb-cl-portlet-holder {
        flex: 1 1 0% !important;
        margin-left: 1.5% !important;
        overflow: visible !important;
        box-sizing: border-box !important;
      }

      /* Native Portlet Blueprint */
      .portlet.box.custom-theme {
        border: 1px solid var(--gb-page-btn, #008000) !important;
        border-radius: 4px !important;
        background-color: #ffffff !important;
        box-shadow: 0 2px 5px rgba(0,0,0,0.05) !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .portlet.box.custom-theme > .portlet-title {
        background-color: var(--gb-page-btn, #008000) !important;
        border-bottom: 1px solid var(--gb-page-btn-dark, #004b23) !important;
        padding: 10px 14px !important;
        height: 38px !important;
        box-sizing: border-box !important;
      }
      .portlet.box.custom-theme > .portlet-title > .caption {
        color: var(--gb-page-btn-text, #d4ffdc) !important;
        font-size: 16px !important;
        font-weight: 400 !important;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif !important;
      }
      .portlet.box.custom-theme > .portlet-body {
        background-color: #ffffff !important;
        padding: 10px 10px 14px 10px !important;
        box-sizing: border-box !important;
      }

      /* Dense 3-Column Button Grid Layout */
      #__gb-cl-btn-grid {
        display: grid !important;
        grid-template-columns: repeat(3, minmax(0, 1fr)) !important; /* minmax strictly prevents inner grid blowout */
        gap: 5px !important;
        width: 100% !important;
      }

      /* Refined Inline Buttons — match page button color scheme */
      .gb-cl-btn {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        justify-content: flex-start !important;
        width: 100% !important;
        height: 30px !important;
        padding: 0 8px !important;
        border-radius: 4px !important;
        background: linear-gradient(180deg, var(--gb-page-btn, #008000) 0%, var(--gb-page-btn-dark, #004b23) 100%) !important;
        border: 1px solid var(--gb-page-btn-border, #026e23) !important;
        color: var(--gb-page-btn-text, #d4ffdc) !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        cursor: pointer !important;
        box-sizing: border-box !important;
        position: relative !important;
        transition: all 0.12s ease !important;
        box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important;
      }
      .gb-cl-btn:hover {
        box-shadow: 0 4px 10px rgba(var(--gb-page-btn-rgb, 0,128,0), 0.4) !important;
        transform: translateY(-1px) !important;
      }
      .gb-cl-btn:active { transform: translateY(0) !important; }
      .gb-cl-btn:disabled {
        opacity: .6 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
      }

      /* SVG Icon (Left) */
      .gb-cl-btn-icon {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-shrink: 0 !important;
        width: 14px !important;
        height: 14px !important;
        color: var(--gb-page-btn-text, #d4ffdc) !important;
        margin-right: 6px !important;
        opacity: 0.85 !important;
      }
      .gb-cl-btn-icon svg { width: 14px !important; height: 14px !important; display: block !important; }

      /* Truncated Text (Center) */
      .gb-cl-btn-text {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        font-size: 11px !important;
        font-weight: 600 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        text-align: left !important;
        margin-right: auto !important;
      }

      /* Clean IN/OUT Tag (Right) */
      .gb-cl-btn-meta {
        font-size: 8.5px !important;
        font-weight: 700 !important;
        color: var(--gb-page-btn-text, #d4ffdc) !important;
        opacity: 0.65 !important;
        margin-left: auto !important;
        margin-right: 0 !important;
        flex-shrink: 0 !important;
        letter-spacing: 0.2px !important;
      }

      /* Action Status Spinners */
      .gb-cl-status-icon {
        width: 12px !important;
        height: 12px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-shrink: 0 !important;
        margin-left: 4px !important;
        margin-right: 0 !important;
      }
      .gb-cl-spin {
        width: 10px !important;
        height: 10px !important;
        border: 1.5px solid rgba(0, 0, 0, 0.1) !important;
        border-top-color: var(--gb-brand, #64748b) !important;
        border-radius: 50% !important;
        animation: __gbClSpin .7s linear infinite !important;
      }
      @keyframes __gbClSpin { to { transform: rotate(360deg); } }

      .gb-cl-empty {
        grid-column: 1 / -1 !important;
        font-size: 11px !important;
        color: #999999 !important;
        padding: 6px 2px !important;
        font-style: italic !important;
        text-align: center !important;
      }
    `;
    document.head.appendChild(st);
  })();

  function getContactId() {
    const m = window.location.href.match(/[?&]customerID=(\d+)/i);
    if (m) return m[1];
    return document.getElementById('tbContactId')?.value?.trim() || '';
  }

  function getContactPhone() {
    const el = document.getElementById('lblContactPhoneNumber');
    return (el?.querySelector('a')?.textContent || el?.textContent || '').trim().replace(/\D/g,'');
  }

  // ── Form Scraper submission setup preventing server exceptions ──
  async function submitCallLog(tpl, contactId, phone, employeeId) {
    if (!tpl.callCategory || tpl.callCategory === 0) {
      throw new Error('No category set — edit this template in the manager and pick a call category before using it.');
    }

    const first = document.getElementById('lblContactFirstName')?.textContent || '';
    const last = document.getElementById('lblContactLastName')?.textContent || '';
    const userName = encodeURIComponent((first + ' ' + last).trim());
    const urlDir = tpl.callDirection === 1 ? '1' : '2';

    const pageUrl = `${BASE}/golfballs/adminnew/Default.aspx?Page=272&phone=${encodeURIComponent(phone)}&employeeId=${encodeURIComponent(employeeId)}&userName=${userName}&userId=${encodeURIComponent(contactId)}&direction=${urlDir}&callFrom=0`;

    const getResp = await new Promise(res =>
      chrome.runtime.sendMessage({ action: 'fetchRaw', url: pageUrl }, res)
    );
    if (!getResp?.ok) throw new Error('Could not load call log validation elements');

    const doc = new DOMParser().parseFromString(getResp.text, 'text/html');
    const form = doc.forms[0];
    if (!form) throw new Error('Form wrapper element missing');

    const formData = new URLSearchParams();
    for (const [key, val] of new FormData(form)) {
      formData.append(key, val);
    }

    const setField = (nameEndsWith, value) => {
      const input = form.querySelector(`[name$="${nameEndsWith}"]`);
      if (input) formData.set(input.name, value);
    };

    setField('tbCategory', String(tpl.callCategory || '0'));
    setField('tbSubject', String(tpl.subject || tpl.name || 'Quick Log Entry'));
    setField('tbBody', String(tpl.body || 'Logged via Quick Action'));
    if (tpl.callVoicemail) setField('Voicemail', 'on');

    const submitBtn = form.querySelector('input[type="submit"][id*="btnSubmit"], button[type="submit"]');
    if (submitBtn && submitBtn.name) {
      formData.set(submitBtn.name, submitBtn.value || 'Save Activity');
    }

    const postResp = await new Promise(res =>
      chrome.runtime.sendMessage({
        action: 'fetchRaw', url: pageUrl, method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      }, res)
    );

    if (!postResp?.ok) throw new Error(`POST processing exception: ${postResp?.status}`);
    return true;
  }

  // ── Render Function ──
  async function renderPanel() {
    const grid = document.getElementById('__gb-cl-btn-grid');
    if (!grid) return;

    const { noteTemplates, gbEmployeeId } = await chrome.storage.local.get(['noteTemplates','gbEmployeeId']);
    const callLogs = (noteTemplates||[]).filter(t => t.subType==='call_log' && t.enabled!==false);

    grid.innerHTML = '';

    if (!callLogs.length) {
      grid.innerHTML = '<span class="gb-cl-empty">No quick logs configured.</span>';
      return;
    }

    const contactId  = getContactId();
    const phone      = getContactPhone();
    const employeeId = gbEmployeeId || '0';

    callLogs.forEach(tpl => {
      const dirLbl = tpl.callDirection === 1 ? 'IN' : 'OUT';
      
      // Select appropriate left-aligned icon based on voicemail state
      const iconHtml = tpl.callVoicemail
      /* Clean square cassette icon for voicemail */
      ? `<svg fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            viewBox="0 0 24 24">
          <rect x="3" y="6" width="18" height="12" rx="2"></rect>
          <circle cx="8" cy="12" r="2"></circle>
          <circle cx="16" cy="12" r="2"></circle>
          <path d="M10 12h4"></path>
        </svg>`
      /* Standard phone icon */
      : `<svg fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            viewBox="0 0 24 24">
          <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 01-.321.988l-1.305.98a10.582 10.582 0 004.872 4.872l.98-1.305a1 1 0 01.988-.321l2.2.548a1 1 0 01.725.94V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
        </svg>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gb-cl-btn';
      btn.innerHTML = `
        <span class="gb-cl-btn-icon">${iconHtml}</span>
        <span class="gb-cl-btn-text">${escHtml(tpl.name || 'Untitled')}</span>
        <span class="gb-cl-btn-meta">${escHtml(dirLbl)}</span>
        <div class="gb-cl-status-icon"></div>
      `;

      btn.addEventListener('click', async () => {
        if (btn.dataset.busy) return;
        btn.dataset.busy = '1';
        btn.disabled = true;

        const statusIcon = btn.querySelector('.gb-cl-status-icon');
        const originalStatusContent = statusIcon.innerHTML;
        statusIcon.innerHTML = '<div class="gb-cl-spin"></div>';

        try {
          await submitCallLog(tpl, contactId, phone, employeeId);
          statusIcon.innerHTML = `<svg style="color:#38b000; width:14px; height:14px;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          
          setTimeout(() => {
            statusIcon.innerHTML = originalStatusContent;
            btn.disabled = false;
            delete btn.dataset.busy;
            if (typeof window.SaveLeadNote === 'function') window.location.reload(); 
          }, 2000);
        } catch(err) {
          console.error('[GB Quick Log Failure]', err);
          statusIcon.innerHTML = `<svg style="color:#c86060; width:14px; height:14px;" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
          btn.title = err.message;
          setTimeout(() => {
            statusIcon.innerHTML = originalStatusContent;
            btn.disabled = false;
            delete btn.dataset.busy;
          }, 3500);
        }
      });

      grid.appendChild(btn);
    });
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Absolute Layout Stabilization Matrix Injection ──
  function injectPlaceholder() {
    if (document.getElementById('__gb-cl-portlet-holder')) return;

    const altPortlet = [...document.querySelectorAll('.portlet-title .caption')]
      .find(el => el.textContent.trim().includes('Alternate Lookups'))
      ?.closest('.portlet');
    if (!altPortlet) return;

    const altPortletCol = altPortlet.closest('[class*="span"]');
    if (!altPortletCol) return;

    const parentRow = altPortletCol.parentElement;
    
    // Override Bootstrap Row securely to Flexbox
    parentRow.classList.add('gb-safe-flex-row');

    // Generate the animated holder shell
    const holder = document.createElement('div');
    holder.id = '__gb-cl-portlet-holder';
    holder.className = altPortletCol.className; // Maintain native classes just in case
    holder.innerHTML = `
      <div id="__gb-cl-portlet" class="portlet box custom-theme">
        <div class="portlet-title">
          <div class="caption">Quick Log</div>
        </div>
        <div class="portlet-body">
          <div id="__gb-cl-btn-grid"><span class="gb-cl-empty">Loading…</span></div>
        </div>
      </div>
    `;

    // Drop inline immediately to the left side
    parentRow.insertBefore(holder, altPortletCol);

    // Coordinate the flex squeeze expansion safely
    requestAnimationFrame(() => {
      setTimeout(() => {
        holder.classList.add('expanded');
        
        // Remove 'overflow: hidden' lock after the slide completes to prevent bottom clipping
        setTimeout(() => {
            holder.style.setProperty('overflow', 'visible', 'important');
        }, 450);
      }, 50);
    });

    renderPanel();
  }

  // ── Structural injection is handled by call-log-early.js at document_start.
  // By the time this script runs (document_idle), #__gb-cl-btn-grid is already
  // in the DOM. Just populate it.
  if (document.getElementById('__gb-cl-btn-grid')) {
    renderPanel();
  } else {
    // Fallback: grid not yet present (early script may have missed it).
    // Wait up to 8s for it to appear.
    const mo = new MutationObserver(() => {
      if (document.getElementById('__gb-cl-btn-grid')) {
        mo.disconnect();
        renderPanel();
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 8000);
  }
})();
}