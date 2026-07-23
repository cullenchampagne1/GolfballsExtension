import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const stateSource = readFileSync(new URL('../../lib/runtime-state.js', import.meta.url), 'utf8');
const scriptsSource = readFileSync(new URL('../../lib/runtime-scripts.js', import.meta.url), 'utf8');
const bootstrapSource = readFileSync(new URL('../../lib/runtime-bootstrap.js', import.meta.url), 'utf8');

function harness() {
  const stored = {};
  const registered = [];
  const reloaded = [];
  const action = { enabled: true };
  const listeners = { installed: [], startup: [], alarm: [] };
  let currentTime = 1_700_000_000_000;
  let reply = {
    ok: true, session_valid: true, extension_enabled: true,
    assistant_enabled: true,
  };
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
      unregisterContentScripts({ ids }, callback) {
        const selected = new Set(ids);
        for (let i = registered.length - 1; i >= 0; i -= 1) {
          if (selected.has(registered[i].id)) registered.splice(i, 1);
        }
        callback();
      },
      registerContentScripts(scripts, callback) {
        registered.push(...structuredClone(scripts));
        callback();
      },
    },
    action: {
      enable(callback) { action.enabled = true; callback(); },
      disable(callback) { action.enabled = false; callback(); },
    },
    tabs: {
      query(query, callback) {
        callback(query.url ? [{ id: 41, url: 'https://www.golfballs.com/admin/order' }] : []);
      },
      remove(_ids, callback) { callback(); },
      reload(id, callback) { reloaded.push(id); callback(); },
    },
    alarms: {
      create() {}, onAlarm: { addListener: (fn) => listeners.alarm.push(fn) },
    },
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
    chromeApi: chrome,
    auth,
    clock: () => currentTime,
  });
  return {
    controller, registered, reloaded, action, stored,
    stateKey: context.GBRuntimeState.SLOT,
    advance(milliseconds) { currentTime += milliseconds; },
    fail(error = Object.assign(new Error('rejected'), { status: 401 })) { reply = error; },
    succeed(payload = {
      ok: true, session_valid: true, extension_enabled: true,
      assistant_enabled: true,
    }) { reply = payload; },
  };
}

describe('project runtime lifecycle', () => {
  it('registers every product script and enables the action after server acceptance', async () => {
    const test = harness();
    assert.equal(test.action.enabled, true);
    const allowed = await test.controller.start();
    assert.equal(allowed, true);
    assert.equal(test.action.enabled, true);
    assert.equal(test.registered.length, 6);
    assert.equal(new Set(test.registered.map((item) => item.id)).size, 6);
    assert.equal(
      test.registered.every((item) => item.persistAcrossSessions === false),
      true,
      'Chrome must not persist scripts independently of the runtime decision',
    );
    assert.equal(test.stored[test.stateKey].o, 1);
    assert.equal(test.stored[test.stateKey].s, 1_700_000_000_000);
  });

  it('retains the last accepted runtime state through a short transport outage', async () => {
    const test = harness();
    await test.controller.start();
    const verifiedAt = test.stored[test.stateKey].s;
    test.advance(12 * 60 * 60 * 1000);
    test.fail(Object.assign(new Error('backend unavailable'), { status: 503 }));

    const allowed = await test.controller.sync();

    assert.equal(allowed, true);
    assert.equal(test.action.enabled, true);
    assert.equal(test.registered.length, 6);
    assert.equal(test.stored[test.stateKey].s, verifiedAt);
    assert.equal(
      /grace|expir|verif|health|access/i.test(JSON.stringify(test.stored[test.stateKey])),
      false,
      'the persisted runtime record must not advertise policy semantics',
    );
  });

  it('closes the runtime when a cached decision is no longer reusable', async () => {
    const test = harness();
    await test.controller.start();
    test.fail(Object.assign(new Error('backend unavailable'), { status: 503 }));
    test.advance(172_800_000);

    const allowed = await test.controller.sync();

    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.registered, []);
    assert.equal(test.stored[test.stateKey].o, 0);
    assert.equal(Object.hasOwn(test.stored[test.stateKey], 'reason'), false);
  });

  it('keeps a new installation closed when no prior decision exists', async () => {
    const test = harness();
    test.fail(Object.assign(new Error('offline')));

    const allowed = await test.controller.start();

    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.registered, []);
  });

  it('restores a cached runtime decision after a worker restart', async () => {
    const test = harness();
    await test.controller.start();
    test.advance(12 * 60 * 60 * 1000);
    test.fail(Object.assign(new Error('dns unavailable')));

    const allowed = await test.controller.start();

    assert.equal(allowed, true);
    assert.equal(test.action.enabled, true);
    assert.equal(test.registered.length, 6);
  });

  it('unregisters scripts, disables UI, and reloads instrumented tabs after revocation', async () => {
    const test = harness();
    await test.controller.start();
    test.fail();
    const allowed = await test.controller.sync();
    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.registered, []);
    assert.deepEqual(test.reloaded, [41]);
    assert.equal(test.stored[test.stateKey].o, 0);
  });

  it('clears scripts from an older static build on the first rejected sync', async () => {
    const test = harness();
    test.fail(Object.assign(new Error('disabled'), { status: 403 }));
    const allowed = await test.controller.start();
    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.reloaded, [41]);

    await test.controller.sync();
    assert.deepEqual(test.reloaded, [41], 'repeated failed checks must not reload-loop');
  });

  it('recovers automatically after an administrator reverses a soft disable', async () => {
    const test = harness();
    test.fail(Object.assign(new Error('disabled'), { status: 403 }));
    assert.equal(await test.controller.start(), false);

    test.succeed();
    assert.equal(await test.controller.sync(), true);
    assert.equal(test.action.enabled, true);
    assert.equal(test.registered.length, 6);
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
    test.fail(Object.assign(new Error('offline'), { status: 503 }));

    assert.equal(await test.controller.start(), true);
    assert.equal(test.stored[test.stateKey].o, 1);
    assert.equal(Object.hasOwn(test.stored, previousSlot), false);
  });
});
