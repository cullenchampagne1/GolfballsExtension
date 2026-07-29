import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCrmSelectionCsv,
  crmRowToCampaignContact,
  crmRowToEmailContact,
  selectedCrmRows,
} from '../../src/lib/crmSearchSelection.js';

const rows = [
  {
    id: 'contact_42',
    recordType_s: 'Contact',
    contactName_t: 'Ada Lovelace',
    accountName_t: 'Analytical Engines, Inc.',
    emails_tps: ['ada@example.com'],
    phones_ss: ['555-0100'],
    yearToDateRevenue_f: 1250,
  },
  {
    id: 'account_17',
    recordType_s: 'Account',
    accountName_t: 'Babbage Works',
    email_tp: 'orders@example.com',
  },
];

describe('CRM Search selection · row filtering and action handoff', () => {
  it('keeps selected records in displayed result order', () => {
    assert.deepEqual(selectedCrmRows(rows, new Set(['account_17', 'contact_42'])), rows);
    assert.deepEqual(selectedCrmRows(rows, new Set(['account_17'])), [rows[1]]);
  });

  it('builds the Email Runner recipient contract from a contact row', () => {
    assert.deepEqual(crmRowToEmailContact(rows[0], '/contact/42'), {
      contactId: 'contact_42',
      crmContactId: '42',
      accountId: '',
      contactName: 'Ada Lovelace',
      firstName: '',
      lastName: '',
      email: 'ada@example.com',
      importVariables: {},
      contactUrl: '/contact/42',
      imported: false,
    });
  });

  it('builds the Campaign Manager audience contract with value and source id', () => {
    assert.deepEqual(crmRowToCampaignContact(rows[1], '/account/17'), {
      contactId: '',
      accountId: '17',
      contactName: 'Babbage Works',
      firstName: '',
      lastName: '',
      email: 'orders@example.com',
      importVariables: {},
      contactUrl: '/account/17',
      value: 0,
      sourceRowId: 'account_17',
      imported: false,
    });
  });
});

describe('CRM Search selection · CSV export', () => {
  it('writes the modal-compatible columns with RFC 4180 escaping', () => {
    const csv = buildCrmSelectionCsv([rows[0]]);
    assert.ok(csv.startsWith('\uFEFFID,Record Type,Contact Name,Account Name'));
    assert.ok(csv.includes('contact_42,Contact,Ada Lovelace,\"Analytical Engines, Inc.\"'));
    assert.ok(csv.includes('ada@example.com'));
  });
});
