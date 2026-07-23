/**
 * Project runtime lifecycle.
 *
 * The runtime gate tracks an install's health/enrollment decision in opaque
 * local state. It deliberately does NOT own script injection or the toolbar
 * action any more: an earlier dynamic model called chrome.scripting +
 * chrome.action.disable() on every failed sync and silently bricked the
 * extension (dead popup, dead buttons, no console errors). Content scripts are
 * static in the manifest again and the action is left to the browser.
 *
 * Two regressions are pinned here and must stay pinned:
 *   1. the gate never touches chrome.scripting / chrome.action / chrome.tabs;
 *   2. only an EXPLICIT 403 revokes — transient failures (429/401/offline)
 *      must not persist a revoked state, or a fresh install shows "Access
 *      paused" while its backend key is fine.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const readSource = (rel) => readFileSync(new URL(rel, root), 'utf8');

const stateSource = readSource('lib/runtime-state.js');
const scriptsSource = readSource('lib/runtime-scripts.js');
const bootstrapSource = readSource('lib/runtime-bootstrap.js');
const manifest = JSON.parse(readSource('manifest.json'));

const HEALTHY = {
  ok: true, session_valid: true, extension_enabled: true, assistant_enabled: true,
};
const GRACE_MS = 48 * 60 * 60 * 1000;
const fault = (message, status) =>
  Object.assign(new Error(message), status ? { status } : {});

function harness() {
  const stored = {};
  const listeners = { installed: [], startup: [], alarm: [] };
  // Every call the gate must never make lands here.
  const forbidden = [];
  const trap = (name) => (...args) => {
    forbidden.push({ name, args });
    return Promise.resolve([]);
  };
  let currentTime = 1_700_000_000_000;
  let reply = HEALTHY;

  const chrome = {
    runtime: {
      id: 'annoeoeiijgdgmlpefllibcilcamnjek', lastError: null,
      getURL: (path) => `chrome-extension://annoeoeiijgdgmlpefllibcilcamnjek/${path}`,
      onInstalled: { addListener: (fn) => listeners.installed.push(fn) },
      onStartup: { addListener: (fn) => listeners.startup.push(fn) },
    },
    storage: { local: {
      get: (key, callback) => callback({ [key]: stored[key] }),
      set: (value, callback) => { Object.assign(stored, value); callback?.(); },
      remove: (key, callback) => { delete stored[key]; callback?.(); },
    } },
    scripting: {
      registerContentScripts: trap('scripting.registerContentScripts'),
      unregisterContentScripts: trap('scripting.unregisterContentScripts'),
    },
    action: { enable: trap('action.enable'), disable: trap('action.disable') },
    tabs: {
      query: trap('tabs.query'), remove: trap('tabs.remove'), reload: trap('tabs.reload'),
    },
    alarms: { create() {}, onAlarm: { addListener: (fn) => listeners.alarm.push(fn) } },
  };

  const auth = {
    async apiJson(path) {
      assert.equal(path, `/${['projects', 'golfballs-extension', 'client', 'health'].join('/')}`);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };

  const context = vm.createContext({
    console, chrome, structuredClone, Promise, Object, String, Number, Date,
    Error, Set,
  });
  context.globalThis = context;
  new vm.Script(stateSource, { filename: 'runtime-state.js' }).runInContext(context);
  new vm.Script(scriptsSource, { filename: 'runtime-scripts.js' }).runInContext(context);
  new vm.Script(bootstrapSource, { filename: 'runtime-bootstrap.js' }).runInContext(context);

  const controller = context.GBRuntimeBootstrap.createController({
    chromeApi: chrome, auth, clock: () => currentTime,
  });
  const stateKey = context.GBRuntimeState.SLOT;
  return {
    controller, stored, forbidden, listeners, stateKey,
    state: () => stored[stateKey],
    advance(ms) { currentTime += ms; },
    now: () => currentTime,
    fail(error = fault('rejected', 403)) { reply = error; },
    succeed(payload = HEALTHY) { reply = payload; },
  };
}

/** The client-side gate (popup.jsx / main.js) reduced to its decision. */
const accessAllowed = (record, now) => {
  if (!record || typeof record !== 'object') return true;      // fail open
  if (!(record.o === 1 || record.o === true)) return false;
  const stamp = Number(record.s) || 0;
  return !stamp || (now - stamp) < GRACE_MS;
};

describe('project runtime lifecycle · injection is static (brick guard)', () => {
  it('never calls chrome.scripting, chrome.action, or chrome.tabs on any path', async () => {
    const test = harness();
    await test.controller.start();          // healthy activation
    test.fail(fault('backend unavailable', 503));
    await test.controller.sync();           // transient failure
    test.fail(fault('disabled', 403));
    await test.controller.sync();           // explicit revocation
    test.succeed();
    await test.controller.sync();           // recovery

    assert.deepEqual(test.forbidden, [],
      'the runtime gate must not touch scripting/action/tabs — that model bricked the extension');
  });

  it('declares the product content scripts statically in the manifest', () => {
    const groups = manifest.content_scripts ?? [];
    assert.ok(groups.length > 0, 'manifest must declare static content_scripts');
    const origins = new Set(groups.flatMap((group) => group.matches ?? []));
    for (const origin of [
      'https://www.golfballs.com/*', 'https://api.golfballs.com/*',
      'https://admin.icustomize.com/*', 'https://office.gbcadmin.com/*',
      'https://operations.gbcadmin.com/*',
    ]) {
      assert.ok(origins.has(origin), `static content_scripts must still cover ${origin}`);
    }
  });

  it('ships every statically injected file', () => {
    for (const group of manifest.content_scripts ?? []) {
      for (const file of [...(group.js ?? []), ...(group.css ?? [])]) {
        assert.ok(existsSync(new URL(file, root)),
          `manifest injects a file that is missing on disk: ${file}`);
      }
    }
  });
});

describe('project runtime lifecycle · decision state', () => {
  it('records an open decision stamped at the successful check', async () => {
    const test = harness();
    assert.equal(await test.controller.start(), true);
    assert.equal(test.state().o, 1);
    assert.equal(test.state().h, 1, 'assistant_enabled must carry into the helper flag');
    assert.equal(test.state().s, test.now());
    assert.equal(accessAllowed(test.state(), test.now()), true);
  });

  it('keeps the persisted record opaque about policy semantics', async () => {
    const test = harness();
    await test.controller.start();
    assert.deepEqual(Object.keys(test.state()).sort(), ['h', 'o', 'p', 's', 'v']);
    assert.equal(/grace|expir|verif|health|access|enabled/i.test(JSON.stringify(test.state())),
      false, 'the persisted runtime record must not advertise policy semantics');
  });

  it('reuses a cached decision across a worker restart while offline', async () => {
    const test = harness();
    await test.controller.start();
    test.advance(12 * 60 * 60 * 1000);
    test.fail(fault('dns unavailable'));

    assert.equal(await test.controller.start(), true);
    assert.equal(test.state().o, 1);
  });

  it('migrates the previous local record without losing a reusable decision', async () => {
    const test = harness();
    const previousSlot = ['gb', 'Extension', 'Access', 'V1'].join('');
    test.stored[previousSlot] = {
      [['state', 'Version'].join('')]: 2,
      [['en', 'abled'].join('')]: true,
      [['assistant', 'Enabled'].join('')]: true,
      checkedAt: 1_700_000_000_000,
      [['last', 'Attempt', 'At'].join('')]: 1_700_000_000_000,
      [['last', 'Verified', 'At'].join('')]: 1_700_000_000_000,
    };
    test.advance(60 * 60 * 1000);
    test.fail(fault('offline', 503));

    assert.equal(await test.controller.start(), true);
    assert.equal(test.state().o, 1);
    assert.equal(Object.hasOwn(test.stored, previousSlot), false);
  });
});

describe('project runtime lifecycle · only an explicit 403 revokes', () => {
  it('persists a revoked decision when the server returns 403', async () => {
    const test = harness();
    await test.controller.start();
    test.fail(fault('extension_disabled', 403));

    assert.equal(await test.controller.sync(), false);
    assert.equal(test.state().o, 0);
    assert.equal(accessAllowed(test.state(), test.now()), false);
  });

  it('revokes when the server answers with a not-ok health payload', async () => {
    const test = harness();
    await test.controller.start();
    test.succeed({ ...HEALTHY, extension_enabled: false });

    assert.equal(await test.controller.sync(), false);
    assert.equal(test.state().o, 0);
  });

  for (const [label, error] of [
    ['a 503 outage', fault('backend unavailable', 503)],
    ['a 429 enrollment rate-limit', fault('too many requests', 429)],
    ['a 401 not-yet-enrolled', fault('unauthorized', 401)],
    ['an offline network error', fault('failed to fetch')],
  ]) {
    it(`leaves an accepted decision untouched through ${label}`, async () => {
      const test = harness();
      await test.controller.start();
      const accepted = { ...test.state() };
      test.advance(12 * 60 * 60 * 1000);
      test.fail(error);

      assert.equal(await test.controller.sync(), true);
      // spread both sides: the record is built inside the vm realm, so a bare
      // deepEqual would fail on the prototype rather than the values.
      assert.deepEqual({ ...test.state() }, accepted,
        'a transient failure must not rewrite the accepted decision');
      assert.equal(accessAllowed(test.state(), test.now()), true);
    });

    it(`leaves a fresh install ungated through ${label}`, async () => {
      const test = harness();
      test.fail(error);

      await test.controller.start();
      assert.equal(test.state(), undefined,
        'a fresh install must not persist a revoked state on a transient failure');
      assert.equal(accessAllowed(test.state(), test.now()), true,
        'with no decision on record the client gate must fail open');
    });
  }

  it('recovers automatically after an administrator reverses a 403', async () => {
    const test = harness();
    test.fail(fault('disabled', 403));
    assert.equal(await test.controller.start(), false);
    assert.equal(test.state().o, 0);

    test.succeed();
    assert.equal(await test.controller.sync(), true);
    assert.equal(test.state().o, 1);
    assert.equal(accessAllowed(test.state(), test.now()), true);
  });
});

describe('project runtime lifecycle · offline grace window', () => {
  it('keeps a cached decision usable for 48 hours offline', async () => {
    const test = harness();
    await test.controller.start();
    test.advance(GRACE_MS - 60_000);
    test.fail(fault('offline', 503));

    assert.equal(await test.controller.start(), true);
    assert.equal(accessAllowed(test.state(), test.now()), true);
  });

  it('stops honouring a cached decision once it is older than 48 hours', async () => {
    const test = harness();
    await test.controller.start();
    test.advance(GRACE_MS + 60_000);
    test.fail(fault('offline', 503));

    assert.equal(await test.controller.start(), false);
    assert.equal(accessAllowed(test.state(), test.now()), false,
      'the client gate must stop honouring a decision stamped beyond the grace window');
  });
});
