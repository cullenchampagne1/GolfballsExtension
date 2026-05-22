// charge.js

const PRIVATE_API = 'https://production-private-api.icustomize.com';
const MASTER_API  = 'https://master.api.icustomize.com';
const PROCESSOR   = 'USIO';
const ACCOUNT_TYPE = 'CONSUMER';

// ── State ─────────────────────────────────────────────────────────────────────
let ctx        = {};  // { orderId, userId, pageTotal }
let methods    = [];  // raw payment method objects from API
let selection  = [];  // ordered array of billingIDs selected by user
let running    = false;
let allDone    = false;

// DOM refs
const $ = id => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  $('btn-close').addEventListener('click', () => window.close());
  $('btn-run').addEventListener('click', runPayments);

  // Load context stored by popup
  const data = await chrome.storage.local.get('chargeContext');
  ctx = data.chargeContext || {};

  $('hdr-order-sub').textContent = ctx.orderId
    ? `Order #${ctx.orderId}`
    : 'Golfballs.com';

  // Pre-fill fields
  $('f-amount').value = ctx.pageTotal ? ctx.pageTotal.toFixed(2) : '';
  $('f-reason').value = 'Order Edit';
  $('f-note').value   = 'Order Charge';

  if (!ctx.orderId) {
    showError('No order ID found. Please reopen from the order page.');
    return;
  }

  await loadMethods();
});

// ── API helpers ───────────────────────────────────────────────────────────────
/**
 * Sends an authenticated API request via the background script, routing
 * it through the icustomize.com admin iframe to acquire the session token.
 * @param {string} url - The API endpoint URL.
 * @param {string} [method='POST'] - HTTP method.
 * @param {object} [body] - Request body (will be JSON-stringified).
 * @returns {Promise<object>} Parsed JSON response from the API.
 */
async function apiCall(url, method = 'POST', body) {
  const resp = await chrome.runtime.sendMessage({
    action: 'chargeApiProxy',
    url, method, body
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.text?.slice(0, 200)}`);
  try { return JSON.parse(resp.text); }
  catch { return resp.text; }
}

// ── Load payment methods ──────────────────────────────────────────────────────
/**
 * Fetches available payment methods for the current order from the
 * icustomize API and stores them in the module-level `methods` array,
 * then triggers a render.
 * @returns {Promise<void>}
 */
async function loadMethods() {
  show('view-loading');
  hide('view-content');
  hide('view-error');

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

    hide('view-loading');
    show('view-content');
    renderMethods();
    updateRunButton();
  } catch (err) {
    showError('Failed to load payment methods: ' + err.message);
  }
}

// ── Render methods list ───────────────────────────────────────────────────────
/**
 * Renders the list of payment method rows in the charge window, including
 * card type, last-4 digits, and amount input fields.
 */
function renderMethods() {
  const list = $('methods-list');
  list.innerHTML = '';

  methods.forEach(m => {
    const row = document.createElement('div');
    row.className = 'method-row';
    row.dataset.billingId = m.billingID;
    row.innerHTML = `
      <div class="order-badge" data-badge="${m.billingID}">—</div>
      <div class="method-info">
        <div class="method-name">${escHtml(m.Name || 'Unknown Card')}</div>
      </div>
      <div class="method-status">
        <div class="spin hidden" data-spinner="${m.billingID}"></div>
        <span class="status-chip pending" data-chip="${m.billingID}"></span>
        <span class="status-msg" data-msg="${m.billingID}"></span>
      </div>
    `;
    row.addEventListener('click', () => toggleMethod(m.billingID));
    list.appendChild(row);
  });
}

// ── Toggle method selection ───────────────────────────────────────────────────
/**
 * Toggles selection of a payment method row and refreshes the amount
 * inputs and Run Charge button state.
 * @param {string} billingId - The billing ID of the method to toggle.
 */
function toggleMethod(billingId) {
  if (running || allDone) return;

  const row = getRow(billingId);
  // Ignore rows that have already been processed
  if (row.classList.contains('failed') || row.classList.contains('succeeded')) return;

  const idx = selection.indexOf(billingId);
  if (idx === -1) {
    selection.push(billingId);
  } else {
    selection.splice(idx, 1);
  }
  refreshBadges();
  updateRunButton();
}

/**
 * Updates the selected/unselected visual badges on all payment method rows
 * to reflect the current selection state.
 */
function refreshBadges() {
  methods.forEach(m => {
    const row   = getRow(m.billingID);
    const badge = row.querySelector(`[data-badge="${m.billingID}"]`);
    const pos   = selection.indexOf(m.billingID);
    if (pos === -1) {
      badge.textContent = '—';
      row.classList.remove('selected');
    } else {
      badge.textContent = pos + 1;
      row.classList.add('selected');
    }
  });
}

// ── Run button state ──────────────────────────────────────────────────────────
/**
 * Enables or disables the "Run Charge" button based on whether at least one
 * payment method is selected and all selected amounts are valid.
 */
function updateRunButton() {
  const btn = $('btn-run');
  if (allDone) return; // already in done state, don't touch
  btn.disabled = selection.length === 0;
}

// ── Charge flow ───────────────────────────────────────────────────────────────
/**
 * Iterates over selected payment methods and calls chargeOne for each in
 * sequence, collecting results and updating the UI on completion.
 * @returns {Promise<void>}
 */
async function runPayments() {
  if (running || allDone) return;
  if (selection.length === 0) return;

  const amount = parseFloat($('f-amount').value);
  if (!amount || amount <= 0) {
    alert('Please enter a valid charge amount.');
    return;
  }

  running = true;
  setRunning(true);

  let successHit = false;

  for (const billingId of selection) {
    if (successHit) break;
    const result = await chargeOne(billingId, amount);
    if (result.success) successHit = true;
  }

  running = false;
  allDone = true;
  setDone();
}

/**
 * Executes a single payment charge or refund for the given billing ID and
 * amount, making the appropriate API calls and updating the row state.
 * @param {string} billingId - The billing ID of the payment method.
 * @param {number} amount - Dollar amount to charge (positive) or refund (negative).
 * @returns {Promise<void>}
 */
async function chargeOne(billingId, amount) {
  const row = getRow(billingId);
  setMethodState(billingId, 'loading', 'Fetching billing info…');

  try {
    // Step 1: Get billing info
    let billing = await apiCall(
      `${PRIVATE_API}/API/User/CreditCardInfo/GetBillingInfoByBillingRequest`,
      'POST',
      {
        orderId: parseInt(ctx.orderId, 10),
        billingID: billingId,
        processor: PROCESSOR,
        accountType: ACCOUNT_TYPE
      }
    );

    // Step 2: If token is null, run billingVerify first
    if (!billing.token) {
      setMethodState(billingId, 'loading', 'Verifying card…');
      try {
        await apiCall(`${MASTER_API}/user/billingVerify`, 'PUT', {
          billingId: billing.billingId,
          customerId: billing.customerId,
          address: billing.address,
          accountType: ACCOUNT_TYPE,
          contact: billing.contact,
          processor: PROCESSOR
        });
      } catch (verifyErr) {
        // Non-fatal: log it but try to continue
        console.warn('[charge] billingVerify failed:', verifyErr.message);
      }

      // Re-fetch billing info to get the token
      setMethodState(billingId, 'loading', 'Re-fetching token…');
      billing = await apiCall(
        `${PRIVATE_API}/API/User/CreditCardInfo/GetBillingInfoByBillingRequest`,
        'POST',
        {
          orderId: parseInt(ctx.orderId, 10),
          billingID: billingId,
          processor: PROCESSOR,
          accountType: ACCOUNT_TYPE
        }
      );
    }

    if (!billing.token) {
      // Still no token after verify — skip
      const msg = 'No token available';
      await saveAdjustment(billingId, amount, null, msg, '');
      setMethodState(billingId, 'fail', msg);
      row.classList.add('failed');
      return { success: false };
    }

    // Step 3: Charge the card
    setMethodState(billingId, 'loading', 'Charging…');
    const chargeResult = await apiCall(`${MASTER_API}/user/chargeCard`, 'PUT', {
      token:       billing.token,
      amount:      amount.toFixed(2),
      expDate:     billing.expDate,
      accountType: ACCOUNT_TYPE,
      processor:   PROCESSOR
    });

        const txn     = chargeResult?.transaction || {};
    const txRef   = txn.transactionReference || {};
    const txId    = txRef.transactionId || '';
    const txCode  = txn.responseCode || txRef.responseCode || '';

    // USIO decline codes follow the pattern "D####:## Description" e.g. "D2026:05 Do not honor".
    // Walk the entire response object to find it regardless of which field it lands in.
    /**
 * Recursively searches a nested response object for the first property whose
 * key or string value matches a Usio response-code pattern.
 * @param {object} obj - The object to search.
 * @param {number} [depth=0] - Current recursion depth (max 5).
 * @returns {string|null} The found response code string, or null.
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
    const isOk    = txCode === '00' && !!txId;

    // Step 4: Save adjustment regardless of success/failure.
    // IMPORTANT: SaveAdjustment failure does NOT mean the charge failed.
    // When isOk=true the card was already debited — always return success.
    setMethodState(billingId, 'loading', 'Saving…');
    let _saveResult;
    try { _saveResult = await saveAdjustment(billingId, amount, txId || null, txMsg, txCode); }
    catch (e) { _saveResult = e.message; }
    const _saveFailed = typeof _saveResult === 'string' && _saveResult.trim().length > 0;

    /**
 * Strips HTML tags and trims whitespace from a raw server response message
 * so it can be shown safely in the UI.
 * @param {string} raw - The raw response string, possibly containing HTML.
 * @returns {string} The cleaned plain-text message.
 */
function _cleanSaveMsg(raw) {
      return (raw || '')
        .replace(/Payment adjustment result was not successful\.\s*/i, '')
        .replace(/^Code:\s*\S*\s*Message:\s*/i, '')
        .trim().slice(0, 60);
    }

    if (isOk) {
      if (_saveFailed) {
        // CRITICAL: card was debited but record save failed. Retry once.
        setMethodState(billingId, 'loading', 'Save failed — retrying…');
        let _retryResult;
        try { _retryResult = await saveAdjustment(billingId, amount, txId, txMsg, txCode); }
        catch (re) { _retryResult = re.message; }
        const _retryFailed = typeof _retryResult === 'string' && _retryResult.trim().length > 0;
        if (_retryFailed) {
          setMethodState(billingId, 'warn',
            `CHARGED $${ amount.toFixed(2) } — ID: ${txId} — RECORD NOT SAVED`);
        } else {
          setMethodState(billingId, 'success', `ID: ${txId}`);
        }
      } else {
        setMethodState(billingId, 'success', txId ? `ID: ${txId}` : 'Approved');
      }
      row.classList.add('succeeded');
      return { success: true };
    } else {
      const shortMsg = _saveFailed
        ? (_cleanSaveMsg(_saveResult) || txMsg.slice(0, 60) || 'Declined')
        : (txMsg.slice(0, 60) || 'Declined');
      setMethodState(billingId, 'fail', shortMsg);
      row.classList.add('failed');
      return { success: false };
    }

  } catch (err) {
    const msg = err.message.slice(0, 50);
    try { await saveAdjustment(billingId, amount, null, msg, ''); } catch {}
    setMethodState(billingId, 'fail', msg);
    getRow(billingId).classList.add('failed');
    return { success: false };
  }
}

/**
 * Saves a charge adjustment record to the icustomize API after a successful
 * or failed charge attempt.
 * @param {string} billingId - The billing ID of the payment method.
 * @param {number} amount - The charged amount.
 * @param {string} transactionId - The transaction ID returned by the processor.
 * @param {string} responseMessage - The human-readable processor response.
 * @param {string} responseCode - The processor response code.
 * @returns {Promise<void>}
 */
async function saveAdjustment(billingId, amount, transactionId, responseMessage, responseCode) {
  const reasonText  = $('f-reason').value.trim() || 'Order Edit';
  const noteText    = $('f-note').value.trim()   || 'Order Charge';

  await apiCall(
    `${PRIVATE_API}/API/User/PaymentOrderCharge/SaveAdjustment`,
    'POST',
    {
      transactionId,
      orderId:          String(ctx.orderId),
      amount:           String(parseFloat($('f-amount').value).toFixed(2)),
      previousAmount:   0,
      type:             { Name: 'Charge', id: 1 },
      reason:           { Name: reasonText, id: -1, adminReason: '' },
      note:             noteText,
      inventoryEffected: false,
      inventoryDetails:  '',
      userId:           String(ctx.userId || ''),
      paymentResult:    { responseCode: responseCode || '', responseMessage, transactionId: transactionId || '' },
      billingId,
      accountType:      ACCOUNT_TYPE,
      heartlandAccount: ACCOUNT_TYPE
    }
  );
}

// ── UI state helpers ──────────────────────────────────────────────────────────
/**
 * Updates the visual state of a payment-method row to reflect the current
 * processing status (idle, processing, success, error).
 * @param {string} billingId - The billing ID of the method row to update.
 * @param {'idle'|'processing'|'success'|'error'} state - The new state.
 * @param {string} [message] - Optional message to display in the row.
 */
function setMethodState(billingId, state, message) {
  const spinner = document.querySelector(`[data-spinner="${billingId}"]`);
  const chip    = document.querySelector(`[data-chip="${billingId}"]`);
  const msg     = document.querySelector(`[data-msg="${billingId}"]`);

  // Spinner
  if (state === 'loading') {
    spinner?.classList.remove('hidden');
  } else {
    spinner?.classList.add('hidden');
  }

  // Chip
  if (chip) {
    chip.className = 'status-chip';
    chip.textContent = '';
    if (state === 'loading') { chip.classList.add('loading'); chip.textContent = 'Processing'; }
    else if (state === 'success') { chip.classList.add('success'); chip.textContent = 'Success'; }
    else if (state === 'fail')    { chip.classList.add('fail');    chip.textContent = 'Failed'; }
    else                          { chip.classList.add('pending'); }
  }

  if (msg) msg.textContent = message || '';
}

/**
 * Disables or re-enables the charge form controls during processing.
 * @param {boolean} isRunning - True while a charge operation is in progress.
 */
function setRunning(isRunning) {
  const btn = $('btn-run');
  btn.disabled = isRunning;
  btn.classList.toggle('running', isRunning);
  if (isRunning) $('btn-run-label').textContent = 'Running…';

  // Disable field inputs during run
  ['f-amount', 'f-reason', 'f-note'].forEach(id => {
    $(id).disabled = isRunning;
  });
}

/**
 * Transitions the charge window to the completed state, showing a summary
 * and enabling the close button.
 */
function setDone() {
  const btn = $('btn-run');
  btn.disabled = false;
  btn.classList.remove('running');
  btn.classList.add('done');
  btn.innerHTML = `
    <svg fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7"/>
    </svg>
    <span id="btn-run-label">Done — Close</span>
  `;
  btn.addEventListener('click', () => window.close(), { once: true });
}

/**
 * Returns the payment-method row element for a given billing ID.
 * @param {string} billingId - The billing ID to look up.
 * @returns {HTMLElement|null} The row element, or null if not found.
 */
function getRow(billingId) {
  return document.querySelector(`[data-billing-id="${billingId}"]`);
}

/**
 * Displays a global error message in the charge window.
 * @param {string} msg - The error message text to display.
 */
function showError(msg) {
  hide('view-loading');
  hide('view-content');
  $('err-text').textContent = msg;
  show('view-error');
  // Still show body so user sees the error inside the window
}

/**
 * Removes the `hidden` class from an element by ID.
 * @param {string} id - The element ID to show.
 */
function show(id) { $(id)?.classList.remove('hidden'); }
/**
 * Adds the `hidden` class to an element by ID.
 * @param {string} id - The element ID to hide.
 */
function hide(id) { $(id)?.classList.add('hidden'); }
/**
 * Escapes a string for safe injection into HTML content.
 * @param {string} s - The raw string to escape.
 * @returns {string} The HTML-escaped string.
 */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}