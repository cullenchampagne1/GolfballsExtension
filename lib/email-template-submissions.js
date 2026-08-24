/** Server-backed email-template approval drafts.
 *
 * Submission documents are deliberately cached outside the normal `templates`
 * array. That makes it impossible for an unapproved draft to leak into a send
 * picker while still letting the editor and sidebar stay live across windows.
 */
(function installEmailTemplateSubmissions(root) {
  'use strict';

  const CACHE_KEY = 'gbEmailTemplateSubmissions';
  const CACHE_SCHEMA_VERSION = 1;
  const PATH = '/projects/golfballs-extension/client/email-template-submissions';
  let syncPromise = null;
  let mutationChain = Promise.resolve();
  const pendingUpdates = new Map();

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const getStorage = (key) => new Promise((resolve) => {
    try { chrome.storage.local.get(key, (value) => resolve(value?.[key] || null)); }
    catch { resolve(null); }
  });
  const setStorage = (value) => new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [CACHE_KEY]: value }, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Unable to cache template submissions'));
        else resolve(value);
      });
    } catch (error) { reject(error); }
  });

  function normalizedPayload(payload) {
    return {
      schemaVersion: CACHE_SCHEMA_VERSION,
      revision: String(payload?.revision || ''),
      isParent: payload?.is_parent === true,
      canSubmit: payload?.can_submit === true,
      pendingCount: Math.max(0, Number(payload?.pending_count) || 0),
      submissions: clone(Array.isArray(payload?.submissions) ? payload.submissions : []),
      syncedAt: Date.now(),
    };
  }

  async function applyPayload(payload) {
    const cache = normalizedPayload(payload);
    await setStorage(cache);
    return cache;
  }

  async function fetchPayload(path = PATH, options = {}) {
    const api = root.GBInstallationAuth;
    if (!api?.apiJson) throw new Error('Installation API is unavailable');
    return api.apiJson(path, options);
  }

  async function sync({ force = false } = {}) {
    if (syncPromise) {
      if (!force) return syncPromise;
      await syncPromise;
      return sync({ force: true });
    }
    syncPromise = (async () => {
      if (!force) {
        const cached = await getStorage(CACHE_KEY);
        if (cached?.schemaVersion === CACHE_SCHEMA_VERSION && cached.revision) return cached;
      }
      return applyPayload(await fetchPayload());
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  function serializeMutation(work) {
    const next = mutationChain.catch(() => {}).then(work);
    mutationChain = next;
    return next;
  }

  function rowFrom(cache, id) {
    return (cache?.submissions || []).find((row) => String(row?.id) === String(id)) || null;
  }

  async function create(clientSubmissionId, template) {
    return serializeMutation(async () => {
      const payload = await fetchPayload(PATH, {
        method: 'POST',
        body: JSON.stringify({
          client_submission_id: String(clientSubmissionId || ''),
          template: clone(template),
        }),
      });
      const cache = await applyPayload(payload);
      return rowFrom(cache, cache.submissions.find(
        (row) => row.client_submission_id === String(clientSubmissionId || ''),
      )?.id);
    });
  }

  async function writeUpdate(submissionId, template) {
    return serializeMutation(async () => {
      let cache = await getStorage(CACHE_KEY);
      let current = rowFrom(cache, submissionId);
      if (!current) {
        cache = await sync({ force: true });
        current = rowFrom(cache, submissionId);
      }
      if (!current) throw new Error('Template submission no longer exists');
      try {
        const payload = await fetchPayload(`${PATH}/${encodeURIComponent(submissionId)}`, {
          method: 'POST',
          body: JSON.stringify({
            base_version: Math.max(1, Number(current.version) || 1),
            template: clone(template),
          }),
        });
        const next = await applyPayload(payload);
        return rowFrom(next, submissionId);
      } catch (error) {
        if (Number(error?.status) === 409) await sync({ force: true });
        throw error;
      }
    });
  }

  /** Collapse autosaves that arrive while a submission write is in flight.
   * Every caller resolves with the final authoritative row, but only the
   * newest queued document crosses the network after the active write. */
  function update(submissionId, template) {
    const key = String(submissionId || '');
    return new Promise((resolve, reject) => {
      let pending = pendingUpdates.get(key);
      if (pending) {
        pending.template = clone(template);
        pending.waiters.push({ resolve, reject });
        return;
      }
      pending = {
        template: clone(template),
        waiters: [{ resolve, reject }],
      };
      pendingUpdates.set(key, pending);
      (async () => {
        let result = null;
        try {
          while (pending.template) {
            const next = pending.template;
            pending.template = null;
            result = await writeUpdate(key, next);
          }
          pending.waiters.forEach((waiter) => waiter.resolve(result));
        } catch (error) {
          pending.waiters.forEach((waiter) => waiter.reject(error));
        } finally {
          pendingUpdates.delete(key);
        }
      })();
    });
  }

  async function approve(submissionId, template) {
    return serializeMutation(async () => {
      let cache = await getStorage(CACHE_KEY);
      let current = rowFrom(cache, submissionId);
      if (!current) {
        cache = await sync({ force: true });
        current = rowFrom(cache, submissionId);
      }
      if (!current) throw new Error('Template submission no longer exists');
      try {
        const payload = await fetchPayload(
          `${PATH}/${encodeURIComponent(submissionId)}/approve`,
          {
            method: 'POST',
            body: JSON.stringify({
              base_version: Math.max(1, Number(current.version) || 1),
              template: clone(template),
            }),
          },
        );
        const next = await applyPayload(payload);
        root.GBManagedEmailTemplates?.sync?.({ force: true }).catch?.(() => {});
        return rowFrom(next, submissionId);
      } catch (error) {
        if (Number(error?.status) === 409) await sync({ force: true });
        throw error;
      }
    });
  }

  root.GBEmailTemplateSubmissions = Object.freeze({
    CACHE_KEY, CACHE_SCHEMA_VERSION, PATH,
    normalizedPayload, applyPayload, sync, create, update, approve,
  });
})(globalThis);
