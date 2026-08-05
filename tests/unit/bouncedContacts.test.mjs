/**
 * Unit tests — src/lib/bouncedContacts.js
 *
 * The rule that turns a relay bounce notification into CRM work. The two that
 * matter most: the task we write has to be the SAME row the Replacement
 * Contacts queue already selects (or the rep never sees it), and an existing
 * open bounce task has to stop us writing a second one.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOUNCE_ACTION_COMMAND,
  BOUNCE_TASK_CATEGORY_ID,
  bounceJobFromAction,
  bounceOutcomeMessage,
  bounceTaskDescription,
  bounceTaskSubject,
  bounceTaskTemplate,
  findOpenBounceTask,
  normalizeBounceEmail,
} from '../../src/lib/bouncedContacts.js';
import {
  isReplacementTask,
  replacementKind,
} from '../../src/lib/replacementContacts.js';

const action = (overrides = {}) => ({
  version: 1,
  command: BOUNCE_ACTION_COMMAND,
  target: 'Jane.Customer@Acme.com',
  value: '5.1.1',
  options: ['hard', 'auto'],
  ...overrides,
});

describe('bouncedContacts · reading the relay action', () => {
  it('reads the address, code, classification and auto flag', () => {
    assert.deepEqual(bounceJobFromAction(action()), {
      email: 'jane.customer@acme.com',
      code: '5.1.1',
      kind: 'hard',
      auto: true,
    });
  });

  it('reports a soft bounce as not automatic', () => {
    const job = bounceJobFromAction(action({ options: ['soft'], value: '4.2.2' }));
    assert.equal(job.kind, 'soft');
    assert.equal(job.auto, false);
  });

  it('defaults to unknown when the relay named no classification', () => {
    assert.equal(bounceJobFromAction(action({ options: [] })).kind, 'unknown');
  });

  it('ignores another command and an unusable target', () => {
    assert.equal(bounceJobFromAction(action({ command: 'open_contact' })), null);
    assert.equal(bounceJobFromAction(action({ target: 'not-an-address' })), null);
    assert.equal(bounceJobFromAction(null), null);
  });

  it('carries extra context through onto the job', () => {
    const job = bounceJobFromAction(action(), { remoteId: 7 });
    assert.equal(job.remoteId, 7);
  });

  it('normalizes an address and rejects anything that is not one', () => {
    assert.equal(normalizeBounceEmail(' <Jane@Acme.com> '), 'jane@acme.com');
    assert.equal(normalizeBounceEmail('jane@acme'), '');
    assert.equal(normalizeBounceEmail(`${'a'.repeat(320)}@acme.com`), '');
  });
});

describe('bouncedContacts · the task it becomes', () => {
  it('writes a subject the Replacement Contacts queue selects', () => {
    // The whole feature depends on this: a task we raise and a task the CRM
    // raises have to be the same row on the page.
    const subject = bounceTaskSubject('jane.customer@acme.com');
    assert.equal(subject, 'Replacement contact needed - jane.customer@acme.com');
    assert.equal(isReplacementTask({ subject }), true);
    assert.equal(replacementKind({ subject }), 'replacement');
  });

  it('files under the CRM Replacement Contact category, due today', () => {
    const template = bounceTaskTemplate({ email: 'jane@acme.com', kind: 'hard' });
    assert.equal(template.categoryId, '18');
    assert.equal(BOUNCE_TASK_CATEGORY_ID, '18');
    assert.equal(template.daysOut, 0);
    assert.equal(template.priority, 1);
  });

  it('says what failed, how certain it is, and where the task came from', () => {
    const body = bounceTaskDescription({
      email: 'jane@acme.com',
      code: '5.1.1',
      kind: 'hard',
      note: 'Recipient address rejected: User unknown',
      when: '5 Aug 2026',
    });
    assert.match(body, /Email to jane@acme\.com bounced \(5\.1\.1\)/);
    assert.match(body, /treat the address as dead/);
    assert.match(body, /Bounce report: Recipient address rejected: User unknown/);
    assert.match(body, /Reported 5 Aug 2026/);
    assert.match(body, /email relay/);
  });

  it('tells a rep not to trust a soft or unclassified bounce', () => {
    assert.match(
      bounceTaskDescription({ email: 'jane@acme.com', kind: 'soft' }),
      /may still work/,
    );
    assert.match(
      bounceTaskDescription({ email: 'jane@acme.com', kind: 'unknown' }),
      /did not say whether/,
    );
  });
});

describe('bouncedContacts · not writing a duplicate', () => {
  const ordinary = [
    { id: '1', subject: 'Call back re: order' },
    { id: '2', subject: 'Send proof' },
  ];

  it('finds the CRM\'s own bounce task', () => {
    const found = findOpenBounceTask([
      ...ordinary,
      { id: '3', subject: 'Investigate bounced contact - jane@acme.com' },
    ]);
    assert.equal(found.id, '3');
  });

  it('finds a task an earlier bounce notification already raised', () => {
    const found = findOpenBounceTask([
      ...ordinary,
      { id: '4', subject: bounceTaskSubject('jane@acme.com') },
    ]);
    assert.equal(found.id, '4');
  });

  it('returns null when the contact only has ordinary rep work', () => {
    assert.equal(findOpenBounceTask(ordinary), null);
    assert.equal(findOpenBounceTask(null), null);
  });
});

describe('bouncedContacts · what the rep is told', () => {
  it('names the contact for a task it created', () => {
    assert.equal(
      bounceOutcomeMessage({ status: 'created', contactName: 'Jane Customer' }),
      'Bounce flagged — replacement task added for Jane Customer',
    );
  });

  it('distinguishes already-queued from no-such-contact from failed', () => {
    assert.match(
      bounceOutcomeMessage({ status: 'existing', contactName: 'Jane Customer' }),
      /already has an open bounce task/,
    );
    assert.match(
      bounceOutcomeMessage({ status: 'unresolved', email: 'jane@acme.com' }),
      /matches no CRM contact/,
    );
    assert.match(
      bounceOutcomeMessage({ status: 'failed', error: 'HTTP 500' }),
      /Could not flag the bounced contact — HTTP 500/,
    );
  });
});
