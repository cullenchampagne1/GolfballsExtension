/* Structured, serializable Task List data for modal-scoped custom actions. */

function idFromUrl(value, key) {
  if (!value) return '';
  try {
    const url = new URL(String(value), 'https://api.golfballs.com/');
    const exact = url.searchParams.get(key);
    if (exact) return String(exact);
    const expected = String(key).toLowerCase();
    for (const [param, entry] of url.searchParams.entries()) {
      if (param.toLowerCase() === expected) return String(entry || '');
    }
    return '';
  } catch {
    return '';
  }
}

function dateValue(value, fallback = '') {
  const raw = value instanceof Date ? value : new Date(value || fallback);
  if (Number.isNaN(raw.getTime())) return String(fallback || '');
  return [
    raw.getFullYear(),
    String(raw.getMonth() + 1).padStart(2, '0'),
    String(raw.getDate()).padStart(2, '0'),
  ].join('-');
}

export function taskListContactId(row, { useMock = false } = {}) {
  const explicit = row?.contactId || row?.customerId;
  if (explicit && String(explicit) !== '0') return String(explicit);
  const fromUrl = idFromUrl(row?.contactUrl, 'customerID');
  if (fromUrl && fromUrl !== '0') return fromUrl;
  return useMock && row?.id ? `mock-${row.id}` : '';
}

export function taskListAccountId(row) {
  const explicit = row?.accountId;
  if (explicit) return String(explicit);
  return idFromUrl(row?.accountUrl, 'AccountID');
}

function actionTask(row, visibleIds, selectedIds, useMock) {
  return {
    id: String(row?.id || ''),
    account: String(row?.account || ''),
    accountId: taskListAccountId(row),
    accountUrl: String(row?.accountUrl || ''),
    contact: String(row?.contact || ''),
    contactId: taskListContactId(row, { useMock }),
    contactUrl: String(row?.contactUrl || ''),
    due: String(row?.due || ''),
    dueDate: dateValue(row?.dueDate, row?.due),
    category: String(row?.category || ''),
    priority: Number(row?.priority) || 2,
    priorityLabel: String(row?.priorityLabel || ''),
    subject: String(row?.subject || ''),
    status: String(row?.status || ''),
    value: Number(row?.value ?? row?.revenue) || 0,
    visible: visibleIds.has(String(row?.id || '')),
    selected: selectedIds.has(String(row?.id || '')),
  };
}

export function buildTaskListActionContext({
  rows = [],
  visibleRows = rows,
  selectedIds = [],
  status = 'ready',
  filters = {},
  useMock = false,
} = {}) {
  const visible = new Set(
    (visibleRows || []).map((row) => String(row?.id || '')).filter(Boolean),
  );
  const selected = new Set(
    Array.from(selectedIds || [], (id) => String(id)).filter(Boolean),
  );
  const tasks = (rows || []).map((row) => actionTask(row, visible, selected, useMock));
  const contacts = new Map();

  for (const task of tasks) {
    if (!task.contactId) continue;
    if (!contacts.has(task.contactId)) {
      contacts.set(task.contactId, {
        contactId: task.contactId,
        contactName: task.contact,
        contactUrl: task.contactUrl,
        accountId: task.accountId,
        accountName: task.account,
        accountUrl: task.accountUrl,
        taskIds: [],
      });
    }
    contacts.get(task.contactId).taskIds.push(task.id);
  }

  return {
    kind: 'task-list',
    status: String(status || 'ready'),
    totalCount: tasks.length,
    visibleCount: visible.size,
    selectedTaskIds: [...selected],
    filters: {
      query: String(filters.query || ''),
      status: String(filters.status || ''),
      priority: String(filters.priority || ''),
      due: String(filters.due || ''),
    },
    tasks,
    contacts: [...contacts.values()],
  };
}
