/**
 * Pure parsing and filtering helpers for CRM Action Review (Page 286).
 *
 * The native WebForms page ships three unrelated tables and can contain more
 * than twenty thousand task rows. Keeping the DOM contract in this module
 * makes the takeover testable without rendering React or reaching the CRM.
 */

const DATE_OPTIONS = new Set(['ON', 'BETWEEN', 'BEFORE', 'AFTER']);
const TASK_STATUS = /^(?:new|waiting|complete(?:d)?|open|closed|pending|in progress|cancel(?:led|ed))$/i;

export function actionReviewText(node) {
  return node ? String(node.textContent || '').replace(/\s+/g, ' ').trim() : '';
}

function directCells(row) {
  return Array.from(row?.children || []).filter((node) => String(node.tagName || '').toLowerCase() === 'td');
}

function rowList(table, selector = 'tbody tr') {
  return table ? Array.from(table.querySelectorAll(selector)) : [];
}

export function parseActionReviewActivities(doc) {
  const table = doc?.querySelector?.('#ActivityTable');
  if (!table) return [];

  const rows = [];
  for (const row of rowList(table)) {
    const cells = directCells(row);
    if (cells.length < 6) continue;

    const link = row.querySelector('a[href*="CreateActivityDetailModal"]');
    const match = /CreateActivityDetailModal\(\s*(\d+)\s*\)/i.exec(link?.getAttribute('href') || '');
    rows.push({
      id: match?.[1] || '',
      employee: actionReviewText(cells[1]),
      category: actionReviewText(cells[2]),
      direction: actionReviewText(cells[3]),
      // The native subject cell also contains a hidden activity-detail modal.
      // Prefer the visible link so that metadata such as "Workflow Type" does
      // not leak into the rendered subject.
      subject: actionReviewText(link) || actionReviewText(cells[4]),
      date: actionReviewText(cells[5]),
    });
  }
  return rows;
}

export function findActionReviewEmailTable(doc) {
  const tables = Array.from(doc?.querySelectorAll?.('table') || []);
  return tables.find((table) => {
    if (table.id === 'ActivityTable' || table.id === 'TableTasks') return false;
    const headers = Array.from(table.querySelectorAll('th')).map((header) => actionReviewText(header).toLowerCase());
    return ['from', 'to', 'subject', 'date', 'size'].every((label) => headers.includes(label));
  }) || null;
}

function bytesFromCell(value) {
  const normalized = String(value || '').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseActionReviewEmails(doc) {
  const table = findActionReviewEmailTable(doc);
  if (!table) return [];

  const rows = [];
  for (const row of rowList(table)) {
    const cells = directCells(row);
    if (cells.length < 6) continue;

    // Production currently has a leading icon cell and a trailing Download
    // cell. The offset keeps the parser compatible with captures that omit
    // the decorative icon column.
    const offset = cells.length >= 7 ? 1 : 0;
    const from = actionReviewText(cells[offset]);
    if (!from) continue;

    const actionCell = cells[offset + 5] || cells[cells.length - 1];
    const link = actionCell?.querySelector?.('a[href]') || row.querySelector('a[href]');
    rows.push({
      from,
      to: actionReviewText(cells[offset + 1]),
      subject: actionReviewText(cells[offset + 2]),
      date: actionReviewText(cells[offset + 3]),
      size: bytesFromCell(actionReviewText(cells[offset + 4])),
      href: link?.getAttribute('href') || '',
    });
  }
  return rows;
}

/** Convert one Action Review email row into the same target shape used by the
 * contact/account Email Preview, while refusing cross-origin links. */
export function actionReviewEmailTarget(email, currentHref = '') {
  try {
    const current = new URL(currentHref);
    const url = new URL(email?.href || '', current.href);
    if (url.origin !== current.origin) return null;
    const params = Array.from(url.searchParams.entries());
    const readParam = (name) => (
      params.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || ''
    );
    const messageId = readParam('MessageID');
    if (!messageId) return null;
    return {
      href: url.href,
      messageId,
      messageGuid: readParam('MessageGUID'),
      meta: {
        from: email?.from || '',
        to: email?.to || '',
        subject: email?.subject || '',
        date: email?.date || '',
      },
    };
  } catch (error) {
    return null;
  }
}

function taskCellOffset(cells) {
  if (TASK_STATUS.test(cells[2] || '')) return 0;
  if (TASK_STATUS.test(cells[3] || '')) return 1;
  return cells.length > 6 && !cells[0] ? 1 : 0;
}

export function parseActionReviewTasks(doc) {
  const table = doc?.querySelector?.('#TableTasks');
  if (!table) return [];

  const rows = [];
  for (const row of Array.from(table.querySelectorAll('tr[id^="taskrow_"]'))) {
    if (row.id.includes('taskrow2_')) continue;
    const cells = directCells(row).map(actionReviewText);
    if (cells.length < 5) continue;
    const offset = taskCellOffset(cells);
    const [subject, category, status, live, due] = cells.slice(offset, offset + 5);
    rows.push({
      id: row.id.replace(/^taskrow_/, ''),
      subject: subject || '',
      category: category || '',
      status: status || '',
      live: live || '',
      due: due || '',
    });
  }
  return rows;
}

export function parseActionReviewRepOptions(doc) {
  return Array.from(doc?.querySelectorAll?.('#SalesRep option') || [])
    .map((option) => ({
      id: option.getAttribute('value') || '',
      label: actionReviewText(option),
    }))
    .filter((option) => option.label);
}

export function collectActionReviewFormState(doc) {
  const state = {};
  const controls = doc?.querySelectorAll?.('form input[name], form select[name], form textarea[name]') || [];
  for (const control of Array.from(controls)) {
    const type = String(control.getAttribute('type') || '').toLowerCase();
    if (type === 'button' || type === 'submit' || type === 'image' || type === 'file') continue;
    if ((type === 'checkbox' || type === 'radio') && !control.checked) continue;
    state[control.name] = control.value ?? '';
  }
  return state;
}

export function toIsoActionReviewDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return [
      String(value.getFullYear()).padStart(4, '0'),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }

  const source = String(value).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(source);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;

  const webForms = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(source);
  if (webForms) return `${webForms[3]}-${String(Number(webForms[1])).padStart(2, '0')}-${String(Number(webForms[2])).padStart(2, '0')}`;
  return '';
}

export function toWebFormsActionReviewDate(value) {
  const iso = toIsoActionReviewDate(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return `${month}/${day}/${year}`;
}

function normalizedDateOption(value) {
  const option = String(value || '').toUpperCase();
  return DATE_OPTIONS.has(option) ? option : 'ON';
}

export function isActionReviewDocument(doc) {
  return !!(
    doc?.querySelector?.('form')
    && doc.querySelector('#SalesRep')
    && doc.querySelector('#DateOption')
    && doc.querySelector('#DateTime')
  );
}

/** Result sections are conditional native output. The initial Page 286 GET
 * contains only the form controls, and even a successful POST can omit any
 * table whose result set is unavailable/empty. */
export function actionReviewResultTables(doc) {
  return {
    activities: !!doc?.querySelector?.('#ActivityTable'),
    emails: !!findActionReviewEmailTable(doc),
    tasks: !!doc?.querySelector?.('#TableTasks'),
  };
}

export function actionReviewDocumentSignature(doc) {
  if (!isActionReviewDocument(doc)) return 'missing';
  const tables = actionReviewResultTables(doc);
  const activities = doc.querySelectorAll('#ActivityTable tbody tr').length;
  const emails = parseActionReviewEmails(doc).length;
  const tasks = doc.querySelectorAll('#TableTasks tr[id^="taskrow_"]').length;
  const reps = doc.querySelectorAll('#SalesRep option').length;
  return [
    `a:${tables.activities ? activities : '-'}`,
    `e:${tables.emails ? emails : '-'}`,
    `t:${tables.tasks ? tasks : '-'}`,
    `r:${reps}`,
  ].join(';');
}

export function isActionReviewSnapshotSettled({
  ready = false,
  elapsedMs = 0,
  stableMs = 0,
  minimumWaitMs = 750,
  quietMs = 250,
} = {}) {
  return !!ready
    && Number(elapsedMs) >= Math.max(0, Number(minimumWaitMs) || 0)
    && Number(stableMs) >= Math.max(0, Number(quietMs) || 0);
}

export function parseActionReviewDocument(doc) {
  const salesRep = doc?.querySelector?.('#SalesRep');
  const form = doc?.querySelector?.('form');
  const resultTables = actionReviewResultTables(doc);
  return {
    activities: parseActionReviewActivities(doc),
    emails: parseActionReviewEmails(doc),
    tasks: parseActionReviewTasks(doc),
    searched: Object.values(resultTables).some(Boolean),
    resultTables,
    reps: parseActionReviewRepOptions(doc),
    selected: {
      rep: salesRep?.value || '',
      dateOption: normalizedDateOption(doc?.querySelector?.('#DateOption')?.value),
      date1: toIsoActionReviewDate(doc?.querySelector?.('#DateTime')?.value),
      date2: toIsoActionReviewDate(doc?.querySelector?.('#SecondDateTime')?.value),
    },
    formState: collectActionReviewFormState(doc),
    formAction: form?.getAttribute?.('action') || '',
  };
}

export function buildActionReviewPostFields(formState, {
  rep = '',
  dateOption = 'ON',
  date1 = '',
  date2 = '',
} = {}) {
  const option = normalizedDateOption(dateOption);
  const firstDate = toWebFormsActionReviewDate(date1);
  // The native page always includes its hidden SecondDateTime value in the
  // GetSalesRep JSON. The server deserializes it as a non-nullable DateTime
  // before inspecting DateOption, so an empty value 500s even for ON/BEFORE/
  // AFTER searches. Preserve the native field and fall back to the first date.
  const secondDate = toWebFormsActionReviewDate(date2) || firstDate;
  const argument = {
    SalesRep: String(rep || ''),
    DateOption: option,
    DateTime: firstDate,
    SecondDateTime: secondDate,
  };
  return {
    ...(formState || {}),
    __EVENTTARGET: 'GetSalesRep',
    __EVENTARGUMENT: JSON.stringify(argument),
    'ctl00$SalesRep': argument.SalesRep,
    'ctl00$DateOption': argument.DateOption,
    'ctl00$DateTime': argument.DateTime,
    'ctl00$SecondDateTime': argument.SecondDateTime,
  };
}

/**
 * Build the same authenticated WebForms POST as __doPostBack('GetSalesRep',
 * ...), but as a background fetch request so the custom page never navigates.
 * The caller parses the returned HTML and renders those rows in place.
 */
export function buildActionReviewRequest(review, filters = {}, currentHref = '') {
  const current = new URL(currentHref);
  let target = current;
  try {
    const candidate = new URL(review?.formAction || current.href, current.href);
    if (candidate.origin === current.origin && /[?&]Page=286\b/i.test(candidate.href)) {
      target = candidate;
    }
  } catch (error) {}

  const fields = buildActionReviewPostFields(review?.formState, filters);
  return {
    url: target.href,
    init: {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams(fields).toString(),
    },
  };
}

export function filterActionReviewTasks(tasks, { query = '', status = 'all' } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  const statusNeedle = String(status || 'all').trim().toLowerCase();
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (statusNeedle !== 'all' && String(task.status || '').toLowerCase() !== statusNeedle) return false;
    if (!needle) return true;
    return `${task.subject || ''} ${task.category || ''} ${task.status || ''} ${task.live || ''} ${task.due || ''}`
      .toLowerCase()
      .includes(needle);
  });
}

export function paginateActionReviewRows(rows, page = 1, pageSize = 100) {
  const size = Math.max(1, Number(pageSize) || 100);
  const total = Array.isArray(rows) ? rows.length : 0;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const currentPage = Math.min(pageCount, Math.max(1, Number(page) || 1));
  const start = (currentPage - 1) * size;
  return {
    rows: (Array.isArray(rows) ? rows : []).slice(start, start + size),
    page: currentPage,
    pageCount,
    pageSize: size,
    total,
    start: total ? start + 1 : 0,
    end: Math.min(start + size, total),
  };
}
