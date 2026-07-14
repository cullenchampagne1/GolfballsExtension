/** Regression tests for the MAIN-world iCustomize authentication broker. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const source = await readFile(new URL('../iframe/auth-session-broker.js', import.meta.url), 'utf8');

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function installBroker() {
  const dom = new JSDOM('<!doctype html><body></body>', {
    url: 'https://admin.icustomize.com/order?entityID=123',
    runScripts: 'outside-only',
  });
  const calls = [];
  const win = dom.window;
  win.Headers = Headers;
  win.Request = Request;
  win.Response = Response;
  win.TextDecoder = TextDecoder;
  win.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '11' },
    });
  };
  win.eval(source);
  return { dom, win, calls };
}

const token = jwt({
  exp: Math.floor(Date.now() / 1000) + 3600,
  adminUserID: 42,
  UserName: 'Test Employee',
});

const { dom, win, calls } = installBroker();
await win.fetch('https://master.api.icustomize.com/user/getCart/123', {
  headers: { adminsession: token },
});

const identity = await win.__gbAuthBrokerExecute({ action: 'identity' });
assert.deepEqual(JSON.parse(JSON.stringify(identity)), {
  ok: true,
  identity: { employeeId: '42', employeeName: 'Test Employee' },
});
assert.equal(JSON.stringify(identity).includes(token), false, 'identity result must not expose the credential');

const note = await win.__gbAuthBrokerExecute({
  action: 'recordNote',
  entityID: '123',
  entityName: 'order',
  note: { subject: 'Follow up', body: 'Called customer', audienceVal: 'Sales' },
});
assert.equal(note.ok, true);
const noteCall = calls.at(-1);
assert.equal(noteCall.url, 'https://51grploz6a.execute-api.us-east-2.amazonaws.com/production/admin/recordNote');
assert.equal(noteCall.options.headers.adminsession, token);
const noteBody = JSON.parse(noteCall.options.body);
assert.equal(noteBody.data.employee_id, '42');
assert.equal(noteBody.data.employee_name, 'Test Employee');

const charge = await win.__gbAuthBrokerExecute({
  action: 'chargeApi',
  url: 'https://master.api.icustomize.com/user/chargeCard',
  method: 'PUT',
  body: '{"amount":10}',
});
assert.equal(charge.ok, true);
assert.equal(calls.at(-1).options.headers.adminsession, token);

await win.fetch('https://production-private-api.icustomize.com/api/user/paymentcreditcard/getuserpaymentmethods', {
  method: 'POST',
  headers: { authorization: token },
});
const privateCharge = await win.__gbAuthBrokerExecute({
  action: 'chargeApi',
  url: 'https://production-private-api.icustomize.com/api/user/paymentcreditcard/getuserpaymentmethods',
  method: 'POST',
  body: 'orderID=123',
});
assert.equal(privateCharge.ok, true);
assert.equal(calls.at(-1).options.headers.authorization, token);

const blocked = await win.__gbAuthBrokerExecute({
  action: 'chargeApi',
  url: 'https://master.api.icustomize.com/admin/deleteEverything',
  method: 'PUT',
  body: '{}',
});
assert.equal(blocked.ok, false);
assert.match(blocked.error, /Blocked payment endpoint/);

await win.fetch('https://admin.icustomize.com/logout');
const afterLogout = await win.__gbAuthBrokerExecute({ action: 'identity' });
assert.equal(afterLogout.ok, false, 'logout must clear the in-memory credential');
dom.window.close();

const storageOnly = installBroker();
storageOnly.win.localStorage.setItem('unrelated', token);
storageOnly.win.sessionStorage.setItem('another', token);
const withoutCapture = await storageOnly.win.__gbAuthBrokerExecute({ action: 'identity' });
assert.equal(withoutCapture.ok, false, 'JWT-shaped storage values must never be scanned');
storageOnly.dom.window.close();

assert.equal(/localStorage|sessionStorage|document\.cookie/.test(source), false, 'broker must not read page storage or cookies');
assert.equal(/console\.(?:log|debug|info|warn|error)/.test(source), false, 'broker must not log credentials or decoded claims');

console.log('auth session broker tests passed');
