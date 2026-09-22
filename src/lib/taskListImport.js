/* Task List spreadsheet import.
 *
 * CRM Search owns the common CSV/XLSX parser. This module turns its canonical
 * Contact/Account rows into task-recipient rows. Contacts already carry the
 * required CRM contact id; accounts are fetched and resolve to the contact
 * attached to the order nearest the same calendar date one year ago.
 */

import { API, CRM_PAGES } from './constants.js';
import { contactIdsFromRow } from './contactImport.js';
import { sendBackgroundMessage } from './backgroundMessage.js';
import { accountContactRows, accountOrderRows } from './page-engine/helpers.js';

const text = (value) => String(value == null ? '' : value).trim();
const positiveId = (value) => (/^\d{1,12}$/.test(text(value)) && Number(value) > 0 ? text(value) : '');
const normalizedContactName = (value) => text(value)
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const compactName = (value) => normalizedContactName(value).replace(/\s+/g, '');

function importedTaskFields(record) {
  const values = record?.importVariables_o && typeof record.importVariables_o === 'object'
    ? record.importVariables_o
    : {};
  return {
    salesRep: text(values.sales_rep),
    subject: text(values.task_subject),
    description: text(values.task_description),
  };
}

/** Resolve an imported rep name without ever guessing between active reps. */
export function matchImportedSalesRep(value, reps) {
  const requested = text(value);
  if (!requested) return { matched: false, optional: true, rep: null, error: '' };
  const inputWords = normalizedContactName(requested).split(/\s+/).filter(Boolean);
  const inputCompact = compactName(requested);
  const inputTokenKey = [...inputWords].sort().join(' ');
  const directory = (Array.isArray(reps) ? reps : []).flatMap((rep) => {
    const id = positiveId(rep?.id);
    const name = text(rep?.name);
    const words = normalizedContactName(name).split(/\s+/).filter(Boolean);
    if (!id || !name || !words.length) return [];
    const commaReversed = /^[^,]+,\s*[^,]+/.test(name);
    const first = commaReversed ? words[words.length - 1] : words[0];
    const last = commaReversed ? words[0] : words[words.length - 1];
    return [{
      id,
      name,
      normalized: words.join(' '),
      compact: words.join(''),
      tokenKey: [...words].sort().join(' '),
      first,
      firstLastInitial: `${first}${words.length > 1 ? last[0] : ''}`,
    }];
  });

  const choose = (candidates, kind) => {
    if (candidates.length === 1) {
      const [{ id, name }] = candidates;
      return { matched: true, optional: false, rep: { id, name }, match: kind, error: '' };
    }
    if (candidates.length > 1) {
      return {
        matched: false,
        optional: false,
        rep: null,
        error: `sales_rep "${requested}" matches multiple active reps`,
      };
    }
    return null;
  };

  const exact = choose(directory.filter((rep) => (
    rep.normalized === inputWords.join(' ')
      || rep.compact === inputCompact
      || (inputWords.length > 1 && rep.tokenKey === inputTokenKey)
  )), 'full-name');
  if (exact) return exact;

  const shorthand = choose(
    directory.filter((rep) => rep.firstLastInitial === inputCompact),
    'first-last-initial',
  );
  if (shorthand) return shorthand;

  const firstName = choose(
    directory.filter((rep) => rep.first === inputWords[0]),
    'unique-first-name',
  );
  if (firstName) return firstName;

  return {
    matched: false,
    optional: false,
    rep: null,
    error: `sales_rep "${requested}" did not match an active rep`,
  };
}

/** Apply row-specific spreadsheet fields over the bulk Quick Task defaults. */
export function importedTaskCreation(row, baseTemplate = {}, fallbackAssigneeId = '') {
  const subject = text(row?.importedTaskSubject);
  const description = text(row?.importedTaskDescription);
  const template = {
    ...(baseTemplate || {}),
    ...(subject ? { name: subject, subject } : {}),
    ...(description ? { body: description } : {}),
  };
  return {
    template,
    assigneeId: positiveId(row?.importedAssigneeId)
      || positiveId(fallbackAssigneeId)
      || positiveId(template.assigneeId),
  };
}

function contactIdFromElement(element) {
  const href = element?.querySelector?.('a[href]')?.getAttribute('href') || '';
  const match = href.match(/[?&]customerID=(\d{1,12})(?:[&#]|$)/i);
  return positiveId(match?.[1]);
}

function parseCrmOrderDate(value) {
  const raw = text(value);
  let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  let year;
  let month;
  let day;
  if (match) {
    [, month, day, year] = match.map(Number);
  } else {
    match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
    if (!match) return null;
    [, year, month, day] = match.map(Number);
  }
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function priorYearDate(now = new Date()) {
  const source = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(source.getTime())) throw new Error('A valid reference date is required');
  const year = source.getFullYear() - 1;
  const month = source.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const result = new Date(year, month, Math.min(source.getDate(), lastDay));
  result.setHours(0, 0, 0, 0);
  return result;
}

export const importedAccountUrl = (accountId) => (
  `${API.CRM_ADMIN}Default.aspx?Page=${CRM_PAGES.ACCOUNT_DETAIL}&AccountID=${encodeURIComponent(accountId)}`
);

export const importedContactUrl = (contactId) => (
  `${API.CRM_ADMIN}Default.aspx?Page=${CRM_PAGES.CONTACT_DETAIL}&customerID=${encodeURIComponent(contactId)}`
);

export function taskContactFromAccountHtml(html, sourceUrl = '', options = {}) {
  if (typeof DOMParser === 'undefined') throw new Error('Account-page parser is unavailable');
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  if (doc.body) doc.body.dataset.gbSourceUrl = sourceUrl;

  const contacts = accountContactRows(doc).map((row) => ({
    contactId: contactIdFromElement(row.children?.[0]),
    contactName: text(row.children?.[0]?.textContent),
  })).filter(({ contactId }) => contactId);
  const contactsByName = new Map();
  contacts.forEach((contact) => {
    const key = normalizedContactName(contact.contactName);
    if (key && !contactsByName.has(key)) contactsByName.set(key, contact);
  });

  const anchor = priorYearDate(options.now);
  const orders = accountOrderRows(doc).map((row, index) => {
    const contactCell = row.children?.[1];
    const orderDateText = text(row.children?.[3]?.textContent);
    const orderDate = parseCrmOrderDate(orderDateText);
    return {
      index,
      contactId: contactIdFromElement(contactCell),
      contactName: text(contactCell?.textContent),
      orderDate,
      orderDateText,
      distance: orderDate ? Math.abs(orderDate.getTime() - anchor.getTime()) : Number.POSITIVE_INFINITY,
    };
  }).filter(({ orderDate }) => orderDate)
    .sort((left, right) => left.distance - right.distance || left.index - right.index);

  for (const order of orders) {
    const contact = order.contactId
      ? { contactId: order.contactId, contactName: order.contactName }
      : contactsByName.get(normalizedContactName(order.contactName));
    if (!contact?.contactId) continue;
    return {
      contactId: contact.contactId,
      contactName: contact.contactName || order.contactName,
      selection: 'prior-year-order',
      orderDate: order.orderDateText,
    };
  }

  const fallback = contacts[0];
  return fallback ? {
    ...fallback,
    selection: 'first-contact-fallback',
    orderDate: '',
  } : { contactId: '', contactName: '', selection: 'none', orderDate: '' };
}

async function fetchTaskAccountContact(accountId) {
  const url = importedAccountUrl(accountId);
  const response = await sendBackgroundMessage('fetchRaw', { url });
  if (typeof response.text !== 'string') throw new Error('Account page returned no HTML');
  return taskContactFromAccountHtml(response.text, url);
}

export function importedTaskTargetRow(record, resolved = {}, index = 0) {
  const ids = contactIdsFromRow(record);
  const contactId = positiveId(resolved.contactId || ids.contactId);
  if (!contactId) return null;
  const accountId = positiveId(ids.accountId);
  const contactName = text(resolved.contactName || record?.contactName_t) || `Contact ${contactId}`;
  const accountName = text(record?.accountName_t) || (accountId ? `Account ${accountId}` : 'Imported contact');
  const taskFields = importedTaskFields(record);
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
    category: ids.contactId
      ? 'Imported contact'
      : resolved.selection === 'prior-year-order'
        ? 'Account · prior-year order'
        : 'Account · first-contact fallback',
    priority: 2,
    priorityLabel: 'Medium',
    subject: taskFields.subject || 'Ready for Quick Task',
    importedTaskSubject: taskFields.subject,
    importedTaskDescription: taskFields.description,
    importedAssigneeId: positiveId(resolved.salesRepId),
    importedAssigneeName: text(resolved.salesRepName),
    status: 'New',
    importedTarget: true,
  };
}

/** Resolve imported CRM Search records with bounded account-page concurrency. */
export async function resolveTaskImportRecords(records, options = {}) {
  const source = Array.isArray(records) ? records : [];
  const resolveAccount = options.resolveAccount || fetchTaskAccountContact;
  const concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || 4));
  const rows = new Array(source.length);
  const errors = [];
  const warnings = [];
  let cursor = 0;

  async function worker() {
    while (cursor < source.length) {
      const index = cursor++;
      const record = source[index];
      const ids = contactIdsFromRow(record);
      try {
        const taskFields = importedTaskFields(record);
        if (taskFields.subject.length > 500) throw new Error('task_subject exceeds 500 characters');
        if (taskFields.description.length > 4_000) throw new Error('task_description exceeds 4,000 characters');
        const salesRep = matchImportedSalesRep(taskFields.salesRep, options.salesReps);
        if (taskFields.salesRep && !salesRep.matched) {
          warnings.push({
            row: Number(record?.importRow_i) || index + 2,
            accountId: ids.accountId,
            message: `${salesRep.error}; using the Quick Task assignee`,
          });
        }
        let resolved = { contactId: ids.contactId, contactName: record?.contactName_t };
        if (!ids.contactId) {
          if (!positiveId(ids.accountId)) throw new Error('row has no usable contact or account id');
          resolved = await resolveAccount(ids.accountId, record);
          if (!positiveId(resolved?.contactId)) throw new Error('account has no contact to receive a task');
        }
        if (salesRep.rep) {
          resolved = {
            ...resolved,
            salesRepId: salesRep.rep.id,
            salesRepName: salesRep.rep.name,
          };
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
  return {
    rows: rows.filter(Boolean),
    errors: errors.sort((a, b) => a.row - b.row),
    warnings: warnings.sort((a, b) => a.row - b.row),
  };
}
