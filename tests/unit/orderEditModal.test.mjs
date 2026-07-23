/**
 * Unit tests — src/vanilla/modals/order-edit-modal.js
 *
 * Vanilla (non-module) content script: loaded with node:vm into a jsdom
 * window with stubbed chrome.runtime + smart-detection globals, following
 * the loading pattern of tests/unit/securityPolicy.test.mjs. Tests the modal's data
 * contract: the editOrder proxy request, cart-iframe URL encoding, and the
 * order-summary sidebar math built from a realistic editOrder response.
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const source = await readFile(new URL('../../src/vanilla/modals/order-edit-modal.js', import.meta.url), 'utf8');

/* Realistic editOrder response slice: $114.99 total = $100.00 product
   subtotal + $6.00 tax + $8.99 ground shipping. */
const baseOrder = () => ({
  shippingAddress: {
    firstName: 'Jane', lastName: 'Doe', address1: '123 Main St', address2: 'Apt 4',
    city: 'Reading', stateProvince: 'PA', postal: '19601',
    phone: '(610) 374-8344', email: 'jane@example.com',
  },
  billingAddress: { useShippingAddress: true },
  promotion: {},
  shippingRates: [
    { method: 'Ground', price: { Amount: '8.99' }, estimatedDelivery: 'Jul 20' },
    { method: '2nd Day', price: { Amount: '24.99' } },
  ],
  shippingMethod: 'Ground',
  salesTax: '6.00',
  orderTotal: '114.99',
  giftCertTotal: '0',
  dropShipFee: '0',
  paymentType: 'CreditCard',
  deliveryMethod: 'Ship',
});

function createPage({ messageId = 'MSG-123', order = baseOrder(), info = {}, chargeRows = null, resp = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://api.golfballs.com/golfballs/adminnew/default.aspx?page=OrderDetail&orderID=2820701',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const calls = [];
  const alerts = [];
  dom.window.alert = (m) => alerts.push(m);
  dom.window.__gbCloseModal = (el) => el.remove();
  dom.window.smartMessageId = () => messageId;
  if (chargeRows) dom.window.smartPageChargeRows = () => chargeRows;
  dom.window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        // JSON round-trip: vm-realm objects have a foreign Object.prototype,
        // which breaks deepEqual against node-realm literals.
        calls.push(JSON.parse(JSON.stringify(msg)));
        cb(resp || { ok: true, text: JSON.stringify({ newOrder: order, orderEditInfo: info }) });
      },
    },
  };
  vm.runInContext(source, dom.getInternalVMContext());
  return { win: dom.window, doc: dom.window.document, calls, alerts };
}

async function waitFor(fn, ms = 2000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** Open the modal and wait for the stats sidebar to render its sections. */
async function openModal(opts) {
  const page = createPage(opts);
  page.win.__gbShowOrderEditModal();
  await waitFor(() => page.doc.querySelector('#__gb-oe-stats-body .gb-oe-section'));
  return page;
}

/** All key/value rows in the sidebar, as [key, value] text pairs. */
const rowsOf = (page) => Array.from(page.doc.querySelectorAll('.gb-oe-row'))
  .map((r) => [r.querySelector('.gb-oe-key').textContent, r.querySelector('.gb-oe-val').textContent]);

const hasRow = (page, key, value) => rowsOf(page).some(([k, v]) => k === key && v === value);

describe('order-edit modal — entry guards and request', () => {
  it('alerts and aborts when the page exposes no messageID', () => {
    const page = createPage({ messageId: null });
    page.win.__gbShowOrderEditModal();
    assert.equal(page.alerts.length, 1);
    assert.match(page.alerts[0], /Could not find a messageID/);
    assert.equal(page.doc.getElementById('__gb-oe-overlay'), null);
  });

  it('calls editOrder through the charge proxy with the page messageID', async () => {
    const page = await openModal();
    assert.deepEqual(page.calls[0], {
      action: 'chargeApiProxy',
      url: 'https://master.api.icustomize.com/admin/editOrder',
      method: 'PUT',
      body: { messageID: 'MSG-123' },
    });
    assert.equal(page.doc.getElementById('__gb-oe-iframe-sub').textContent, 'www.golfballs.com/cart');
  });

  it('points the cart iframe at the URL-encoded messageID', async () => {
    const page = await openModal({ messageId: 'abc 123/xyz' });
    assert.equal(
      page.doc.getElementById('__gb-oe-iframe').src,
      'https://www.golfballs.com/cart?editOrderMessageID=abc%20123%2Fxyz',
    );
  });

  it('does not open a second overlay while one is already on the page', async () => {
    const page = await openModal();
    page.win.__gbShowOrderEditModal();
    assert.equal(page.doc.querySelectorAll('#__gb-oe-overlay').length, 1);
  });
});

describe('order-edit modal — financial summary math', () => {
  it('derives the product subtotal from total minus tax, shipping and drop-ship', async () => {
    const page = await openModal();
    assert.equal(hasRow(page, 'Subtotal', '$100.00'), true);
    assert.equal(hasRow(page, 'Shipping', '$8.99'), true);
    assert.equal(hasRow(page, 'Tax', '$6.00'), true);
    assert.equal(page.doc.querySelector('.gb-oe-total-val').textContent, '$114.99');
  });

  it('marks shipping FREE (with the discount) and skips it from the subtotal math', async () => {
    const order = baseOrder();
    order.promotion = {
      freeShipping: true, shippingDiscount: 8.99,
      promo: 'FREESHIP', promoType: 'FREE_SHIPPING', promoDescription: 'Free ground shipping',
    };
    const page = await openModal({ order });
    // Shipping no longer subtracted: 114.99 − 6.00 tax = 108.99
    assert.equal(hasRow(page, 'Subtotal', '$108.99'), true);
    assert.equal(hasRow(page, 'Shipping', 'FREE ($8.99 off)'), true);
    assert.equal(hasRow(page, 'Code', 'FREESHIP'), true);
    assert.equal(hasRow(page, 'Type', 'FREE SHIPPING'), true);
    const activeRate = page.doc.querySelector('.gb-oe-ship-rate-row.active');
    assert.match(activeRate.textContent, /Ground/);
    assert.match(activeRate.textContent, /FREE/);
  });

  it('shows the selected shipping method pill and each rate with delivery estimate', async () => {
    const page = await openModal();
    assert.match(page.doc.querySelector('.gb-oe-ship-pill').textContent, /Ground/);
    const rates = Array.from(page.doc.querySelectorAll('.gb-oe-ship-rate-row')).map((r) => r.textContent.trim());
    assert.match(rates[0], /^Ground\$8\.99 · Jul 20$/);
    assert.match(rates[1], /^2nd Day\$24\.99$/);
  });

  it('formats cards on file as masked last-four with MM/YY expiration', async () => {
    const page = await openModal({
      info: { billingOptions: [{ ccLastNumbers: '1234', ccName: 'Jane Doe', ccExpiration: '1226' }] },
    });
    assert.equal(hasRow(page, '•••• 1234', 'Jane Doe · 12/26'), true);
  });

  it('collapses billing to "Same as shipping" and surfaces the contact email', async () => {
    const page = await openModal();
    assert.equal(hasRow(page, 'Address', 'Same as shipping'), true);
    assert.equal(hasRow(page, 'Email', 'jane@example.com'), true);
    assert.equal(hasRow(page, 'Name', 'Jane Doe'), true);
    assert.equal(hasRow(page, 'City', 'Reading, PA 19601'), true);
  });

  it('escapes markup coming back from the API instead of rendering it', async () => {
    const order = baseOrder();
    order.shippingAddress.firstName = '<b>Jane</b>';
    const page = await openModal({ order });
    assert.equal(page.doc.querySelector('.gb-oe-val b'), null);
    assert.equal(hasRow(page, 'Name', '<b>Jane</b> Doe'), true);
  });
});

describe('order-edit modal — charges block', () => {
  const CHARGES = [
    { amount: 60, type: 'Visa', last4: '1111', cardHolder: 'Jane Doe', note: '' },
    { amount: 54.99, type: 'MC', last4: '', cardHolder: '', note: 'Manual charge' },
  ];

  it('reports Settled when charges exactly cover the order total', async () => {
    const page = await openModal({ chargeRows: CHARGES });
    assert.equal(hasRow(page, 'Total Charged', '$114.99'), true);
    const balance = Array.from(page.doc.querySelectorAll('#__gb-oe-stats-body span'))
      .find((s) => s.textContent === 'Settled');
    assert.ok(balance, 'balance pill should read Settled');
  });

  it('reports the amount still owed when the order is undercharged', async () => {
    const page = await openModal({ chargeRows: [CHARGES[0]] });
    assert.equal(hasRow(page, 'Total Charged', '$60.00'), true);
    const owed = Array.from(page.doc.querySelectorAll('#__gb-oe-stats-body span'))
      .find((s) => s.textContent === '$54.99 owed');
    assert.ok(owed, 'balance pill should show $54.99 owed');
  });
});

describe('order-edit modal — API failure', () => {
  it('renders the error in the sidebar and still opens the cart iframe', async () => {
    const page = createPage({ resp: { ok: false, status: 500 } });
    page.win.__gbShowOrderEditModal();
    const errorBox = await waitFor(() => page.doc.querySelector('#__gb-oe-stats-error span')?.textContent && page.doc.querySelector('#__gb-oe-stats-error span'));
    assert.equal(errorBox.textContent, 'editOrder API failed: HTTP 500');
    assert.equal(
      page.doc.getElementById('__gb-oe-iframe').src,
      'https://www.golfballs.com/cart?editOrderMessageID=MSG-123',
    );
  });
});
