/** Fail-closed bootstrap for the authenticated Golfballs extension runtime. */
(function installExtensionAccessGate(root) {
  'use strict';

  const STORAGE_KEY = 'gbExtensionAccessV1';
  const ALARM_NAME = 'gb-extension-access-health';
  const CLIENT_HEALTH = '/projects/golfballs-extension/client/health';
  const SCRIPT_IDS = [
    'gb-custom-page-boot', 'gb-golfballs-runtime', 'gb-iframe-auth',
    'gb-iframe-runtime', 'gb-proposal-hook', 'gb-operations-runtime',
  ];
  const PAGE_MATCHES = [
    'https://www.golfballs.com/*', 'https://api.golfballs.com/*',
    'https://admin.icustomize.com/*', 'https://office.gbcadmin.com/*',
    'https://operations.gbcadmin.com/*',
  ];
  const CONTENT_SCRIPTS = [
    {
      id: 'gb-custom-page-boot',
      matches: ['https://www.golfballs.com/*', 'https://api.golfballs.com/*'],
      js: ['src/vanilla/custom-page-boot.js'],
      runAt: 'document_start', allFrames: false, persistAcrossSessions: false,
    },
    {
      id: 'gb-golfballs-runtime',
      matches: ['https://www.golfballs.com/*', 'https://api.golfballs.com/*'],
      js: [
        'theme.js', 'src/vanilla/smart-detection.js',
        'react-dist/vanilla/page-engine.js', 'src/vanilla/variable-resolution.js',
        'react-dist/content/image-preview.js', 'react-dist/content/submit-proof.js',
        'react-dist/content/gift-catalog.js', 'src/vanilla/modals/charge-modal.js',
        'src/vanilla/modals/order-edit-modal.js', 'src/vanilla/page-utils.js',
        'react-dist/content/email-preview.js', 'react-dist/content/text-preview.js',
        'react-dist/content/watch-list.js',
        /* @admin:start */
        'react-dist/content/notifications.js',
        /* @admin:end */
        'react-dist/content/campaign-manager.js', 'react-dist/content/task-list.js',
        'react-dist/content/call-log.js', 'react-dist/content/quick-task.js',
        'react-dist/content/quick-order-note.js', 'react-dist/content/margin-calc.js',
        'react-dist/content/crm-search.js', 'react-dist/content/crm-create-contact.js',
        'react-dist/content/actions-shelf.js', 'react-dist/content/calendar.js',
        'react-dist/content/proposal-debug.js', 'react-dist/content/contact-details.js',
        'react-dist/content/account-details.js', 'react-dist/content/opportunity-details.js',
        'src/vanilla/custom-pages.js', 'src/vanilla/main.js',
      ],
      allFrames: false, persistAcrossSessions: false,
    },
    {
      id: 'gb-iframe-auth',
      matches: ['https://admin.icustomize.com/*'],
      js: ['iframe/auth-session-broker.js'],
      runAt: 'document_start', world: 'MAIN', allFrames: true,
      persistAcrossSessions: false,
    },
    {
      id: 'gb-iframe-runtime',
      matches: ['https://admin.icustomize.com/*'],
      js: [
        'theme.js', 'calendar-form-state.js', 'iframe/message-bridge.js',
        'iframe/note-sender.js', 'iframe/date-utils.js',
        'iframe/calendar-bridge.js', 'iframe/toolbar.js',
      ],
      css: ['theme.css'], allFrames: true, persistAcrossSessions: false,
    },
    {
      id: 'gb-proposal-hook',
      matches: [
        'https://www.golfballs.com/*', 'https://api.golfballs.com/*',
        'https://office.gbcadmin.com/*', 'https://operations.gbcadmin.com/*',
      ],
      js: ['src/vanilla/proposal-net-hook.js'],
      runAt: 'document_start', world: 'MAIN', allFrames: true,
      persistAcrossSessions: false,
    },
    {
      id: 'gb-operations-runtime',
      matches: ['https://office.gbcadmin.com/*', 'https://operations.gbcadmin.com/*'],
      js: ['theme.js', 'react-dist/content/proposal-debug.js'],
      allFrames: false, persistAcrossSessions: false,
    },
  ];

  function callChrome(fn, ...args) {
    return new Promise((resolve, reject) => fn(...args, (result) => {
      const error = root.chrome?.runtime?.lastError;
      if (error) reject(new Error(error.message || 'Chrome API request failed'));
      else resolve(result);
    }));
  }

  function createController({ chromeApi = root.chrome, auth = root.GBInstallationAuth } = {}) {
    if (!chromeApi?.scripting || !chromeApi?.storage?.local || !auth?.apiJson) {
      throw new Error('Authenticated extension bootstrap is unavailable');
    }
    let enabled = false;
    let checkPromise = null;

    const storageGet = (key) => new Promise((resolve) => chromeApi.storage.local.get(key, (value) => resolve(value?.[key])));
    const storageSet = (value) => new Promise((resolve) => chromeApi.storage.local.set({ [STORAGE_KEY]: value }, resolve));
    const unregister = async () => {
      try {
        await callChrome(chromeApi.scripting.unregisterContentScripts.bind(chromeApi.scripting), { ids: SCRIPT_IDS });
      } catch (error) {
        if (!/No script|not registered|Could not find/i.test(String(error?.message || ''))) throw error;
      }
    };

    async function closeExtensionSurfaces() {
      let tabs = [];
      try { tabs = await callChrome(chromeApi.tabs.query.bind(chromeApi.tabs), {}); } catch { return; }
      const extensionOrigin = chromeApi.runtime.getURL('');
      const extensionTabs = tabs.filter((tab) => String(tab.url || '').startsWith(extensionOrigin));
      if (extensionTabs.length) {
        try { await callChrome(chromeApi.tabs.remove.bind(chromeApi.tabs), extensionTabs.map((tab) => tab.id)); } catch { /* */ }
      }
    }

    async function reloadProductTabs() {
      let tabs = [];
      try { tabs = await callChrome(chromeApi.tabs.query.bind(chromeApi.tabs), { url: PAGE_MATCHES }); } catch { return; }
      await Promise.all(tabs.map(async (tab) => {
        if (!Number.isInteger(tab.id)) return;
        try { await callChrome(chromeApi.tabs.reload.bind(chromeApi.tabs), tab.id); } catch { /* */ }
      }));
    }

    async function disable(reason = 'unauthorized', { reload = false } = {}) {
      const previous = await storageGet(STORAGE_KEY);
      enabled = false;
      try { await unregister(); } catch { /* fail closed even if Chrome reports stale metadata */ }
      try { await callChrome(chromeApi.action.disable.bind(chromeApi.action)); } catch { /* */ }
      await storageSet({ enabled: false, reason: String(reason).slice(0, 120), checkedAt: Date.now() });
      await closeExtensionSurfaces();
      // Reload once when entering the disabled state, including the first run
      // after upgrading from a manifest that statically injected these files.
      // Repeated failed health alarms do not create a reload loop.
      if (reload && previous?.enabled !== false) await reloadProductTabs();
      return false;
    }

    async function enable(payload) {
      await unregister();
      await callChrome(
        chromeApi.scripting.registerContentScripts.bind(chromeApi.scripting),
        CONTENT_SCRIPTS,
      );
      await callChrome(chromeApi.action.enable.bind(chromeApi.action));
      enabled = true;
      await storageSet({
        enabled: true,
        assistantEnabled: payload?.assistant_enabled === true,
        checkedAt: Date.now(),
      });
      return true;
    }

    async function check() {
      if (checkPromise) return checkPromise;
      checkPromise = (async () => {
        try {
          const payload = await auth.apiJson(CLIENT_HEALTH, { responseLimit: 64 * 1024 });
          if (payload?.ok !== true || payload?.session_valid !== true || payload?.extension_enabled !== true) {
            return disable('access-denied', { reload: true });
          }
          return enable(payload);
        } catch (error) {
          return disable(`health-${Number(error?.status || 0) || 'unreachable'}`, { reload: true });
        }
      })();
      try { return await checkPromise; } finally { checkPromise = null; }
    }

    async function start() {
      // Remove persisted registrations before the network decision. A browser
      // restart can never create a window in which old scripts run first.
      try { await callChrome(chromeApi.action.disable.bind(chromeApi.action)); } catch { /* */ }
      try { await unregister(); } catch { /* */ }
      try { chromeApi.alarms.create(ALARM_NAME, { periodInMinutes: 3 }); } catch { /* */ }
      return check();
    }

    chromeApi.runtime.onInstalled?.addListener(() => { start().catch(() => {}); });
    chromeApi.runtime.onStartup?.addListener(() => { start().catch(() => {}); });
    chromeApi.alarms?.onAlarm?.addListener((alarm) => {
      if (alarm?.name === ALARM_NAME) check().catch(() => {});
    });

    return Object.freeze({
      STORAGE_KEY, ALARM_NAME, CONTENT_SCRIPTS, SCRIPT_IDS,
      start, check, disable, isEnabled: () => enabled,
    });
  }

  root.GBExtensionAccessGate = Object.freeze({
    STORAGE_KEY, ALARM_NAME, CLIENT_HEALTH, CONTENT_SCRIPTS, SCRIPT_IDS,
    createController,
  });
})(globalThis);
