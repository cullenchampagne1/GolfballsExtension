/* Task List spreadsheet import.
 *
 * CRM Search owns the common CSV/XLSX parser. This module turns its canonical
 * Contact/Account rows into task-recipient rows. Contacts already carry the
 * required CRM contact id; accounts are fetched and deliberately resolve to
 * the first contact in the account Contacts table.
 */

import { API, CRM_PAGES } from './constants.js';
import { contactIdsFromRow } from './contactImport.js';
import { sendBackgroundMessage } from './backgroundMessage.js';
import { firstAccountContactField } from './page-engine/helpers.js';

const text = (value) => String(value == null ? '' : value).trim();
const positiveId = (value) => (/^\d{1,12}$/.test(text(value)) && Number(value) > 0 ? text(value) : '');

export const importedAccountUrl = (accountId) => (
  `${API.CRM_ADMIN}Default.aspx?Page=${CRM_PAGES.ACCOUNT_DETAIL}&AccountID=${encodeURIComponent(accountId)}`
);

export const importedContactUrl = (contactId) => (
  `${API.CRM_ADMIN}Default.aspx?Page=${CRM_PAGES.CONTACT_DETAIL}&customerID=${encodeURIComponent(contactId)}`
);

export function firstTaskContactFromAccountHtml(html, sourceUrl = '') {
  if (typeof DOMParser === 'undefined') throw new Error('Account-page parser is unavailable');
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  if (doc.body) doc.body.dataset.gbSourceUrl = sourceUrl;
  return {
    contactId: positiveId(firstAccountContactField(doc, 'contactId')),
    contactName: text(firstAccountContactField(doc, 'fullName')),
  };
}

async function fetchFirstAccountContact(accountId) {
  const url = importedAccountUrl(accountId);
  const response = await sendBackgroundMessage('fetchRaw', { url });
  if (typeof response.text !== 'string') throw new Error('Account page returned no HTML');
  return firstTaskContactFromAccountHtml(response.text, url);
}

export function importedTaskTargetRow(record, resolved = {}, index = 0) {
  const ids = contactIdsFromRow(record);
  const contactId = positiveId(resolved.contactId || ids.contactId);
  if (!contactId) return null;
  const accountId = positiveId(ids.accountId);
  const contactName = text(resolved.contactName || record?.contactName_t) || `Contact ${contactId}`;
  const accountName = text(record?.accountName_t) || (accountId ? `Account ${accountId}` : 'Imported contact');
  return {
    id: `import-target-${index + 1}-${contactId}`,
    sourceRecordId: text(record?.id),
    targetContactId: contactId,
    account: accountName,
    accountUrl: accountId ? importedAccountUrl(accountId) : '',
    contact: contactName,
    contactUrl: importedContactUrl(contactId),
    due: '—',
    dueDate: null,
    category: ids.contactId ? 'Imported contact' : 'Account · first contact',
    priority: 2,
    priorityLabel: 'Medium',
    subject: 'Ready for Quick Task',
    status: 'New',
    importedTarget: true,
  };
}

/** Resolve imported CRM Search records with bounded account-page concurrency. */
export async function resolveTaskImportRecords(records, options = {}) {
  const source = Array.isArray(records) ? records : [];
  const resolveAccount = options.resolveAccount || fetchFirstAccountContact;
  const concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || 4));
  const rows = new Array(source.length);
  const errors = [];
  let cursor = 0;

  async function worker() {
    while (cursor < source.length) {
      const index = cursor++;
      const record = source[index];
      const ids = contactIdsFromRow(record);
      try {
        let resolved = { contactId: ids.contactId, contactName: record?.contactName_t };
        if (!ids.contactId) {
          if (!positiveId(ids.accountId)) throw new Error('row has no usable contact or account id');
          resolved = await resolveAccount(ids.accountId, record);
          if (!positiveId(resolved?.contactId)) throw new Error('account has no contact to receive a task');
        }
        rows[index] = importedTaskTargetRow(record, resolved, index);
      } catch (error) {
        errors.push({
          row: Number(record?.importRow_i) || index + 2,
          accountId: ids.accountId,
          message: error?.message || String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, source.length) }, () => worker()));
  return { rows: rows.filter(Boolean), errors: errors.sort((a, b) => a.row - b.row) };
}
