/* Contact-list import for CRM Search.
 *
 * The extension deliberately keeps this parser dependency-free: Chrome can
 * inflate the ZIP entries inside an .xlsx workbook with DecompressionStream,
 * and DOMParser handles the workbook XML. CSV remains available for older
 * Excel exports. Imported rows are normalized to the same flat Solr document
 * shape used by CRMSearch and crmIndex.
 */

const HEADER_ALIASES = {
  name: 'name',
  full_name: 'name',
  fullname: 'name',
  contact_name: 'name',
  first_name: 'first_name',
  firstname: 'first_name',
  first: 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  last: 'last_name',
  contact_id: 'contact_id',
  contactid: 'contact_id',
  customer_id: 'contact_id',
  customerid: 'contact_id',
  account_id: 'account_id',
  accountid: 'account_id',
  email: 'email',
  email_address: 'email',
  emailaddress: 'email',
};

const textDecoder = new TextDecoder('utf-8');

const asText = (value) => (value == null ? '' : String(value)).trim();

export function normalizeImportHeader(value) {
  const key = asText(value)
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return HEADER_ALIASES[key] || '';
}

function normalizeId(value, kind) {
  let id = asText(value);
  if (!id) return '';
  const queryName = kind === 'contact' ? '(?:customerID|customerId|contactID|contactId)' : '(?:accountID|accountId)';
  const fromUrl = id.match(new RegExp(`[?&]${queryName}=([^&#]+)`, 'i'));
  if (fromUrl) id = decodeURIComponent(fromUrl[1]);
  id = id.replace(new RegExp(`^(?:${kind}|${kind === 'contact' ? 'customer' : 'acct'})[_:#\\s-]+`, 'i'), '');
  // Excel commonly serializes integer IDs as "12345.0".
  if (/^\d+\.0+$/.test(id)) id = id.replace(/\.0+$/, '');
  return id.trim();
}

function splitName(name, first, last) {
  let firstName = asText(first);
  let lastName = asText(last);
  let fullName = asText(name);
  if (!fullName) fullName = [firstName, lastName].filter(Boolean).join(' ');
  if (fullName && !firstName && !lastName) {
    const parts = fullName.split(/\s+/);
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }
  if (!fullName) fullName = [firstName, lastName].filter(Boolean).join(' ');
  return { fullName, firstName, lastName };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeIdPart(value) {
  return asText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'none';
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Convert a worksheet matrix into canonical CRM rows.
 * Returns accepted records plus row-specific errors suitable for a summary.
 */
export function normalizeContactMatrix(matrix, { fileName = '' } = {}) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const headerIndex = rows.slice(0, 12).findIndex((row) => {
    const recognized = new Set((Array.isArray(row) ? row : []).map(normalizeImportHeader).filter(Boolean));
    return recognized.has('email') && (recognized.has('contact_id') || recognized.has('account_id'));
  });
  if (headerIndex < 0) {
    throw new Error('No header row found. Include email and either contact_id or account_id.');
  }

  const headers = rows[headerIndex].map(normalizeImportHeader);
  const present = new Set(headers.filter(Boolean));
  if (!present.has('email')) throw new Error('The worksheet needs an email column.');
  if (!present.has('contact_id') && !present.has('account_id')) {
    throw new Error('The worksheet needs contact_id or account_id.');
  }
  if (!present.has('name') && !present.has('first_name') && !present.has('last_name')) {
    throw new Error('The worksheet needs name, first_name, or last_name.');
  }

  const records = [];
  const errors = [];
  const warnings = [];
  const seen = new Set();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const cells = Array.isArray(rows[i]) ? rows[i] : [];
    if (!cells.some((cell) => asText(cell))) continue;
    const raw = {};
    headers.forEach((key, col) => { if (key && raw[key] == null) raw[key] = cells[col]; });

    const spreadsheetRow = i + 1;
    const email = asText(raw.email).toLowerCase();
    const contactId = normalizeId(raw.contact_id, 'contact');
    const accountId = normalizeId(raw.account_id, 'account');
    const { fullName, firstName, lastName } = splitName(raw.name, raw.first_name, raw.last_name);

    const problems = [];
    if (!email) problems.push('email is blank');
    else if (!validEmail(email)) problems.push('email is invalid');
    if (!contactId && !accountId) problems.push('contact_id and account_id are blank');
    if (!fullName) problems.push('name is blank');
    if (problems.length) {
      errors.push({ row: spreadsheetRow, message: problems.join('; ') });
      continue;
    }

    const identity = contactId ? `contact:${contactId}` : `account:${accountId}:${email}`;
    if (seen.has(identity)) {
      warnings.push({ row: spreadsheetRow, message: 'duplicate row skipped' });
      continue;
    }
    seen.add(identity);

    const id = contactId
      ? `contact_${contactId}`
      : `import_account_${safeIdPart(accountId)}_${stableHash(email)}`;
    records.push({
      id,
      recordType_s: 'Contact',
      contactName_t: fullName,
      firstName_s: firstName,
      lastName_s: lastName,
      accountName_t: '',
      accountID_s: accountId,
      email_tp: email,
      emails_tps: [email],
      phones_ss: [],
      importSource_s: fileName || 'Spreadsheet',
      imported_b: true,
      importedAt_l: Date.now(),
      importContactID_s: contactId,
      importAccountID_s: accountId,
      importRow_i: spreadsheetRow,
    });
  }

  if (!records.length) {
    const detail = errors[0]?.message ? ` First error: row ${errors[0].row}, ${errors[0].message}.` : '';
    throw new Error(`No valid contacts found.${detail}`);
  }
  return { records, errors, warnings, headerRow: headerIndex + 1 };
}

/** RFC-4180-compatible CSV parser (commas, quotes and embedded newlines). */
export function parseCsvMatrix(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell); cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function findEndOfCentralDirectory(view) {
  const min = Math.max(0, view.byteLength - 65557);
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function zipDirectory(buffer) {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error('This is not a readable .xlsx workbook.');
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('The workbook ZIP directory is damaged.');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = textDecoder.decode(new Uint8Array(buffer, offset + 46, fileNameLength)).replace(/^\//, '');
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipEntry(buffer, entry) {
  if (!entry) return '';
  const view = new DataView(buffer);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('A workbook ZIP entry is damaged.');
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const bytes = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) return textDecoder.decode(bytes);
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') {
    throw new Error('This workbook uses an unsupported Excel compression format.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return textDecoder.decode(await new Response(stream).arrayBuffer());
}

function parseXml(xml, label) {
  const doc = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`Excel ${label} XML could not be read.`);
  return doc;
}

function descendants(root, localName) {
  const namespaced = root?.getElementsByTagNameNS?.('*', localName);
  if (namespaced?.length) return [...namespaced];
  return [...(root?.getElementsByTagName?.(localName) || [])];
}

function directChildren(root, localName) {
  return [...(root?.children || [])].filter((node) => node.localName === localName || node.nodeName === localName);
}

function columnIndex(cellRef) {
  const letters = String(cellRef || '').match(/^[A-Z]+/i)?.[0]?.toUpperCase() || '';
  let out = 0;
  for (const char of letters) out = out * 26 + char.charCodeAt(0) - 64;
  return Math.max(0, out - 1);
}

function firstWorksheetPath(entries) {
  return [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/i)?.[1]) - Number(b.match(/sheet(\d+)/i)?.[1]))[0];
}

export async function parseXlsxMatrix(buffer) {
  const entries = zipDirectory(buffer);
  const worksheetPath = firstWorksheetPath(entries);
  if (!worksheetPath) throw new Error('The workbook has no worksheet.');

  const [sheetXml, sharedXml] = await Promise.all([
    readZipEntry(buffer, entries.get(worksheetPath)),
    readZipEntry(buffer, entries.get('xl/sharedStrings.xml')),
  ]);
  const shared = sharedXml
    ? descendants(parseXml(sharedXml, 'shared strings'), 'si')
      .map((si) => descendants(si, 't').map((node) => node.textContent || '').join(''))
    : [];
  const sheet = parseXml(sheetXml, 'worksheet');
  const matrix = [];
  for (const rowNode of descendants(sheet, 'row')) {
    const row = [];
    for (const cell of directChildren(rowNode, 'c')) {
      const col = columnIndex(cell.getAttribute('r'));
      const type = cell.getAttribute('t') || '';
      const raw = directChildren(cell, 'v')[0]?.textContent ?? '';
      let value = raw;
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = descendants(cell, 't').map((node) => node.textContent || '').join('');
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      row[col] = value;
    }
    matrix.push(row);
  }
  return matrix;
}

export async function parseContactFile(file) {
  if (!file) throw new Error('Choose an Excel or CSV file.');
  const lower = String(file.name || '').toLowerCase();
  let matrix;
  if (lower.endsWith('.csv')) matrix = parseCsvMatrix(await file.text());
  else if (lower.endsWith('.xlsx')) matrix = await parseXlsxMatrix(await file.arrayBuffer());
  else throw new Error('Use a modern Excel .xlsx file or a .csv export.');
  return normalizeContactMatrix(matrix, { fileName: file.name || '' });
}

export function contactIdsFromRow(row) {
  const id = asText(row?.id);
  const idContact = id.match(/^contact_(.+)$/i)?.[1] || '';
  const idAccount = id.match(/^account_(.+)$/i)?.[1] || '';
  return {
    contactId: normalizeId(row?.importContactID_s || idContact, 'contact'),
    accountId: normalizeId(row?.importAccountID_s || row?.accountID_s || idAccount, 'account'),
  };
}

/** Best-effort values for templates when an imported row has no CRM page. */
export function directContactVariables(contact, definitions = {}) {
  const firstName = asText(contact?.firstName);
  const lastName = asText(contact?.lastName);
  const contactName = asText(contact?.contactName || contact?.name) || [firstName, lastName].filter(Boolean).join(' ');
  const email = asText(contact?.email);
  const contactId = asText(contact?.crmContactId || contact?.contactId);
  const accountId = asText(contact?.accountId);
  const values = {};
  for (const [name, definition] of Object.entries(definitions || {})) {
    const hint = `${name} ${definition?.path || ''} ${definition?.field || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (hint.includes('firstname')) values[name] = firstName;
    else if (hint.includes('lastname')) values[name] = lastName;
    else if (hint.includes('email')) values[name] = email;
    else if (hint.includes('accountid')) values[name] = accountId;
    else if (hint.includes('contactid') || hint.includes('customerid')) values[name] = contactId;
    else if (hint.includes('contactname') || hint === 'name' || hint.includes('fullname')) values[name] = contactName;
  }
  return values;
}
