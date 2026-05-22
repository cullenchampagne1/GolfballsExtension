// calendar-bridge.js — calendar state fetch, full ASP.NET postback chain
// ALL chrome.runtime.sendMessage calendar calls live here so cookies work.
// Depends on: note-sender.js, date-utils.js


// ── Background-proxied fetch helpers (called from iframe — cookies flow) ───────
/**
 * Fetches the delivery-date calendar HTML via the background script proxy so
 * the session cookies from the iframe are included in the request.
 * @param {string} url - The calendar page URL to fetch.
 * @returns {Promise<string>} Resolves to the full HTML string of the calendar page.
 */
function __gbFetchCalendarHtml(url) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject('Background script took too long. It may be asleep.'), 10000);
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      clearTimeout(t);
      return reject('Extension was updated. Please refresh the page.');
    }
    try {
      chrome.runtime.sendMessage({ action: 'fetchCalendarState', url }, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) return reject('Extension Error: ' + chrome.runtime.lastError.message);
        if (!r)       return reject('No response from background script.');
        if (!r.ok)    return reject(r.error || 'Background fetch failed');
        resolve(r.html);
      });
    } catch (e) { clearTimeout(t); reject('Message routing failed: ' + e.message); }
  });
}

/**
 * Performs a single ASP.NET Calendar postback step (selecting a date) via
 * the background script, returning the updated ViewState bundle for the
 * next step in the chain.
 * @param {string} url - The calendar page URL.
 * @param {{viewState:string, viewStateGen:string, eventValidation:string, eventTarget:string, eventArgument:string}} state - Current form state plus the event to fire.
 * @returns {Promise<object>} Resolves to the new ViewState bundle.
 */
function __gbPostCalendarStep(url, state) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Request timed out (20s).')), 20000);
    try {
      chrome.runtime.sendMessage({
        action: 'postCalendarForm', url,
        viewState:       state.viewState,
        viewStateGen:    state.viewStateGen,
        eventValidation: state.eventValidation,
        eventTarget:     state.eventTarget,
        eventArgument:   state.eventArgument
      }, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!r?.ok) return reject(new Error(r?.error || 'Date step failed'));
        resolve(r.state);
      });
    } catch(e) { clearTimeout(t); reject(e); }
  });
}

/**
 * Submits the final form POST to save the selected approval and commitment
 * dates to the order record.
 * @param {string} url - The calendar page URL.
 * @param {{viewState:string, viewStateGen:string, eventValidation:string}} state - Final form state.
 * @returns {Promise<void>}
 */
function __gbCalendarFinalSubmit(url, state) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Submit timed out (20s).')), 20000);
    try {
      chrome.runtime.sendMessage({
        action: 'submitCalendarUpdate', url,
        viewState:       state.viewState,
        viewStateGen:    state.viewStateGen,
        eventValidation: state.eventValidation
      }, (r) => {
        clearTimeout(t);
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!r?.ok) return reject(new Error(r?.error || 'Final submit failed'));
        resolve();
      });
    } catch(e) { clearTimeout(t); reject(e); }
  });
}

// ── Run the full 3-step postback chain from within the iframe ─────────────────
// Step messages go UP to parent so the calendar UI can show progress.
/**
 * Runs the full three-step calendar postback chain (select approval date,
 * select commitment date, save). Posts step-progress and done/error messages
 * to the parent window so the full-screen calendar UI can show a progress bar.
 * @param {string} calendarUrl - The calendar page URL.
 * @param {object} calState - Initial ViewState bundle.
 * @param {string} approvalOffset - ASP.NET day offset for the approval date.
 * @param {string} commitmentOffset - ASP.NET day offset for the commitment date.
 * @returns {Promise<void>}
 */
async function __gbRunCalendarChain(calendarUrl, calState, approvalOffset, commitmentOffset) {
  const up = (action, payload) => window.parent.postMessage({ action, ...payload }, '*');

  try {
    up('GB_CALENDAR_STEP', { step: 1, label: 'Selecting approval date…' });
    const s1 = await __gbPostCalendarStep(calendarUrl, {
      ...calState, eventTarget: 'ctl00$ApprovalDate', eventArgument: approvalOffset
    });

    up('GB_CALENDAR_STEP', { step: 2, label: 'Selecting commitment date…' });
    const s2 = await __gbPostCalendarStep(calendarUrl, {
      ...s1, eventTarget: 'ctl00$DeviveryCommitment', eventArgument: commitmentOffset
    });

    up('GB_CALENDAR_STEP', { step: 3, label: 'Saving to server…' });
    await __gbCalendarFinalSubmit(calendarUrl, s2);

    up('GB_CALENDAR_DONE', {});
  } catch (err) {
    console.error('[GB] Calendar chain failed:', err);
    up('GB_CALENDAR_ERROR', { error: (err.message || String(err)).slice(0, 120) });
  }
}

// ── Calendar button: fetch state → open full-screen UI in parent ──────────────
// Keeps calState in memory here so the save postbacks originate from this iframe.
let __gbCalendarState   = null;
let __gbCalendarUrl     = null;

/**
 * Entry point for the calendar button: fetches the current calendar state
 * from the server, stores it in module-level variables, then posts a
 * `GB_OPEN_CALENDAR` message to the parent window so the full-screen
 * calendar picker can open.
 * @returns {Promise<void>}
 */
async function __gbShowCalendarModal() {
  const urlParams = new URLSearchParams(window.location.search);
  const orderID   = urlParams.get('entityID');
  if (!orderID) { alert('Error: Could not determine Order ID.'); return; }

  __gbCalendarUrl = `https://api.golfballs.com/golfballs/AdminNew/default.aspx?folder=Orders&page=DeliveryDateCalendar&orderID=${orderID}`;


  try {
    const html = await __gbFetchCalendarHtml(__gbCalendarUrl);
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    __gbCalendarState = {
      viewState:       doc.getElementById('__VIEWSTATE')?.value         || '',
      viewStateGen:    doc.getElementById('__VIEWSTATEGENERATOR')?.value || '',
      eventValidation: doc.getElementById('__EVENTVALIDATION')?.value   || '',
    };

    if (!__gbCalendarState.viewState) throw new Error('__VIEWSTATE missing. Session may have expired.');

    window.parent.postMessage({
      action: 'GB_OPEN_CALENDAR',
      data: {
        orderID,
        calendarUrl:       __gbCalendarUrl,
        defaultApproval:   __gbParseDateFromCell('ctl00_ApprovalDate',      doc),
        defaultCommitment: __gbParseDateFromCell('ctl00_DeviveryCommitment', doc),
      }
    }, '*');

  } catch (err) {
    console.error('[GB] Calendar Sync Error:', err);
    window.parent.postMessage({
      action: 'GB_NOTIFY',
      message: 'Calendar sync failed: ' + String(err.message || err).slice(0, 80),
      type: 'error', duration: 5000
    }, '*');
  }
}

// ── Auto-push: compute offsets, show bar on parent, run chain from here ───────
let __gbPendingPushNote = null;
let __gbPendingPushBtn  = null;

/**
 * Combined "push dates + submit note" flow triggered by quick-note buttons
 * that have a `daysOut` value. Fetches the current calendar state, computes
 * the target approval and (conditionally) commitment offsets, runs the full
 * postback chain, then submits the note on success.
 * @param {{subject:string, body:string, audienceVal?:string, daysOut:number}} note - The note template with days-out value.
 * @param {HTMLButtonElement} btn - The toolbar button that triggered the action.
 * @returns {Promise<void>}
 */
async function __gbPushDatesAndSubmitNote(note, btn) {
  const urlParams = new URLSearchParams(window.location.search);
  const orderID   = urlParams.get('entityID');
  if (!orderID) { alert('[GB] Could not find Order ID.'); return; }

  const calendarUrl = `https://api.golfballs.com/golfballs/AdminNew/default.aspx?folder=Orders&page=DeliveryDateCalendar&orderID=${orderID}`;

  const stateText = btn.querySelector('.gb-text-state');
  if (stateText) stateText.textContent = 'Syncing...';
  btn.classList.add('show-state', 'is-saving');

  const up = (action, payload) => window.parent.postMessage({ action, ...payload }, '*');

  try {
    const html = await __gbFetchCalendarHtml(calendarUrl);
    const doc  = new DOMParser().parseFromString(html, 'text/html');

    const calState = {
      viewState:       doc.getElementById('__VIEWSTATE')?.value         || '',
      viewStateGen:    doc.getElementById('__VIEWSTATEGENERATOR')?.value || '',
      eventValidation: doc.getElementById('__EVENTVALIDATION')?.value   || '',
    };
    if (!calState.viewState) throw new Error('Could not load calendar state. Session may have expired.');

    const newApproval = new Date();
    newApproval.setDate(newApproval.getDate() + note.daysOut);
    const approvalOffset = String(__gbDateToAspOffset(newApproval));

    // Only change commitment if new approval exceeds it; set commitment = approval + 2 days
    let commitmentOffset = null;
    const currentCommitStr = __gbParseDateFromCell('ctl00_DeviveryCommitment', doc);
    if (currentCommitStr) {
      const currentCommit = new Date(currentCommitStr);
      if (!isNaN(currentCommit.getTime()) && newApproval > currentCommit) {
        const nc = new Date(newApproval);
        nc.setDate(nc.getDate() + 2);
        commitmentOffset = String(__gbDateToAspOffset(nc));
      }
    }

    // Tell parent to show the progress bar
    up('GB_PUSH_DATES_AND_NOTE', { daysOut: note.daysOut, commitmentOffset });

    __gbPendingPushNote = note;
    __gbPendingPushBtn  = btn;
    const totalSteps = commitmentOffset !== null ? 3 : 2;

    // Run the chain right here in the iframe
    try {
      up('GB_AUTO_PUSH_STEP', { step: 0.3, label: 'Pushing approval date…' });
      let state = await __gbPostCalendarStep(calendarUrl, {
        ...calState, eventTarget: 'ctl00$ApprovalDate', eventArgument: approvalOffset
      });
      up('GB_AUTO_PUSH_STEP', { step: 1, label: commitmentOffset ? 'Pushing commitment date…' : 'Saving changes…' });

      if (commitmentOffset !== null) {
        state = await __gbPostCalendarStep(calendarUrl, {
          ...state, eventTarget: 'ctl00$DeviveryCommitment', eventArgument: commitmentOffset
        });
        up('GB_AUTO_PUSH_STEP', { step: 2, label: 'Saving changes…' });
      }

      await __gbCalendarFinalSubmit(calendarUrl, state);

      // Trigger note submit
      if (__gbPendingPushNote && __gbPendingPushBtn) {
        __gbSubmitNoteDirectly(__gbPendingPushNote, __gbPendingPushBtn);
        __gbPendingPushNote = null;
        __gbPendingPushBtn  = null;
      }
      up('GB_DATES_PUSHED', {});

    } catch (chainErr) {
      btn.classList.remove('show-state', 'is-saving');
      if (stateText) stateText.textContent = 'Failed';
      up('GB_AUTO_PUSH_ERROR', { error: (chainErr.message || String(chainErr)).slice(0, 80) });
    }

  } catch (err) {
    console.error('[GB] Auto date push setup failed:', err);
    btn.classList.remove('show-state', 'is-saving');
    up('GB_NOTIFY', { message: 'Date push failed: ' + String(err.message || err).slice(0, 80), type: 'error', duration: 5000 });
  }
}

// ── Handle GB_CALENDAR_SAVE broadcast from background ────────────────────────
// Relayed via chrome.tabs.sendMessage(allFrames) so it reaches this iframe.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'GB_CALENDAR_SAVE') {
    if (!__gbCalendarState || !__gbCalendarUrl) {
      window.parent.postMessage({ action: 'GB_CALENDAR_ERROR', error: 'Calendar state lost — please reopen the calendar.' }, '*');
      sendResponse({ ok: false });
      return true;
    }
    __gbRunCalendarChain(__gbCalendarUrl, __gbCalendarState, msg.approvalOffset, msg.commitmentOffset);
    sendResponse({ ok: true });
    return true;
  }
});
