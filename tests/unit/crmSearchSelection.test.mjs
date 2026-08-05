import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCrmSelectionCsv,
  crmRowToWorkflowContact,
  crmRowToEmailContact,
  selectedCrmRows,
  toggleCrmSelection,
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

  it('toggles one record normally and adds an anchored range with Shift-click', () => {
    const extendedRows = [
      ...rows,
      { id: 'contact_99', contactName_t: 'Grace Hopper' },
      { id: 'contact_100', contactName_t: 'Katherine Johnson' },
    ];
    const first = toggleCrmSelection(extendedRows, new Set(), 'account_17', 1, null, false);
    assert.deepEqual([...first.selectedIds], ['account_17']);
    assert.equal(first.anchorIndex, 1);

    const range = toggleCrmSelection(
      extendedRows,
      first.selectedIds,
      'contact_100',
      3,
      first.anchorIndex,
      true,
    );
    assert.deepEqual([...range.selectedIds], ['account_17', 'contact_99', 'contact_100']);
    assert.equal(range.anchorIndex, 3);
  });

  it('keeps normal toggle behavior when Shift has no prior anchor', () => {
    const result = toggleCrmSelection(rows, new Set(), 'contact_42', 0, null, true);
    assert.deepEqual([...result.selectedIds], ['contact_42']);
    assert.equal(result.anchorIndex, 0);
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
      pageEngineIdentity: { schemaId: 'contact', id: '42' },
    });
  });

  it('builds the Workflow Manager audience contract with value and source id', () => {
    assert.deepEqual(crmRowToWorkflowContact(rows[1], '/account/17'), {
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
      pageEngineIdentity: { schemaId: 'account', id: '17' },
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
