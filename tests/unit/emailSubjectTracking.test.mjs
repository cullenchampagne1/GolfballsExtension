import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmailTemplateTrackerCatalog,
  matchEmailTemplateSubject,
  normalizeEmailSubject,
} from '../../src/lib/emailSubjectTracking.js';
import {
  createEmailTemplateTrackingStore,
  EMAIL_TEMPLATE_SENDS_KEY,
  EMAIL_TEMPLATE_TRACKERS_KEY,
} from '../../src/lib/emailTemplateTrackingStore.js';

const orderTemplate = (id, subject, extra = {}) => ({
  id,
  name: extra.name || id,
  type: 'order',
  enabled: extra.enabled ?? true,
  subject,
  vars: {
    order_number: { type: 'builtin', builtin: 'order_number' },
    name: { type: 'schema', path: 'contact.firstName' },
    ...(extra.vars || {}),
  },
  variations: extra.variations || [],
});

function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  const listeners = new Set();
  return {
    data,
    local: {
      get(keys, callback) {
        const out = {};
        for (const key of [].concat(keys)) if (key in data) out[key] = structuredClone(data[key]);
        callback?.(out);
        return Promise.resolve(out);
      },
      set(values, callback) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          changes[key] = { oldValue: data[key], newValue: structuredClone(value) };
          data[key] = structuredClone(value);
        }
        callback?.();
        for (const listener of listeners) listener(changes, 'local');
        return Promise.resolve();
      },
    },
    events: {
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
    },
  };
}

describe('automatic email-template subject trackers', () => {
  it('matches personalized order subjects after reply and external prefixes are removed', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('update', 'Order #{{order_number}} update for {{name}}'),
    ]);
    assert.equal(catalog.trackers[0].status, 'ready');
    assert.equal(
      matchEmailTemplateSubject('RE: [External Email] Fwd: Order #42819 update for María', catalog)?.templateId,
      'update',
    );
    assert.equal(normalizeEmailSubject(' [EXTERNAL] Re:  Order — Update '), 'order - update');
  });

  it('accepts the base subject and every saved variation', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('proof', 'Proof ready · Order #{{order_number}}', {
        variations: [
          { id: 'gentle', label: 'Gentle', subject: 'Your proof · Order #{{order_number}}' },
          { id: 'direct', label: 'Direct', subject: 'Approve artwork · Order #{{order_number}}' },
        ],
      }),
    ]);
    assert.equal(catalog.trackers[0].variants.length, 3);
    assert.equal(matchEmailTemplateSubject('Your proof · Order #123', catalog)?.templateId, 'proof');
    assert.equal(matchEmailTemplateSubject('Approve artwork · Order #987', catalog)?.templateId, 'proof');
  });

  it('marks exact duplicate subjects as a symmetric conflict', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('dynamic-oos', 'Out of Stock Item | Golfballs.com Order #{{order_number}}', { name: 'Dynamic OOS' }),
      orderTemplate('oos', 'Out of Stock Item | Golfballs.com Order #{{order_number}}', { name: 'OOS' }),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['conflict', 'conflict']);
    assert.equal(catalog.trackers[0].trackerId, null);
    assert.equal(catalog.trackers[0].regex, null);
    assert.equal(catalog.trackers[0].conflictsWith[0].templateId, 'oos');
    assert.equal(catalog.trackers[1].conflictsWith[0].templateId, 'dynamic-oos');
    assert.equal(matchEmailTemplateSubject('Out of Stock Item | Golfballs.com Order #42', catalog), null);
  });

  it('conservatively conflicts a dynamic language with a fixed subject it can produce', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('personal', 'Hello {{name}}'),
      orderTemplate('pat', 'Hello Pat'),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['conflict', 'conflict']);
    assert.equal(catalog.trackers[0].conflictsWith[0].witness, 'hello pat');
  });

  it('lets an untrackable dynamic-only template invalidate otherwise unique trackers', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('dynamic-only', '{{name}}'),
      orderTemplate('fixed', 'Order status update'),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['conflict', 'conflict']);
  });

  it('automatically resolves a conflict after fixed wording changes', () => {
    const conflicted = [
      orderTemplate('personal', 'Hello {{name}}'),
      orderTemplate('pat', 'Hello Pat'),
    ];
    assert.equal(buildEmailTemplateTrackerCatalog(conflicted).trackers[0].status, 'conflict');
    const resolved = buildEmailTemplateTrackerCatalog([
      conflicted[0], { ...conflicted[1], subject: 'Welcome Pat' },
    ]);
    assert.deepEqual(resolved.trackers.map((tracker) => tracker.status), ['ready', 'ready']);
  });

  it('uses literal variables and fixed code fragments to prove subjects apart', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('vip', 'Segment {{tier}} · {{computed}}', {
        vars: {
          tier: { type: 'literal', value: 'VIP' },
          computed: { type: 'code', body: 'return `Order ${ctx.order.number}`;' },
        },
      }),
      orderTemplate('standard', 'Segment {{tier}} · {{computed}}', {
        vars: {
          tier: { type: 'literal', value: 'Standard' },
          computed: { type: 'code', body: 'return "Account review";' },
        },
      }),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['ready', 'ready']);
    assert.equal(matchEmailTemplateSubject('Segment VIP · Order 5512', catalog)?.templateId, 'vip');
    assert.equal(matchEmailTemplateSubject('Segment Standard · Account review', catalog)?.templateId, 'standard');
  });

  it('does not generate trackers for disabled, case, empty, or dynamic-only subjects', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('off', 'Disabled message', { enabled: false }),
      { ...orderTemplate('case', 'Ignored'), type: 'case' },
      orderTemplate('empty', ''),
      orderTemplate('dynamic', '{{name}}'),
    ]);
    assert.deepEqual(
      catalog.trackers.map((tracker) => tracker.status),
      ['disabled', 'not_applicable', 'incomplete', 'incomplete'],
    );
  });
});

describe('template response and order attribution', () => {
  it('regenerates the stored catalog whenever templates change', async () => {
    const memory = memoryStorage({
      templates: [orderTemplate('one', 'First · Order #{{order_number}}')],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local,
      storageEvents: memory.events,
      now: () => 2_000_000_000_000,
    });
    await store.install();
    assert.equal(memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers[0].status, 'ready');

    await memory.local.set({
      templates: [
        orderTemplate('one', 'Same · Order #{{order_number}}'),
        orderTemplate('two', 'Same · Order #{{order_number}}'),
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(
      memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers.map((tracker) => tracker.status),
      ['conflict', 'conflict'],
    );
  });

  it('records a successful send, its reply, and the recipient contact’s later order', async () => {
    let now = 2_000_000_000_000;
    const memory = memoryStorage({
      templates: [orderTemplate('update', 'Order #{{order_number}} update')],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    await store.recordDelivery([{
      templateId: 'update', templateName: 'Update', templateVariationId: '__original',
      to: 'Buyer@Example.com', subject: 'Order #5512 update',
      trackingContext: { contactId: 'contact-9', accountId: 'account-2' },
    }], 'pa', [{ status: 'sent' }]);

    now += 60_000;
    await store.recordReplies([{
      id: 'remote:44', remoteId: 44, topic: 'message.reply.received',
      body: 'Re: [External] Order #5512 update', createdAt: now,
      actions: [{ payload: JSON.stringify({ version: 1, command: 'open_contact', target: 'buyer@example.com' }) }],
    }]);

    now += 60_000;
    await store.recordOrders([{
      externalId: 'contact-9@2033-05-18', at: now,
      data: { contactId: 'contact-9', orderDate: '2033-05-18' },
    }]);

    const [send] = memory.data[EMAIL_TEMPLATE_SENDS_KEY];
    assert.equal(send.trackingStatus, 'ready');
    assert.equal(send.recipient, 'buyer@example.com');
    assert.equal(send.respondedAt, 2_000_000_060_000);
    assert.equal(send.orderedAt, 2_000_000_120_000);
    const [summary] = await store.summaries();
    assert.deepEqual(
      { sent: summary.sent, responded: summary.responded, ordered: summary.ordered, responseRate: summary.responseRate, orderRate: summary.orderRate },
      { sent: 1, responded: 1, ordered: 1, responseRate: 1, orderRate: 1 },
    );
  });

  it('keeps conflicted and rendered-subject-mismatch sends out of attribution', async () => {
    let now = 2_000_000_000_000;
    const memory = memoryStorage({
      templates: [
        orderTemplate('one', 'Same · Order #{{order_number}}'),
        orderTemplate('two', 'Same · Order #{{order_number}}'),
        orderTemplate('unique', 'Unique · Order #{{order_number}}'),
      ],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    await store.recordDelivery([
      { templateId: 'one', to: 'one@example.com', subject: 'Same · Order #10', trackingContext: { contactId: 'c1' } },
      { templateId: 'unique', to: 'two@example.com', subject: 'Manually changed subject', trackingContext: { contactId: 'c2' } },
    ], 'pa', [{ status: 'sent' }, { status: 'sent' }]);
    assert.deepEqual(
      memory.data[EMAIL_TEMPLATE_SENDS_KEY].map((send) => send.trackingStatus).sort(),
      ['conflict', 'subject-mismatch'],
    );

    now += 60_000;
    await store.recordReplies([{
      topic: 'message.reply.received', body: 'Re: Same · Order #10', createdAt: now,
      actions: [{ payload: JSON.stringify({ command: 'open_contact', target: 'one@example.com' }) }],
    }]);
    await store.recordOrders([
      { externalId: 'o1', at: now, data: { contactId: 'c1' } },
      { externalId: 'o2', at: now, data: { contactId: 'c2' } },
    ]);
    assert.ok(memory.data[EMAIL_TEMPLATE_SENDS_KEY].every((send) => !send.respondedAt && !send.orderedAt));
  });
});
