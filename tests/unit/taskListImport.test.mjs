import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  importedTaskTargetRow,
  priorYearDate,
  resolveTaskImportRecords,
  taskContactFromAccountHtml,
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
  it('uses the order contact nearest the same date one year earlier instead of the first contact', () => {
    globalThis.DOMParser = new JSDOM('').window.DOMParser;
    const html = `<!doctype html><div class="portlet box green">
      <div class="caption">Account Contacts</div><table><tbody>
        <tr><td><a href="/Default.aspx?Page=240&customerID=772">Katherine Johnson</a></td><td>kj@example.test</td></tr>
        <tr><td><a href="/Default.aspx?Page=240&customerID=771">Grace Hopper</a></td><td>grace@example.test</td></tr>
      </tbody></table></div>
      <div class="portlet box blue"><div class="caption">Account Orders</div><table><tbody>
        <tr><td><a href="?page=ViewOrder&orderID=1">1</a></td><td>Katherine Johnson</td><td>Golf balls</td><td>01/10/2026</td><td>$100</td><td>Shipped</td></tr>
        <tr><td><a href="?page=ViewOrder&orderID=2">2</a></td><td>Grace Hopper</td><td>Golf balls</td><td>09/15/2025</td><td>$100</td><td>Shipped</td></tr>
      </tbody></table></div>`;

    assert.deepEqual(taskContactFromAccountHtml(html, '', { now: new Date(2026, 8, 17) }), {
      contactId: '771', contactName: 'Grace Hopper', selection: 'prior-year-order', orderDate: '09/15/2025',
    });
  });

  it('tries the next-nearest order when the closest order contact is not in the account Contacts table', () => {
    globalThis.DOMParser = new JSDOM('').window.DOMParser;
    const html = `<!doctype html><div class="portlet"><div class="caption">Account Contacts</div><table><tbody>
      <tr><td><a href="?Page=240&customerID=771">Grace Hopper</a></td></tr>
    </tbody></table></div><div class="portlet"><div class="caption">Account Orders</div><table><tbody>
      <tr><td><a href="?orderID=1">1</a></td><td>Former Buyer</td><td>Order</td><td>09/17/2025</td><td>$100</td><td>Shipped</td></tr>
      <tr><td><a href="?orderID=2">2</a></td><td>Grace Hopper</td><td>Order</td><td>09/10/2025</td><td>$100</td><td>Shipped</td></tr>
    </tbody></table></div>`;

    assert.deepEqual(taskContactFromAccountHtml(html, '', { now: new Date(2026, 8, 17) }), {
      contactId: '771', contactName: 'Grace Hopper', selection: 'prior-year-order', orderDate: '09/10/2025',
    });
  });

  it('falls back to the first account contact when no order has a resolvable contact', () => {
    globalThis.DOMParser = new JSDOM('').window.DOMParser;
    const html = `<!doctype html><div class="portlet"><div class="caption">Account Contacts</div><table><tbody>
      <tr><td><a href="?Page=240&customerID=771">Grace Hopper</a></td></tr>
    </tbody></table></div>`;

    assert.deepEqual(taskContactFromAccountHtml(html, '', { now: new Date(2026, 8, 17) }), {
      contactId: '771', contactName: 'Grace Hopper', selection: 'first-contact-fallback', orderDate: '',
    });
  });

  it('clamps a leap-day reference to the final day of the prior February', () => {
    assert.deepEqual(
      [priorYearDate(new Date(2024, 1, 29)).getFullYear(), priorYearDate(new Date(2024, 1, 29)).getMonth(), priorYearDate(new Date(2024, 1, 29)).getDate()],
      [2023, 1, 28],
    );
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

  it('uses the prior-year order contact resolved for an account as the task recipient', async () => {
    const seen = [];
    const result = await resolveTaskImportRecords([account], {
      resolveAccount: async (accountId) => {
        seen.push(accountId);
        return { contactId: '771', contactName: 'Grace Hopper', selection: 'prior-year-order', orderDate: '09/15/2025' };
      },
    });

    assert.deepEqual(seen, ['901']);
    assert.equal(result.rows[0].targetContactId, '771');
    assert.equal(result.rows[0].contact, 'Grace Hopper');
    assert.equal(result.rows[0].category, 'Account · prior-year order');
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
