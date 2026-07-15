// note-sender.js — typed client for authenticated note submission
// Runs inside admin.icustomize.com iframes

// Guard: set the ready flag on first load (content scripts inject once per frame)
if (window.__gbIframeReady) { /* already loaded */ }
window.__gbIframeReady = true;


  // ═══════════════════════════════════════════════════════
  // QUICK NOTES INJECTOR
  // ═══════════════════════════════════════════════════════

  /**
   * Sends a typed operation to the MAIN-world authentication broker. The
   * broker returns only bounded operation results; authentication headers are
   * never copied into this isolated content-script world or extension storage.
   * @param {object} request Approved broker operation.
   * @returns {Promise<object>} Bounded operation result.
   */
  function __gbAuthBrokerRequest(request) {
    const requestId = `${Date.now().toString(36)}_${crypto.getRandomValues(new Uint32Array(2)).join('_')}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        document.removeEventListener('GB_AUTH_BROKER_RESPONSE', onResponse);
        resolve({ ok: false, status: 0, error: 'Authenticated iCustomize bridge did not respond' });
      }, 15_000);
      function onResponse(event) {
        if (!event.detail || event.detail.requestId !== requestId) return;
        clearTimeout(timeout);
        document.removeEventListener('GB_AUTH_BROKER_RESPONSE', onResponse);
        resolve(event.detail.result || { ok: false, status: 0, error: 'Empty authenticated response' });
      }
      document.addEventListener('GB_AUTH_BROKER_RESPONSE', onResponse);
      document.dispatchEvent(new CustomEvent('GB_AUTH_BROKER_REQUEST', { detail: { requestId, request } }));
    });
  }

  async function __gbGetAuthenticatedIdentity() {
    const result = await __gbAuthBrokerRequest({ action: 'identity' });
    return result && result.ok ? result.identity : null;
  }

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
   * Submits a quick note directly to the icustomize Notes API, bypassing the
   * page UI. Animates the triggering button through saving/saved/error states
   * and reloads the page on success.
   * @param {{subject:string, body:string, audienceVal?:string}} note - The note template to submit.
   * @param {HTMLButtonElement|null} buttonElement - Optional legacy toolbar button.
   * @returns {Promise<{ok:boolean,error?:string}>}
   */
  async function __gbSubmitNoteDirectly(note, buttonElement) {
    const urlParams = new URLSearchParams(window.location.search);
    const entityID = urlParams.get('entityID');
    const entityName = urlParams.get('entityName') || 'order';

    if (!entityID) {
        const error = 'Could not find Order ID in the iframe URL';
        if (buttonElement) alert("[GB] Could not find Order ID in the URL. Are you on an order page?");
        return { ok: false, error };
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const replace = s => (s || '').replace(/\{\{date\}\}/gi, dateStr).replace(/\{\{time\}\}/gi, timeStr);

    // --- Modern Animation Trigger: Saving ---
    const stateText = buttonElement?.querySelector('.gb-text-state');
    if (stateText) stateText.textContent = "Saving...";
    buttonElement?.classList.add('show-state', 'is-saving');

    try {
        const response = await __gbAuthBrokerRequest({
            action: 'recordNote',
            entityName,
            entityID,
            note: {
                subject: replace(note.subject),
                body: replace(note.body),
                audienceVal: note.audienceVal || ''
            }
        });

        if (response.ok) {
            // --- Modern Animation Trigger: Success ---
            if (stateText) stateText.textContent = "Saved ✓";
            buttonElement?.classList.remove('is-saving');
            buttonElement?.classList.add('is-saved');

            setTimeout(() => window.location.reload(), 600);
            return { ok: true };
        } else {
            const error = response.error || `HTTP ${response.status || 0}`;
            if (buttonElement) alert(`Failed to save note via API (${error}).`);

            // --- Revert Animation on Fail ---
            buttonElement?.classList.remove('show-state', 'is-saving');
            return { ok: false, error };
        }
    } catch (error) {
        if (buttonElement) alert("Network error while saving note.");

        // --- Revert Animation on Fail ---
        buttonElement?.classList.remove('show-state', 'is-saving');
        return { ok: false, error: error?.message || 'Network error while saving note' };
    }
  }

  // ── ASP.NET Calendar offset calculator ─────────────────────
