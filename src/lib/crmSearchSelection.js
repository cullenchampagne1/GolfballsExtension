import { contactIdsFromRow } from './contactImport.js';

export function selectedCrmRows(rows, selectedIds) {
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  return (Array.isArray(rows) ? rows : []).filter((row) => ids.has(row?.id));
}

export function crmRowEmail(row) {
  return row?.emails_tps?.[0] || row?.email_tp || '';
}

export function crmRowToEmailContact(row, contactUrl = '') {
  const { contactId, accountId } = contactIdsFromRow(row);
  return {
    contactId: row?.id,
    crmContactId: contactId,
    accountId,
    contactName: row?.contactName_t || row?.accountName_t || '',
    firstName: row?.firstName_s || '',
    lastName: row?.lastName_s || '',
    email: crmRowEmail(row),
    importVariables: row?.importVariables_o || {},
    contactUrl,
    imported: !!row?.imported_b,
  };
}

export function crmRowToCampaignContact(row, contactUrl = '') {
  const { contactId, accountId } = contactIdsFromRow(row);
  return {
    contactId,
    accountId,
    contactName: row?.contactName_t || row?.accountName_t || '',
    firstName: row?.firstName_s || '',
    lastName: row?.lastName_s || '',
    email: crmRowEmail(row),
    importVariables: row?.importVariables_o || {},
    contactUrl,
    value: row?.yearToDateRevenue_f ?? row?.priorYearRevenue_f ?? 0,
    sourceRowId: row?.id,
    imported: !!row?.imported_b,
  };
}

const CSV_COLUMNS = [
  ['id', 'ID'],
  ['recordType_s', 'Record Type'],
  ['contactName_t', 'Contact Name'],
  ['accountName_t', 'Account Name'],
  ['accountID_s', 'Account ID'],
  ['emails_tps', 'Email'],
  ['phones_ss', 'Phone'],
  ['salesRep_s', 'Sales Rep'],
  ['salesRepID_s', 'Sales Rep ID'],
  ['podID_i', 'Pod ID'],
  ['role_s', 'Role'],
  ['orderCount_i', 'Order Count'],
  ['yearToDateRevenue_f', 'YTD Revenue'],
  ['priorYearRevenue_f', 'Prior Year Revenue'],
  ['lastOrderDate_dt', 'Last Order Date'],
  ['nextTaskDate_dt', 'Next Task Date'],
];

function csvCell(value) {
  if (value == null) return '';
  const raw = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function buildCrmSelectionCsv(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const lines = [
    CSV_COLUMNS.map(([, label]) => csvCell(label)).join(','),
    ...safeRows.map((row) => CSV_COLUMNS.map(([key]) => csvCell(row?.[key])).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}
