import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEmailTemplateTrackerCatalog,
  emailTemplateTrackingIssue,
  emailTemplateClusterId,
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

describe('automatic email-template subject clusters', () => {
  it('shows presentation feedback only for actionable tracking problems', () => {
    assert.equal(emailTemplateTrackingIssue(null), null);
    assert.equal(emailTemplateTrackingIssue({ status: 'ready' }), null);
    assert.equal(emailTemplateTrackingIssue({ status: 'not_applicable' }), null);
    assert.equal(emailTemplateTrackingIssue({ status: 'disabled' }), null);

    assert.deepEqual(
      emailTemplateTrackingIssue({
        status: 'incomplete',
        reason: 'Every subject variation needs a subject line.',
      }),
      {
        status: 'incomplete',
        tone: 'warning',
        badge: 'Untracked',
        title: 'Subject cluster is not ready',
        message: 'Every subject variation needs a subject line.',
      },
    );
    assert.deepEqual(
      emailTemplateTrackingIssue({
        status: 'conflict',
        conflictsWith: [{ templateName: 'Callaway Promo' }, 'Srixon Promo'],
      }),
      {
        status: 'conflict',
        tone: 'error',
        badge: 'Conflict',
        title: 'Subject tracking conflict',
        message: 'This template overlaps “Callaway Promo”, “Srixon Promo”. Change the fixed wording in one of the overlapping subjects.',
      },
    );
  });

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

  it('keeps identical structural shapes in distinct stable template clusters', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('dynamic-oos', 'Out of Stock Item | Golfballs.com Order #{{order_number}}', { name: 'Dynamic OOS' }),
      orderTemplate('oos', 'Out of Stock Item | Golfballs.com Order #{{order_number}}', { name: 'OOS' }),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['ready', 'ready']);
    assert.deepEqual(
      catalog.trackers.map((tracker) => tracker.clusterId),
      ['email-template:dynamic-oos', 'email-template:oos'],
    );
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.conflictsWith), [[], []]);
    // Structural lookup correctly remains ambiguous. Delivery attribution does
    // not use it; it compares a reply with actual recorded sends instead.
    assert.equal(matchEmailTemplateSubject('Out of Stock Item | Golfballs.com Order #42', catalog), null);
  });

  it('does not let a wildcard shape disable a fixed-subject cluster', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('personal', 'Hello {{name}}'),
      orderTemplate('pat', 'Hello Pat'),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['ready', 'ready']);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.patterns), [
      ['hello <*>'],
      ['hello pat'],
    ]);
  });

  it('keeps literal brand wording distinct across personalized promo campaigns', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('callaway', 'Callaway Promos for {{name}}'),
      orderTemplate('srixon', 'Srixon Promos for {{name}}'),
      orderTemplate('taylormade', 'TaylorMade Promos for {{name}}'),
    ]);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.status), ['ready', 'ready', 'ready']);
    assert.deepEqual(catalog.trackers.map((tracker) => tracker.patterns[0]), [
      'callaway promos for <*>',
      'srixon promos for <*>',
      'taylormade promos for <*>',
    ]);
  });

  it('assigns cluster IDs independently of subject edits, catalog order, and rebuilds', () => {
    const original = orderTemplate('campaign-17', 'Welcome {{name}}');
    const first = buildEmailTemplateTrackerCatalog([
      original,
      orderTemplate('other', 'Other subject'),
    ]);
    const edited = buildEmailTemplateTrackerCatalog([
      orderTemplate('other', 'Other subject'),
      { ...original, subject: 'Your Callaway promotion, {{name}}' },
    ]);
    const firstTracker = first.trackers.find((tracker) => tracker.templateId === 'campaign-17');
    const editedTracker = edited.trackers.find((tracker) => tracker.templateId === 'campaign-17');
    assert.equal(firstTracker.clusterId, emailTemplateClusterId('campaign-17'));
    assert.equal(editedTracker.clusterId, firstTracker.clusterId);
    assert.notEqual(editedTracker.clusterRevision, firstTracker.clusterRevision);
    assert.equal(
      buildEmailTemplateTrackerCatalog([structuredClone(original)]).trackers[0].clusterId,
      firstTracker.clusterId,
    );
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
    assert.deepEqual(catalog.trackers[0].patterns, ['segment vip · order <*>']);
    assert.deepEqual(catalog.trackers[1].patterns, ['segment standard · account review']);
    assert.equal(matchEmailTemplateSubject('Segment VIP · Order 5512', catalog)?.templateId, 'vip');
    assert.equal(matchEmailTemplateSubject('Segment Standard · Account review', catalog)?.templateId, 'standard');
  });

  it('clusters dynamic-only subjects but skips disabled, case, and empty templates', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('off', 'Disabled message', { enabled: false }),
      { ...orderTemplate('case', 'Ignored'), type: 'case' },
      orderTemplate('empty', ''),
      orderTemplate('dynamic', '{{name}}'),
    ]);
    assert.deepEqual(
      catalog.trackers.map((tracker) => tracker.status),
      ['disabled', 'not_applicable', 'incomplete', 'ready'],
    );
    assert.deepEqual(catalog.trackers[3].patterns, ['<*>']);
  });

  it('leaves reply-in-thread templates in the original email cluster', () => {
    const catalog = buildEmailTemplateTrackerCatalog([
      orderTemplate('initial', 'Order #{{order_number}} update'),
      { ...orderTemplate('thread-reply', 'Order #{{order_number}} update'), replyMode: 'reply' },
    ]);

    assert.deepEqual(
      catalog.trackers.map((tracker) => tracker.status),
      ['ready', 'not_applicable'],
    );
    assert.equal(catalog.trackers[0].clusterId, 'email-template:initial');
    assert.equal(catalog.trackers[1].trackerId, null);
    assert.equal(catalog.trackers[1].regex, null);
    assert.equal(
      matchEmailTemplateSubject('Re: Order #5512 update', catalog)?.templateId,
      'initial',
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
    assert.equal(memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].version, 2);
    const stableClusterId = memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers[0].clusterId;

    await memory.local.set({
      templates: [
        orderTemplate('one', 'Same · Order #{{order_number}}'),
        orderTemplate('two', 'Same · Order #{{order_number}}'),
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(
      memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers.map((tracker) => tracker.status),
      ['ready', 'ready'],
    );
    assert.equal(memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers[0].clusterId, stableClusterId);
    assert.equal(memory.data[EMAIL_TEMPLATE_TRACKERS_KEY].trackers[1].clusterId, 'email-template:two');
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
    assert.equal(send.clusterId, 'email-template:update');
    assert.equal(send.trackerId, send.clusterId);
    assert.equal(send.recipient, 'buyer@example.com');
    assert.equal(send.normalizedSubject, 'order #5512 update');
    assert.equal(send.respondedAt, 2_000_000_060_000);
    assert.equal(send.orderedAt, 2_000_000_120_000);
    const [summary] = await store.summaries();
    assert.deepEqual(
      { sent: summary.sent, responded: summary.responded, ordered: summary.ordered, responseRate: summary.responseRate, orderRate: summary.orderRate },
      { sent: 1, responded: 1, ordered: 1, responseRate: 1, orderRate: 1 },
    );
  });

  it('does not create tracked-send rows for actual reply-in-thread deliveries', async () => {
    const memory = memoryStorage({
      templates: [
        orderTemplate('initial', 'Order #{{order_number}} update'),
        orderTemplate('thread-reply', 'Checking in'),
      ],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local,
      storageEvents: memory.events,
      now: () => 2_000_000_000_000,
    });
    await store.install();
    await store.recordDelivery([
      {
        templateId: 'initial', to: 'buyer@example.com', subject: 'Order #5512 update',
        trackingContext: { contactId: 'contact-9' },
      },
      {
        templateId: 'thread-reply', to: 'buyer@example.com', subject: 'Checking in',
        replyMode: 'reply',
        trackingContext: { contactId: 'contact-9' },
      },
    ], 'pa', [{ status: 'sent' }, { status: 'sent' }]);

    assert.deepEqual(
      memory.data[EMAIL_TEMPLATE_SENDS_KEY].map((send) => send.templateId),
      ['initial'],
    );
  });

  it('attributes overlapping code-variable clusters by their exact rendered subjects', async () => {
    let now = 2_000_000_000_000;
    const memory = memoryStorage({
      templates: [
        orderTemplate('callaway', '{{campaign_subject}}', {
          vars: { campaign_subject: { type: 'code', body: 'if (ctx.promo) return ctx.promo.subject; return ctx.brand;' } },
        }),
        orderTemplate('srixon', '{{campaign_subject}}', {
          vars: { campaign_subject: { type: 'code', body: 'if (ctx.promo) return ctx.promo.subject; return ctx.brand;' } },
        }),
      ],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    await store.recordDelivery([
      { templateId: 'callaway', to: 'buyer@example.com', subject: 'Callaway Promos for Dana', trackingContext: { contactId: 'c1' } },
      { templateId: 'srixon', to: 'buyer@example.com', subject: 'Srixon Spring Sale for Dana', trackingContext: { contactId: 'c1' } },
    ], 'pa', [{ status: 'sent' }, { status: 'sent' }]);
    assert.deepEqual(
      memory.data[EMAIL_TEMPLATE_SENDS_KEY].map((send) => send.trackingStatus),
      ['ready', 'ready'],
    );

    now += 60_000;
    await store.recordReplies([{
      topic: 'message.reply.received', body: 'Re: Srixon Spring Sale for Dana', createdAt: now,
      actions: [{ payload: JSON.stringify({ command: 'open_contact', target: 'buyer@example.com' }) }],
    }]);
    const byTemplate = new Map(memory.data[EMAIL_TEMPLATE_SENDS_KEY]
      .map((send) => [send.templateId, send]));
    assert.equal(byTemplate.get('srixon').respondedAt, now);
    assert.equal(byTemplate.get('callaway').respondedAt, null);
  });

  it('does not guess between identical recorded subjects when a reply has no recipient', async () => {
    let now = 2_000_000_000_000;
    const memory = memoryStorage({
      templates: [
        orderTemplate('one', 'Shared promotion'),
        orderTemplate('two', 'Shared promotion'),
      ],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    await store.recordDelivery([
      { templateId: 'one', to: 'one@example.com', subject: 'Shared promotion' },
      { templateId: 'two', to: 'two@example.com', subject: 'Shared promotion' },
    ], 'pa', [{ status: 'sent' }, { status: 'sent' }]);

    now += 60_000;
    await store.recordReplies([{
      topic: 'message.reply.received', body: 'Re: Shared promotion', createdAt: now,
    }]);
    assert.ok(memory.data[EMAIL_TEMPLATE_SENDS_KEY].every((send) => !send.respondedAt));
  });

  it('deterministically credits the newest matching send for the same recipient and subject', async () => {
    let now = 2_000_000_000_000;
    const memory = memoryStorage({
      templates: [
        orderTemplate('older', 'Shared promotion'),
        orderTemplate('newer', 'Shared promotion'),
      ],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    await store.recordDelivery([
      { templateId: 'older', to: 'buyer@example.com', subject: 'Shared promotion' },
    ], 'pa', [{ status: 'sent' }]);
    now += 60_000;
    await store.recordDelivery([
      { templateId: 'newer', to: 'buyer@example.com', subject: 'Shared promotion' },
    ], 'pa', [{ status: 'sent' }]);

    now += 60_000;
    await store.recordReplies([{
      topic: 'message.reply.received', body: 'Re: Shared promotion', createdAt: now,
      actions: [{ payload: JSON.stringify({ command: 'open_contact', target: 'buyer@example.com' }) }],
    }]);
    const byTemplate = new Map(memory.data[EMAIL_TEMPLATE_SENDS_KEY]
      .map((send) => [send.templateId, send]));
    assert.equal(byTemplate.get('newer').respondedAt, now);
    assert.equal(byTemplate.get('older').respondedAt, null);
  });

  it('upgrades legacy conflict rows when an exact reply or order arrives', async () => {
    let now = 2_000_000_060_000;
    const memory = memoryStorage({
      templates: [orderTemplate('legacy', 'Callaway Promos for {{name}}')],
      [EMAIL_TEMPLATE_SENDS_KEY]: [{
        id: 'old-send', templateId: 'legacy', templateName: 'Legacy',
        trackerId: 'email-template:legacy:old-regex-hash', trackingStatus: 'conflict', recipient: 'buyer@example.com',
        contactId: 'contact-9', subject: 'Callaway Promos for Dana',
        sentAt: 2_000_000_000_000, respondedAt: null, orderedAt: null,
      }],
    });
    const store = createEmailTemplateTrackingStore({
      storage: memory.local, storageEvents: memory.events, now: () => now,
    });
    await store.install();
    assert.equal(memory.data[EMAIL_TEMPLATE_SENDS_KEY][0].trackerId, 'email-template:legacy');
    assert.equal(memory.data[EMAIL_TEMPLATE_SENDS_KEY][0].trackingStatus, 'ready');
    await store.recordReplies([{
      topic: 'message.reply.received', body: 'Re: Callaway Promos for Dana', createdAt: now,
      actions: [{ payload: JSON.stringify({ command: 'open_contact', target: 'buyer@example.com' }) }],
    }]);
    now += 60_000;
    await store.recordOrders([{ externalId: 'o1', at: now, data: { contactId: 'contact-9' } }]);

    const [send] = memory.data[EMAIL_TEMPLATE_SENDS_KEY];
    assert.equal(send.clusterId, 'email-template:legacy');
    assert.equal(send.trackingStatus, 'ready');
    assert.equal(send.respondedAt, 2_000_000_060_000);
    assert.equal(send.orderedAt, 2_000_000_120_000);
  });
});
