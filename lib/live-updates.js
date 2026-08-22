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

  async function emailTemplateChanges(update, writes) {
    writes[EMAIL_SHARE_REVISION_KEY] = update;
    const shareId = String(update.data.share_id || '');
    if (update.data.reason !== 'revoked' || !SHARE_ID.test(shareId)) return;
    const stored = await getStorage('templates');
    const existing = Array.isArray(stored.templates) ? stored.templates : [];
    const templates = existing.filter((item) => !importedFromShare(item, shareId));
    if (templates.length !== existing.length) writes.templates = templates;
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
  });
})(globalThis);
