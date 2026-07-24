/** Chrome-native delivery for installation notifications.
 *
 * Native clicks are reconstructed through GBNotificationActions. Page-bound
 * actions are placed in a short-lived launch intent before a supported tab is
 * focused/opened, so service-worker suspension cannot lose the click.
 */
(function installNativeNotifications(root) {
  'use strict';

  const PREFIX = 'gb-extension-notification:';
  const INTENT_KEY = 'gbNotificationLaunchIntent';
  const INTENT_TTL_MS = 2 * 60 * 1000;
  const GOLFBALLS_TABS = [
    'https://www.golfballs.com/*',
    'https://api.golfballs.com/*',
  ];
  const FALLBACK_PAGE = 'https://www.golfballs.com/';
  const CONTACT_URL = /^https:\/\/api\.golfballs\.com\/golfballs\/adminnew\//i;

  const call = (fn) => new Promise((resolve) => {
    try { fn(resolve); } catch { resolve(null); }
  });
  const notificationId = (value) => {
    const id = Number(value?.remoteId);
    return Number.isSafeInteger(id) && id > 0 ? `${PREFIX}${id}` : '';
  };
  const remoteId = (value) => {
    const match = String(value || '').match(
      /^gb-extension-notification:(\d+)$/,
    );
    const id = Number(match?.[1]);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  };

  async function show(notification) {
    const id = notificationId(notification);
    if (!id || !chrome.notifications?.create) return false;
    const action = root.GBNotificationActions?.normalize?.(
      notification.action,
    );
    const options = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: String(notification.title || 'Golfballs Toolkit').slice(0, 160),
      message: String(notification.body || '').slice(0, 4_000),
      contextMessage: 'Golfballs Toolkit',
      priority: notification.level === 'error' ? 2 : (
        notification.level === 'warning' ? 1 : 0
      ),
      requireInteraction:
        notification.presentation?.requireInteraction === true,
      silent: false,
    };
    if (action) options.buttons = [{ title: action.label || 'Open' }];
    const created = await call((resolve) => {
      chrome.notifications.create(id, options, (result) => {
        void chrome.runtime.lastError;
        resolve(result || '');
      });
    });
    return !!created;
  }

  async function queryTabs() {
    return call((resolve) => {
      chrome.tabs.query({ url: GOLFBALLS_TABS }, (tabs) => {
        void chrome.runtime.lastError;
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    });
  }

  async function sendToTab(tabId, payload) {
    return call((resolve) => {
      chrome.tabs.sendMessage(tabId, payload, (response) => {
        const failed = !!chrome.runtime.lastError;
        resolve(!failed && response?.ok !== false);
      });
    });
  }

  async function focusTab(tab) {
    if (!tab?.id) return false;
    await call((resolve) => {
      chrome.tabs.update(tab.id, { active: true }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    });
    if (tab.windowId != null && chrome.windows?.update) {
      await call((resolve) => {
        chrome.windows.update(tab.windowId, { focused: true }, () => {
          void chrome.runtime.lastError;
          resolve(true);
        });
      });
    }
    return true;
  }

  async function queuePageIntent(notification) {
    await call((resolve) => {
      chrome.storage.local.set({
        [INTENT_KEY]: {
          notification,
          createdAt: Date.now(),
          expiresAt: Date.now() + INTENT_TTL_MS,
        },
      }, () => resolve(true));
    });
    const tabs = await queryTabs();
    const tab = tabs.find((item) => item.active) || tabs[0];
    if (tab) {
      await focusTab(tab);
      const handled = await sendToTab(tab.id, {
        action: 'runNotificationAction',
        notification,
      });
      if (handled) chrome.storage.local.remove(INTENT_KEY);
      return handled;
    }
    await call((resolve) => {
      chrome.tabs.create({ url: FALLBACK_PAGE, active: true }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    });
    return true;
  }

  async function openCenter(notification) {
    await call((resolve) => {
      chrome.storage.local.set({
        [INTENT_KEY]: {
          notification,
          openCenter: true,
          createdAt: Date.now(),
          expiresAt: Date.now() + INTENT_TTL_MS,
        },
      }, () => resolve(true));
    });
    const tabs = await queryTabs();
    const tab = tabs.find((item) => item.active) || tabs[0];
    if (tab) {
      await focusTab(tab);
      const handled = await sendToTab(tab.id, {
        action: 'showNotificationsModal',
      });
      if (handled) chrome.storage.local.remove(INTENT_KEY);
      return handled;
    }
    await call((resolve) => {
      chrome.tabs.create({ url: FALLBACK_PAGE, active: true }, () => {
        void chrome.runtime.lastError;
        resolve(true);
      });
    });
    return true;
  }

  async function acknowledge(notification, state) {
    const id = Number(notification?.remoteId);
    if (!Number.isSafeInteger(id) || id < 1) return;
    await Promise.all([
      root.GBNotifications?.patch?.(
        [id],
        { status: state === 'dismissed' ? 'dismissed' : 'read' },
      ),
      root.GBNotificationPoll?.sendReceipt?.([id], state),
    ]);
  }

  root.GBNotificationActions?.registerHandler?.(
    'open_contact',
    'worker',
    async (action, context) => {
      let url = String(context.notification?.localActionUrl || '');
      if (!CONTACT_URL.test(url)) {
        url = String(
          await root.GBNotificationPoll?.resolveContact?.(
            action.arguments.contact_email,
          ) || '',
        );
      }
      if (!CONTACT_URL.test(url)) return false;
      await call((resolve) => {
        chrome.tabs.create({ url, active: true }, () => {
          void chrome.runtime.lastError;
          resolve(true);
        });
      });
      return true;
    },
  );
  for (const type of ['open_mockup_batch', 'open_support_ticket']) {
    root.GBNotificationActions?.registerHandler?.(
      type,
      'worker',
      (_action, context) => queuePageIntent(context.notification),
    );
  }

  async function run(nativeId) {
    const id = remoteId(nativeId);
    const notification = await root.GBNotifications?.find?.(id);
    if (!notification) return false;
    const action = root.GBNotificationActions?.normalize?.(
      notification.action,
    );
    const handled = action
      ? await Promise.resolve(root.GBNotificationActions.execute(
        action,
        'worker',
        { notification },
      ))
      : await openCenter(notification);
    if (handled) await acknowledge(notification, action ? 'acted' : 'read');
    try { chrome.notifications.clear(nativeId); } catch { /* optional */ }
    return handled === true;
  }

  chrome.notifications?.onClicked?.addListener((id) => {
    run(id).catch(() => {});
  });
  chrome.notifications?.onButtonClicked?.addListener((id) => {
    run(id).catch(() => {});
  });

  root.GBNativeNotifications = Object.freeze({
    PREFIX,
    INTENT_KEY,
    show,
    run,
  });
})(globalThis);
