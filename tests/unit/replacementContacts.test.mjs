import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAIN_META,
  RC_SETTABLE,
  buildReplacementRecords,
  classifyEmailDomain,
  closingSummary,
  contactIdFromUrl,
  emailDomain,
  excludeReplacementTasks,
  filterReplacementRecords,
  isClosingStatus,
  isReplacementTask,
  kindLabel,
  normalizeReplacementStates,
  pruneReplacementStates,
  replacementKind,
  replacementKpis,
  selectReplacementTasks,
  sortReplacementRecords,
} from '../../src/lib/replacementContacts.js';

const TODAY = new Date(2026, 7, 5);           // 2026-08-05, local midnight
const day = (offset) => new Date(2026, 7, 5 + offset);

const task = (over = {}) => ({
  id: '900',
  subject: 'Investigate bounced contact',
  contact: 'Renee Guidry',
  contactUrl: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=240&customerID=3204411',
  account: 'Cypress Country Club',
  accountUrl: 'https://api.golfballs.com/golfballs/adminnew/Default.aspx?Page=271&accountID=141002',
  due: '08/05/2026',
  dueDate: day(0),
  category: 'Email',
  priority: 2,
  ...over,
});

describe('replacement contacts · which tasks are the queue', () => {
  it('claims both automated bounce subjects and labels each kind', () => {
    assert.equal(replacementKind(task({ subject: 'Investigate bounced contact' })), 'investigate');
    assert.equal(replacementKind(task({ subject: 'Replacement contact needed' })), 'replacement');
    assert.equal(kindLabel('investigate'), 'Bounce investigation');
    assert.equal(kindLabel('replacement'), 'Replacement needed');
  });

  it('matches on the subject prefix, so an appended address still counts', () => {
    assert.equal(isReplacementTask(task({ subject: 'Replacement contact needed - jdoe@acme.com' })), true);
    assert.equal(isReplacementTask(task({ subject: 'INVESTIGATE BOUNCED CONTACT  (auto)' })), true);
  });

  it('leaves ordinary rep work alone — including a subject that merely mentions a bounce', () => {
    assert.equal(isReplacementTask(task({ subject: 'Follow up on investigate bounced contact' })), false);
    assert.equal(isReplacementTask(task({ subject: 'Quarterly check-in' })), false);
    assert.equal(isReplacementTask(task({ subject: '' })), false);
  });

  it('partitions a mixed list both ways with no row lost or duplicated', () => {
    const tasks = [
      task({ id: '1', subject: 'Quarterly check-in' }),
      task({ id: '2', subject: 'Investigate bounced contact' }),
      task({ id: '3', subject: 'Replacement contact needed' }),
      task({ id: '4', subject: 'Send proposal' }),
    ];
    assert.deepEqual(selectReplacementTasks(tasks).map((t) => t.id), ['2', '3']);
    assert.deepEqual(excludeReplacementTasks(tasks).map((t) => t.id), ['1', '4']);
  });
});

describe('replacement contacts · domain classification', () => {
  it('treats a company address as findable', () => {
    assert.equal(classifyEmailDomain('rguidry@cypresscc.com'), 'business');
    assert.equal(DOMAIN_META.business.tone, 'success');
  });

  it('separates a shared role mailbox from a person at the same domain', () => {
    assert.equal(classifyEmailDomain('proshop@cypresscc.com'), 'role');
    assert.equal(classifyEmailDomain('purchasing2@cypresscc.com'), 'role');
    assert.equal(classifyEmailDomain('r.guidry@cypresscc.com'), 'business');
  });

  it('marks consumer mailboxes as dead ends — there is no company to search', () => {
    assert.equal(classifyEmailDomain('reneeguidry42@gmail.com'), 'personal');
    assert.equal(classifyEmailDomain('Renee.Guidry@BellSouth.net'), 'personal');
  });

  it('marks marketplace relays, including a subdomain relay', () => {
    assert.equal(classifyEmailDomain('t8fj2@marketplace.amazon.com'), 'marketplace');
    assert.equal(classifyEmailDomain('x@members.ebay.com'), 'marketplace');
  });

  it('reports unknown for anything that is not an address', () => {
    for (const bad of ['', null, undefined, 'not-an-email', '@nolocal.com', 'trailing@', 'a@b']) {
      assert.equal(classifyEmailDomain(bad), 'unknown', String(bad));
    }
  });

  it('extracts the domain for the enrichment search', () => {
    assert.equal(emailDomain('Renee@Cypress-CC.com'), 'cypress-cc.com');
    assert.equal(emailDomain('nope'), '');
  });

  it('pulls the customer id out of a native contact link', () => {
    assert.equal(contactIdFromUrl(task().contactUrl), '3204411');
    assert.equal(contactIdFromUrl('Default.aspx?Page=240'), '');
  });
});

describe('replacement contacts · records', () => {
  const tasks = [task({ id: '900' }), task({ id: '901', subject: 'Replacement contact needed' })];
  const hydrated = { 3204411: { email: 'proshop@cypresscc.com', jobTitle: 'Golf Professional' } };

  it('joins the task row with the contact lookup', () => {
    const [rec] = buildReplacementRecords(tasks, { hydrated, today: TODAY });
    assert.equal(rec.taskId, '900');
    assert.equal(rec.contactId, '3204411');
    assert.equal(rec.email, 'proshop@cypresscc.com');
    assert.equal(rec.domain, 'cypresscc.com');
    assert.equal(rec.dtype, 'role');
    assert.equal(rec.searchable, true);
    assert.equal(rec.title, 'Golf Professional');
    assert.equal(rec.status, 'pending');
  });

  it('says the address is still loading rather than claiming the contact has none', () => {
    const [rec] = buildReplacementRecords(tasks, { hydrated: {}, today: TODAY });
    assert.equal(rec.emailState, 'pending');
    assert.equal(rec.dtype, 'unknown');
    assert.equal(rec.searchable, false);
  });

  it('does not leave a task with no contact link waiting on a lookup', () => {
    const [rec] = buildReplacementRecords([task({ contactUrl: '' })], { today: TODAY });
    assert.equal(rec.contactId, '');
    assert.equal(rec.emailState, 'none');
  });

  it('distinguishes a contact with no address on file from a failed lookup', () => {
    const none = buildReplacementRecords([task()], { hydrated: { 3204411: { email: '' } }, today: TODAY });
    const failed = buildReplacementRecords([task()], { hydrated: { 3204411: { error: 'HTTP 500' } }, today: TODAY });
    assert.equal(none[0].emailState, 'none');
    assert.equal(failed[0].emailState, 'error');
  });

  it('carries the rep annotation, including a chosen replacement', () => {
    const states = { 900: { status: 'complete', replacement: { name: 'Beau Hebert', email: 'bhebert@cypresscc.com' } } };
    const [rec] = buildReplacementRecords(tasks, { hydrated, states, today: TODAY });
    assert.equal(rec.status, 'complete');
    assert.equal(rec.replacement.email, 'bhebert@cypresscc.com');
  });

  it('buckets the task due date so overdue rows can surface', () => {
    const recs = buildReplacementRecords([
      task({ id: '1', dueDate: day(-3) }),
      task({ id: '2', dueDate: day(0) }),
      task({ id: '3', dueDate: day(30) }),
    ], { today: TODAY });
    assert.deepEqual(recs.map((r) => r.dueBucket), ['overdue', 'today', 'later']);
  });

  it('ignores non-replacement tasks handed to it', () => {
    const recs = buildReplacementRecords([task({ subject: 'Quarterly check-in' })], { today: TODAY });
    assert.deepEqual(recs, []);
  });
});

describe('replacement contacts · filtering and order', () => {
  const recs = buildReplacementRecords([
    task({ id: '1', contact: 'Beau Hebert', dueDate: day(-9) }),
    task({ id: '2', contact: 'Talia Landry', dueDate: day(-2) }),
    task({ id: '3', contact: 'Kirk Savoie', dueDate: day(6), subject: 'Replacement contact needed' }),
    task({ id: '4', contact: 'Sonya Doucet', dueDate: day(-30) }),
  ], {
    hydrated: {
      3204411: { email: 'bhebert@cypresscc.com' },
    },
    states: { 4: { status: 'archived', updatedAt: TODAY.getTime() } },
    today: TODAY,
  });
  // Every task in this fixture shares one contactUrl, so give them distinct
  // addresses by hand — the join is covered above.
  const rows = recs.map((rec, i) => ({
    ...rec,
    ...[
      { email: 'bhebert@cypresscc.com', domain: 'cypresscc.com', dtype: 'business', searchable: true },
      { email: 'talia88@gmail.com', domain: 'gmail.com', dtype: 'personal', searchable: false },
      { email: 'orders@savoiegolf.com', domain: 'savoiegolf.com', dtype: 'role', searchable: true },
      { email: '', domain: '', dtype: 'unknown', searchable: false },
    ][i],
  }));

  it('defaults to the open queue, hiding closed rows', () => {
    const open = filterReplacementRecords(rows, {});
    assert.deepEqual(open.map((r) => r.id), ['1', '2', '3']);
  });

  it('can show everything, including the archived row', () => {
    assert.equal(filterReplacementRecords(rows, { status: 'all' }).length, 4);
    assert.deepEqual(filterReplacementRecords(rows, { status: 'archived' }).map((r) => r.id), ['4']);
  });

  it('filters to one domain type and one task kind', () => {
    assert.deepEqual(filterReplacementRecords(rows, { dtype: 'personal' }).map((r) => r.id), ['2']);
    assert.deepEqual(filterReplacementRecords(rows, { kind: 'replacement' }).map((r) => r.id), ['3']);
  });

  it('searches contact, account, address and domain together', () => {
    assert.deepEqual(filterReplacementRecords(rows, { query: 'savoiegolf' }).map((r) => r.id), ['3']);
    assert.deepEqual(filterReplacementRecords(rows, { query: 'talia' }).map((r) => r.id), ['2']);
    assert.deepEqual(filterReplacementRecords(rows, { query: 'cypress country' }).map((r) => r.id), ['1', '2', '3']);
  });

  it('puts workable domains above dead ends, then the most overdue first', () => {
    const order = sortReplacementRecords(filterReplacementRecords(rows, {}), 'queue').map((r) => r.id);
    assert.deepEqual(order, ['1', '3', '2']);
  });

  it('sorts by due date when the header asks for it', () => {
    const order = sortReplacementRecords(rows, 'due').map((r) => r.id);
    assert.deepEqual(order, ['4', '1', '2', '3']);
  });

  it('sorts rows with no address last, not first', () => {
    const order = sortReplacementRecords(rows, 'email').map((r) => r.id);
    assert.equal(order[order.length - 1], '4');
  });

  it('counts the rail off the whole queue, not the filtered view', () => {
    const k = replacementKpis(rows);
    assert.equal(k.total, 4);
    assert.equal(k.open, 3);
    assert.equal(k.searchable, 2);
    assert.equal(k.deadEnd, 1);
    assert.equal(k.overdue, 2);
    assert.equal(k.archived, 1);
    assert.equal(k.replaced, 0);
  });
});

describe('replacement contacts · rep annotations', () => {
  it('accepts only known statuses and numeric task keys', () => {
    const states = normalizeReplacementStates({
      900: { status: 'working' },
      901: { status: 'nonsense' },
      'drop me': { status: 'working' },
    });
    assert.deepEqual(Object.keys(states).sort(), ['900', '901']);
    assert.equal(states[901].status, 'pending');
    for (const status of RC_SETTABLE) {
      assert.equal(normalizeReplacementStates({ 5: { status } })[5].status, status);
    }
  });

  it('keeps a chosen replacement and drops junk fields', () => {
    const state = normalizeReplacementStates({
      7: { status: 'complete', replacement: { name: 'Beau Hebert', email: 'b@x.com', evil: 1 } },
    })[7];
    assert.deepEqual(state.replacement, { name: 'Beau Hebert', email: 'b@x.com' });
  });

  it('survives a corrupt storage value instead of throwing', () => {
    assert.deepEqual(normalizeReplacementStates(null), {});
    assert.deepEqual(normalizeReplacementStates('nope'), {});
    assert.deepEqual(normalizeReplacementStates([1, 2]), {});
  });

  it('prunes annotations for tasks that are gone, after a grace period', () => {
    const now = TODAY.getTime();
    const states = {
      1: { status: 'working', updatedAt: now },                       // live
      2: { status: 'working', updatedAt: now - 10 * 86400000 },       // gone, recent
      3: { status: 'working', updatedAt: now - 90 * 86400000 },       // gone, stale
    };
    const kept = pruneReplacementStates(states, ['1'], { now });
    assert.deepEqual(Object.keys(kept).sort(), ['1', '2']);
  });
});

describe('replacement contacts · closing actions', () => {
  it('treats exactly the three closing statuses as closing', () => {
    assert.equal(isClosingStatus('complete'), true);
    assert.equal(isClosingStatus('archived'), true);
    assert.equal(isClosingStatus('norep'), true);
    for (const open of ['pending', 'working', 'called', 'analyzed']) {
      assert.equal(isClosingStatus(open), false, open);
    }
  });

  it('says the CRM task gets completed, so the rep is never surprised', () => {
    assert.equal(closingSummary('complete', 1), 'Mark 1 contact replaced and complete the bounce task.');
    assert.equal(closingSummary('archived', 3), 'Archive 3 contacts and complete the bounce tasks.');
    assert.equal(closingSummary('norep', 2), 'Close 2 contacts as unreplaceable and complete the bounce tasks.');
  });
});
