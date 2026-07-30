/** Employee identity resolution from the CRM page and the cached fallback. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { employeeIdFromDocument, resolveEmployeeId } from '../../src/lib/employeeIdentity.js';

const cachedStorage = (cacheWrites = []) => ({
  get(_key, callback) { callback({ gbEmployeeId: '77' }); },
  set(value) { cacheWrites.push(value); },
});

describe('employee identity', () => {
  it('reads the signed-in employee id from the CRM toolbar on Search pages', () => {
    const searchPage = new JSDOM(
      '<iframe id="ccaiFrame" src="/toolbar/index.html?mode=crm&userId=48174"></iframe>',
      { url: 'https://api.golfballs.com/golfballs/crm/Admin/Default.aspx?Page=360' },
    );
    assert.equal(employeeIdFromDocument(searchPage.window.document), '48174');
  });

  it('reads the employee id from an inline window.employeeID script', () => {
    const scripted = new JSDOM('<script>window.employeeID = 48174;</script>');
    assert.equal(employeeIdFromDocument(scripted.window.document), '48174');
  });

  it('reads the employee id from an EmployeeID form field', () => {
    const field = new JSDOM('<input name="EmployeeID" value="68420">');
    assert.equal(employeeIdFromDocument(field.window.document), '68420');
  });

  it('rejects a non-numeric employee id rather than trusting the page', () => {
    const unsafe = new JSDOM('<script>window.employeeID = "not-an-id";</script>');
    assert.equal(employeeIdFromDocument(unsafe.window.document), '');
  });

  it('prefers the page id, caches it, and publishes it on window', async () => {
    const scripted = new JSDOM('<script>window.employeeID = 48174;</script>');
    const cacheWrites = [];
    globalThis.window = {};
    const resolved = await resolveEmployeeId({
      doc: scripted.window.document, storage: cachedStorage(cacheWrites),
    });
    assert.equal(resolved, '48174');
    assert.deepEqual(cacheWrites, [{ gbEmployeeId: '48174' }]);
    assert.equal(globalThis.window.__gbEmployeeId, '48174');
  });

  it('falls back to the cached id when the page carries none', async () => {
    globalThis.window = {};
    const resolved = await resolveEmployeeId({
      doc: new JSDOM('').window.document, storage: cachedStorage(),
    });
    assert.equal(resolved, '77');
  });
});
