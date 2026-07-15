/**
 * Unit tests — src/lib/submitCaseCategory.js
 *
 * Applying a category to a CRM case is a read-merge-write: Get.ajax for the
 * current case, then Update.ajax with the merged payload in the query
 * string. These tests capture both URLs through a stubbed fetchRaw bridge
 * and assert the exact merged payload. Conventions per findPhone.test.mjs.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=280' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { submitCaseCategory, getEmployeeId } = await import('../../src/lib/submitCaseCategory.js');

const CASE_DATA = {
  caseID: 123,
  Name: 'Order issue',
  Direction: 'Out',
  Channel: 'Phone',
  OwnerID: 42,
  DepartmentID: 5,
};

function installChrome({ getText = JSON.stringify(CASE_DATA), updateText = '{"caseID":123}' } = {}) {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: (msg, cb) => {
        calls.push(msg);
        cb({ ok: true, text: msg.url.includes('/MyCase/Get.ajax') ? getText : updateText });
      },
    },
  };
  return calls;
}

/** The Update.ajax query string is raw (un-encoded) JSON — parse it back. */
function updatePayloadOf(calls) {
  const call = calls.find((c) => c.url.includes('/MyCase/Update.ajax?'));
  return JSON.parse(call.url.slice(call.url.indexOf('Update.ajax?') + 'Update.ajax?'.length));
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete dom.window.Case;
  dom.window.__gbEmployeeId = '';
});

describe('getEmployeeId — resolution precedence', () => {
  it('prefers the tbCurrentAdmin field on the page', async () => {
    document.body.innerHTML = '<input id="tbCurrentAdmin" value=" 99 ">';
    dom.window.__gbEmployeeId = '11';
    assert.equal(await getEmployeeId(), '99');
  });

  it('falls back to the case record ClosedBy, then the window cache', async () => {
    dom.window.Case = { ClosedBy: 12 };
    assert.equal(await getEmployeeId(), '12');
    delete dom.window.Case;
    dom.window.__gbEmployeeId = 88;
    assert.equal(await getEmployeeId(), '88');
  });

  it('reads the chrome.storage cache when the page exposes nothing', async () => {
    globalThis.chrome = {
      runtime: { sendMessage: () => {} },
      storage: { local: { get: (keys, cb) => cb({ gbEmployeeId: 7 }) } },
    };
    assert.equal(await getEmployeeId(), '7');
  });

  it('returns null when no identity source is available', async () => {
    globalThis.chrome = {
      runtime: { sendMessage: () => {} },
      storage: { local: { get: (keys, cb) => cb({}) } },
    };
    assert.equal(await getEmployeeId(), null);
  });
});

describe('submitCaseCategory — payload construction', () => {
  it('merges the fetched case with the new category and closes the case (Status 3)', async () => {
    const calls = installChrome();
    dom.window.__gbEmployeeId = '88';
    const res = await submitCaseCategory('123', 'Returns', 'Refund');
    assert.deepEqual(res, { ok: true });
    assert.equal(calls[0].url, 'https://api.golfballs.com/golfballs/crm/Admin/MyCase/Get.ajax?123');
    assert.deepEqual(updatePayloadOf(calls), {
      Name: 'Order issue',
      Direction: 'Out',
      Channel: 'Phone',
      Category: 'Returns',
      Subcategory: 'Refund',
      Owner: '42',
      caseID: '123',
      Department: '5',
      Status: 3,
      ClosedBy: '88',
    });
  });

  it('reuses the category as subcategory when none is given', async () => {
    const calls = installChrome();
    dom.window.__gbEmployeeId = '88';
    await submitCaseCategory('123', 'Returns', '');
    assert.equal(updatePayloadOf(calls).Subcategory, 'Returns');
  });

  it('applies CRM defaults for missing case fields and omits ClosedBy without an identity', async () => {
    const calls = installChrome({ getText: '{"caseID":123}' });
    const res = await submitCaseCategory('123', 'Shipping');
    assert.equal(res.ok, true);
    assert.deepEqual(updatePayloadOf(calls), {
      Name: '',
      Direction: 'In',
      Channel: 'Email',
      Category: 'Shipping',
      Subcategory: 'Shipping',
      Owner: '1',
      caseID: '123',
      Department: '2',
      Status: 3,
    });
  });
});

describe('submitCaseCategory — error paths', () => {
  it('refuses to run without a caseID', async () => {
    const res = await submitCaseCategory('', 'Returns');
    assert.deepEqual(res, { ok: false, error: 'No caseID found.' });
  });

  it('fails when the case read comes back unreadable', async () => {
    installChrome({ getText: '<html>login page</html>' });
    const res = await submitCaseCategory('123', 'Returns');
    assert.deepEqual(res, { ok: false, error: 'Could not read case data.' });
  });

  it('echoes a short server error when the update does not confirm the case', async () => {
    installChrome({ updateText: 'Category is no longer valid' });
    const res = await submitCaseCategory('123', 'Returns');
    assert.deepEqual(res, { ok: false, error: 'Category is no longer valid' });
  });

  it('accepts a plain-text success acknowledgement from the update endpoint', async () => {
    installChrome({ updateText: 'Success' });
    const res = await submitCaseCategory('123', 'Returns');
    assert.deepEqual(res, { ok: true });
  });
});
