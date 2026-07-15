import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { employeeIdFromDocument, resolveEmployeeId } from '../src/lib/employeeIdentity.js';

const scripted = new JSDOM('<script>window.employeeID = 48174;</script>');
assert.equal(employeeIdFromDocument(scripted.window.document), '48174');

const field = new JSDOM('<input name="EmployeeID" value="68420">');
assert.equal(employeeIdFromDocument(field.window.document), '68420');

const cacheWrites = [];
const storage = {
  get(_key, callback) { callback({ gbEmployeeId: '77' }); },
  set(value) { cacheWrites.push(value); },
};
globalThis.window = {};
assert.equal(await resolveEmployeeId({ doc: scripted.window.document, storage }), '48174');
assert.deepEqual(cacheWrites, [{ gbEmployeeId: '48174' }]);
assert.equal(globalThis.window.__gbEmployeeId, '48174');

globalThis.window = {};
assert.equal(await resolveEmployeeId({ doc: new JSDOM('').window.document, storage }), '77');

const unsafe = new JSDOM('<script>window.employeeID = "not-an-id";</script>');
assert.equal(employeeIdFromDocument(unsafe.window.document), '');

console.log('employee identity tests passed');
