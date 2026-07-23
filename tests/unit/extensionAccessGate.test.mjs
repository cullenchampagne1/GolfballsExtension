import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../lib/extension-access-gate.js', import.meta.url), 'utf8');

function harness() {
  const stored = {};
  const registered = [];
  const reloaded = [];
  const action = { enabled: true };
  const listeners = { installed: [], startup: [], alarm: [] };
  let health = {
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
      assert.equal(path, '/projects/golfballs-extension/client/health');
      if (health instanceof Error) throw health;
      return health;
    },
  };
  const context = vm.createContext({
    console, chrome, structuredClone, Promise, Object, String, Number, Date,
    Error, Set,
  });
  context.globalThis = context;
  new vm.Script(source, { filename: 'extension-access-gate.js' }).runInContext(context);
  const controller = context.GBExtensionAccessGate.createController({ chromeApi: chrome, auth });
  return {
    controller, registered, reloaded, action, stored,
    fail(error = Object.assign(new Error('revoked'), { status: 401 })) { health = error; },
  };
}

describe('authenticated extension bootstrap', () => {
  it('registers every product script and enables the action only after health passes', async () => {
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
      'a browser restart must not inject previously authorized scripts before health',
    );
    assert.equal(test.stored.gbExtensionAccessV1.enabled, true);
  });

  it('unregisters scripts, disables UI, and reloads instrumented tabs after revocation', async () => {
    const test = harness();
    await test.controller.start();
    test.fail();
    const allowed = await test.controller.check();
    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.registered, []);
    assert.deepEqual(test.reloaded, [41]);
    assert.equal(test.stored.gbExtensionAccessV1.enabled, false);
  });

  it('clears scripts from an older static build on the first failed health check', async () => {
    const test = harness();
    test.fail(Object.assign(new Error('disabled'), { status: 403 }));
    const allowed = await test.controller.start();
    assert.equal(allowed, false);
    assert.equal(test.action.enabled, false);
    assert.deepEqual(test.reloaded, [41]);

    await test.controller.check();
    assert.deepEqual(test.reloaded, [41], 'repeated failed checks must not reload-loop');
  });
});
