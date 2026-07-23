/** CSV/XLSX contact import: parsing, normalisation, ids, and direct variables. */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  parseCsvMatrix,
  parseXlsxMatrix,
  normalizeContactMatrix,
  contactIdsFromRow,
  directContactVariables,
} from '../../src/lib/contactImport.js';

before(() => {
  globalThis.DOMParser = new JSDOM('').window.DOMParser;
});

const encoder = new TextEncoder();
const u16 = (value) => [value & 255, (value >>> 8) & 255];
const u32 = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];

// Minimal stored-ZIP builder. CRC is not consulted by the extension parser;
// this fixture exercises the real XLSX central-directory and worksheet path.
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0),
      ...nameBytes, ...data,
    ]);
    locals.push(local);
    centrals.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes,
    ]));
    offset += local.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(centrals.length), ...u16(centrals.length),
    ...u32(centralSize), ...u32(offset), ...u16(0),
  ]);
  const parts = [...locals, ...centrals, eocd];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) { output.set(part, cursor); cursor += part.length; }
  return output.buffer;
}

describe('contact import · csv', () => {
  it('normalises a quoted contact row and reports the unusable one', () => {
    const csv = parseCsvMatrix(
      'name,contact_id,account_id,email,account_name,preferred_product\r\n'
      + '"Doe, Jane",1001,77,jane@example.com,Example Club,Tour Soft\r\nBad,,,bad,,',
    );
    const normalized = normalizeContactMatrix(csv, { fileName: 'contacts.csv' });
    assert.equal(normalized.records.length, 1);
    assert.equal(normalized.errors.length, 1);
    assert.equal(normalized.records[0].contactName_t, 'Doe, Jane');
    assert.equal(normalized.records[0].accountName_t, 'Example Club');
    assert.equal(normalized.records[0].importVariables_o.account_name, 'Example Club');
    assert.equal(normalized.records[0].importVariables_o.preferred_product, 'Tour Soft');
    assert.deepEqual(contactIdsFromRow(normalized.records[0]), { contactId: '1001', accountId: '77' });
  });

  it('imports accounts that carry no email address', () => {
    const withoutEmails = normalizeContactMatrix(parseCsvMatrix(
      'account_name,account_id\r\nNo Email Account,501\r\nPerson Account,502\r\n',
    ), { fileName: 'accounts.csv' });
    assert.equal(withoutEmails.records.length, 2);
    assert.equal(withoutEmails.records[0].recordType_s, 'Account');
    assert.equal(withoutEmails.records[0].accountName_t, 'No Email Account');
    assert.equal(withoutEmails.records[0].email_tp, '');
    assert.deepEqual(withoutEmails.records[0].emails_tps, []);
    assert.deepEqual(contactIdsFromRow(withoutEmails.records[0]), { contactId: '', accountId: '501' });
  });

  it('builds a person name from first/last when no email is present', () => {
    const people = normalizeContactMatrix(parseCsvMatrix(
      'first_name,last_name,contact_id\r\nTaylor,Jordan,601\r\n',
    ), { fileName: 'contacts-no-email.csv' });
    assert.equal(people.records[0].contactName_t, 'Taylor Jordan');
    assert.equal(people.records[0].email_tp, '');
    assert.deepEqual(contactIdsFromRow(people.records[0]), { contactId: '601', accountId: '' });
  });

  it('rejects a sheet with neither an account name nor a person name', () => {
    assert.throws(
      () => normalizeContactMatrix(parseCsvMatrix('email,account_id\r\na@example.com,1\r\n')),
      /account_name or a person name/,
    );
  });
});

describe('contact import · xlsx', () => {
  it('parses a real workbook through shared strings and inline cells', async () => {
    const shared = ['name', 'first_name', 'last_name', 'account_id', 'email'];
    const sharedXml = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
      shared.map((v) => `<si><t>${v}</t></si>`).join('')}</sst>`;
    const sheetXml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
  <row r="1">${shared.map((_, i) => `<c r="${String.fromCharCode(65 + i)}1" t="s"><v>${i}</v></c>`).join('')}</row>
  <row r="2"><c r="A2" t="inlineStr"><is><t>Alex Smith</t></is></c><c r="B2" t="inlineStr"><is><t>Alex</t></is></c><c r="C2" t="inlineStr"><is><t>Smith</t></is></c><c r="D2"><v>9001</v></c><c r="E2" t="inlineStr"><is><t>alex@example.com</t></is></c></row>
</sheetData></worksheet>`;
    const workbook = zip({ 'xl/sharedStrings.xml': sharedXml, 'xl/worksheets/sheet1.xml': sheetXml });
    const rows = await parseXlsxMatrix(workbook);
    const normalized = normalizeContactMatrix(rows, { fileName: 'contacts.xlsx' });
    assert.equal(normalized.records[0].id.startsWith('import_account_9001_'), true);
    assert.deepEqual(contactIdsFromRow(normalized.records[0]), { contactId: '', accountId: '9001' });
  });
});

describe('contact import · direct variables', () => {
  it('resolves contact, account, and spreadsheet-supplied variables', () => {
    const values = directContactVariables({
      contactName: 'Alex Smith', firstName: 'Alex', lastName: 'Smith',
      email: 'alex@example.com', crmContactId: '42', accountId: '9001',
      importVariables: { account_name: 'Spreadsheet Account', preferred_product: 'Tour Soft' },
    }, {
      greeting: { path: 'contact.firstName' },
      recipient: { path: 'contact.email' },
      account: { path: 'account.id' },
      account_name: { path: 'account.name' },
      preferred_product: { path: 'contact.favoriteProduct' },
    });
    assert.deepEqual(values, {
      greeting: 'Alex', recipient: 'alex@example.com', account: '9001',
      account_name: 'Spreadsheet Account', preferred_product: 'Tour Soft',
    });
  });

  it('omits a recipient variable when the record has no email yet', () => {
    const deferred = directContactVariables({
      contactName: 'No Email Account', accountId: '501', email: '',
      importVariables: { account_name: 'No Email Account', email: '' },
    }, {
      recipient: { path: 'contact.email' },
      account_name: { path: 'account.name' },
    });
    assert.deepEqual(deferred, { account_name: 'No Email Account' });
  });
});
