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
      const previous = await state.read(local);
      await scripts.open({ reload: previous?.o !== true });
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
          // Only an EXPLICIT revocation (403 extension_disabled) tears the
          // install down. Transient failures — enrollment rate-limit (429),
          // not-yet-enrolled (401), offline/network — must NOT persist a revoked
          // state, or a fresh/hiccuping install shows "Access paused" while its
          // backend key is enabled. Leave prior state untouched (the client gate
          // fail-opens when there's none); the periodic alarm retries.
          if (status === 403) return close({ reload: true });
          return scripts.isOpen();
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

    const report = (error) => {
      root.console?.error?.('[Golfballs Toolkit] Runtime initialization failed', error);
    };
    chromeApi.runtime.onInstalled?.addListener(() => { start().catch(report); });
    chromeApi.runtime.onStartup?.addListener(() => { start().catch(report); });
    chromeApi.alarms?.onAlarm?.addListener((alarm) => {
      if (alarm?.name === ALARM) sync().catch(report);
    });

    return Object.freeze({
      start,
      sync,
      close,
      report,
      isOpen: scripts.isOpen,
    });
  }

  root.GBRuntimeBootstrap = Object.freeze({
    createController,
    isDecisionPath: (path) => path === ADDRESS,
  });
})(globalThis);
