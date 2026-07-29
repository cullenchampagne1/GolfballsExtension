/**
 * Task List page data model: parsing native Page=349 rows, the Refine
 * filters (status/priority/category/due), stable multi-key sort, and the
 * due-date bucketer that drives the sidebar.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.DOMParser = dom.window.DOMParser;

const {
  parseTasksFromHtml, filterTasks, sortTasks, dueBucket, distinctCategories, looksLikeLoginShell,
} = await import('../../src/lib/taskListModel.js');

// One native task row (Account / Contact / Due / Category / Priority / Subject / status input).
const ROW = (id, { account = 'Acme', contact = 'Jane', cust = '555', due = '7/01/2026', cat = 'Follow Up', pri = '2Med', subject = 'Call', status = 'New' } = {}) => `
  <tr id="taskrow_${id}">
    <td><a href="/Default.aspx?Page=271&accountID=9">${account}</a></td>
    <td><a href="/Default.aspx?Page=240&customerID=${cust}">${contact}</a></td>
    <td>${due}</td><td>${cat}</td><td>${pri}</td><td>${subject}</td>
    <td><input id="status_${id}" value="${status}"></td>
  </tr>`;
const PAGE = (rows) => `<table id="TableTasks"><tbody>${rows.join('')}</tbody></table>`;

describe('parseTasksFromHtml', () => {
  it('pulls the row fields and resolves absolute contact/account urls', () => {
    const [t] = parseTasksFromHtml(PAGE([ROW('100', { pri: '1High', cat: 'Email' })]));
    assert.equal(t.id, '100');
    assert.equal(t.account, 'Acme');
    assert.equal(t.contact, 'Jane');
    assert.equal(t.priority, 1);
    assert.equal(t.priorityLabel, 'High');
    assert.equal(t.category, 'Email');
    assert.equal(t.status, 'New');
    assert.match(t.contactUrl, /customerID=555/);
  });

  it('marks completed rows from the status input and skips nested taskrow2_ rows', () => {
    const html = PAGE([ROW('1', { status: 'Complete task' })]) + '<tr id="taskrow2_1"><td>nested</td></tr>';
    const rows = parseTasksFromHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'Complete');
  });
});

describe('dueBucket', () => {
  // Local-time construction (the real parser reads US-format dates as local).
  const d = (y, m, day) => new Date(y, m - 1, day);
  const today = d(2026, 7, 10);
  it('classifies overdue / today / week / later / none', () => {
    assert.equal(dueBucket(d(2026, 7, 5), today), 'overdue');
    assert.equal(dueBucket(d(2026, 7, 10), today), 'today');
    assert.equal(dueBucket(d(2026, 7, 14), today), 'week');
    assert.equal(dueBucket(d(2026, 8, 20), today), 'later');
    assert.equal(dueBucket(new Date('nonsense'), today), 'none');
  });
});

describe('filterTasks', () => {
  const tasks = parseTasksFromHtml(PAGE([
    ROW('1', { pri: '1High', cat: 'Email', subject: 'Send specs', status: 'New' }),
    ROW('2', { pri: '3Low', cat: 'Call', subject: 'Reorder', status: 'New' }),
    ROW('3', { pri: '2Med', cat: 'Email', subject: 'Proof', status: 'Complete task' }),
  ]));

  it('defaults to New status only', () => {
    assert.deepEqual(filterTasks(tasks, {}).map((t) => t.id), ['1', '2']);
  });
  it('filters by priority set and category set', () => {
    assert.deepEqual(filterTasks(tasks, { status: '0', priority: new Set(['1']) }).map((t) => t.id), ['1']);
    assert.deepEqual(filterTasks(tasks, { status: '0', category: new Set(['Email']) }).map((t) => t.id), ['1', '3']);
  });
  it('free-text query matches account/contact/subject/category', () => {
    assert.deepEqual(filterTasks(tasks, { status: '0', query: 'reorder' }).map((t) => t.id), ['2']);
  });
  it('completed status shows only completed', () => {
    assert.deepEqual(filterTasks(tasks, { status: '3' }).map((t) => t.id), ['3']);
  });
});

describe('sortTasks', () => {
  const tasks = parseTasksFromHtml(PAGE([
    ROW('a', { due: '7/10/2026', pri: '2Med' }),
    ROW('b', { due: '7/01/2026', pri: '1High' }),
    ROW('c', { due: '7/20/2026', pri: '3Low' }),
  ]));
  it('sorts by due date ascending by default', () => {
    assert.deepEqual(sortTasks(tasks, [{ key: 'dueDate', dir: 'asc' }]).map((t) => t.id), ['b', 'a', 'c']);
  });
  it('sorts by priority descending', () => {
    assert.deepEqual(sortTasks(tasks, [{ key: 'priority', dir: 'desc' }]).map((t) => t.id), ['c', 'a', 'b']);
  });
});

describe('helpers', () => {
  it('distinctCategories dedupes + sorts', () => {
    const tasks = parseTasksFromHtml(PAGE([ROW('1', { cat: 'Email' }), ROW('2', { cat: 'Call' }), ROW('3', { cat: 'Email' })]));
    assert.deepEqual(distinctCategories(tasks), ['Call', 'Email']);
  });
  it('looksLikeLoginShell is false when task rows are present', () => {
    assert.equal(looksLikeLoginShell(PAGE([ROW('1')])), false);
    assert.equal(looksLikeLoginShell('<form id="loginform"><input name="password"></form>'), true);
  });
});
