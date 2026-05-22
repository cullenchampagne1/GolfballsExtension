// toolbar.js — quick-note toolbar, calendar button, note buttons + observers
// Depends on: note-sender.js, calendar-bridge.js

  // ── Sales rep detection: scans notes, broadcasts name to parent ──────────
  /**
   * Scans the notes section body text for a "was assigned to [name]" pattern
   * and posts the detected sales rep name to the parent window via postMessage.
   * Runs at most once per page load (guarded by __gbRepFound).
   */
  function __gbBroadcastSalesRep() {
    if (window.__gbRepFound) return;
    const m = (document.body.innerText || '').match(/was\s+assign(?:ed)?\s+to\s+([a-z]+)(?:[\s\xA0]+([a-z]+))?/i);
    if (m) {
      window.__gbRepFound = true;
      const name = m[1] + (m[2] ? ' ' + m[2].charAt(0) : '');
      window.parent.postMessage({ action: 'GB_SALES_REP_FOUND', salesRep: name.trim() }, '*');
    }
  }

    // --- TOOLBAR INJECTION --- //

  let __gbNotesBuildingToolbar = false;

  // Add this right above __gbRenderQuickNotes
  /**
   * Injects the `.gb-modern-btn` button stylesheet and animation rules into
   * the iframe document head. Idempotent.
   */
  function __gbInjectModernStyles() {
    if (document.getElementById('__gb-modern-styles')) return;
    const style = document.createElement('style');
    style.id = '__gb-modern-styles';
    style.textContent = `
        /* Base Modern Button — uses brand vars so it follows the active theme */
        .gb-modern-btn {
            background: linear-gradient(180deg, var(--gb-page-btn, #008000) 0%, var(--gb-page-btn-dark, #004b23) 100%) !important;
            color: var(--gb-page-btn-text, #d4ffdc) !important;
            border: 1px solid var(--gb-page-btn-border, #026e23) !important;
            padding: 6px 16px !important;
            border-radius: 6px !important;
            cursor: pointer !important;
            font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15), 0 1px 2px rgba(var(--gb-brand-rgb, 110,144,29),0.25) !important;
            position: relative !important;
            overflow: hidden !important;
            transition: all 0.25s ease !important;
            text-align: center !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            user-select: none !important;
        }

        /* Hover & Active States */
        .gb-modern-btn:hover {
            background: linear-gradient(180deg, var(--gb-page-btn, #008000) 0%, var(--gb-page-btn-dark, #004b23) 100%) !important;
            box-shadow: 0 4px 10px rgba(var(--gb-page-btn-rgb, 0,128,0), 0.4), 0 0 8px rgba(var(--gb-page-btn-rgb, 0,128,0), 0.25) !important;
            transform: translateY(-1px) !important;
        }
        .gb-modern-btn:active {
            transform: translateY(1px) !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.15) !important;
        }

        /* Status States */
        .gb-modern-btn.is-saving {
            background: linear-gradient(180deg, var(--gb-surface-hover, #1e1e1e) 0%, var(--gb-surface-raised, #1a1a1a) 100%) !important;
            border-color: var(--gb-border-standard, #333333) !important;
            color: var(--gb-text-muted, #888888) !important;
            pointer-events: none !important;
            box-shadow: inset 0 2px 4px rgba(0,0,0,0.1) !important;
        }
        .gb-modern-btn.is-saved {
            background: linear-gradient(180deg, var(--gb-page-btn-saved, #004b23) 0%, var(--gb-page-btn-saved, #004b23) 100%) !important;
            border-color: var(--gb-page-btn-border, #026e23) !important;
            color: var(--gb-page-btn-text, #d4ffdc) !important;
            box-shadow: 0 0 14px rgba(var(--gb-page-btn-saved-rgb, 0,75,35), 0.6) !important;
            pointer-events: none !important;
        }

        /* Text Sliding Magic - Grid ensures button width stays constant */
        .gb-btn-text-wrapper {
            display: grid !important;
            align-items: center !important;
            justify-items: center !important;
        }
        .gb-text-normal, .gb-text-state {
            grid-area: 1 / 1 !important; /* Stack elements perfectly */
            transition: transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease !important; /* Smooth bouncy snap */
        }
        .gb-text-state {
            transform: translateY(-150%) !important; /* Start high above */
            opacity: 0 !important;
        }

        /* Trigger Slide */
        .gb-modern-btn.show-state .gb-text-normal {
            transform: translateY(150%) !important; /* Push current text down */
            opacity: 0 !important;
        }
        .gb-modern-btn.show-state .gb-text-state {
            transform: translateY(0) !important; /* Pull new text in */
            opacity: 1 !important;
        }
        
        /* Specific tweak for Calendar Button */
        #__gb-cal-btn {
            padding: 6px 10px !important;
            margin-right: 15px !important;
            order: -10 !important;
            top: -2px !important;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Renders the quick-note toolbar and calendar button adjacent to the native
 * "New" note button. Reads note templates from chrome.storage.local (falling
 * back to built-in defaults) and wires each button to either a direct note
 * submission or a date-push-then-submit flow.
 */
function __gbRenderQuickNotes() {
    if (__gbNotesBuildingToolbar) return;

    const addBtn       = __gbFindAddNoteButton();
    const existingTbar = document.getElementById('__gb-qn-toolbar');

    if (!addBtn) return;
    if (existingTbar && addBtn.nextElementSibling === existingTbar) return;
    existingTbar?.remove();

    __gbNotesBuildingToolbar = true;
    __gbInjectModernStyles(); // Inject CSS once

    chrome.storage.local.get(['noteTemplates', 'featureFlags'], ({ noteTemplates, featureFlags }) => {
        __gbNotesBuildingToolbar = false;

        const flags = { calendarEnabled: true, ...(featureFlags || {}) };

        // Only show 'note' subtype — tasks must not appear in the quick-note bar
        const stored = (noteTemplates || []).filter(n =>
            n.enabled !== false && (!n.subType || n.subType === 'note')
        );
        const notes = stored.length > 0 ? stored : __gbQuickNoteDefaults;

        const toolbar = document.createElement('div');
        toolbar.id = '__gb-qn-toolbar';

        const parent = addBtn.parentElement;
        if (parent) {
            parent.style.setProperty('display', 'flex', 'important');
            parent.style.setProperty('align-items', 'center', 'important');
            parent.style.setProperty('width', '100%', 'important'); 
        }

        // --- Calendar Button Refactor ---
        const calBtn = document.createElement('button');
        calBtn.id    = '__gb-cal-btn';
        calBtn.className = 'gb-modern-btn'; // Use new class
        calBtn.type  = 'button';
        calBtn.onclick = (e) => {
            e.preventDefault();
            __gbShowCalendarModal();
        };
        calBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 4H5C3.89543 4 3 4.89543 3 6V20C3 21.1046 3.89543 22 5 22H19C20.1046 22 21 21.1046 21 20V6C21 4.89543 20.1046 4 19 4Z" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M16 2V6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8 2V6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3 10H21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;

        addBtn.style.setProperty('order', '2', 'important');

        toolbar.style.cssText = [
            'display: inline-flex',
            'gap: 8px',
            'align-items: center',
            'margin-right: 12px',
            'margin-left: auto',  
            'vertical-align: middle',
            'flex-shrink: 0',
            'order: 1'           
        ].join(' !important; ') + ' !important;';

        // --- Notes Buttons Refactor ---
        notes.forEach(note => {
            const btn   = document.createElement('button');
            btn.id      = '__gb-qn-' + note.id;
            btn.className = 'gb-modern-btn'; // Use new class
            btn.type    = 'button';
            
            // Build the HTML structure for the slider
            btn.innerHTML = `
                <span class="gb-btn-text-wrapper">
                    <span class="gb-text-normal">${note.name}</span>
                    <span class="gb-text-state"></span>
                </span>
            `;

            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                if (note.daysOut != null && note.daysOut >= 0) {
                    __gbPushDatesAndSubmitNote(note, btn);
                } else {
                    __gbSubmitNoteDirectly(note, btn);
                }
            });

            toolbar.appendChild(btn);
        });

        // Only add calendar button if feature flag is enabled AND there are note buttons to show
        if (flags.calendarEnabled && notes.length > 0) {
            parent.prepend(calBtn);
        }
        addBtn.insertAdjacentElement('afterend', toolbar);
    });
  }

  // ── OBSERVERS & TRIGGERS ── //
  const __gbNotesObserver = new MutationObserver(() => {
      __gbRenderQuickNotes();
      __gbBroadcastSalesRep();
  });
  __gbNotesObserver.observe(document.body, { childList: true, subtree: true });
  
  __gbRenderQuickNotes();
  __gbBroadcastSalesRep(); 
  
  // Bloodhound Fallback: Check every 1.5 seconds in case the API loads the notes late
  setInterval(__gbBroadcastSalesRep, 1500);

  // Broadcast the logged-in employee's ID from the JWT so the main page can
  // use it for case actions (e.g. Mark as Junk → ClosedBy field).
  (function () {
    try {
      const token = __gbGetAuthToken ? __gbGetAuthToken() : null;
      if (!token) return;
      const payload = JSON.parse(atob(token.split('.')[1]));
      const id = payload.adminUserID || payload.employeeID || payload.EmployeeID || payload.sub;
      if (id) window.parent.postMessage({ action: 'GB_EMPLOYEE_ID', employeeId: String(id) }, '*');
    } catch (_) {}
  })();
