/* ───────────────────────────────────────────────────────────────
   mock-chrome.js — an in-memory stand-in for the chrome.* extension
   APIs, plus realistic seed data, so the real extension UIs can run
   live inside this guide. Each live embed gets its OWN isolated mock
   (so demos don't clash). window.GBMock.* are factories.
─────────────────────────────────────────────────────────────── */
(function () {
  /* ---- seed: feature flags (from src/lib/flags.js FEATURE_DEFAULTS) ---- */
  function defaultFlags() {
    return {
      copyIdsEnabled: true, chargeEnabled: true, orderEditEnabled: true,
      emailPreviewEnabled: true, imagePreviewEnabled: true, calendarEnabled: true,
      watchListEnabled: true, autoPushEnabled: true, signifydGlowEnabled: true,
      crmQueryBuilderEnabled: true, taskListEnabled: true,
      marginCalcEnabled: true, crmSearchEnabled: true, phoneFinderEnabled: true,
      emailTemplatesEnabled: true, powerAutomateEnabled: false, powerAutomateUrl: '',
    };
  }

  /* ---- seed: realistic email/order templates ----
     Shape mirrors what popup.jsx consumes: id, name, type, enabled,
     rules, vars, toField, subject, body, variations[], replyMode. */
  function defaultTemplates() {
    return [
      {
        id: 'tpl_ship', name: 'Order Shipped', type: 'order', enabled: true,
        replyMode: 'standalone',
        rules: { all: [{ field: 'status', op: 'is', value: 'Shipped' }] },
        toField: { type: 'auto' },
        vars: {
          first_name: { type: 'builtin', path: 'contact.firstName' },
          order_no:   { type: 'builtin', path: 'order.number' },
          tracking:   { type: 'builtin', path: 'order.tracking' },
        },
        subject: 'Your Golfballs.com order {{order_no}} has shipped',
        body: '<p>Hi {{first_name}},</p><p>Good news — your order <b>{{order_no}}</b> is on its way! Track it here: {{tracking}}.</p><p>Thanks for your business.</p>',
        variations: [
          { id: 'v_ship_warm', preview: 'Warmer tone', subject: 'Great news — order {{order_no}} just shipped!', body: '<p>Hi {{first_name}},</p><p>Your golf balls are on the way 🎉 Order <b>{{order_no}}</b> · tracking {{tracking}}.</p>' },
          { id: 'v_ship_brief', preview: 'Brief / transactional', subject: 'Shipped: {{order_no}}', body: '<p>{{first_name}}, order {{order_no}} shipped. Tracking: {{tracking}}.</p>' },
        ],
      },
      {
        id: 'tpl_proof', name: 'Art Proof Ready', type: 'order', enabled: true,
        replyMode: 'reply',
        rules: { all: [{ field: 'hasLogo', op: 'is', value: true }] },
        toField: { type: 'auto' },
        vars: {
          first_name: { type: 'builtin', path: 'contact.firstName' },
          order_no:   { type: 'builtin', path: 'order.number' },
          proof_link: { type: 'code', path: '' },
        },
        subject: 'Proof ready for review — order {{order_no}}',
        body: '<p>Hi {{first_name}},</p><p>Your logo proof is ready. Please review and approve: {{proof_link}}.</p>',
        variations: [],
      },
      {
        id: 'tpl_thanks', name: 'Thank You / Follow-up', type: 'account', enabled: true,
        replyMode: 'standalone',
        accountConditions: [],
        toField: { type: 'auto' },
        vars: { first_name: { type: 'builtin', path: 'contact.firstName' } },
        subject: 'Thanks from the Golfballs.com team',
        body: '<p>Hi {{first_name}},</p><p>Just wanted to say thanks for choosing us. Let me know if you need anything.</p>',
        variations: [
          { id: 'v_thanks_rev', preview: 'Ask for a review', subject: 'Quick favor, {{first_name}}?', body: '<p>Hi {{first_name}}, would you mind leaving us a quick review?</p>' },
        ],
      },
      {
        id: 'tpl_backorder', name: 'Backorder Notice', type: 'order', enabled: true,
        replyMode: 'reply',
        rules: { all: [{ field: 'status', op: 'is', value: 'Backordered' }] },
        toField: { type: 'auto' },
        vars: { first_name: { type: 'builtin', path: 'contact.firstName' }, order_no: { type: 'builtin', path: 'order.number' }, eta: { type: 'manual' } },
        subject: 'Update on your order {{order_no}}',
        body: '<p>Hi {{first_name}},</p><p>One item on order {{order_no}} is briefly backordered. New ETA: {{eta}}.</p>',
        variations: [],
      },
      {
        id: 'tpl_quote', name: 'Custom Quote', type: 'account', enabled: true,
        replyMode: 'standalone',
        accountConditions: [],
        toField: { type: 'manual' },
        vars: { first_name: { type: 'builtin', path: 'contact.firstName' }, qty: { type: 'manual' } },
        subject: 'Your custom quote',
        body: '<p>Hi {{first_name}},</p><p>Here is the quote for {{qty}} dozen. Let me know if that works.</p>',
        variations: [],
      },
      { id: 'tpl_case_dupe', name: '[Case] Duplicate', type: 'case', enabled: true, rules: {}, vars: {}, subject: '', body: '', variations: [] },
    ];
  }

  /* ---- seed: page context for an order page ---- */
  function orderPageInfo() {
    return {
      pageType: 'order',
      orderNo: '4815162342',
      contactId: 'C-90210',
      accountId: 'A-1138',
      userId: '0042',
      messageId: 'MSG-77123',
      pageOrderTotal: 412.5,
      pageChargeTotal: 312.5,
      pageChargeRows: [{ label: 'Auth · Visa ••4242', amount: 312.5 }],
      matchedTemplateIds: ['tpl_ship'],
      pendingTemplateIds: ['tpl_proof'],
    };
  }
  function accountPageInfo() {
    return { pageType: 'account', accountId: 'A-1138', contactId: 'C-90210', userId: '0042', matchedTemplateIds: ['tpl_thanks'], pendingTemplateIds: [] };
  }

  function defaultWatchList() {
    const now = Date.now();
    return [
      { id: 'w1', entity: 'order', entityId: '4815162342', note: 'Customer asked to expedite — confirm ship date', addedAt: now - 7 * 3600000, done: false },
      { id: 'w2', entity: 'contact', entityId: 'C-90210', note: 'Wants a custom logo quote by Friday', addedAt: now - 2 * 3600000, done: false },
      { id: 'w3', entity: 'order', entityId: '7770003331', note: 'Refund processed — follow up', addedAt: now - 30 * 3600000, done: true },
    ];
  }

  /* ---- the message responder: emulates the content scripts ---- */
  function makeResponder(seed) {
    return function respond(msg) {
      const info = seed.pageInfo;
      switch (msg && msg.action) {
        case 'getPageInfo': return { ...info };
        case 'resolveVars': {
          const sample = {
            first_name: 'Jordan', order_no: info.orderNo || '4815162342',
            tracking: '1Z999AA10123456784', proof_link: 'https://proofs.golfballs.com/p/77123',
            qty: '25', eta: 'Jun 14', employee: 'Pat M.',
          };
          const resolved = {};
          Object.keys(msg.vars || {}).forEach((k) => { resolved[k] = sample[k] ?? ''; });
          const toEmail = (msg.toField && msg.toField.type === 'manual') ? '' : 'jordan.lee@example.com';
          return { resolved, toEmail };
        }
        case 'resolveMatch': return { matched: true };
        default: return { ok: true };
      }
    };
  }

  /* ---- the chrome mock factory ---- */
  function createChrome(seedOverrides) {
    const seed = Object.assign({
      flags: defaultFlags(),
      templates: defaultTemplates(),
      pageInfo: orderPageInfo(),
      watchList: defaultWatchList(),
      devSettings: {},
      probeReady: true,
    }, seedOverrides || {});
    const respond = makeResponder(seed);

    const store = {
      templates: seed.templates,
      featureFlags: seed.flags,
      watchList: seed.watchList,
      devSettings: seed.devSettings,
      orderTabId: 1,
    };
    const listeners = [];
    const fire = (changes) => listeners.forEach((fn) => { try { fn(changes, 'local'); } catch (e) {} });

    function get(keys, cb) {
      let out = {};
      if (keys == null) out = { ...store };
      else if (typeof keys === 'string') out = { [keys]: store[keys] };
      else if (Array.isArray(keys)) keys.forEach((k) => { out[k] = store[k]; });
      else if (typeof keys === 'object') Object.keys(keys).forEach((k) => { out[k] = (k in store) ? store[k] : keys[k]; });
      if (cb) { cb(out); return; }
      return Promise.resolve(out);
    }
    function set(obj, cb) {
      const changes = {};
      Object.keys(obj).forEach((k) => { changes[k] = { oldValue: store[k], newValue: obj[k] }; store[k] = obj[k]; });
      fire(changes);
      if (cb) cb();
      return Promise.resolve();
    }

    return {
      __store: store,
      storage: {
        local: {
          get, set,
          onChanged: { addListener: (fn) => listeners.push(fn), removeListener: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } },
        },
        onChanged: { addListener: (fn) => listeners.push(fn), removeListener: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); } },
      },
      tabs: {
        query: (opts, cb) => { const t = [{ id: 1, url: seed.url || 'https://www.golfballs.com/admin/order' }]; cb ? cb(t) : Promise.resolve(t); },
        sendMessage: (tabId, msg, cb) => { const r = respond(msg); if (cb) setTimeout(() => cb(r), seed.latency ?? 140); return Promise.resolve(r); },
        create: (opts) => { store.__lastOpened = opts && opts.url; if (seed.onOpen) seed.onOpen(opts); },
      },
      scripting: {
        executeScript: (opts, cb) => { const res = opts && opts.func ? [{ result: seed.probeReady }] : []; if (cb) setTimeout(() => cb(res), 40); return Promise.resolve(res); },
      },
      runtime: {
        sendMessage: (msg, cb) => { if (seed.onRuntime) seed.onRuntime(msg); if (cb) cb({ ok: true }); },
        onMessage: { addListener: () => {}, removeListener: () => {} },
        lastError: null,
      },
    };
  }

  window.GBMock = { createChrome, defaultFlags, defaultTemplates, orderPageInfo, accountPageInfo, defaultWatchList };
})();
