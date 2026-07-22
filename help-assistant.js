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
  const DataAccess = root.GBHelpDataAccess;
  if (!DataAccess) throw new Error('Help data-access policy failed to initialize');

  const BASE_PATH = '/projects/golfballs-extension/assistant';
  const ALARM_NAME = 'gb-help-assistant-poll';
  const APPROVALS_KEY = 'gbHelpDataApprovalsV1';
  const RESPONSE_LIMIT = 512 * 1024;
  const APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/;

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
    let approvalQueue = Promise.resolve();

    function rawStorageGet(keys) {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.get(keys, (result) => {
          const error = chromeApi.runtime?.lastError;
          if (error) reject(new Error(error.message || 'Unable to read extension storage'));
          else resolve(result || {});
        });
      });
    }

    function rawStorageSet(value) {
      return new Promise((resolve, reject) => {
        chromeApi.storage.local.set(value, () => {
          const error = chromeApi.runtime?.lastError;
          if (error) reject(new Error(error.message || 'Unable to save extension storage'));
          else resolve();
        });
      });
    }

    function rawStorageRemove(key) {
      return new Promise((resolve) => chromeApi.storage.local.remove(key, resolve));
    }

    function storageGet() {
      return rawStorageGet(State.STORAGE_KEY)
        .then((result) => State.normalizeState(result?.[State.STORAGE_KEY], now()));
    }

    function storageSet(state) {
      const normalized = State.normalizeState(state, now());
      return rawStorageSet({ [State.STORAGE_KEY]: normalized }).then(() => normalized);
    }

    const safeApprovalId = (value) => {
      const id = String(value || '').trim();
      if (!APPROVAL_ID.test(id)) throw new Error('The data approval identifier is invalid');
      return id;
    };

    async function approvalLedger() {
      const raw = (await rawStorageGet(APPROVALS_KEY))[APPROVALS_KEY];
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    }

    async function saveApproval(id, value) {
      const current = await approvalLedger();
      const next = { ...current, [id]: value };
      const trimmed = Object.fromEntries(
        Object.entries(next).sort((left, right) => Number(right[1]?.at || 0) - Number(left[1]?.at || 0)).slice(0, 100),
      );
      await rawStorageSet({ [APPROVALS_KEY]: trimmed });
      return value;
    }

    async function dataApprovalStatus(receiptId) {
      const id = safeApprovalId(receiptId);
      const value = (await approvalLedger())[id];
      if (!value || typeof value !== 'object') return null;
      return {
        status: ['pending', 'submitted', 'denied', 'failed'].includes(value.status) ? value.status : 'failed',
        requestId: String(value.requestId || '').slice(0, 80),
        query: String(value.query || '').slice(0, 120),
        fields: value.fields === 'content' ? 'content' : 'metadata',
        resultCount: Math.max(0, Math.min(20, Number(value.resultCount) || 0)),
        totalMatches: Math.max(0, Math.min(10_000, Number(value.totalMatches) || 0)),
        truncated: value.truncated === true,
        message: String(value.message || '').slice(0, 240),
        at: Math.max(0, Number(value.at) || 0),
      };
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

    async function send(message, context, { retry = false, requestIdOverride = '' } = {}) {
      const requestId = requestIdOverride || State.makeRequestId(now());
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
            // A POST can reach the backend before its response reaches Chrome.
            // Reusing the id lets the backend return that run instead of
            // creating a duplicate when the user retries.
            reuseRequestId: true,
            now: now(),
          });
        });
        clearScheduledPoll();
        return state;
      }
    }

    async function resolveDataAccess(receiptId, action, context, decision) {
      const task = approvalQueue.then(async () => {
        const id = safeApprovalId(receiptId);
        const plan = DataAccess.planRequest(action);
        const existing = await dataApprovalStatus(id);
        if (existing?.status === 'submitted' || existing?.status === 'denied') {
          return { state: await getState(), approval: existing };
        }
        if (decision === 'deny') {
          const approval = await saveApproval(id, {
            status: 'denied', requestId: existing?.requestId || '',
            query: plan.query, fields: plan.fields, resultCount: 0,
            totalMatches: 0, truncated: false,
            message: 'Access was not shared.', at: now(),
          });
          return { state: await getState(), approval };
        }
        if (decision !== 'allow') throw new Error('Choose whether to allow this data request');
        const currentState = await getState();
        if (currentState.active) throw new Error('Wait for the current Help Companion response to finish');

        const stored = await rawStorageGet('templates');
        const result = DataAccess.filterEmailTemplates(stored.templates, action);
        const requestId = existing?.requestId || State.makeRequestId(now());
        await saveApproval(id, {
          status: 'pending', requestId, query: plan.query, fields: plan.fields,
          resultCount: result.resources.length, totalMatches: result.resultCount,
          truncated: result.truncated, message: 'Sending approved results once…', at: now(),
        });

        const approvalContext = {
          ...(context && typeof context === 'object' ? context : {}),
          available_resources: result.resources,
          resource_access: {
            request_id: requestId,
            target: plan.target,
            query: plan.query,
            options: plan.options,
            result_count: result.resources.length,
            truncated: result.truncated,
          },
        };
        const continuation = DataAccess.continuationMessage(result);
        const state = await send(continuation, approvalContext, {
          retry: existing?.status === 'failed',
          requestIdOverride: requestId,
        });
        const failed = state.lastError?.requestId === requestId;
        const approval = await saveApproval(id, {
          status: failed ? 'failed' : 'submitted', requestId,
          query: plan.query, fields: plan.fields,
          resultCount: result.resources.length, totalMatches: result.resultCount,
          truncated: result.truncated,
          message: failed
            ? (state.lastError?.message || 'Approved results could not be sent.')
            : `${result.resources.length} matching template${result.resources.length === 1 ? '' : 's'} shared once.`,
          at: now(),
        });
        return { state, approval };
      });
      approvalQueue = task.then(() => undefined, () => undefined);
      return task;
    }

    async function retry(context) {
      const state = await getState();
      const message = state.lastError?.retryMessage;
      if (!message) throw new Error('There is no failed question to retry');
      const requestIdOverride = state.lastError.reuseRequestId
        ? state.lastError.requestId
        : '';
      return send(message, context, { retry: true, requestIdOverride });
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
            reuseRequestId: true,
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
      const state = await mutate((current) => {
        if (current.active) throw new Error('Cancel the active response before clearing this conversation');
        clearScheduledPoll();
        return State.emptyState(now());
      });
      await rawStorageRemove(APPROVALS_KEY);
      return state;
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
      dataApprovalStatus,
      resolveDataAccess,
      friendlyError,
    });
  }

  root.GBHelpAssistant = Object.freeze({
    BASE_PATH, ALARM_NAME, APPROVALS_KEY, RESPONSE_LIMIT, createController,
  });
})(globalThis);
