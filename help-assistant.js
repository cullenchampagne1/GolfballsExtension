/**
 * Background-owned transport for the Golfballs Help Companion.
 *
 * The service worker owns submission, polling, cancellation, persistence, and
 * unread state. Content scripts receive only the safe conversation snapshot;
 * the installation credential stays inside installation-auth.js.
 */
(function installHelpAssistant(root) {
  'use strict';

  const State = root.GBHelpChatState;
  if (!State) throw new Error('Help chat state failed to initialize');

  const BASE_PATH = '/projects/golfballs-extension/assistant';
  const ALARM_NAME = 'gb-help-assistant-poll';
  const RESPONSE_LIMIT = 512 * 1024;

  function createController({
    chromeApi = root.chrome,
    auth = root.GBInstallationAuth,
    now = () => Date.now(),
    setTimer = (fn, delay) => setTimeout(fn, delay),
    clearTimer = (id) => clearTimeout(id),
  } = {}) {
    if (!chromeApi?.storage?.local || !auth?.apiJson) throw new Error('Help assistant dependencies are unavailable');

    let timerId = null;
    let pollPromise = null;
    let mutationQueue = Promise.resolve();

    function storageGet() {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.get(State.STORAGE_KEY, (result) => {
          const error = chromeApi.runtime?.lastError;
          if (error) reject(new Error(error.message || 'Unable to read help conversation'));
          else resolve(State.normalizeState(result?.[State.STORAGE_KEY], now()));
        });
      });
    }

    function storageSet(state) {
      const normalized = State.normalizeState(state, now());
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.set({ [State.STORAGE_KEY]: normalized }, () => {
          const error = chromeApi.runtime?.lastError;
          if (error) reject(new Error(error.message || 'Unable to save help conversation'));
          else resolve(normalized);
        });
      });
    }

    function mutate(fn) {
      const task = mutationQueue.then(async () => {
        const current = await storageGet();
        const next = await fn(current);
        return next ? storageSet(next) : current;
      });
      mutationQueue = task.catch(() => {});
      return task;
    }

    async function getState() {
      await mutationQueue.catch(() => {});
      return storageGet();
    }

    function clearScheduledPoll() {
      if (timerId != null) {
        clearTimer(timerId);
        timerId = null;
      }
      try { chromeApi.alarms?.clear?.(ALARM_NAME); } catch { /* */ }
    }

    function schedulePoll(stateValue) {
      const state = State.normalizeState(stateValue, now());
      clearScheduledPoll();
      if (!state.active?.runId) return;
      const target = Math.max(now() + 250, state.active.nextPollAt || (now() + state.active.pollAfterMs));
      const delay = Math.max(250, target - now());
      try { chromeApi.alarms?.create?.(ALARM_NAME, { when: target }); } catch { /* timer still covers an awake worker */ }
      timerId = setTimer(() => {
        timerId = null;
        poll().catch(() => {});
      }, delay);
    }

    function friendlyError(error, fallback = 'The Help Companion could not reach the service.') {
      const status = Number(error?.status || 0);
      if (status === 401) return 'This extension installation is no longer authorized. Reinstall or ask an administrator to restore access.';
      if (status === 403) return 'Help Companion access has not been granted to this installation yet. Ask a RevStack administrator to grant assistant access.';
      if (status === 404) return 'That help response expired before it could be recovered. Please send the question again.';
      if (status === 409) return 'Another help response is already running for this installation.';
      if (status === 429) return 'The Help Companion is receiving questions too quickly. Wait a moment, then try again.';
      if (status >= 500) return 'The Help Companion is temporarily unavailable. Your question is still here to retry.';
      const message = String(error?.message || '').trim();
      return message && message.length <= 500 ? message : fallback;
    }

    function isTerminalHttpError(error) {
      const status = Number(error?.status || 0);
      return [400, 401, 403, 404, 409, 422, 429].includes(status);
    }

    async function send(message, context, { retry = false } = {}) {
      const requestId = State.makeRequestId(now());
      let body;
      let optimistic;
      await mutate((current) => {
        body = State.buildRequest(current, message, context, requestId, { retry });
        optimistic = State.beginTurn(current, {
          message: body.message,
          requestId,
          now: now(),
          reuseLastUser: retry,
        });
        return optimistic;
      });

      try {
        const payload = await auth.apiJson(`${BASE_PATH}/messages`, {
          method: 'POST',
          body: JSON.stringify(body),
          responseLimit: RESPONSE_LIMIT,
        });
        const state = await mutate((current) => {
          if (current.active?.requestId !== requestId) return current;
          return State.applyRun(current, payload, now());
        });
        schedulePoll(state);
        return state;
      } catch (error) {
        const state = await mutate((current) => {
          if (current.active?.requestId !== requestId) return current;
          return State.failTurn(current, {
            message: friendlyError(error),
            status: error?.status,
            retryMessage: body.message,
            now: now(),
          });
        });
        clearScheduledPoll();
        return state;
      }
    }

    async function retry(context) {
      const state = await getState();
      const message = state.lastError?.retryMessage;
      if (!message) throw new Error('There is no failed question to retry');
      return send(message, context, { retry: true });
    }

    async function poll({ force = false } = {}) {
      if (pollPromise) return pollPromise;
      pollPromise = (async () => {
        const before = await getState();
        const active = before.active;
        if (!active?.runId) return before;
        if (!force && active.nextPollAt && active.nextPollAt > now() + 100) {
          schedulePoll(before);
          return before;
        }
        try {
          const payload = await auth.apiJson(`${BASE_PATH}/runs/${encodeURIComponent(active.runId)}`, {
            responseLimit: RESPONSE_LIMIT,
          });
          const state = await mutate((current) => {
            if (current.active?.runId !== active.runId) return current;
            return State.applyRun(current, payload, now());
          });
          schedulePoll(state);
          return state;
        } catch (error) {
          if (isTerminalHttpError(error)) {
            const failed = await mutate((current) => {
              if (current.active?.runId !== active.runId) return current;
              return State.failTurn(current, {
                message: friendlyError(error),
                status: error?.status,
                now: now(),
              });
            });
            clearScheduledPoll();
            return failed;
          }

          const delayed = await mutate((current) => {
            if (current.active?.runId !== active.runId) return current;
            const age = Math.max(0, now() - current.active.startedAt);
            if (age > 12 * 60_000) {
              return State.failTurn(current, {
                message: friendlyError(error, 'The help response could not be recovered after several attempts.'),
                status: error?.status,
                now: now(),
              });
            }
            const attempts = Math.min(20, (current.active.attempts || 0) + 1);
            const delay = Math.min(30_000, Math.max(3_000, 3_000 * (2 ** Math.min(attempts - 1, 3))));
            current.active = {
              ...current.active,
              attempts,
              updatedAt: now(),
              pollAfterMs: delay,
              nextPollAt: now() + delay,
            };
            current.notice = 'Connection interrupted — retrying in the background.';
            current.updatedAt = now();
            return current;
          });
          schedulePoll(delayed);
          return delayed;
        }
      })();
      try {
        return await pollPromise;
      } finally {
        pollPromise = null;
      }
    }

    async function resume() {
      let state = await getState();
      if (state.active?.status === 'submitting' && now() - state.active.startedAt > 30_000) {
        state = await mutate((current) => {
          if (current.active?.status !== 'submitting') return current;
          return State.failTurn(current, {
            message: 'The browser closed before the help request was confirmed. Your question is ready to retry.',
            now: now(),
          });
        });
      }
      if (state.active?.runId) {
        if (!state.active.nextPollAt || state.active.nextPollAt <= now()) poll({ force: true }).catch(() => {});
        else schedulePoll(state);
      }
      return state;
    }

    async function cancel() {
      const state = await getState();
      const runId = state.active?.runId;
      if (!runId) {
        if (state.active?.status === 'submitting') {
          const cancelled = await mutate((current) => State.applyRun(current, { status: 'cancelled' }, now()));
          clearScheduledPoll();
          return cancelled;
        }
        return state;
      }
      try {
        const payload = await auth.apiJson(`${BASE_PATH}/runs/${encodeURIComponent(runId)}/cancel`, {
          method: 'POST',
          body: '{}',
          responseLimit: RESPONSE_LIMIT,
        });
        const cancelled = await mutate((current) => {
          if (current.active?.runId !== runId) return current;
          return State.applyRun(current, payload?.status ? payload : { ...payload, status: 'cancelled' }, now());
        });
        clearScheduledPoll();
        return cancelled;
      } catch (error) {
        throw new Error(friendlyError(error, 'Unable to cancel the help response.'));
      }
    }

    async function markRead() {
      return mutate((current) => current.unread ? State.markRead(current, now()) : current);
    }

    async function clearConversation() {
      const state = await getState();
      if (state.active) throw new Error('Cancel the active response before clearing this conversation');
      clearScheduledPoll();
      return storageSet(State.emptyState(now()));
    }

    async function feedback(runId, rating) {
      if (!['helpful', 'not_helpful'].includes(rating)) throw new Error('Invalid feedback rating');
      const safeRunId = String(runId || '');
      await auth.apiJson(`${BASE_PATH}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ run_id: safeRunId, rating }),
        responseLimit: RESPONSE_LIMIT,
      });
      return mutate((current) => State.setFeedback(current, safeRunId, rating, now()));
    }

    async function status() {
      return auth.apiJson(`${BASE_PATH}/status`, { responseLimit: RESPONSE_LIMIT });
    }

    return Object.freeze({
      STORAGE_KEY: State.STORAGE_KEY,
      ALARM_NAME,
      getState,
      send,
      retry,
      poll,
      resume,
      cancel,
      markRead,
      clearConversation,
      feedback,
      status,
      friendlyError,
    });
  }

  root.GBHelpAssistant = Object.freeze({ BASE_PATH, ALARM_NAME, RESPONSE_LIMIT, createController });
})(globalThis);
