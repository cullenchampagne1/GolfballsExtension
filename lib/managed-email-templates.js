/** Universal managed email-template bucket.
 *
 * Templates remain in the existing `templates` array so every picker and send
 * path sees one catalog.  Provenance is the only distinction: parents receive
 * editable managed rows, while ordinary installations receive locked mirrors.
 */
(function installManagedEmailTemplates(root) {
  'use strict';

  const CACHE_KEY = 'gbManagedEmailTemplateBucket';
  const META_KEY = 'managedTemplate';
  const ENROLLMENT_KEY = 'managedTemplateEnrollment';
  const KIND = 'revstack-managed-email-template';
  const PATH = '/projects/golfballs-extension/client/email-template-bucket';
  const OMIT = new Set([
    'id', 'folderId', 'shareImport', 'shareSync', META_KEY, ENROLLMENT_KEY,
    'createdAt', 'updatedAt', '__gbShareMeta',
  ]);
  let applying = false;
  let publishTimer = null;
  let syncPromise = null;

  const getStorage = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (value) => resolve(value || {})); }
    catch { resolve({}); }
  });
  const setStorage = (value) => new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(value, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Unable to cache managed templates'));
        else resolve();
      });
    } catch (error) { reject(error); }
  });
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function capabilities(settings = {}) {
    return {
      isParent: settings?.['emailTemplates.allowParentAccount'] === true,
      allowLocal: settings?.['emailTemplates.allowLocalTemplateUsage'] !== false,
    };
  }

  function metadata(template) {
    const value = template?.[META_KEY];
    return value?.kind === KIND && typeof value.bucketId === 'string' ? value : null;
  }

  function enrollment(template) {
    const value = template?.[ENROLLMENT_KEY];
    return value?.kind === KIND ? value : null;
  }

  function serverTemplate(template) {
    const output = {};
    for (const [key, value] of Object.entries(template || {})) {
      if (!OMIT.has(key)) output[key] = clone(value);
    }
    return output;
  }

  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); }
    catch { return false; }
  }

  function localId(item, existingIds) {
    const preferred = item.created_by_current ? String(item.client_template_id || '') : '';
    if (preferred && !existingIds.has(preferred)) return preferred;
    return `managed_${String(item.id || '').replace(/[^A-Za-z0-9_-]/g, '')}`;
  }

  function managedRecord(item, previous, editable) {
    const remote = clone(item.template || {});
    remote.id = previous?.id || `managed_${item.id}`;
    if (previous?.folderId) remote.folderId = previous.folderId;
    const previousMeta = metadata(previous);
    const overrideDefaults = {
      presetTaskId: String(remote.presetTaskId || ''),
      followUpActionId: String(remote.followUpActionId || ''),
      replyMode: remote.replyMode === 'reply' ? 'reply' : 'standalone',
      senderAccount: String(remote.senderAccount || 'golfballs'),
      senderRandomize: remote.senderRandomize === true,
      literalVariables: Object.fromEntries([
        ...Object.entries(remote.vars || {})
          .filter(([, definition]) => definition?.type === 'literal')
          .map(([name, definition]) => [name, String(definition.value ?? '')]),
        ...(Array.isArray(remote.caseVars) ? remote.caseVars : [])
          .filter((variable) => variable?.kind === 'literal' && variable.name)
          .map((variable) => [variable.name, String(variable.config ?? '')]),
      ]),
    };
    const overrides = !editable && previousMeta?.overrides
      ? clone(previousMeta.overrides) : {};
    if (!editable) {
      for (const field of ['presetTaskId', 'followUpActionId', 'senderAccount', 'senderRandomize']) {
        if (Object.prototype.hasOwnProperty.call(overrides, field)) remote[field] = overrides[field];
      }
      for (const [name, value] of Object.entries(overrides.literalVariables || {})) {
        if (remote.vars?.[name]?.type === 'literal') {
          remote.vars[name] = { ...remote.vars[name], value: String(value ?? '') };
        }
        if (Array.isArray(remote.caseVars)) {
          remote.caseVars = remote.caseVars.map((variable) => (
            variable?.name === name && variable.kind === 'literal'
              ? { ...variable, config: String(value ?? '') } : variable
          ));
        }
      }
    }
    remote[META_KEY] = {
      kind: KIND,
      bucketId: String(item.id),
      clientTemplateId: String(item.client_template_id || previous?.id || ''),
      version: Math.max(1, Number(item.version) || 1),
      snapshot: clone(item.template || {}),
      createdBy: String(item.created_by || 'Management'),
      lastEditor: String(item.last_editor || item.created_by || 'Management'),
      createdByCurrent: item.created_by_current === true,
      editable: editable === true,
      conflictWith: Array.isArray(item.conflict_with) ? item.conflict_with.map(String) : [],
      updatedAt: String(item.updated_at || ''),
      overrideDefaults,
      overrides,
    };
    return remote;
  }

  function reconcile(existing, payload, settings = {}, options = {}) {
    const list = Array.isArray(existing) ? existing : [];
    const items = Array.isArray(payload?.templates) ? payload.templates : [];
    const { isParent } = capabilities(settings);
    const managedById = new Map(list.map((row) => [metadata(row)?.bucketId, row]).filter(([id]) => id));
    const ordinary = list.filter((row) => !metadata(row));
    const existingIds = new Set(ordinary.map((row) => String(row?.id || '')));
    const nextManaged = [];

    for (const item of items) {
      let previous = managedById.get(String(item.id));
      if (!previous && isParent && item.created_by_current) {
        previous = ordinary.find((row) => String(row?.id || '') === String(item.client_template_id || ''));
        if (previous) ordinary.splice(ordinary.indexOf(previous), 1);
      }
      if (!previous) {
        previous = { id: localId(item, existingIds) };
        existingIds.add(previous.id);
      }
      const priorMeta = metadata(previous);
      const dirtyParent = !options.acceptRemote && isParent && priorMeta
        && !same(serverTemplate(previous), priorMeta.snapshot);
      if (dirtyParent && Number(item.version || 0) > Number(priorMeta.version || 0)) {
        nextManaged.push({
          ...previous,
          [META_KEY]: {
            ...priorMeta,
            remoteVersion: Number(item.version || 0),
            remoteSnapshot: clone(item.template || {}),
            conflictWith: Array.from(new Set([
              ...(priorMeta.conflictWith || []),
              String(item.last_editor || 'another parent'),
            ])),
          },
        });
      } else {
        nextManaged.push(managedRecord(item, previous, isParent));
      }
    }

    // A source cleanup or another parent's removal must not erase the local
    // template originally contributed by this installation. Detach that row
    // from management and preserve it as an ordinary private template. Other
    // installations simply drop their mirrors of the removed bucket row.
    const liveBucketIds = new Set(items.map((item) => String(item?.id || '')));
    for (const row of list) {
      const meta = metadata(row);
      if (!meta?.createdByCurrent || liveBucketIds.has(meta.bucketId)) continue;
      const detached = clone(row);
      delete detached[META_KEY];
      delete detached[ENROLLMENT_KEY];
      ordinary.push(detached);
    }
    return [...ordinary, ...nextManaged];
  }

  function writes(templates, cache) {
    const rows = (Array.isArray(templates) ? templates : [])
      .filter((row) => !row?.shareImport && (metadata(row) || enrollment(row)))
      .map((row) => {
        const meta = metadata(row);
        return {
          ...(meta?.bucketId ? { bucket_id: meta.bucketId } : {}),
          client_template_id: String(meta?.clientTemplateId || row?.id || ''),
          base_version: Number(meta?.version || 0),
          ...(meta?.snapshot ? { base_template: clone(meta.snapshot) } : {}),
          template: serverTemplate(row),
        };
      })
      .filter((row) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(row.client_template_id)
        && row.template?.name && ['order', 'account', 'case', 'contact'].includes(row.template?.type));
    const liveIds = new Set(rows.map((row) => row.bucket_id).filter(Boolean));
    const removed_ids = (Array.isArray(cache?.templates) ? cache.templates : [])
      .filter((item) => !liveIds.has(String(item.id)))
      .map((item) => String(item.id));
    return { templates: rows, removed_ids };
  }

  function needsPublish(templates, cache) {
    const update = writes(templates, cache);
    if (update.removed_ids.length) return true;
    return update.templates.some((row) => {
      if (!row.bucket_id) return true;
      const cached = (cache?.templates || []).find((item) => String(item?.id) === row.bucket_id);
      return !cached || !same(row.template, cached.template);
    });
  }

  async function applyPayload(payload, stored, options = {}) {
    const settings = stored?.devSettings || {};
    const templates = reconcile(stored?.templates, payload, settings, options);
    applying = true;
    try {
      await setStorage({
        templates,
        [CACHE_KEY]: {
          schemaVersion: 1,
          revision: String(payload?.revision || ''),
          isParent: payload?.is_parent === true,
          templates: clone(payload?.templates || []),
          syncedAt: Date.now(),
        },
      });
    } finally { applying = false; }
    return templates;
  }

  async function fetchBucket() {
    const api = root.GBInstallationAuth;
    if (!api?.apiJson) throw new Error('Installation API is unavailable');
    return api.apiJson(PATH);
  }

  async function sync({ force = false } = {}) {
    // A bucket invalidation can arrive while the startup reconciliation is
    // still reading an older server snapshot. Reusing that in-flight promise
    // would acknowledge the newer revision without ever fetching it. A forced
    // caller therefore waits for the current pass and performs one fresh pass.
    if (syncPromise) {
      if (!force) return syncPromise;
      await syncPromise;
      return sync({ force: true });
    }
    syncPromise = (async () => {
      const stored = await getStorage(['templates', 'devSettings', CACHE_KEY]);
      const caps = capabilities(stored.devSettings);
      const cache = stored[CACHE_KEY];
      if (!force && cache?.revision && cache.isParent === caps.isParent) {
        if (caps.isParent && needsPublish(stored.templates, cache)) schedulePublish(50);
        return cache;
      }
      const payload = await fetchBucket();
      const templates = await applyPayload(payload, stored);
      if (caps.isParent && !cache?.isParent) schedulePublish(50);
      else if (caps.isParent && templates.some((row) => metadata(row)?.remoteVersion)) {
        schedulePublish(50);
      }
      return payload;
    })().finally(() => { syncPromise = null; });
    return syncPromise;
  }

  async function publish() {
    const stored = await getStorage(['templates', 'devSettings', CACHE_KEY]);
    if (!capabilities(stored.devSettings).isParent) return null;
    const api = root.GBInstallationAuth;
    if (!api?.apiJson) return null;
    const payload = await api.apiJson(PATH, {
      method: 'PUT',
      body: JSON.stringify(writes(stored.templates, stored[CACHE_KEY])),
    });
    await applyPayload(payload, stored, {
      acceptRemote: !Array.isArray(payload?.sync_conflicts) || payload.sync_conflicts.length === 0,
    });
    return payload;
  }

  function schedulePublish(delay = 900) {
    clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      publish().catch(() => schedulePublish(15_000));
    }, delay);
  }

  function install() {
    chrome.storage?.onChanged?.addListener((changes, area) => {
      if (area && area !== 'local') return;
      if (changes.devSettings) {
        const before = capabilities(changes.devSettings.oldValue);
        const after = capabilities(changes.devSettings.newValue);
        if (before.isParent !== after.isParent || before.allowLocal !== after.allowLocal) {
          sync({ force: true }).catch(() => {});
        }
      }
      if (changes.templates && !changes[CACHE_KEY] && !applying) {
        getStorage(['devSettings', CACHE_KEY]).then((stored) => {
          if (capabilities(stored.devSettings).isParent
              && needsPublish(changes.templates.newValue, stored[CACHE_KEY])) {
            schedulePublish();
          }
        });
      }
    });
  }

  root.GBManagedEmailTemplates = Object.freeze({
    CACHE_KEY, META_KEY, ENROLLMENT_KEY, KIND, metadata, enrollment,
    serverTemplate, reconcile, writes, needsPublish,
    sync, publish, schedulePublish, install,
  });
})(globalThis);
