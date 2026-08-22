/** Durable notification cache and toolbar badge.
 *
 * The authenticated backend outbox is authoritative; this local newest-first
 * cache keeps the notification center useful while the backend is temporarily
 * unavailable. Raw worker script (importScripts) — no ESM.
 */
(function installNotificationsStore(root) {
  'use strict';

  const STORAGE_KEY = 'gbNotifications';
  const MAX = 200;
  const BADGE_BG = '#D64545';
  const BADGE_FG = '#FFFFFF';
  const LEVELS = new Set(['info', 'success', 'warning', 'error']);
  const STATUSES = new Set(['unread', 'read', 'dismissed']);

  const read = () => new Promise((resolve) => {
    try {
      chrome.storage.local.get(
        [STORAGE_KEY, 'featureFlags'],
        (value) => resolve(value || {}),
      );
    } catch { resolve({}); }
  });
  const write = (items) => new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: items }, () => resolve());
    } catch { resolve(); }
  });
  const list = (bag) => (
    Array.isArray(bag?.[STORAGE_KEY]) ? bag[STORAGE_KEY] : []
  );
  const remoteId = (value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  };
  const timestamp = (value, fallback = Date.now()) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const safeText = (value, maximum) => String(value || '').trim().slice(0, maximum);

  function normalizeAction(value) {
    try {
      const normalized = root.GBActionLanguage?.normalize?.(value);
      if (!normalized) return null;
      return {
        label: safeText(value?.label || normalized.label || 'Open', 48),
        payload: root.GBActionLanguage.serialize(normalized),
      };
    } catch {
      return null;
    }
  }

  /** The notification's ordered actions, dropping any this build can't parse.
   *
   * The first is the default — what clicking the notification runs. A server
   * that predates multi-action notifications sends only `action`; a build that
   * predates it reads only `action`. Both keep working because the two fields
   * describe the same list from different ends. */
  function normalizeActions(value, fallback) {
    const raw = Array.isArray(value) && value.length
      ? value.slice(0, 3)
      : (fallback ? [fallback] : []);
    return raw.map(normalizeAction).filter(Boolean);
  }

  function normalizePresentation(value, action) {
    const raw = value && typeof value === 'object' ? value : {};
    let type = ['tag', 'action'].includes(String(raw.type || ''))
      ? String(raw.type)
      : (action ? 'action' : 'tag');
    // A malformed or future action payload must still have visible UI; render
    // it as a compact tag rather than an empty CTA.
    if (type === 'action' && !action) type = 'tag';
    if (type === 'tag' && action) type = 'action';
    return {
      type,
      location: 'top-right',
    };
  }

  function normalizeRemote(value) {
    if (value?.visible === false) return null;
    const id = remoteId(value?.id);
    const title = safeText(value?.title, 160);
    const body = safeText(value?.body, 4_000);
    if (!id || !title || !body) return null;
    const dismissed = !!value.dismissed_at;
    const readAt = value.read_at ? timestamp(value.read_at, null) : null;
    const actions = normalizeActions(value.actions, value.action);
    const action = actions[0] || null;
    return {
      id: `remote:${id}`,
      remoteId: id,
      topic: safeText(value.topic || 'general', 80),
      kind: safeText(value.kind || 'general', 48),
      level: LEVELS.has(value.level) ? value.level : 'info',
      title,
      body,
      action,
      actions,
      presentation: normalizePresentation(value.presentation, action),
      visible: true,
      status: dismissed ? 'dismissed' : (readAt ? 'read' : 'unread'),
      createdAt: timestamp(value.created_at),
      updatedAt: timestamp(
        value.acted_at || value.dismissed_at || value.read_at
          || value.delivered_at || value.created_at,
      ),
      deliveredAt: value.delivered_at ? timestamp(value.delivered_at, null) : null,
      readAt,
      dismissedAt: value.dismissed_at
        ? timestamp(value.dismissed_at, null) : null,
      actedAt: value.acted_at ? timestamp(value.acted_at, null) : null,
      localActionUrl: '',
    };
  }

  function unreadCount(items) {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.status === 'unread').length;
  }

  function badgeEnabled(flags) {
    return !flags || flags.notificationsEnabled !== false;
  }

  async function paintBadge(items, flags) {
    let rows = items;
    let featureFlags = flags;
    if (rows === undefined || featureFlags === undefined) {
      const bag = await read();
      rows = list(bag);
      featureFlags = bag.featureFlags;
    }
    const count = badgeEnabled(featureFlags) ? unreadCount(rows) : 0;
    try {
      chrome.action.setBadgeText({
        text: count > 0 ? (count > 99 ? '99+' : String(count)) : '',
      });
      if (count > 0) {
        chrome.action.setBadgeBackgroundColor({ color: BADGE_BG });
        if (chrome.action.setBadgeTextColor) {
          chrome.action.setBadgeTextColor({ color: BADGE_FG });
        }
      }
    } catch { /* action API unavailable during tests or shutdown */ }
  }

  async function mergeRemote(values) {
    const incoming = (Array.isArray(values) ? values : [])
      .map(normalizeRemote)
      .filter(Boolean);
    if (!incoming.length) return [];
    const bag = await read();
    const current = list(bag);
    const byRemote = new Map(
      current.filter((item) => item?.remoteId)
        .map((item) => [Number(item.remoteId), item]),
    );
    const added = [];
    for (const item of incoming) {
      const previous = byRemote.get(item.remoteId);
      if (previous) {
        byRemote.set(item.remoteId, {
          ...previous,
          ...item,
          localActionUrl: previous.localActionUrl || item.localActionUrl,
        });
      } else {
        byRemote.set(item.remoteId, item);
        added.push(item);
      }
    }
    const localOnly = current.filter((item) => !item?.remoteId);
    const next = [
      ...byRemote.values(), ...localOnly,
    ].sort((a, b) => (
      Number(b.updatedAt || b.createdAt || 0)
      - Number(a.updatedAt || a.createdAt || 0)
    )).slice(0, MAX);
    await write(next);
    await paintBadge(next, bag.featureFlags);
    return added;
  }

  async function patch(remoteIds, values) {
    const ids = new Set(
      (Array.isArray(remoteIds) ? remoteIds : [remoteIds])
        .map(remoteId).filter(Boolean),
    );
    if (!ids.size) return [];
    const bag = await read();
    const now = Date.now();
    const next = list(bag).map((item) => {
      if (!ids.has(Number(item?.remoteId))) return item;
      const status = STATUSES.has(values?.status)
        ? values.status : item.status;
      return {
        ...item,
        ...values,
        status,
        updatedAt: now,
        readAt: status !== 'unread' ? (item.readAt || now) : null,
        dismissedAt: status === 'dismissed'
          ? (item.dismissedAt || now) : null,
      };
    });
    await write(next);
    await paintBadge(next, bag.featureFlags);
    return next;
  }

  async function setActionUrl(remoteIdValue, url) {
    const safe = /^https:\/\/api\.golfballs\.com\/golfballs\/adminnew\//i
      .test(String(url || '')) ? String(url) : '';
    return patch([remoteIdValue], { localActionUrl: safe });
  }

  async function find(remoteIdValue) {
    const id = remoteId(remoteIdValue);
    if (!id) return null;
    const bag = await read();
    return list(bag).find(
      (item) => Number(item?.remoteId) === id,
    ) || null;
  }

  root.GBNotifications = Object.freeze({
    STORAGE_KEY,
    mergeRemote,
    normalizeRemote,
    normalizeAction,
    normalizeActions,
    patch,
    find,
    setActionUrl,
    paintBadge,
    unreadCount,
  });
})(globalThis);
