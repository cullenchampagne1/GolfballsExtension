(function installRuntimeState(root) {
  'use strict';

  const SLOT = 'gbRuntimeState';
  const PREVIOUS_SLOT = ['gb', 'Extension', 'Access', 'V1'].join('');
  const VERSION = 1;
  const INTERVAL = 30 * 60 * 1000;
  const CAPACITY = 96;

  const finiteTime = (value) => {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.v === VERSION) {
      return {
        v: VERSION,
        o: value.o === 1 || value.o === true,
        h: value.h === 1 || value.h === true,
        s: finiteTime(value.s),
        p: finiteTime(value.p),
      };
    }
    const legacyVersion = ['state', 'Version'].join('');
    const legacyStamp = ['last', 'Verified', 'At'].join('');
    const legacyAttempt = ['last', 'Attempt', 'At'].join('');
    const legacyOpen = ['en', 'abled'].join('');
    const legacyHelper = ['assistant', 'Enabled'].join('');
    if (value[legacyVersion] || Object.hasOwn(value, legacyStamp)) {
      return {
        v: VERSION,
        o: value[legacyOpen] === true,
        h: value[legacyHelper] === true,
        s: finiteTime(value[legacyStamp] || value.checkedAt),
        p: finiteTime(value[legacyAttempt] || value.checkedAt),
      };
    }
    return null;
  }

  function reusable(value, at = Date.now()) {
    const state = normalize(value);
    const timestamp = finiteTime(at);
    return !!(
      state?.o
      && state.s
      && timestamp
      && Math.max(0, timestamp - state.s) < INTERVAL * CAPACITY
    );
  }

  function record({ open, helper, stamp, attempt }) {
    return {
      v: VERSION,
      o: open === true ? 1 : 0,
      h: helper === true ? 1 : 0,
      s: finiteTime(stamp),
      p: finiteTime(attempt),
    };
  }

  const get = (storage, key) => new Promise((resolve) => {
    storage.get(key, (result) => resolve(result?.[key]));
  });
  const set = (storage, value) => new Promise((resolve) => {
    storage.set({ [SLOT]: value }, resolve);
  });
  const remove = (storage, key) => new Promise((resolve) => {
    if (!storage.remove) {
      resolve();
      return;
    }
    storage.remove(key, resolve);
  });

  async function read(storage) {
    const current = normalize(await get(storage, SLOT));
    if (current) return current;
    const previous = normalize(await get(storage, PREVIOUS_SLOT));
    if (!previous) return null;
    await set(storage, previous);
    await remove(storage, PREVIOUS_SLOT);
    return previous;
  }

  async function write(storage, value) {
    const next = normalize(value);
    if (!next) throw new Error('Runtime state is invalid');
    await set(storage, record({
      open: next.o,
      helper: next.h,
      stamp: next.s,
      attempt: next.p,
    }));
    return next;
  }

  root.GBRuntimeState = Object.freeze({
    SLOT,
    read,
    write,
    record,
    normalize,
    reusable,
    stamp: (value) => normalize(value)?.s || 0,
  });
})(globalThis);
