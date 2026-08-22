/** Typed state-change delivery over the installation notification cursor.
 *
 * The notification endpoint is the extension's one authenticated update
 * transport. Events are always applied; whether the same row also enters the
 * notification center is a separate server-owned `visible` choice handled by
 * notifications-poll.js.
 */
(function installLiveUpdates(root) {
  'use strict';

  const LIVE_UPDATE_KEY = 'gbLiveUpdate';
  const EMAIL_SHARE_REVISION_KEY = 'gbEmailShareRevision';
  const SUPPORT_TICKET_REVISION_KEY = 'gbSupportTicketRevision';
  const SETTINGS_POLICY_REVISION_KEY = 'gbSettingsPolicyRevision';
  const EMAIL_IMPORT_KIND = 'revstack-email-template-share';
  const SHARE_ID = /^[A-Za-z0-9_-]{32}$/;
  const EVENT_TYPE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){1,7}$/;
  const MAX_EVENT_BYTES = 12_000;

  const getStorage = (keys) => new Promise((resolve) => {
    try { chrome.storage.local.get(keys, (value) => resolve(value || {})); }
    catch { resolve({}); }
  });
  const setStorage = (value) => new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(value, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message || 'Unable to apply live update'));
        else resolve();
      });
    } catch (error) { reject(error); }
  });

  function normalize(value) {
    if (!value || value.version !== 1 || !EVENT_TYPE.test(String(value.type || ''))
        || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)) {
      return null;
    }
    try {
      const encoded = JSON.stringify(value.data);
      if (new TextEncoder().encode(encoded).byteLength > MAX_EVENT_BYTES) return null;
      return { version: 1, type: String(value.type), data: JSON.parse(encoded) };
    } catch { return null; }
  }

  function importedFromShare(template, shareId) {
    const source = template?.shareImport;
    return source?.kind === EMAIL_IMPORT_KIND
      && String(source.shareId || '') === shareId;
  }

  function ownedShareRemoved(template, shareId) {
    const sync = template?.shareSync;
    if (!sync || !Array.isArray(sync.owned)) return template;
    const owned = sync.owned.filter((row) => String(row?.shareId || '') !== shareId);
    if (owned.length === sync.owned.length) return template;
    const next = { ...template };
    if (owned.length) next.shareSync = { ...sync, owned };
    else delete next.shareSync;
    return next;
  }

  function overrideDefaults(template) {
    const literalVariables = {};
    for (const [name, definition] of Object.entries(template?.vars || {})) {
      if (definition?.type === 'literal') literalVariables[name] = String(definition.value ?? '');
    }
    for (const variable of template?.caseVars || []) {
      if (variable?.kind === 'literal' && variable.name) {
        literalVariables[variable.name] = String(variable.config ?? '');
      }
    }
    return {
      presetTaskId: String(template?.presetTaskId || ''),
      followUpActionId: String(template?.followUpActionId || ''),
      replyMode: template?.replyMode === 'reply' ? 'reply' : 'standalone',
      senderAccount: String(template?.senderAccount || 'golfballs'),
      senderRandomize: template?.senderRandomize === true,
      literalVariables,
    };
  }

  function refreshedImportedTemplate(local, share) {
    const source = local?.shareImport;
    const remote = share?.template;
    if (!source || !remote || typeof remote !== 'object' || Array.isArray(remote)
        || !String(remote.name || '').trim()
        || !['order', 'account', 'case', 'contact'].includes(String(remote.type || ''))) {
      return local;
    }
    const overrides = source.overrides && typeof source.overrides === 'object'
      ? JSON.parse(JSON.stringify(source.overrides)) : {};
    // Reply mode belongs to the owner. Remove the short-lived local override
    // introduced by the first imported-template override implementation.
    delete overrides.replyMode;

    const allowedLiterals = new Set();
    for (const [name, definition] of Object.entries(remote.vars || {})) {
      if (definition?.type === 'literal') allowedLiterals.add(name);
    }
    for (const variable of remote.caseVars || []) {
      if (variable?.kind === 'literal' && variable.name) allowedLiterals.add(variable.name);
    }
    const literalOverrides = {};
    for (const [name, value] of Object.entries(overrides.literalVariables || {})) {
      if (allowedLiterals.has(name)) literalOverrides[name] = String(value ?? '');
    }
    if (Object.keys(literalOverrides).length) overrides.literalVariables = literalOverrides;
    else delete overrides.literalVariables;

    const next = JSON.parse(JSON.stringify(remote));
    next.id = local.id;
    if (local.folderId) next.folderId = local.folderId;
    if (local.createdAt != null) next.createdAt = local.createdAt;
    for (const field of ['presetTaskId', 'followUpActionId', 'senderAccount', 'senderRandomize']) {
      if (Object.prototype.hasOwnProperty.call(overrides, field)) next[field] = overrides[field];
    }
    for (const [name, value] of Object.entries(literalOverrides)) {
      if (next.vars?.[name]?.type === 'literal') next.vars[name] = { ...next.vars[name], value };
      if (Array.isArray(next.caseVars)) {
        next.caseVars = next.caseVars.map((variable) => (
          variable?.name === name && variable.kind === 'literal'
            ? { ...variable, config: value } : variable
        ));
      }
    }
    next.shareImport = {
      ...source,
      ownerName: String(share.owner_name || source.ownerName || 'Unregistered installation'),
      version: Math.max(1, Number(share.version) || 1),
      updatedAt: String(share.updated_at || ''),
      overrideDefaults: overrideDefaults(remote),
      overrides,
    };
    return next;
  }

  async function emailTemplateChanges(update, writes) {
    writes[EMAIL_SHARE_REVISION_KEY] = update;
    const shareId = String(update.data.share_id || '');
    if (!SHARE_ID.test(shareId)) return;
    const stored = await getStorage('templates');
    const existing = Array.isArray(stored.templates) ? stored.templates : [];
    if (update.data.reason === 'revoked') {
      const templates = existing
        .filter((item) => !importedFromShare(item, shareId))
        .map((item) => ownedShareRemoved(item, shareId));
      if (JSON.stringify(templates) !== JSON.stringify(existing)) writes.templates = templates;
      return;
    }
    if (update.data.reason !== 'updated') return;
    const imported = existing.filter((item) => importedFromShare(item, shareId));
    if (!imported.length) return;
    const wantedVersion = Math.max(1, Number(update.data.version) || 1);
    if (imported.every((item) => Number(item.shareImport?.version || 1) >= wantedVersion)) return;
    const api = root.GBInstallationAuth;
    if (!api?.apiJson || !api.CLIENT_BASE) return;
    const share = await api.apiJson(`${api.CLIENT_BASE}/email-template-shares/${shareId}`);
    if (!share || String(share.id || '') !== shareId) return;
    writes.templates = existing.map((item) => (
      importedFromShare(item, shareId) ? refreshedImportedTemplate(item, share) : item
    ));
  }

  async function apply(notification) {
    const event = normalize(notification?.event);
    if (!event) return null;
    const id = Number(notification?.id);
    const update = {
      ...event,
      notificationId: Number.isSafeInteger(id) && id > 0 ? id : 0,
      receivedAt: Date.now(),
    };
    const writes = { [LIVE_UPDATE_KEY]: update };
    if (event.type === 'email_templates.changed') {
      await emailTemplateChanges(update, writes);
    } else if (event.type === 'tickets.changed') {
      writes[SUPPORT_TICKET_REVISION_KEY] = update;
    } else if (event.type === 'settings.changed') {
      writes[SETTINGS_POLICY_REVISION_KEY] = update;
    }
    await setStorage(writes);

    // Policy storage is the live source every extension surface already
    // subscribes to. A failed refresh stays non-fatal and the existing alarm
    // retries it; the event cursor must keep moving either way.
    if (event.type === 'settings.changed') {
      try { await root.GBRemoteSettingsPolicy?.sync?.(); }
      catch { /* periodic policy reconciliation remains the fallback */ }
    }
    return update;
  }

  async function applyAll(notifications) {
    const applied = [];
    for (const notification of (Array.isArray(notifications) ? notifications : [])) {
      const update = await apply(notification);
      if (update) applied.push(update);
    }
    return applied;
  }

  root.GBLiveUpdates = Object.freeze({
    LIVE_UPDATE_KEY,
    EMAIL_SHARE_REVISION_KEY,
    SUPPORT_TICKET_REVISION_KEY,
    SETTINGS_POLICY_REVISION_KEY,
    normalize,
    apply,
    applyAll,
    refreshedImportedTemplate,
  });
})(globalThis);
