/**
 * Unit tests — src/vanilla/modals/charge-modal.js
 *
 * Vanilla (non-module) content script: loaded with node:vm into a jsdom
 * window with a stubbed chrome.runtime bridge, following the loading
 * pattern of tests/unit/securityPolicy.test.mjs. Tests the modal's data contract:
 * amount prefill, method selection, the exact chargeCard/SaveAdjustment
 * payloads, and the money-critical stop-after-success loop.
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = await readFile(new URL('../../src/vanilla/modals/charge-modal.js', import.meta.url), 'utf8');

const ok = (obj) => ({ ok: true, text: JSON.stringify(obj) });
const APPROVED = { transaction: { responseCode: '00', transactionReference: { transactionId: 'TX-9', responseMessage: 'Approved' } } };
const DECLINED = { transaction: { responseCode: '05', responseMessage: 'Declined', transactionReference: { responseMessage: 'D2026:05 Do not honor' } } };
const TWO_METHODS = [{ billingID: 'b1', Name: 'VISA ****1111' }, { billingID: 'b2', Name: 'MC ****2222' }];

/** Route the chargeApiProxy calls the modal makes. Overrides may be values
 *  or (callCount) => value functions to vary responses per call. */
function apiRoutes({ methods = TWO_METHODS, billing, charge, save } = {}) {
  const counts = { billing: 0, charge: 0, save: 0 };
  const pick = (v, n, fallback) => {
    const resolved = typeof v === 'function' ? v(n) : v;
    return resolved === undefined ? fallback : resolved;
  };
  return (msg) => {
    const u = msg.url;
    if (u.includes('GetUserPaymentMethods')) return ok({ paymentMethods: methods });
    if (u.includes('GetBillingInfoByBillingRequest')) { counts.billing += 1; return ok(pick(billing, counts.billing, { token: 'tok-1', expDate: '1226' })); }
    if (u.includes('billingVerify')) return ok({});
    if (u.includes('chargeCard')) { counts.charge += 1; return ok(pick(charge, counts.charge, APPROVED)); }
    if (u.includes('SaveAdjustment')) { counts.save += 1; return { ok: true, text: pick(save, counts.save, 'Success') }; }
    throw new Error('unexpected chargeApiProxy url: ' + u);
  };
}

function createPage(routes = apiRoutes()) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://api.golfballs.com/golfballs/adminnew/default.aspx?page=OrderDetail&orderID=2820701',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const calls = [];
  const alerts = [];
  dom.window.alert = (m) => alerts.push(m);
  dom.window.__gbCloseModal = (el) => el.remove();
  dom.window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        // JSON round-trip: the modal builds messages in the vm realm, whose
        // Object.prototype differs — normalize so deepEqual works.
        calls.push(JSON.parse(JSON.stringify(msg)));
        cb(routes(msg));
      },
    },
  };
  vm.runInContext(source, dom.getInternalVMContext());
  return { win: dom.window, doc: dom.window.document, calls, alerts };
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };

const BASE_CTX = { orderId: '2820701', userId: '42', pageTotal: 114.99, captured: 89.99, diffAmount: 25, isRefund: false, isZeroDiff: false, chargeRows: [] };

async function openModal(ctx = BASE_CTX, routes) {
  const page = createPage(routes);
  page.win.__gbShowChargeModal(ctx);
  await flush();
  return page;
}

const methodRow = (page, billingId) => page.doc.querySelector(`.gb-method-row[data-id="${billingId}"]`);
const amountInput = (page) => page.doc.getElementById('__gb-f-amount');
const runBtn = (page) => page.doc.getElementById('__gb-btn-run');
const callsTo = (page, fragment) => page.calls.filter((c) => c.url.includes(fragment));

async function runCharge(page, { amount = '25', select = ['b1'] } = {}) {
  for (const id of select) methodRow(page, id).onclick();
  amountInput(page).value = amount;
  await runBtn(page).onclick();
  await flush();
}

describe('charge modal — opening state', () => {
  it('prefills the amount with the absolute outstanding difference', async () => {
    const page = await openModal({ ...BASE_CTX, diffAmount: -12.5 });
    assert.equal(amountInput(page).value, '12.50');
  });

  it('falls back to the page total, then to empty, when no difference exists', async () => {
    const withTotal = await openModal({ ...BASE_CTX, diffAmount: null, pageTotal: 99.9 });
    assert.equal(amountInput(withTotal).value, '99.90');
    const bare = await openModal({ orderId: '1', diffAmount: null, pageTotal: 0 });
    assert.equal(amountInput(bare).value, '');
  });

  it('shows the order number in the header, Unknown when missing', async () => {
    const page = await openModal();
    assert.match(page.doc.getElementById('__gb-charge-hdr').textContent, /Order #2820701/);
    const anon = await openModal({ ...BASE_CTX, orderId: '' });
    assert.match(anon.doc.getElementById('__gb-charge-hdr').textContent, /Order #Unknown/);
  });

  it('does not open a second overlay while one is already on the page', async () => {
    const page = await openModal();
    page.win.__gbShowChargeModal(BASE_CTX);
    assert.equal(page.doc.querySelectorAll('#__gb-charge-overlay').length, 1);
  });
});

describe('charge modal — loading payment methods', () => {
  it('requests methods with the numeric order id and USIO/CONSUMER constants', async () => {
    const page = await openModal();
    assert.deepEqual(page.calls[0], {
      action: 'chargeApiProxy',
      url: 'https://production-private-api.icustomize.com/API/User/PaymentCreditCard/GetUserPaymentMethods',
      method: 'POST',
      body: { orderId: 2820701, processor: 'USIO', accountType: 'CONSUMER' },
    });
    assert.equal(page.doc.querySelectorAll('.gb-method-row').length, 2);
  });

  it('refuses to fetch methods without an order id', async () => {
    const page = await openModal({ ...BASE_CTX, orderId: '' });
    assert.equal(page.calls.length, 0);
    assert.match(page.doc.getElementById('__gb-charge-err').textContent, /^No order ID found/);
  });

  it('reports when the customer has no cards on file', async () => {
    const page = await openModal(BASE_CTX, apiRoutes({ methods: [] }));
    assert.equal(
      page.doc.getElementById('__gb-charge-err').textContent,
      'No payment methods found on file for this customer.',
    );
  });

  it('escapes markup embedded in card names instead of rendering it', async () => {
    const hostile = [{ billingID: 'b1', Name: '<img src=x onerror=steal()>' }];
    const page = await openModal(BASE_CTX, apiRoutes({ methods: hostile }));
    const name = page.doc.querySelector('.gb-method-name');
    assert.equal(name.querySelector('img'), null);
    assert.equal(name.textContent, '<img src=x onerror=steal()>');
  });
});

describe('charge modal — method selection', () => {
  it('numbers selections in click order and renumbers on deselect', async () => {
    const page = await openModal();
    methodRow(page, 'b1').onclick();
    methodRow(page, 'b2').onclick();
    assert.equal(methodRow(page, 'b1').querySelector('.badge-num').textContent, '1');
    assert.equal(methodRow(page, 'b2').querySelector('.badge-num').textContent, '2');
    methodRow(page, 'b1').onclick(); // deselect the first
    assert.equal(methodRow(page, 'b1').classList.contains('selected'), false);
    assert.equal(methodRow(page, 'b2').querySelector('.badge-num').textContent, '1');
  });

  it('enables Run Charge only while at least one method is selected', async () => {
    const page = await openModal();
    assert.equal(runBtn(page).disabled, true);
    methodRow(page, 'b1').onclick();
    assert.equal(runBtn(page).disabled, false);
    methodRow(page, 'b1').onclick();
    assert.equal(runBtn(page).disabled, true);
  });

  it('keeps the button locked in refund mode (refund logic not implemented)', async () => {
    const page = await openModal({ ...BASE_CTX, isRefund: true, diffAmount: -25 });
    assert.match(page.doc.getElementById('__gb-charge-title').textContent, /Refund Customer/);
    methodRow(page, 'b1').onclick();
    assert.equal(runBtn(page).disabled, true);
  });

  it('keeps the button locked when the order difference is zero', async () => {
    const page = await openModal({ ...BASE_CTX, isZeroDiff: true, diffAmount: 0 });
    methodRow(page, 'b1').onclick();
    assert.equal(runBtn(page).disabled, true);
  });
});

describe('charge modal — running a charge', () => {
  it('alerts and sends nothing when the amount is missing or non-positive', async () => {
    const page = await openModal();
    methodRow(page, 'b1').onclick();
    amountInput(page).value = '';
    await runBtn(page).onclick();
    amountInput(page).value = '-5';
    await runBtn(page).onclick();
    assert.deepEqual(page.alerts, ['Please enter a valid amount.', 'Please enter a valid amount.']);
    assert.equal(page.calls.length, 1); // only the initial methods fetch
  });

  it('charges via chargeCard with the token, 2-decimal amount and USIO constants', async () => {
    const page = await openModal();
    await runCharge(page, { amount: '25' });
    const [charge] = callsTo(page, '/user/chargeCard');
    assert.deepEqual(charge, {
      action: 'chargeApiProxy',
      url: 'https://master.api.icustomize.com/user/chargeCard',
      method: 'PUT',
      body: { token: 'tok-1', amount: '25.00', expDate: '1226', accountType: 'CONSUMER', processor: 'USIO' },
    });
    assert.equal(methodRow(page, 'b1').classList.contains('succeeded'), true);
    assert.equal(runBtn(page).textContent, 'Done');
  });

  it('saves the adjustment record with reason, note and the processor result', async () => {
    const page = await openModal();
    await runCharge(page, { amount: '25' });
    const [save] = callsTo(page, 'SaveAdjustment');
    assert.deepEqual(save.body, {
      transactionId: 'TX-9',
      orderId: '2820701',
      amount: '25.00',
      previousAmount: 0,
      type: { Name: 'Charge', id: 1 },
      reason: { Name: 'Order Edit', id: -1, adminReason: '' },
      note: 'Order Charge',
      inventoryEffected: false,
      inventoryDetails: '',
      userId: '42',
      paymentResult: { responseCode: '00', responseMessage: 'Approved', transactionId: 'TX-9' },
      billingId: 'b1',
      accountType: 'CONSUMER',
      heartlandAccount: 'CONSUMER',
    });
  });

  it('feeds the dropdown-selected reason into the adjustment payload', async () => {
    const page = await openModal();
    page.doc.querySelector('.gb-dropdown-option[data-value="Shipping Upgrade"]').click();
    assert.equal(page.doc.getElementById('__gb-f-reason').value, 'Shipping Upgrade');
    await runCharge(page);
    const [save] = callsTo(page, 'SaveAdjustment');
    assert.equal(save.body.reason.Name, 'Shipping Upgrade');
  });

  it('stops charging the remaining cards after the first approval', async () => {
    const page = await openModal();
    await runCharge(page, { select: ['b1', 'b2'] });
    assert.equal(callsTo(page, '/user/chargeCard').length, 1);
    assert.equal(methodRow(page, 'b1').classList.contains('succeeded'), true);
    assert.equal(methodRow(page, 'b2').classList.contains('succeeded'), false);
    assert.equal(methodRow(page, 'b2').classList.contains('failed'), false);
  });

  it('falls through to the next card when the first declines, recording the USIO code', async () => {
    const page = await openModal(BASE_CTX, apiRoutes({ charge: (n) => (n === 1 ? DECLINED : APPROVED) }));
    await runCharge(page, { select: ['b1', 'b2'] });
    assert.equal(callsTo(page, '/user/chargeCard').length, 2);
    assert.equal(methodRow(page, 'b1').classList.contains('failed'), true);
    assert.equal(methodRow(page, 'b2').classList.contains('succeeded'), true);
    const declineSave = callsTo(page, 'SaveAdjustment')
      .find((c) => c.body.billingId === 'b1');
    assert.deepEqual(declineSave.body.paymentResult, {
      responseCode: '05',
      responseMessage: 'D2026:05 Do not honor',
      transactionId: '',
    });
    assert.equal(declineSave.body.transactionId, null);
    // KNOWN BUG (this test fails until fixed): setMethodState builds an
    // escaped `detail` string but the success/fail/warn branches render an
    // EMPTY <span></span>. The rep MUST see the decline reason (and, on the
    // warn path, the CHARGED-but-RECORD-NOT-SAVED notice) — not just a color.
    assert.match(
      methodRow(page, 'b1').querySelector('.gb-msg').textContent,
      /D2026:05 Do not honor/,
      'decline reason must be rendered in the method row',
    );
  });

  it('verifies then refetches billing info when no token, failing without charging', async () => {
    const page = await openModal(BASE_CTX, apiRoutes({ billing: {} }));
    await runCharge(page);
    assert.equal(callsTo(page, '/user/chargeCard').length, 0);
    assert.equal(callsTo(page, '/user/billingVerify').length, 1);
    assert.equal(callsTo(page, 'GetBillingInfoByBillingRequest').length, 2);
    const [save] = callsTo(page, 'SaveAdjustment');
    assert.equal(save.body.paymentResult.responseMessage, 'No token available');
    assert.equal(methodRow(page, 'b1').classList.contains('failed'), true);
  });

  it('treats an approved charge with a failed record save as success and retries the save once', async () => {
    const failText = 'Payment adjustment result was not successful. Code: 1 Message: DB timeout';
    const page = await openModal(BASE_CTX, apiRoutes({ save: (n) => (n === 1 ? failText : 'Success') }));
    await runCharge(page, { select: ['b1', 'b2'] });
    // Card was debited — the loop MUST stop even though the first save failed.
    assert.equal(callsTo(page, '/user/chargeCard').length, 1);
    assert.equal(callsTo(page, 'SaveAdjustment').length, 2);
    assert.equal(methodRow(page, 'b1').classList.contains('succeeded'), true);
  });

  it('still reports success (warn state) when both save attempts fail after a debit', async () => {
    const failText = 'Payment adjustment result was not successful. Code: 1 Message: DB timeout';
    const page = await openModal(BASE_CTX, apiRoutes({ save: failText }));
    await runCharge(page, { select: ['b1', 'b2'] });
    assert.equal(callsTo(page, '/user/chargeCard').length, 1);
    assert.equal(callsTo(page, 'SaveAdjustment').length, 2);
    assert.equal(methodRow(page, 'b1').classList.contains('succeeded'), true);
    assert.equal(runBtn(page).textContent, 'Done');
  });
});
