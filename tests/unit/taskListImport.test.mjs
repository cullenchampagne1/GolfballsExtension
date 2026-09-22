import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  importedTaskCreation,
  importedTaskTargetRow,
  matchImportedSalesRep,
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
  it('matches a full name, unique first name, and unique first-plus-last-initial shorthand', () => {
    const reps = [
      { id: '10', name: 'Alex Sylvester' },
      { id: '11', name: 'Jordan Lee' },
    ];

    assert.equal(matchImportedSalesRep('Alex Sylvester', reps).rep.id, '10');
    assert.equal(matchImportedSalesRep('alex', reps).rep.id, '10');
    assert.equal(matchImportedSalesRep('AlexS', reps).rep.id, '10');
    assert.equal(matchImportedSalesRep('alex s', reps).rep.id, '10');
  });

  it('matches a full CSV name to a shortened or last-name-first CRM option', () => {
    assert.equal(matchImportedSalesRep('Aaron Hunter', [
      { id: '20', name: 'Aaron' },
    ]).rep.id, '20');
    assert.equal(matchImportedSalesRep('Aaron Hunter', [
      { id: '21', name: 'Hunter, Aaron' },
    ]).rep.id, '21');
    assert.equal(matchImportedSalesRep('AaronH', [
      { id: '21', name: 'Hunter, Aaron' },
    ]).rep.id, '21');
    assert.equal(matchImportedSalesRep('AlexS', [
      { id: '22', name: 'Sylvester, Alex (SA)' },
    ]).rep.id, '22');
  });

  it('rejects ambiguous or unknown sales-rep shorthand instead of guessing', () => {
    const reps = [
      { id: '10', name: 'Alex Sylvester' },
      { id: '12', name: 'Alex Smith' },
    ];

    assert.match(matchImportedSalesRep('Alex', reps).error, /multiple active reps/);
    assert.match(matchImportedSalesRep('AlexS', reps).error, /multiple active reps/);
    assert.match(matchImportedSalesRep('Taylor', reps).error, /did not match/);
  });

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

  it('carries per-row subject, description, and matched assignee into task creation', async () => {
    const enriched = {
      ...contact,
      importVariables_o: {
        task_subject: 'Review dormant account',
        task_description: 'No order since last fall; confirm the purchasing contact.',
        sales_rep: 'AlexS',
      },
    };
    const result = await resolveTaskImportRecords([enriched], {
      salesReps: [{ id: '314', name: 'Alex Sylvester' }],
    });

    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0].subject, 'Review dormant account');
    assert.equal(result.rows[0].importedTaskDescription, 'No order since last fall; confirm the purchasing contact.');
    assert.equal(result.rows[0].importedAssigneeId, '314');
    assert.equal(result.rows[0].importedAssigneeName, 'Alex Sylvester');

    assert.deepEqual(importedTaskCreation(result.rows[0], {
      subject: 'Shared fallback', body: 'Shared note', daysOut: 7, assigneeId: '22',
    }), {
      template: {
        name: 'Review dormant account',
        subject: 'Review dormant account',
        body: 'No order since last fall; confirm the purchasing contact.',
        daysOut: 7,
        assigneeId: '22',
      },
      assigneeId: '314',
    });
  });

  it('uses Quick Task values when optional spreadsheet task fields are blank', () => {
    assert.deepEqual(importedTaskCreation({}, {
      subject: 'Call next week', body: 'Discuss the renewal.', assigneeId: '22',
    }), {
      template: { subject: 'Call next week', body: 'Discuss the renewal.', assigneeId: '22' },
      assigneeId: '22',
    });
  });

  it('keeps a row with an ambiguous spreadsheet rep and reports the Quick Task fallback', async () => {
    const result = await resolveTaskImportRecords([{
      ...contact,
      importVariables_o: { sales_rep: 'Alex' },
    }], {
      salesReps: [
        { id: '10', name: 'Alex Sylvester' },
        { id: '12', name: 'Alex Smith' },
      ],
    });

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].importedAssigneeId, '');
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.warnings, [{
      row: 2,
      accountId: '900',
      message: 'sales_rep "Alex" matches multiple active reps; using the Quick Task assignee',
    }]);
  });

  it('distinguishes an unavailable rep directory from an unmatched name', async () => {
    const result = await resolveTaskImportRecords([{
      ...contact,
      importVariables_o: { sales_rep: 'AlexS' },
    }], {
      salesReps: [],
      salesRepLookupError: 'Sales rep lookup returned no active reps',
    });

    assert.equal(result.rows.length, 1);
    assert.match(result.warnings[0].message, /directory unavailable/);
    assert.match(result.warnings[0].message, /Quick Task assignee/);
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
