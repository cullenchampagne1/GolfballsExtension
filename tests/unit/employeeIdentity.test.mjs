/** Employee identity resolution from the CRM page and the cached fallback. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  employeeIdFromDocument,
  employeeNameFromDocument,
  resolveCurrentUserContext,
  resolveEmployeeId,
  sessionEmployeeIdentity,
} from '../../src/lib/employeeIdentity.js';

const cachedStorage = (cacheWrites = []) => ({
  get(_key, callback) { callback({ gbEmployeeId: '77' }); },
  set(value) { cacheWrites.push(value); },
});

const memoryStorage = (initial = {}) => {
  const data = structuredClone(initial);
  const writes = [];
  return {
    data,
    writes,
    get(keys, callback) {
      if (Array.isArray(keys)) {
        callback(Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]])));
      } else callback({ [keys]: data[keys] });
    },
    set(value) {
      writes.push(structuredClone(value));
      Object.assign(data, value);
    },
  };
};

describe('employee identity', () => {
  it('reads the signed-in employee id from the CRM toolbar on Search pages', () => {
    const searchPage = new JSDOM(
      [
        '<iframe id="ccaiFrame" src="/toolbar/index.html?mode=crm&userId=48174"></iframe>',
        '<input name="EmployeeID" value="999">', // record owner, not the signed-in rep
      ].join(''),
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

  it('maps the signed-in id to its directory option instead of the selected record owner', () => {
    const page = new JSDOM(`
      <select id="ddlSalesRepId">
        <option value="77" selected>Different Record Owner</option>
        <option value="48174">Cullen Champagne</option>
      </select>
    `);
    assert.equal(employeeNameFromDocument(page.window.document, '48174'), 'Cullen Champagne');
  });
});

describe('global current-user context', () => {
  it('publishes verified CRM identity and only bounded non-credential profile metadata', async () => {
    const page = new JSDOM('<iframe id="ccaiFrame" src="/toolbar?userId=48174"></iframe>');
    const storage = memoryStorage({
      gbEmployeeId: '48174',
      gbCurrentUser: {
        employeeId: '48174', employeeName: 'Cullen Champagne',
        source: 'crm_session', updatedAt: Date.now(), authorization: 'Bearer secret',
      },
      gbInstallationIdentity: {
        registered: true,
        installationId: '123e4567-e89b-12d3-a456-426614174000',
        displayName: 'Editable Profile Name',
        localPart: 'old.sender',
        source: 'settings_prompt',
        apiKey: 'must-not-cross',
      },
      devSettings: { 'email.localPart': 'cullen.champagne', password: 'must-not-cross' },
    });
    globalThis.window = page.window;
    const currentUser = await resolveCurrentUserContext({ doc: page.window.document, storage });

    assert.equal(currentUser.employeeId, '48174');
    assert.equal(currentUser.employeeName, 'Cullen Champagne');
    assert.equal(currentUser.name, 'Cullen Champagne');
    assert.equal(currentUser.nameSource, 'crm_session');
    assert.equal(currentUser.crmVerified, true);
    assert.equal(currentUser.sessionVerified, true);
    assert.deepEqual(sessionEmployeeIdentity(currentUser), {
      employeeId: '48174', employeeName: 'Cullen Champagne', updatedAt: currentUser.updatedAt,
    });
    assert.equal(currentUser.email.localPart, 'cullen.champagne');
    assert.equal(currentUser.email.addresses.golfballs, 'cullen.champagne@golfballs.com');
    assert.equal(currentUser.email.addresses.loyaltylogo, 'cullen.champagne@loyaltylogo.com');
    assert.equal(currentUser.installation.displayName, 'Editable Profile Name');
    assert.equal(currentUser.installation.installationId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(page.window.__gbCurrentUser, currentUser);
    assert.equal(page.window.__gbGetCurrentUser(), currentUser);
    assert.equal(Object.isFrozen(currentUser), true);
    assert.doesNotMatch(JSON.stringify(currentUser), /secret|password|authorization|apiKey/i);
    page.window.close();
  });

  it('rejects a stale cached rep and falls back to an exact id-directory match', async () => {
    const page = new JSDOM(`
      <iframe id="ccaiFrame" src="/toolbar?userId=42"></iframe>
      <select id="ddlSalesRepId">
        <option value="77" selected>Stale Record Rep</option>
        <option value="42">Taylor Signed In</option>
      </select>
    `);
    const storage = memoryStorage({
      gbEmployeeId: '77',
      gbCurrentUser: {
        employeeId: '77', employeeName: 'Wrong Cached User',
        source: 'crm_session', updatedAt: 12,
      },
    });
    globalThis.window = page.window;
    const currentUser = await resolveCurrentUserContext({ doc: page.window.document, storage });

    assert.equal(currentUser.employeeId, '42');
    assert.equal(currentUser.employeeName, 'Taylor Signed In');
    assert.equal(currentUser.nameSource, 'crm_directory');
    assert.equal(currentUser.crmVerified, true);
    assert.equal(currentUser.sessionVerified, false);
    assert.equal(sessionEmployeeIdentity(currentUser), null);
    assert.deepEqual(storage.data.gbCurrentUser, {
      employeeId: '42', employeeName: 'Taylor Signed In',
      source: 'crm_directory', updatedAt: currentUser.updatedAt,
    });
    page.window.close();
  });

  it('keeps an installation-profile fallback separate from session identity', async () => {
    const page = new JSDOM('');
    const storage = memoryStorage({
      gbInstallationIdentity: {
        registered: true,
        installationId: '123e4567-e89b-12d3-a456-426614174000',
        displayName: 'Profile Only',
      },
    });
    globalThis.window = page.window;
    const currentUser = await resolveCurrentUserContext({ doc: page.window.document, storage });

    assert.equal(currentUser.employeeId, '');
    assert.equal(currentUser.employeeName, '');
    assert.equal(currentUser.name, 'Profile Only');
    assert.equal(currentUser.nameSource, 'installation_profile');
    assert.equal(currentUser.crmVerified, false);
    assert.equal(currentUser.sessionVerified, false);
    assert.equal(sessionEmployeeIdentity(currentUser), null);
    page.window.close();
  });

  it('expires a cached session identity instead of presenting it as current', async () => {
    const page = new JSDOM('<iframe id="ccaiFrame" src="/toolbar?userId=42"></iframe>');
    const storage = memoryStorage({
      gbCurrentUser: {
        employeeId: '42', employeeName: 'Previous Login', source: 'crm_session',
        updatedAt: Date.now() - (9 * 60 * 60 * 1000),
      },
      gbInstallationIdentity: {
        registered: true,
        installationId: '123e4567-e89b-12d3-a456-426614174000',
        displayName: 'Registered Profile',
      },
    });
    globalThis.window = page.window;
    const currentUser = await resolveCurrentUserContext({ doc: page.window.document, storage });

    assert.equal(currentUser.employeeName, '');
    assert.equal(currentUser.name, 'Registered Profile');
    assert.equal(currentUser.sessionVerified, false);
    assert.equal(sessionEmployeeIdentity(currentUser), null);
    page.window.close();
  });
});
