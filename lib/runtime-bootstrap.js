(function installRuntimeBootstrap(root) {
  'use strict';

  const ADDRESS = `/${['projects', 'golfballs-extension', 'client', 'health'].join('/')}`;
  const ALARM = ['gb', 'runtime', 'sync'].join('-');

  function createController({
    chromeApi = root.chrome,
    auth = root.GBInstallationAuth,
    clock = () => Date.now(),
    state = root.GBRuntimeState,
    scripts = root.GBRuntimeScripts?.createManager(chromeApi),
  } = {}) {
    if (!chromeApi?.storage?.local || !auth?.apiJson || !state || !scripts) {
      throw new Error('Runtime bootstrap is unavailable');
    }
    let pending = null;
    const now = () => Number(clock()) || Date.now();
    const local = chromeApi.storage.local;

    async function persist(open, helper, stamp, attempt = now()) {
      return state.write(local, state.record({
        open,
        helper,
        stamp,
        attempt,
      }));
    }

    async function close({ reload = false } = {}) {
      const previous = await state.read(local);
      await scripts.close({
        reload,
        transitioned: previous?.o !== false,
      });
      await persist(false, false, state.stamp(previous));
      return false;
    }

    async function accept(payload) {
      const timestamp = now();
      await scripts.open();
      await persist(true, payload?.assistant_enabled === true, timestamp, timestamp);
      return true;
    }

    async function reuse(previous) {
      const timestamp = now();
      if (!state.reusable(previous, timestamp)) return close({ reload: true });
      await scripts.open();
      await persist(true, previous?.h === true, state.stamp(previous), timestamp);
      return true;
    }

    async function sync() {
      if (pending) return pending;
      pending = (async () => {
        let payload;
        try {
          payload = await auth.apiJson(ADDRESS, { responseLimit: 64 * 1024 });
        } catch (error) {
          const status = Number(error?.status || 0);
          if (status === 401 || status === 403) return close({ reload: true });
          return reuse(await state.read(local));
        }
        if (
          payload?.ok !== true
          || payload?.session_valid !== true
          || payload?.extension_enabled !== true
        ) {
          return close({ reload: true });
        }
        return accept(payload);
      })();
      try {
        return await pending;
      } finally {
        pending = null;
      }
    }

    async function start() {
      try { chromeApi.alarms.create(ALARM, { periodInMinutes: 3 }); } catch { /* */ }
      const previous = await state.read(local);
      if (state.reusable(previous, now())) {
        try {
          await scripts.open();
          await persist(true, previous?.h === true, state.stamp(previous));
        } catch {
          // The sync below resolves the final state.
        }
      } else {
        await scripts.close({ reload: false, transitioned: false });
      }
      return sync();
    }

    chromeApi.runtime.onInstalled?.addListener(() => { start().catch(() => {}); });
    chromeApi.runtime.onStartup?.addListener(() => { start().catch(() => {}); });
    chromeApi.alarms?.onAlarm?.addListener((alarm) => {
      if (alarm?.name === ALARM) sync().catch(() => {});
    });

    return Object.freeze({
      start,
      sync,
      close,
      isOpen: scripts.isOpen,
    });
  }

  root.GBRuntimeBootstrap = Object.freeze({
    createController,
    isDecisionPath: (path) => path === ADDRESS,
  });
})(globalThis);
