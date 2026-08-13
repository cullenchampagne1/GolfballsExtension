/** MAIN-world iCustomize authentication broker.
 *
 * The broker captures a credential from observed traffic and holds it in memory,
 * so the primary suite shares one installed broker and its `it` blocks run in
 * declaration order (capture → use → logout).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const sourceUrl = new URL('../../iframe/auth-session-broker.js', import.meta.url);
let source;

before(async () => { source = await readFile(sourceUrl, 'utf8'); });

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
  class FakeXMLHttpRequest {
    constructor() { this.status = 200; this.listeners = new Map(); }
    open(method, url) { this.method = method; this.url = String(url); }
    setRequestHeader(name, value) { this.headers ||= {}; this.headers[name] = value; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    send(body) {
      calls.push({ url: this.url, options: { method: this.method, headers: this.headers || {}, body } });
      this.listeners.get('loadend')?.();
    }
  }
  win.XMLHttpRequest = FakeXMLHttpRequest;
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

describe('auth session broker · captured credential lifecycle', () => {
  let win;
  let calls;
  let dom;

  before(async () => {
    ({ dom, win, calls } = installBroker());
    await win.fetch('https://master.api.icustomize.com/user/getCart/123', {
      headers: { adminsession: token },
    });
  });
  after(() => dom.window.close());

  it('derives the employee identity without exposing the credential', async () => {
    const identity = await win.__gbAuthBrokerExecute({ action: 'identity' });
    assert.deepEqual(JSON.parse(JSON.stringify(identity)), {
      ok: true,
      identity: { employeeId: '42', employeeName: 'Test Employee' },
    });
    assert.equal(JSON.stringify(identity).includes(token), false,
      'identity result must not expose the credential');
  });

  it('records a CRM note with the captured session and resolved employee', async () => {
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
  });

  it('attaches the session to an allowlisted charge call', async () => {
    const charge = await win.__gbAuthBrokerExecute({
      action: 'chargeApi',
      url: 'https://master.api.icustomize.com/user/chargeCard',
      method: 'PUT',
      body: '{"amount":10}',
    });
    assert.equal(charge.ok, true);
    assert.equal(calls.at(-1).options.headers.adminsession, token);
  });

  it('uses the authorization credential for the private payment api', async () => {
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
  });

  it('blocks a non-payment endpoint', async () => {
    const blocked = await win.__gbAuthBrokerExecute({
      action: 'chargeApi',
      url: 'https://master.api.icustomize.com/admin/deleteEverything',
      method: 'PUT',
      body: '{}',
    });
    assert.equal(blocked.ok, false);
    assert.match(blocked.error, /Blocked payment endpoint/);
  });

  it('clears the in-memory credential on logout', async () => {
    await win.fetch('https://admin.icustomize.com/logout');
    const afterLogout = await win.__gbAuthBrokerExecute({ action: 'identity' });
    assert.equal(afterLogout.ok, false, 'logout must clear the in-memory credential');
  });
});

describe('auth session broker · capture sources', () => {
  it('signals when a new authenticated identity becomes available without putting claims in event detail', async () => {
    const announced = installBroker();
    const events = [];
    announced.win.document.addEventListener('GB_AUTH_IDENTITY_AVAILABLE', (event) => {
      events.push(event.detail);
    });
    await announced.win.fetch('https://master.api.icustomize.com/user/getCart/123', {
      headers: { adminsession: token },
    });
    assert.deepEqual(events, [null]);
    announced.dom.window.close();
  });

  it('captures a credential set through XMLHttpRequest headers', async () => {
    const xhrOnly = installBroker();
    const xhr = new xhrOnly.win.XMLHttpRequest();
    xhr.open('GET', 'https://master.api.icustomize.com/user/getCart/123');
    xhr.setRequestHeader('AdminSession', token);
    xhr.send();
    const identity = await xhrOnly.win.__gbAuthBrokerExecute({ action: 'identity' });
    assert.deepEqual(JSON.parse(JSON.stringify(identity)), {
      ok: true,
      identity: { employeeId: '42', employeeName: 'Test Employee' },
    });
    xhrOnly.dom.window.close();
  });

  it('never scans page storage for JWT-shaped values', async () => {
    const storageOnly = installBroker();
    storageOnly.win.localStorage.setItem('unrelated', token);
    storageOnly.win.sessionStorage.setItem('another', token);
    const identity = await storageOnly.win.__gbAuthBrokerExecute({ action: 'identity' });
    assert.equal(identity.ok, false, 'JWT-shaped storage values must never be scanned');
    storageOnly.dom.window.close();
  });
});

describe('auth session broker · source guardrails', () => {
  it('does not read page storage or cookies', () => {
    assert.equal(/localStorage|sessionStorage|document\.cookie/.test(source), false,
      'broker must not read page storage or cookies');
  });

  it('does not log credentials or decoded claims', () => {
    assert.equal(/console\.(?:log|debug|info|warn|error)/.test(source), false,
      'broker must not log credentials or decoded claims');
  });

  it('bridges only the authenticated employee name and id to extension frames', async () => {
    const [toolbar, iframeBridge, background, main] = await Promise.all([
      readFile(new URL('../../iframe/toolbar.js', import.meta.url), 'utf8'),
      readFile(new URL('../../iframe/message-bridge.js', import.meta.url), 'utf8'),
      readFile(new URL('../../background.js', import.meta.url), 'utf8'),
      readFile(new URL('../../src/vanilla/main.js', import.meta.url), 'utf8'),
    ]);
    assert.match(toolbar, /gbCurrentUser:\s*\{ employeeId, employeeName, source: 'crm_session', updatedAt \}/);
    assert.match(toolbar, /post\('GB_EMPLOYEE_IDENTITY',[\s\S]*employeeId,[\s\S]*employeeName: hasSafeName \? employeeName : '',[\s\S]*updatedAt/);
    assert.match(toolbar, /GB_AUTH_IDENTITY_AVAILABLE/);
    assert.match(toolbar, /setTimeout\(\(\) => __gbBroadcastAuthenticatedIdentity\(true\), 1000\)/);
    assert.match(toolbar, /setInterval\(\(\) => __gbBroadcastAuthenticatedIdentity\(true\), 60_000\)/);
    assert.match(iframeBridge, /'GB_EMPLOYEE_IDENTITY'/);
    assert.match(background, /'GB_EMPLOYEE_IDENTITY'/);
    assert.match(main, /gbCurrentUser:\s*\{ employeeId, employeeName, source: 'crm_session', updatedAt \}/);
  });
});
