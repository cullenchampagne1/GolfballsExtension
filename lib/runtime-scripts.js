(function installRuntimeScripts(root) {
  'use strict';

  const IDS = [
    'gb-custom-page-boot', 'gb-golfballs-runtime', 'gb-iframe-auth',
    'gb-iframe-runtime', 'gb-proposal-hook', 'gb-operations-runtime',
  ];
  const MATCHES = [
    'https://www.golfballs.com/*', 'https://api.golfballs.com/*',
    'https://admin.icustomize.com/*', 'https://office.gbcadmin.com/*',
    'https://operations.gbcadmin.com/*',
  ];
  const CATALOG = [
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

  function invoke(fn, ...args) {
    try {
      return Promise.resolve(fn(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function createManager(chromeApi = root.chrome) {
    let openState = false;

    async function unregister() {
      try {
        await invoke(
          chromeApi.scripting.unregisterContentScripts.bind(chromeApi.scripting),
          { ids: IDS },
        );
      } catch (error) {
        if (!/No script|not registered|Could not find/i.test(String(error?.message || ''))) {
          throw error;
        }
      }
    }

    async function closeSurfaces() {
      let tabs = [];
      try {
        tabs = await invoke(chromeApi.tabs.query.bind(chromeApi.tabs), {});
      } catch {
        return;
      }
      const origin = chromeApi.runtime.getURL('');
      const selected = tabs
        .filter((tab) => String(tab.url || '').startsWith(origin))
        .map((tab) => tab.id)
        .filter(Number.isInteger);
      if (!selected.length) return;
      try {
        await invoke(chromeApi.tabs.remove.bind(chromeApi.tabs), selected);
      } catch {
        // Best effort.
      }
    }

    async function reloadTabs() {
      let tabs = [];
      try {
        tabs = await invoke(
          chromeApi.tabs.query.bind(chromeApi.tabs),
          { url: MATCHES },
        );
      } catch {
        return;
      }
      await Promise.all(tabs.map(async (tab) => {
        if (!Number.isInteger(tab.id)) return;
        try {
          await invoke(chromeApi.tabs.reload.bind(chromeApi.tabs), tab.id);
        } catch {
          // Best effort.
        }
      }));
    }

    async function open({ reload = false } = {}) {
      await unregister();
      await invoke(
        chromeApi.scripting.registerContentScripts.bind(chromeApi.scripting),
        CATALOG,
      );
      await invoke(chromeApi.action.enable.bind(chromeApi.action));
      openState = true;
      if (reload) await reloadTabs();
      return true;
    }

    async function close({ reload = false, transitioned = true } = {}) {
      openState = false;
      try { await unregister(); } catch { /* already closed */ }
      try {
        await invoke(chromeApi.action.disable.bind(chromeApi.action));
      } catch {
        // Best effort.
      }
      await closeSurfaces();
      if (reload && transitioned) await reloadTabs();
      return false;
    }

    return Object.freeze({
      open,
      close,
      isOpen: () => openState,
    });
  }

  root.GBRuntimeScripts = Object.freeze({ createManager });
})(globalThis);
