/**
 * Unit tests — src/lib/crmTasks.js
 *
 * Task completion scrapes the Page=349 task list, reads each task via
 * Get.ajax and writes it back with taskStatusID 3. These tests stub global
 * fetch with realistic CRM HTML/JSON and assert the parsed rows and the
 * exact Update.ajax payloads. Conventions per findPhone.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
globalThis.DOMParser = dom.window.DOMParser;

const {
  fetchOpenTasksForContact,
  createTaskForContact,
  updateTaskById,
  completeTaskById,
  completeContactTasks,
} = await import('../../src/lib/crmTasks.js');

/* ── Fixtures ─────────────────────────────────────────────────── */

const taskRow = ({ id, contactId, due, subject, status }) => `
  <tr id="taskrow_${id}">
    <td>&nbsp;</td>
    <td><a href="/golfballs/adminnew/Default.aspx?Page=240&customerID=${contactId}">Contact</a></td>
    <td>${due}</td>
    <td>Category</td>
    <td>Owner</td>
    <td>${subject}</td>
    <td><input id="status_${id}" value="${status}"></td>
  </tr>`;

const TASK_LIST_HTML = `<!doctype html><html><body><table>
  ${taskRow({ id: 101, contactId: 555, due: '7/10/2026', subject: 'Call back re: order', status: 'Open' })}
  ${taskRow({ id: 102, contactId: 555, due: '7/8/2026', subject: 'Send proof', status: 'Complete' })}
  ${taskRow({ id: 103, contactId: 999, due: '7/9/2026', subject: 'Other contact task', status: 'Open' })}
  ${taskRow({ id: 104, contactId: 555, due: '7/12/2026', subject: 'Confirm logo art', status: 'Open' })}
  <tr id="taskrow_105"><td>malformed short row</td></tr>
</table></body></html>`;

const TASK_101 = {
  TaskId: '101', Subject: 'Call back re: order', Description: 'Ring the customer',
  LiveDate: '7/1/2026', DueDate: '7/10/2026', taskCategoryID: 4,
  taskStatusID: 1, contactID: 555, leadID: '', employeeID: 77, caseID: 12,
  Priority: '2',
};
const TASK_104 = { ...TASK_101, TaskId: '104', Subject: 'Confirm logo art', DueDate: '7/12/2026' };

function installFetch({ listOk = true, updateOk = true } = {}) {
  const updates = [];
  globalThis.fetch = async (url) => {
    if (url.includes('Page=349')) {
      return { ok: listOk, status: listOk ? 200 : 500, text: async () => TASK_LIST_HTML };
    }
    if (url.includes('/Task/Get.ajax?')) {
      const id = url.split('Get.ajax?')[1];
      return { ok: true, status: 200, json: async () => (id === '104' ? TASK_104 : TASK_101) };
    }
    if (url.includes('/Task/Update.ajax?')) {
      updates.push(JSON.parse(decodeURIComponent(url.split('Update.ajax?')[1])));
      return { ok: updateOk, status: updateOk ? 200 : 500 };
    }
    throw new Error('unexpected fetch ' + url);
  };
  return updates;
}

/* ── Tests ────────────────────────────────────────────────────── */

describe('fetchOpenTasksForContact', () => {
  it('returns only the contact’s open tasks with id, due date and subject', async () => {
    installFetch();
    const tasks = await fetchOpenTasksForContact('555');
    assert.deepEqual(tasks.map((t) => t.id), ['101', '104']);
    assert.equal(tasks[0].subject, 'Call back re: order');
    assert.equal(tasks[0].dueDate.getTime(), new Date('7/10/2026').getTime());
  });

  it('skips rows already marked Complete', async () => {
    installFetch();
    const tasks = await fetchOpenTasksForContact('555');
    assert.equal(tasks.some((t) => t.id === '102'), false);
  });

  it('rejects a non-numeric contact id before any network call', async () => {
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: true, text: async () => '' }; };
    await assert.rejects(() => fetchOpenTasksForContact('555; DROP'), /Invalid contact ID/);
    assert.equal(fetched, 0);
  });

  it('propagates an HTTP failure loading the task list', async () => {
    installFetch({ listOk: false });
    await assert.rejects(() => fetchOpenTasksForContact('555'), /HTTP 500/);
  });
});

describe('completeTaskById', () => {
  it('writes the task back verbatim with taskStatusID 3 and a numeric TaskId', async () => {
    const updates = installFetch();
    await completeTaskById('101');
    assert.deepEqual(updates, [{
      TaskId: 101,
      Subject: 'Call back re: order',
      Description: 'Ring the customer',
      LiveDate: '7/1/2026',
      DueDate: '7/10/2026',
      taskCategoryID: 4,
      taskStatusID: 3,
      contactID: 555,
      employeeID: 77,
      Priority: '2',
    }]);
  });

  it('rejects a malformed task id without fetching', async () => {
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: true }; };
    await assert.rejects(() => completeTaskById('abc'), /Invalid task ID/);
    assert.equal(fetched, 0);
  });
});

describe('updateTaskById', () => {
  it('edits approved fields while preserving the untouched CRM task payload', async () => {
    const updates = installFetch();
    const result = await updateTaskById('101', {
      subject: 'Rescheduled follow-up',
      description: 'Live date moved to one week before due date.',
      liveDate: new Date(2026, 6, 3, 12),
      dueDate: '2026-07-10',
      categoryId: 9,
      priority: 'high',
    });

    assert.deepEqual(result, {
      ok: true,
      taskId: '101',
      changed: ['subject', 'description', 'liveDate', 'dueDate', 'categoryId', 'priority'],
    });
    assert.deepEqual(updates, [{
      TaskID: '101',
      Subject: 'Rescheduled follow-up',
      Description: 'Live date moved to one week before due date.',
      LiveDate: '07/03/2026',
      DueDate: '07/10/2026',
      taskCategoryID: '9',
      taskStatusID: '1',
      Priority: '1',
      contactID: '555',
      leadID: '',
      employeeID: '77',
      caseID: 12,
    }]);
  });

  it('rejects unsupported-only edits before loading the task', async () => {
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: true }; };
    await assert.rejects(
      () => updateTaskById('101', { contactId: '999' }),
      /no supported fields/,
    );
    assert.equal(fetched, 0);
  });

  it('rejects malformed dates without writing an update', async () => {
    const updates = installFetch();
    await assert.rejects(
      () => updateTaskById('101', { liveDate: 'not a date' }),
      /Invalid task live date/,
    );
    assert.deepEqual(updates, []);
  });
});

describe('completeContactTasks', () => {
  it('rejects an unknown completion mode', async () => {
    const res = await completeContactTasks('555', { mode: 'completeSome' });
    assert.deepEqual(res, { ok: false, error: 'Invalid completion mode' });
  });

  it('rejects an invalid contact id with an error result (not a throw)', async () => {
    const res = await completeContactTasks('not-a-number');
    assert.deepEqual(res, { ok: false, error: 'Invalid contact ID' });
  });

  it('reports "No open tasks" when the contact has nothing outstanding', async () => {
    installFetch();
    const res = await completeContactTasks('999999');
    assert.deepEqual(res, { ok: true, detail: 'No open tasks' });
  });

  it('completeAll completes every open task for the contact', async () => {
    const updates = installFetch();
    const res = await completeContactTasks('555', { mode: 'completeAll' });
    assert.deepEqual(res, { ok: true, detail: 'Completed 2 tasks' });
    assert.deepEqual(updates.map((u) => u.TaskId), [101, 104]);
    assert.equal(updates.every((u) => u.taskStatusID === 3), true);
  });

  it('completeLatest completes only the task with the most recent due date', async () => {
    const updates = installFetch();
    const res = await completeContactTasks('555', { mode: 'completeLatest' });
    assert.deepEqual(res, { ok: true, detail: 'Completed 1 task' });
    assert.deepEqual(updates.map((u) => u.TaskId), [104]);
  });

  it('reports failure when every update is rejected by the CRM', async () => {
    installFetch({ updateOk: false });
    const res = await completeContactTasks('555', { mode: 'completeAll' });
    assert.deepEqual(res, { ok: false, error: 'No tasks completed' });
  });

  it('wraps a task-list failure in a friendly error', async () => {
    installFetch({ listOk: false });
    const res = await completeContactTasks('555');
    assert.deepEqual(res, { ok: false, error: "Couldn't load tasks (HTTP 500)" });
  });
});

describe('createTaskForContact', () => {
  /* Same-origin create used by bounced-contact flagging: the request has to
     carry the exact CRM field names, and an answer that is not a created task
     has to fail rather than read as success. */
  function installCreate({ ok = true, body = '{"TaskId":"4242"}' } = {}) {
    const created = [];
    globalThis.fetch = async (url) => {
      if (!url.includes('/Task/Create.ajax?')) throw new Error('unexpected fetch ' + url);
      created.push(JSON.parse(decodeURIComponent(url.split('Create.ajax?')[1])));
      return { ok, status: ok ? 200 : 500, text: async () => body };
    };
    return created;
  }

  it('sends the CRM create payload and returns the new task id', async () => {
    const created = installCreate();
    const result = await createTaskForContact({
      contactId: '555',
      employeeId: '77',
      subject: 'Replacement contact needed - jane@acme.com',
      description: 'Email to jane@acme.com bounced (5.1.1).',
      categoryId: '18',
      priority: 1,
      daysOut: 0,
      today: new Date(2026, 7, 5),
    });
    assert.deepEqual(result, { ok: true, taskId: '4242' });
    assert.deepEqual(created, [{
      TaskID: '',
      Subject: 'Replacement contact needed - jane@acme.com',
      Description: 'Email to jane@acme.com bounced (5.1.1).',
      LiveDate: '08/05/2026',
      DueDate: '08/05/2026',
      taskCategoryID: '18',
      taskStatusID: '1',
      Priority: '1',
      contactID: '555',
      leadID: '0',
      employeeID: '77',
      caseID: 0,
    }]);
  });

  it('pushes the due date out by daysOut, leaving the live date today', async () => {
    const created = installCreate();
    await createTaskForContact({
      contactId: '555', employeeId: '77', subject: 'Follow up',
      daysOut: 3, today: new Date(2026, 7, 5),
    });
    assert.equal(created[0].LiveDate, '08/05/2026');
    assert.equal(created[0].DueDate, '08/08/2026');
  });

  it('never writes an orphan task', async () => {
    let fetched = 0;
    globalThis.fetch = async () => { fetched += 1; return { ok: true, text: async () => '{}' }; };
    await assert.rejects(
      () => createTaskForContact({ contactId: '0', employeeId: '77', subject: 'Hi' }),
      /Invalid contact ID/,
    );
    await assert.rejects(
      () => createTaskForContact({ contactId: '555', employeeId: '', subject: 'Hi' }),
      /Invalid employee ID/,
    );
    await assert.rejects(
      () => createTaskForContact({ contactId: '555', employeeId: '77', subject: '  ' }),
      /subject is required/,
    );
    assert.equal(fetched, 0);
  });

  it('treats a non-JSON answer as a failure, not a created task', async () => {
    // A login redirect answers HTTP 200 with HTML. Reading that as success is
    // how a bounce silently never reaches the queue.
    installCreate({ body: '<!doctype html><title>Sign in</title>' });
    await assert.rejects(
      () => createTaskForContact({ contactId: '555', employeeId: '77', subject: 'Hi' }),
      /did not return a created task/,
    );
  });

  it('rejects a JSON answer that carries no task id', async () => {
    installCreate({ body: '{"Error":"nope"}' });
    await assert.rejects(
      () => createTaskForContact({ contactId: '555', employeeId: '77', subject: 'Hi' }),
      /no TaskId came back/,
    );
  });

  it('propagates an HTTP failure', async () => {
    installCreate({ ok: false });
    await assert.rejects(
      () => createTaskForContact({ contactId: '555', employeeId: '77', subject: 'Hi' }),
      /HTTP 500/,
    );
  });
});
