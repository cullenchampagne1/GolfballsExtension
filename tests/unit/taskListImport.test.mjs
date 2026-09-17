import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  firstTaskContactFromAccountHtml,
  importedTaskTargetRow,
  resolveTaskImportRecords,
} from '../../src/lib/taskListImport.js';

const contact = {
  id: 'contact_42', recordType_s: 'Contact', contactName_t: 'Ada Lovelace',
  accountName_t: 'Analytical Engines', accountID_s: '900',
  importContactID_s: '42', importAccountID_s: '900', importRow_i: 2,
};

const account = {
  id: 'import_account_901_x', recordType_s: 'Account', contactName_t: '',
  accountName_t: 'Difference Works', accountID_s: '901',
  importContactID_s: '', importAccountID_s: '901', importRow_i: 3,
};

describe('Task List import · recipient rows', () => {
  it('reads the first contact from the real account Contacts-table shape', () => {
    globalThis.DOMParser = new JSDOM('').window.DOMParser;
    const html = `<!doctype html><div class="portlet box green">
      <div class="caption">Account Contacts</div><table><tbody>
        <tr><td><a href="/Default.aspx?Page=240&customerID=771">Grace Hopper</a></td><td>grace@example.test</td></tr>
        <tr><td><a href="/Default.aspx?Page=240&customerID=772">Katherine Johnson</a></td><td>kj@example.test</td></tr>
      </tbody></table></div>`;

    assert.deepEqual(firstTaskContactFromAccountHtml(html), {
      contactId: '771', contactName: 'Grace Hopper',
    });
  });

  it('turns a contact record into a Quick Task target without a page lookup', async () => {
    let accountReads = 0;
    const result = await resolveTaskImportRecords([contact], {
      resolveAccount: async () => { accountReads += 1; return {}; },
    });

    assert.equal(accountReads, 0);
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.rows[0], importedTaskTargetRow(contact, {
      contactId: '42', contactName: 'Ada Lovelace',
    }, 0));
    assert.equal(result.rows[0].targetContactId, '42');
    assert.match(result.rows[0].contactUrl, /Page=240&customerID=42$/);
  });

  it('uses the first resolved account contact as the task recipient', async () => {
    const seen = [];
    const result = await resolveTaskImportRecords([account], {
      resolveAccount: async (accountId) => {
        seen.push(accountId);
        return { contactId: '771', contactName: 'Grace Hopper' };
      },
    });

    assert.deepEqual(seen, ['901']);
    assert.equal(result.rows[0].targetContactId, '771');
    assert.equal(result.rows[0].contact, 'Grace Hopper');
    assert.equal(result.rows[0].category, 'Account · first contact');
    assert.match(result.rows[0].accountUrl, /Page=271&AccountID=901$/);
  });

  it('keeps valid rows and reports an account with no contacts', async () => {
    const result = await resolveTaskImportRecords([contact, account], {
      resolveAccount: async () => ({ contactId: '', contactName: '' }),
    });

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].targetContactId, '42');
    assert.deepEqual(result.errors, [{
      row: 3,
      accountId: '901',
      message: 'account has no contact to receive a task',
    }]);
  });
});
