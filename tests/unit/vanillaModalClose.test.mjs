/**
 * Unit tests — the vanilla overlays' close path + usage reporting.
 *
 * Loads the real manifest script set (usage-report.js → modal-chrome.js →
 * the modal) into one jsdom window with NOTHING stubbed but chrome.runtime.
 * The existing charge/order-edit suites stub `window.__gbCloseModal`, which is
 * exactly why nobody noticed that the helper's file was deleted in 2b7fcd16
 * and every close path threw ReferenceError in production. These tests refuse
 * that stub on purpose: they pass only if the shipped scripts define it.
 *
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const MANIFEST = JSON.parse(await read('manifest.json'));
const usageReport = await read('src/vanilla/usage-report.js');
const modalChrome = await read('src/vanilla/modals/modal-chrome.js');
const chargeModal = await read('src/vanilla/modals/charge-modal.js');
const orderEditModal = await read('src/vanilla/modals/order-edit-modal.js');

const CHARGE_CTX = {
  orderId: '2820701', userId: '42', pageTotal: 114.99, captured: 89.99,
  diffAmount: 25, isRefund: false, isZeroDiff: false, chargeRows: [],
};

const ORDER = {
  shippingAddress: { firstName: 'Jane', lastName: 'Doe', address1: '123 Main St', city: 'Reading', stateProvince: 'PA', postal: '19601', phone: '(610) 374-8344', email: 'jane@example.com' },
  billingAddress: { useShippingAddress: true },
  promotion: {},
  shippingRates: [{ method: 'Ground', price: { Amount: '8.99' } }],
  shippingMethod: 'Ground', salesTax: '6.00', orderTotal: '114.99',
  giftCertTotal: '0', dropShipFee: '0', paymentType: 'CreditCard', deliveryMethod: 'Ship',
};

/** The golfballs.com content-script list, in injection order. */
function contentScriptFiles() {
  const entry = MANIFEST.content_scripts.find(
    (group) => (group.js || []).includes('src/vanilla/modals/charge-modal.js'),
  );
  return entry ? entry.js : [];
}

/**
 * A page with the two shared vanilla scripts loaded exactly as the manifest
 * loads them — and no `__gbCloseModal` stub.
 */
function createPage(modalSource, { respond } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://api.golfballs.com/golfballs/adminnew/default.aspx?page=OrderDetail&orderID=2820701',
    runScripts: 'outside-only',
    virtualConsole: new VirtualConsole(),
  });
  const usage = [];
  dom.window.alert = () => {};
  dom.window.smartMessageId = () => 'MSG-123';
  dom.window.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        if (msg.action === 'gbUsageEvent') { usage.push(JSON.parse(JSON.stringify(msg.event))); return; }
        cb?.(respond ? respond(msg) : { ok: true, text: '{}' });
      },
    },
  };
  const context = dom.getInternalVMContext();
  vm.runInContext(usageReport, context);
  vm.runInContext(modalChrome, context);
  vm.runInContext(modalSource, context);
  return { win: dom.window, doc: dom.window.document, usage };
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };
const settleClose = () => new Promise((r) => setTimeout(r, 300));

describe('guard · vanilla overlay close + usage', () => {
  it('ships __gbCloseModal in the same script list as the modals that call it', () => {
    const files = contentScriptFiles();
    assert.ok(files.length, 'charge-modal.js is registered as a content script');
    assert.ok(
      files.indexOf('src/vanilla/modals/modal-chrome.js') !== -1,
      'the close helper is injected alongside the overlays',
    );
    assert.ok(
      files.indexOf('src/vanilla/modals/modal-chrome.js') < files.indexOf('src/vanilla/modals/charge-modal.js'),
      'the helper loads before its callers',
    );
    assert.ok(
      files.indexOf('src/vanilla/usage-report.js') < files.indexOf('src/vanilla/modals/charge-modal.js'),
      'the usage reporter loads before the overlays that report through it',
    );
  });

  it('closes the charge overlay from its close button and reports the surface', async () => {
    const page = createPage(chargeModal, {
      respond: () => ({ ok: true, text: JSON.stringify({ paymentMethods: [] }) }),
    });
    page.win.__gbShowChargeModal(CHARGE_CTX);
    await flush();

    const overlay = page.doc.getElementById('__gb-charge-overlay');
    assert.ok(overlay, 'the overlay mounted');
    assert.deepEqual(
      page.usage.map((e) => [e.kind, e.surface, e.surface_kind]),
      [['surface_open', 'Charge Customer', 'modal']],
      'opening reports exactly one open',
    );

    page.doc.getElementById('__gb-charge-close').click();
    await settleClose();

    assert.equal(page.doc.getElementById('__gb-charge-overlay'), null, 'the overlay is gone');
    const close = page.usage.find((e) => e.kind === 'surface_close');
    assert.ok(close, 'closing reports a close');
    assert.equal(close.surface, 'Charge Customer');
    assert.equal(typeof close.ms, 'number');
  });

  it('reports one close per overlay, however many close paths fire', async () => {
    const page = createPage(chargeModal, {
      respond: () => ({ ok: true, text: JSON.stringify({ paymentMethods: [] }) }),
    });
    page.win.__gbShowChargeModal(CHARGE_CTX);
    await flush();

    const overlay = page.doc.getElementById('__gb-charge-overlay');
    page.win.__gbCloseModal(overlay);
    page.win.__gbCloseModal(overlay);
    await settleClose();

    assert.equal(
      page.usage.filter((e) => e.kind === 'surface_close').length, 1,
      'a second close is a no-op, not a second sample',
    );
  });

  it('closes the order-edit overlay from its backdrop and reports Order Edit', async () => {
    const page = createPage(orderEditModal, {
      respond: () => ({ ok: true, text: JSON.stringify({ newOrder: ORDER, orderEditInfo: {} }) }),
    });
    page.win.__gbShowOrderEditModal();
    await flush();

    const overlay = page.doc.getElementById('__gb-oe-overlay');
    assert.ok(overlay, 'the overlay mounted');
    assert.equal(page.usage[0].surface, 'Order Edit');

    // Backdrop click: the overlay itself is the event target.
    overlay.dispatchEvent(new page.win.Event('click', { bubbles: true }));
    await settleClose();

    assert.equal(page.doc.getElementById('__gb-oe-overlay'), null, 'the overlay is gone');
    assert.ok(
      page.usage.some((e) => e.kind === 'surface_close' && e.surface === 'Order Edit'),
      'the backdrop path reports the close too',
    );
  });
});
