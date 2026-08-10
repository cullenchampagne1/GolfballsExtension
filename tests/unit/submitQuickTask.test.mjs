/**
 * Unit tests — src/lib/submitQuickTask.js
 *
 * The task submitter posts a JSON payload in the Create.ajax query string.
 * These tests decode the exact payload the CRM receives (subject, dates,
 * category/priority normalization) and exercise every validation gate.
 * Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', {
  url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=555&accountID=777',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;

const { submitQuickTask, readTaskContext } = await import('../../src/lib/submitQuickTask.js');

const VALID_CONTEXT = { contactId: '555001', employeeId: '77' };

/* m/d/yyyy the way the CRM expects it — used only to build EXPECTED values. */
const crmDate = (daysFromToday = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

function installChrome(response = { ok: true, text: '{"TaskId":4321}' }) {
  const calls = [];
  globalThis.chrome = {
    runtime: { sendMessage: (msg, cb) => { calls.push(msg); cb(response); } },
  };
  return calls;
}

/** Decode the JSON payload out of the Create.ajax query string. */
function payloadOf(url) {
  const qs = url.split('/golfballs/crm/Admin/Task/Create.ajax?')[1];
  return JSON.parse(decodeURIComponent(qs));
}

describe('submitQuickTask — validation gates', () => {
  it('rejects a template with a blank subject', async () => {
    const res = await submitQuickTask({ template: { subject: '   ' }, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'Task needs a subject. Add one to the template or in the custom form.' });
  });

  it('rejects a subject over 500 characters', async () => {
    const res = await submitQuickTask({ template: { subject: 'x'.repeat(501) }, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'Task subject exceeds 500 characters.' });
  });

  it('rejects a description over 4,000 characters', async () => {
    const res = await submitQuickTask({
      template: { subject: 'Follow up', body: 'y'.repeat(4001) },
      context: VALID_CONTEXT,
    });
    assert.deepEqual(res, { ok: false, error: 'Task description exceeds 4,000 characters.' });
  });

  it('rejects a non-numeric contact id with a clear message', async () => {
    dom.window.__gbEmployeeId = '';
    const res = await submitQuickTask({
      template: { subject: 'Follow up' },
      context: { contactId: 'abc123', employeeId: '77' },
    });
    assert.deepEqual(res, { ok: false, error: 'Missing valid contact ID. Open from a real contact or account page first.' });
  });

  it('lists both ids when contact and employee are missing', async () => {
    dom.window.__gbEmployeeId = '';
    globalThis.chrome = undefined;
    const res = await submitQuickTask({ template: { subject: 'Follow up' }, context: {} });
    assert.deepEqual(res, {
      ok: false,
      error: 'Missing valid contact ID, valid employee ID. Open from a real contact or account page first.',
    });
  });

  it('fails with the sandbox message when chrome.runtime is unavailable', async () => {
    globalThis.chrome = undefined;
    const res = await submitQuickTask({ template: { subject: 'Follow up' }, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'CRM bridge unavailable — not running in extension context.' });
  });

  it('refuses to send a request that exceeds the CRM URL limit', async () => {
    installChrome();
    // 4,000 quote chars pass length validation but every one encodes to
    // %5C%22 (6 chars) in the query string, blowing past the 20k limit.
    const res = await submitQuickTask({
      template: { subject: 'Follow up', body: '"'.repeat(4000) },
      context: VALID_CONTEXT,
    });
    assert.deepEqual(res, { ok: false, error: 'Task request exceeds the CRM URL limit.' });
  });
});

describe('submitQuickTask — Create.ajax payload construction', () => {
  it('builds the full CRM payload with today live date and defaulted ids', async () => {
    const calls = installChrome();
    const res = await submitQuickTask({
      template: { subject: '  Call about proof  ', body: ' Check logo placement ', priority: 3, categoryId: 12, daysOut: null },
      context: { contactId: '555001', employeeId: '77' },
    });
    assert.deepEqual(res, { ok: true, taskId: 4321 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'fetchRaw');
    assert.ok(calls[0].url.startsWith('https://api.golfballs.com/golfballs/crm/Admin/Task/Create.ajax?'));
    assert.deepEqual(payloadOf(calls[0].url), {
      TaskID: '',
      Subject: 'Call about proof',
      Description: 'Check logo placement',
      LiveDate: crmDate(0),
      DueDate: crmDate(0),
      taskCategoryID: '12',
      taskStatusID: '1',
      Priority: '3',
      contactID: '555001',
      leadID: '0',
      employeeID: '77',
      caseID: 0,
    });
  });

  it('offsets the due date by daysOut in m/d/yyyy format', async () => {
    const calls = installChrome();
    await submitQuickTask({
      template: { subject: 'Follow up', daysOut: 7 },
      context: VALID_CONTEXT,
    });
    assert.equal(payloadOf(calls[0].url).DueDate, crmDate(7));
  });

  it('treats zero or negative daysOut as due today', async () => {
    const calls = installChrome();
    await submitQuickTask({ template: { subject: 'Follow up', daysOut: 0 }, context: VALID_CONTEXT });
    await submitQuickTask({ template: { subject: 'Follow up', daysOut: -5 }, context: VALID_CONTEXT });
    assert.equal(payloadOf(calls[0].url).DueDate, crmDate(0));
    assert.equal(payloadOf(calls[1].url).DueDate, crmDate(0));
  });

  it('normalizes an out-of-range priority to the Medium default', async () => {
    const calls = installChrome();
    await submitQuickTask({ template: { subject: 'Follow up', priority: 9 }, context: VALID_CONTEXT });
    assert.equal(payloadOf(calls[0].url).Priority, '2');
  });

  it('normalizes a garbage category id to 0', async () => {
    const calls = installChrome();
    await submitQuickTask({ template: { subject: 'Follow up', categoryId: 'DROP TABLE' }, context: VALID_CONTEXT });
    assert.equal(payloadOf(calls[0].url).taskCategoryID, '0');
  });

  it('uses the template name as the subject fallback', async () => {
    const calls = installChrome();
    await submitQuickTask({ template: { name: 'Send catalog' }, context: VALID_CONTEXT });
    assert.equal(payloadOf(calls[0].url).Subject, 'Send catalog');
  });
});

describe('submitQuickTask — response handling', () => {
  it('surfaces the HTTP status when the CRM rejects the request', async () => {
    installChrome({ ok: false, status: 500 });
    const res = await submitQuickTask({ template: { subject: 'Follow up' }, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'CRM returned HTTP 500.' });
  });

  it('fails when the CRM answers 200 but returns no TaskId', async () => {
    installChrome({ ok: true, text: '{"Message":"queued"}' });
    const res = await submitQuickTask({ template: { subject: 'Follow up' }, context: VALID_CONTEXT });
    assert.deepEqual(res, { ok: false, error: 'CRM accepted the request but no TaskId came back.' });
  });

  it('treats an unparseable 200 body as success (HTTP result wins)', async () => {
    installChrome({ ok: true, text: '<html>weird proxy page</html>' });
    const res = await submitQuickTask({ template: { subject: 'Follow up' }, context: VALID_CONTEXT });
    assert.equal(res.ok, true);
    assert.equal(res.taskId, undefined);
  });

  it('runs a configured follow-up against the created task contact', async () => {
    installChrome();
    const calls = [];
    const res = await submitQuickTask({
      template: { subject: 'Follow up', followUpActionId: 'action_1' },
      context: VALID_CONTEXT,
    }, {
      loadActions: async () => [{ id: 'action_1', enabled: true, source: '' }],
      hydrateContact: async (contact) => {
        calls.push(['hydrate', contact.contactId, contact.contactUrl]);
        return { page: { contact: { contactId: contact.contactId } }, context: { doc: {} } };
      },
      runAction: async ({ action, page }) => {
        calls.push(['run', action.id, page.contact.contactId]);
        return { ok: true, steps: 1 };
      },
    });

    assert.equal(res.ok, true);
    assert.equal(res.taskId, 4321);
    assert.equal(res.followUpAction.ok, true);
    assert.deepEqual(calls, [
      ['hydrate', '555001', 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=555001'],
      ['run', 'action_1', '555001'],
    ]);
  });
});

describe('readTaskContext — parsing the contact/account page', () => {
  it('reads contact id, account id, name and employee id from a contact page', async () => {
    document.body.innerHTML = `
      <span id="lblContactFirstName">Jane</span>
      <span id="lblContactLastName">Doe</span>
      <input id="employeeID" value="42">
    `;
    const ctx = await readTaskContext();
    assert.deepEqual(ctx, { contactId: '555', accountId: '777', contactName: 'Jane Doe', employeeId: '42' });
  });

  it('falls back to hidden inputs and drops a zero account id', async () => {
    const dom2 = new JSDOM(
      `<body>
        <input id="tbContactId" value="888">
        <input id="AccountID" value="0">
        <input id="Name" value="Acme Corp">
      </body>`,
      { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=271' },
    );
    const saved = { document: globalThis.document, location: globalThis.location };
    globalThis.document = dom2.window.document;
    globalThis.location = dom2.window.location;
    try {
      const ctx = await readTaskContext();
      assert.equal(ctx.contactId, '888');
      assert.equal(ctx.accountId, '');
      assert.equal(ctx.contactName, 'Acme Corp');
    } finally {
      globalThis.document = saved.document;
      globalThis.location = saved.location;
    }
  });

  it('drops a zero contact id so account pages fall back to the rep contact', async () => {
    // Account pages render #tbContactId=0 (no current contact). A raw
    // '0' is truthy and would be created against contact 0 (fails).
    const dom3 = new JSDOM(
      `<body>
        <input id="tbContactId" value="0">
        <input id="AccountID" value="159590">
        <input id="Name" value="Scott Plumbing">
      </body>`,
      { url: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=271&accountID=159590' },
    );
    const saved = { document: globalThis.document, location: globalThis.location };
    globalThis.document = dom3.window.document;
    globalThis.location = dom3.window.location;
    try {
      const ctx = await readTaskContext();
      assert.equal(ctx.contactId, '');            // '0' normalized to empty
      assert.equal(!ctx.contactId, true);          // so the fallback check now fires
      assert.equal(ctx.accountId, '159590');
    } finally {
      globalThis.document = saved.document;
      globalThis.location = saved.location;
    }
  });
});
