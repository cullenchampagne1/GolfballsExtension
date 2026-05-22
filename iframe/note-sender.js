// note-sender.js — AdminSession token capture + direct API note submission
// Runs inside admin.icustomize.com iframes

// Guard: set the ready flag on first load (content scripts inject once per frame)
if (window.__gbIframeReady) { /* already loaded */ }
window.__gbIframeReady = true;


  // ═══════════════════════════════════════════════════════
  // QUICK NOTES INJECTOR (API BYPASS METHOD)
  // ═══════════════════════════════════════════════════════

  // --- THE TOKEN THIEF (FETCH INTERCEPTOR) --- //
  let __gbStolenToken = null;
  const __originalFetch = window.fetch;
  
  window.fetch = async function(...args) {
      const [resource, config] = args;
      if (config && config.headers) {
          let headers = config.headers;
          if (headers instanceof Headers) {
              if (headers.has('adminsession')) __gbStolenToken = headers.get('adminsession');
          } else {
              for (let key in headers) {
                  if (key.toLowerCase() === 'adminsession') __gbStolenToken = headers[key];
              }
          }
      }
      return __originalFetch.apply(this, args);
  };

  /**
   * Locates the "New" button in the notes panel that triggers the note-entry
   * dialog, skipping Blueprint dialog elements and extension-injected buttons.
   * @returns {HTMLButtonElement|null} The "New" note button, or null if not found.
   */
  function __gbFindAddNoteButton() {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.closest('.bp5-dialog') || btn.id?.startsWith('__gb')) continue;
      const txt = btn.textContent.trim();
      if (txt === 'New' || txt.toLowerCase() === 'new') return btn;
    }
    return null;
  }

  /**
   * Scans a Web Storage object (localStorage or sessionStorage) for a value
   * that contains a JWT (identified by the "eyJ" base64 header prefix).
   * @param {Storage} storage - The storage object to scan.
   * @returns {string|null} The extracted JWT string, or null if not found.
   */
  function __gbFindJWTInStorage(storage) {
      for (let i = 0; i < storage.length; i++) {
          try {
              const val = storage.getItem(storage.key(i));
              if (typeof val === 'string' && val.includes('eyJ')) {
                  const match = val.match(/(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/);
                  if (match) return match[1];
              }
          } catch(e) {}
      }
      return null;
  }

  /**
   * Retrieves the active admin session token using a prioritised strategy:
   * intercepted fetch token → localStorage → sessionStorage → cookie.
   * @returns {string|null} The JWT token string, or null if unavailable.
   */
  function __gbGetAuthToken() {
    if (__gbStolenToken) return __gbStolenToken;
    let token = __gbFindJWTInStorage(localStorage) || __gbFindJWTInStorage(sessionStorage);
    if (token) return token;
    const match = document.cookie.match(new RegExp('(^| )adminsession=([^;]+)', 'i'));
    if (match) return match[2];
    return null; 
  }

  /**
   * Submits a quick note directly to the icustomize Notes API, bypassing the
   * page UI. Animates the triggering button through saving/saved/error states
   * and reloads the page on success.
   * @param {{subject:string, body:string, audienceVal?:string}} note - The note template to submit.
   * @param {HTMLButtonElement} buttonElement - The button that triggered the action.
   * @returns {Promise<void>}
   */
  async function __gbSubmitNoteDirectly(note, buttonElement) {
    const token = __gbGetAuthToken();
    if (!token) {
        alert("[GB] Could not locate AdminSession token. Please try manually reloading the iframe.");
        return;
    }
    
    const urlParams = new URLSearchParams(window.location.search);
    const entityID = urlParams.get('entityID');
    const entityName = urlParams.get('entityName') || 'order';
    
    if (!entityID) {
        alert("[GB] Could not find Order ID in the URL. Are you on an order page?");
        return;
    }
    
    let empId = "0";
    let empName = "Unknown";
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        empId = payload.adminUserID || "0";
        empName = payload.UserName || "Unknown";
    } catch (e) {}

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const replace = s => (s || '').replace(/\{\{date\}\}/gi, dateStr).replace(/\{\{time\}\}/gi, timeStr);
    
    const payload = {
        entityName: entityName,
        entityID: entityID,
        data: {
            audience: note.audienceVal ? [note.audienceVal] : [],
            scope: "",
            subject: replace(note.subject),
            body: replace(note.body),
            employee_id: String(empId),
            employee_name: empName,
            hidden: false,
            media: []
        }
    };

    // --- Modern Animation Trigger: Saving ---
    const stateText = buttonElement.querySelector('.gb-text-state');
    if (stateText) stateText.textContent = "Saving...";
    buttonElement.classList.add('show-state', 'is-saving');
    
    try {
        const response = await fetch("https://51grploz6a.execute-api.us-east-2.amazonaws.com/production/admin/recordNote", {
            method: "PUT",
            headers: {
                "accept": "application/json, text/plain, */*",
                "adminsession": token,
                "content-type": "application/json;charset=UTF-8",
                "sitekey": "golfballs"
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`[GB] API Note submitted successfully for Order ${entityID}!`);
            
            // --- Modern Animation Trigger: Success ---
            if (stateText) stateText.textContent = "Saved ✓";
            buttonElement.classList.remove('is-saving');
            buttonElement.classList.add('is-saved');
            
            setTimeout(() => window.location.reload(), 600);
        } else {
            console.error("[GB] Failed to submit note:", response.status, await response.text());
            alert("Failed to save note via API. Check console for details.");
            
            // --- Revert Animation on Fail ---
            buttonElement.classList.remove('show-state', 'is-saving');
        }
    } catch (error) {
        console.error("[GB] API Error:", error);
        alert("Network error while saving note.");
        
        // --- Revert Animation on Fail ---
        buttonElement.classList.remove('show-state', 'is-saving');
    }
  }

  // ── ASP.NET Calendar offset calculator ─────────────────────
