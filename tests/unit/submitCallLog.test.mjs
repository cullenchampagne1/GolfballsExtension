/**
 * Unit tests — src/lib/submitCallLog.js
 *
 * The call-log submitter is a GET-form-then-POST flow against the CRM's
 * ASP.NET activity-log page. These tests stub the chrome.runtime fetchRaw
 * bridge and assert the exact URLs and form payloads the CRM receives,
 * plus every validation short-circuit. Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=987654',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.FormData = dom.window.FormData;

const { submitCallLog, readCallContext } = await import('../../src/lib/submitCallLog.js');

/** Realistic slice of the CRM's Page=272 activity-log form. */
const CRM_FORM_HTML = `<!doctype html><html><body>
  <form method="post" action="Default.aspx?Page=272">
    <input type="hidden" name="__VIEWSTATE" value="VS123">
    <input type="hidden" name="__EVENTVALIDATION" value="EV456">
    <select name="ctl00$Content$tbCategory">
      <option value="0" selected>None</option>
      <option value="5">Sales</option>
    </select>
    <input name="ctl00$Content$tbSubject" value="">
    <textarea name="ctl00$Content$tbBody"></textarea>
    <input type="checkbox" name="ctl00$Content$Voicemail">
    <input type="submit" id="ctl00_Content_btnSubmit" name="ctl00$Content$btnSubmit" value="Save Activity">
  </form>
</body></html>`;

const VALID_CONTEXT = { contactId: '555001', phone: '6103748344', employeeId: '77', contactName: 'Jane Doe' };
const VALID_TEMPLATE = { callCategory: '5', subject: 'Left VM', body: 'Called about order 2820701', callVoicemail: true, callDirection: 1 };

function installChrome(responder) {
  const calls = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: (msg, cb) => { calls.push(msg); cb(responder(msg, calls.length)); },
    },
  };
  return calls;
}

function resetIdentity() {
  document.body.innerHTML = '';
  dom.window.__gbEmployeeId = '';
}

describe('submitCallLog — validation short-circuits', () => {
  it('rejects a template with no callCategory before touching the network', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    const res = await submitCallLog({ template: { subject: 'No category' }, context: VALID_CONTEXT });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Template has no category set. Open Notes editor and pick a CRM category first.');
    assert.equal(calls.length, 0);
  });

  it('lists every missing context field in the error', async () => {
    resetIdentity();
    installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: {} });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'Missing contact ID, phone number, employee ID. Open from a real contact page first.');
  });

  it('fails with the sandbox message when chrome.runtime is unavailable', async () => {
    globalThis.chrome = undefined;
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'CRM bridge unavailable — not running in extension context.');
  });
});

describe('submitCallLog — CRM request construction', () => {
  it('builds the Page=272 GET URL with phone, employee, contact and inbound direction', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.equal(res.ok, true);
    assert.equal(
      calls[0].url,
      'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=272'
        + '&phone=6103748344&employeeId=77&userName=Jane%20Doe&userId=555001&direction=1&callFrom=0',
    );
  });

  it('defaults the direction to outbound (2) when callDirection is not 1', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    await submitCallLog({ template: { ...VALID_TEMPLATE, callDirection: undefined }, context: VALID_CONTEXT });
    assert.match(calls[0].url, /&direction=2&callFrom=0$/);
  });

  it('overlays the template onto the scraped ASP.NET form and POSTs it back', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.equal(res.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, 'POST');
    assert.equal(calls[1].url, calls[0].url);
    assert.deepEqual(calls[1].headers, { 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = new URLSearchParams(calls[1].body);
    assert.equal(body.get('__VIEWSTATE'), 'VS123');
    assert.equal(body.get('__EVENTVALIDATION'), 'EV456');
    assert.equal(body.get('ctl00$Content$tbCategory'), '5');
    assert.equal(body.get('ctl00$Content$tbSubject'), 'Left VM');
    assert.equal(body.get('ctl00$Content$tbBody'), 'Called about order 2820701');
    assert.equal(body.get('ctl00$Content$Voicemail'), 'on');
    assert.equal(body.get('ctl00$Content$btnSubmit'), 'Save Activity');
  });

  it('omits the Voicemail flag when the template does not set it', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    await submitCallLog({ template: { ...VALID_TEMPLATE, callVoicemail: false }, context: VALID_CONTEXT });
    const body = new URLSearchParams(calls[1].body);
    assert.equal(body.has('ctl00$Content$Voicemail'), false);
  });

  it('falls back to the template name as subject when no subject is set', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    await submitCallLog({
      template: { callCategory: 5, name: 'Voicemail Left' },
      context: VALID_CONTEXT,
    });
    const body = new URLSearchParams(calls[1].body);
    assert.equal(body.get('ctl00$Content$tbSubject'), 'Voicemail Left');
    assert.equal(body.get('ctl00$Content$tbBody'), '');
  });

  it('runs a configured follow-up against the logged call contact', async () => {
    const calls = installChrome(() => ({ ok: true, text: CRM_FORM_HTML }));
    const res = await submitCallLog({
      template: { ...VALID_TEMPLATE, followUpActionId: 'action_1' },
      context: VALID_CONTEXT,
    }, {
      loadActions: async () => [{ id: 'action_1', enabled: true, source: '' }],
      hydrateContact: async (contact) => ({
        page: { contact: { contactId: contact.contactId } },
        context: { doc: {} },
      }),
      runAction: async ({ action, page }) => {
        calls.push({ followUpAction: action.id, contactId: page.contact.contactId });
        return { ok: true, steps: 1 };
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.followUpAction.ok, true);
    assert.deepEqual(calls[2], { followUpAction: 'action_1', contactId: '555001' });
  });
});

describe('submitCallLog — transport failures', () => {
  it('surfaces the HTTP status when the form GET fails', async () => {
    installChrome(() => ({ ok: false, status: 500 }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'CRM returned HTTP 500 loading the form.' });
  });

  it('fails cleanly when the CRM response has no form to scrape', async () => {
    installChrome(() => ({ ok: true, text: '<html><body><p>Session expired</p></body></html>' }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'Activity-log form not found in the CRM response.' });
  });

  it('surfaces the HTTP status when the POST is rejected', async () => {
    installChrome((msg, n) => (n === 1 ? { ok: true, text: CRM_FORM_HTML } : { ok: false, status: 403 }));
    const res = await submitCallLog({ template: VALID_TEMPLATE, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'CRM rejected the submission (HTTP 403).' });
  });
});

describe('readCallContext — parsing the contact page', () => {
  it('reads contact id from the URL, digits-only phone, name and employee id', async () => {
    globalThis.chrome = undefined;
    document.body.innerHTML = `
      <span id="lblContactFirstName">Jane</span>
      <span id="lblContactLastName">Doe</span>
      <span id="lblContactPhoneNumber"><a href="#">(610) 374-8344</a></span>
      <input id="employeeID" value="42">
    `;
    const ctx = await readCallContext();
    assert.deepEqual(ctx, {
      contactId: '987654',
      phone: '6103748344',
      contactName: 'Jane Doe',
      employeeId: '42',
      contactType: 'contact',
    });
  });

  it('falls back to the hidden tbContactId input when the URL has no customerID', async () => {
    const dom2 = new JSDOM(
      '<body><input id="tbContactId" value=" 123456 "></body>',
      { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=271' },
    );
    const saved = { document: globalThis.document, location: globalThis.location };
    globalThis.document = dom2.window.document;
    globalThis.location = dom2.window.location;
    try {
      const ctx = await readCallContext();
      assert.equal(ctx.contactId, '123456');
      assert.equal(ctx.phone, '');
      assert.equal(ctx.contactName, '');
    } finally {
      globalThis.document = saved.document;
      globalThis.location = saved.location;
    }
  });
});
